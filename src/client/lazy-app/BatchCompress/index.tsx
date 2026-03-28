import { h, Component, Fragment } from 'preact';
import JSZip from 'jszip';

import * as style from './style.module.css';
import './style.module.css';
import {
  EncoderState,
  EncoderOptions,
  EncoderType,
  encoderMap,
  defaultProcessorState,
  ProcessorState,
} from '../feature-meta';
import WorkerBridge from '../worker-bridge';
import {
  decodeImage,
  processImage,
  compressImage,
  SourceImage,
} from '../util/image-pipeline';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import prettyBytes from '../Compress/Results/pretty-bytes';
import Toggle from '../Compress/Options/Toggle';
import Expander from '../Compress/Options/Expander';
import { cleanMerge } from '../util/clean-modify';
import { workerResizeMethods } from 'features/processors/resize/shared/meta';

type BatchItemStatus =
  | 'pending'
  | 'decoding'
  | 'processing'
  | 'encoding'
  | 'done'
  | 'error';

interface BatchItem {
  id: string;
  file: File;
  status: BatchItemStatus;
  thumbUrl?: string;
  result?: { file: File; downloadUrl: string };
  error?: string;
  originalSize: number;
  compressedSize?: number;
}

interface Props {
  files: File[];
  showSnack: SnackBarElement['showSnackbar'];
  onBack: () => void;
}

type ResizeDimension = 'width' | 'height';

interface State {
  items: BatchItem[];
  encoderState: EncoderState;
  processorState: ProcessorState;
  isProcessing: boolean;
  supportedEncoderMap?: typeof encoderMap;
  resizeDimension: ResizeDimension;
  resizeValue: number;
}

const supportedEncoderMapP: Promise<typeof encoderMap> = (async () => {
  const supported = { ...encoderMap };

  await Promise.all(
    Object.entries(encoderMap).map(async ([name, details]) => {
      if ('featureTest' in details && !(await details.featureTest())) {
        delete supported[name as keyof typeof encoderMap];
      }
    }),
  );

  return supported;
})();

let batchIdCounter = 0;

export default class BatchCompress extends Component<Props, State> {
  private workerBridge = new WorkerBridge();
  private abortController?: AbortController;

  constructor(props: Props) {
    super(props);

    const items: BatchItem[] = props.files.map((file) => ({
      id: `batch-${batchIdCounter++}`,
      file,
      status: 'pending' as const,
      originalSize: file.size,
      thumbUrl: URL.createObjectURL(file),
    }));

    this.state = {
      items,
      encoderState: {
        type: 'mozJPEG',
        options: encoderMap.mozJPEG.meta.defaultOptions,
      },
      processorState: defaultProcessorState,
      isProcessing: false,
      resizeDimension: 'width',
      resizeValue: 1920,
    };

    supportedEncoderMapP.then((supportedEncoderMap) =>
      this.setState({ supportedEncoderMap }),
    );
  }

  componentWillUnmount() {
    this.abortController?.abort();
    for (const item of this.state.items) {
      if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
      if (item.result) URL.revokeObjectURL(item.result.downloadUrl);
    }
  }

  private handleEncoderTypeChange = (event: Event) => {
    const type = (event.currentTarget as HTMLSelectElement)
      .value as EncoderType;
    this.setState({
      encoderState: {
        type,
        options: encoderMap[type].meta.defaultOptions,
      },
    });
  };

  private handleEncoderOptionsChange = (options: EncoderOptions) => {
    this.setState((state) => ({
      encoderState: { ...state.encoderState, options: options as any },
    }));
  };

  private handleResizeToggle = () => {
    this.setState((state) => ({
      processorState: cleanMerge(state.processorState, 'resize', {
        ...state.processorState.resize,
        enabled: !state.processorState.resize.enabled,
      }),
    }));
  };

  private handleResizeDimensionChange = (e: Event) => {
    this.setState({
      resizeDimension: (e.currentTarget as HTMLSelectElement)
        .value as ResizeDimension,
    });
  };

  private handleResizeValueChange = (e: Event) => {
    const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    if (val > 0) this.setState({ resizeValue: val });
  };

  private handleResizeMethodChange = (e: Event) => {
    const method = (e.currentTarget as HTMLSelectElement).value;
    this.setState((state) => ({
      processorState: cleanMerge(state.processorState, 'resize', {
        ...state.processorState.resize,
        method,
      }),
    }));
  };

  private handleRemoveItem = (id: string) => {
    this.setState((state) => {
      const item = state.items.find((i) => i.id === id);
      if (item?.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
      if (item?.result) URL.revokeObjectURL(item.result.downloadUrl);
      return { items: state.items.filter((i) => i.id !== id) };
    });
  };

  private handleProcessAll = async () => {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Reset all items to pending
    this.setState((state) => ({
      isProcessing: true,
      items: state.items.map((item) => {
        if (item.result) URL.revokeObjectURL(item.result.downloadUrl);
        return {
          ...item,
          status: 'pending' as const,
          result: undefined,
          error: undefined,
          compressedSize: undefined,
        };
      }),
    }));

    const { encoderState, processorState } = this.state;

    for (let i = 0; i < this.state.items.length; i++) {
      if (signal.aborted) break;

      const item = this.state.items[i];

      try {
        // Decode
        this.updateItemStatus(item.id, 'decoding');
        const decoded = await decodeImage(signal, item.file, this.workerBridge);

        if (signal.aborted) break;

        // Build source
        const source: SourceImage = {
          file: item.file,
          decoded,
          preprocessed: decoded,
        };

        // Process (resize — compute per-image, only downsize)
        this.updateItemStatus(item.id, 'processing');
        let effectiveProcessorState = processorState;

        if (processorState.resize.enabled) {
          const { resizeDimension, resizeValue } = this.state;
          const srcW = decoded.width;
          const srcH = decoded.height;
          const aspect = srcW / srcH;

          let tgtW: number;
          let tgtH: number;

          if (resizeDimension === 'width') {
            tgtW = resizeValue;
            tgtH = Math.round(resizeValue / aspect);
          } else {
            tgtH = resizeValue;
            tgtW = Math.round(resizeValue * aspect);
          }

          // Skip resize if image is already smaller or equal
          if (tgtW >= srcW && tgtH >= srcH) {
            effectiveProcessorState = cleanMerge(processorState, 'resize', {
              ...processorState.resize,
              enabled: false,
            });
          } else {
            effectiveProcessorState = cleanMerge(processorState, 'resize', {
              ...processorState.resize,
              width: tgtW,
              height: tgtH,
              fitMethod: 'stretch',
            });
          }
        }

        const processed = await processImage(
          signal,
          source,
          effectiveProcessorState,
          this.workerBridge,
        );

        if (signal.aborted) break;

        // Encode
        this.updateItemStatus(item.id, 'encoding');
        const resultFile = await compressImage(
          signal,
          processed,
          encoderState,
          item.file.name,
          this.workerBridge,
        );

        if (signal.aborted) break;

        const downloadUrl = URL.createObjectURL(resultFile);

        this.setState((state) => ({
          items: state.items.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'done' as const,
                  result: { file: resultFile, downloadUrl },
                  compressedSize: resultFile.size,
                }
              : it,
          ),
        }));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') break;

        this.setState((state) => ({
          items: state.items.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'error' as const,
                  error:
                    err instanceof Error ? err.message : 'Processing failed',
                }
              : it,
          ),
        }));
      }
    }

    this.setState({ isProcessing: false });
  };

  private handleCancel = () => {
    this.abortController?.abort();
    this.setState((state) => ({
      isProcessing: false,
      items: state.items.map((item) =>
        item.status === 'done' || item.status === 'error'
          ? item
          : { ...item, status: 'pending' as const },
      ),
    }));
  };

  private handleDownloadAll = async () => {
    const doneItems = this.state.items.filter(
      (item) => item.status === 'done' && item.result,
    );
    if (doneItems.length === 0) return;

    const zip = new JSZip();
    for (const item of doneItems) {
      zip.file(item.result!.file.name, item.result!.file);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `squoosh-batch-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  private updateItemStatus = (id: string, status: BatchItemStatus) => {
    this.setState((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status } : item,
      ),
    }));
  };

  render(
    { onBack }: Props,
    {
      items,
      encoderState,
      processorState,
      isProcessing,
      supportedEncoderMap,
      resizeDimension,
      resizeValue,
    }: State,
  ) {
    const doneCount = items.filter((i) => i.status === 'done').length;
    const errorCount = items.filter((i) => i.status === 'error').length;
    const totalOriginalSize = items.reduce((sum, i) => sum + i.originalSize, 0);
    const totalCompressedSize = items
      .filter((i) => i.compressedSize != null)
      .reduce((sum, i) => sum + i.compressedSize!, 0);
    const progress =
      items.length > 0 ? ((doneCount + errorCount) / items.length) * 100 : 0;
    const totalSaved = totalOriginalSize - totalCompressedSize;

    const encoder = encoderMap[encoderState.type];
    const EncoderOptionComponent =
      'Options' in encoder ? encoder.Options : undefined;

    return (
      <div class={style.batch}>
        {/* Header */}
        <div class={style.header}>
          <button class={style.backBtn} onClick={onBack}>
            <svg viewBox="0 0 24 24">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>

          <h2 class={style.headerTitle}>
            Batch Optimize{' '}
            <span class={style.headerCount}>
              {items.length} image{items.length !== 1 ? 's' : ''}
            </span>
          </h2>

          {doneCount > 0 && (
            <span class={style.headerStats}>
              {doneCount}/{items.length} done
              {totalSaved > 0 && (
                <span class={style.statsSaved}>
                  -{prettyBytes(totalSaved).value}{' '}
                  {prettyBytes(totalSaved).unit}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Sidebar (right) */}
        <div class={style.sidebar}>
          <h4 class={style.sidebarTitle}>Settings</h4>

          <div class={style.sidebarSection}>
            <h3>Encoder</h3>
            {supportedEncoderMap ? (
              <select
                class={style.sidebarSelect}
                value={encoderState.type}
                onChange={this.handleEncoderTypeChange}
                disabled={isProcessing}
              >
                {Object.entries(supportedEncoderMap).map(([type, enc]) => (
                  <option value={type}>{enc.meta.label}</option>
                ))}
              </select>
            ) : (
              <select class={style.sidebarSelect} disabled>
                <option>Loading…</option>
              </select>
            )}
          </div>

          {EncoderOptionComponent && (
            <div class={`${style.sidebarSection} ${style.encoderOptions}`}>
              <h3>Options</h3>
              <EncoderOptionComponent
                options={encoderState.options as any}
                onChange={this.handleEncoderOptionsChange}
              />
            </div>
          )}

          <div class={style.sidebarSection}>
            <label class={style.sidebarToggleLabel}>
              <h3>Resize</h3>
              <Toggle
                checked={!!processorState.resize.enabled}
                onChange={this.handleResizeToggle}
              />
            </label>
            <Expander>
              {processorState.resize.enabled ? (
                <div class={style.resizeControls}>
                  <div class={style.resizeRow}>
                    <select
                      class={style.sidebarSelect}
                      value={resizeDimension}
                      onChange={this.handleResizeDimensionChange}
                    >
                      <option value="width">Width</option>
                      <option value="height">Height</option>
                    </select>
                    <div class={style.resizeInputWrap}>
                      <input
                        class={style.resizeInput}
                        type="number"
                        min="1"
                        value={resizeValue}
                        onInput={this.handleResizeValueChange}
                      />
                      <span class={style.resizeInputUnit}>px</span>
                    </div>
                  </div>
                  <div class={style.resizeRow}>
                    <label class={style.resizeLabel}>Method</label>
                    <select
                      class={style.sidebarSelect}
                      value={processorState.resize.method}
                      onChange={this.handleResizeMethodChange}
                    >
                      {workerResizeMethods.map((m: string) => (
                        <option value={m}>
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </option>
                      ))}
                      <option value="browser-pixelated">Pixelated</option>
                      <option value="browser-low">Low (Browser)</option>
                      <option value="browser-medium">Medium (Browser)</option>
                      <option value="browser-high">High (Browser)</option>
                    </select>
                  </div>
                  <p class={style.resizeNote}>
                    Height/width auto-calculated per image. Only images larger
                    than the target will be resized.
                  </p>
                </div>
              ) : null}
            </Expander>
          </div>

          <div class={style.sidebarActions}>
            {isProcessing ? (
              <button class={style.cancelBtn} onClick={this.handleCancel}>
                Cancel
              </button>
            ) : (
              <button
                class={style.processBtn}
                onClick={this.handleProcessAll}
                disabled={items.length === 0}
              >
                {doneCount > 0 ? 'Re-process All' : 'Process All'}
              </button>
            )}

            <button
              class={style.downloadAllBtn}
              onClick={this.handleDownloadAll}
              disabled={doneCount === 0}
            >
              Download ZIP ({doneCount})
            </button>
          </div>
        </div>

        {/* Progress bar area */}
        <div
          class={
            isProcessing ? style.progressAreaVisible : style.progressAreaHidden
          }
        >
          {isProcessing && (
            <>
              <div class={style.progressBar}>
                <div
                  class={style.progressFill}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span class={style.progressLabel}>{Math.round(progress)}%</span>
            </>
          )}
        </div>

        {/* Items list */}
        <div class={style.itemsContainer}>
          {items.length === 0 ? (
            <div class={style.emptyState}>
              <svg class={style.emptyIcon} viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
              No images to process
            </div>
          ) : (
            <div class={style.itemsList}>
              {items.map((item) => (
                <BatchItemRow
                  key={item.id}
                  item={item}
                  onRemove={this.handleRemoveItem}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}

interface BatchItemRowProps {
  item: BatchItem;
  onRemove: (id: string) => void;
}

class BatchItemRow extends Component<BatchItemRowProps> {
  private handleRemove = () => {
    this.props.onRemove(this.props.item.id);
  };

  render({ item }: BatchItemRowProps) {
    const originalPretty = prettyBytes(item.originalSize);
    const savings =
      item.compressedSize != null
        ? Math.round(
            ((item.originalSize - item.compressedSize) / item.originalSize) *
              100,
          )
        : null;

    const statusClass = {
      pending: style.statusPending,
      decoding: style.statusProcessing,
      processing: style.statusProcessing,
      encoding: style.statusProcessing,
      done: style.statusDone,
      error: style.statusError,
    }[item.status];

    const statusLabel = {
      pending: 'Pending',
      decoding: 'Decodingâ€¦',
      processing: 'Processingâ€¦',
      encoding: 'Encodingâ€¦',
      done: 'Done',
      error: 'Error',
    }[item.status];

    const isActive =
      item.status === 'decoding' ||
      item.status === 'processing' ||
      item.status === 'encoding';

    const itemClass =
      item.status === 'done'
        ? style.itemDone
        : item.status === 'error'
        ? style.itemError
        : isActive
        ? style.itemActive
        : style.item;

    return (
      <div class={itemClass}>
        <img class={style.itemThumb} src={item.thumbUrl} alt="" />
        <div class={style.itemInfo}>
          <div class={style.itemName}>{item.file.name}</div>
          <div class={style.itemMeta}>
            <span>
              {originalPretty.value} {originalPretty.unit}
            </span>
            {item.compressedSize != null && (
              <>
                <span class={style.itemSizeArrow}>â†’</span>
                <span class={style.itemSizeResult}>
                  {prettyBytes(item.compressedSize).value}{' '}
                  {prettyBytes(item.compressedSize).unit}
                </span>
              </>
            )}
            {savings !== null && (
              <span
                class={savings >= 0 ? style.savings : style.savingsNegative}
              >
                {savings >= 0 ? `â†“${savings}%` : `â†‘${Math.abs(savings)}%`}
              </span>
            )}
          </div>
          {savings !== null && (
            <div class={style.itemSavingsBar}>
              <div
                class={
                  savings >= 0
                    ? style.itemSavingsFillGood
                    : style.itemSavingsFillBad
                }
                style={{ width: `${Math.min(Math.abs(savings), 100)}%` }}
              />
            </div>
          )}
          {item.error && (
            <div class={style.itemMeta}>
              <span class={style.savingsNegative}>{item.error}</span>
            </div>
          )}
        </div>

        <div class={style.itemStatus}>
          <span class={statusClass}>{statusLabel}</span>
        </div>

        <div class={style.itemActions}>
          {item.result && (
            <a
              class={style.itemDownload}
              href={item.result.downloadUrl}
              download={item.result.file.name}
              title="Download"
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
            </a>
          )}
          <button
            class={style.itemRemove}
            onClick={this.handleRemove}
            title="Remove"
          >
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }
}
