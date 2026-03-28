import { h, Component, Fragment } from 'preact';

import * as style from './style.module.css';
import './style.module.css';
import { cleanSet, cleanMerge } from '../../util/clean-modify';

import type { SourceImage, OutputType } from '..';
import {
  EncoderOptions,
  EncoderState,
  ProcessorState,
  ProcessorOptions,
  encoderMap,
} from '../../feature-meta';
import {
  FilenameSettings,
  normalizeFilenameSettings,
  createOutputFilename,
} from '../../filename-settings';
import Expander from './Expander';
import Toggle from './Toggle';
import Select from './Select';
import { Options as ResizeOptionsComponent } from 'features/processors/resize/client';
import { ResetIcon } from 'client/lazy-app/icons';

interface Props {
  index: 0 | 1;
  mobileView: boolean;
  source?: SourceImage;
  encoderState?: EncoderState;
  processorState: ProcessorState;
  filenameSettings: FilenameSettings;
  onEncoderTypeChange(index: 0 | 1, newType: OutputType): void;
  onEncoderOptionsChange(index: 0 | 1, newOptions: EncoderOptions): void;
  onProcessorOptionsChange(index: 0 | 1, newOptions: ProcessorState): void;
  onFilenameSettingsChange(newSettings: FilenameSettings): void;
  onResetSettings(index: 0 | 1): void;
}

interface State {
  supportedEncoderMap?: PartialButNotUndefined<typeof encoderMap>;
}

type PartialButNotUndefined<T> = {
  [P in keyof T]: T[P];
};

const supportedEncoderMapP: Promise<PartialButNotUndefined<typeof encoderMap>> =
  (async () => {
    const supportedEncoderMap: PartialButNotUndefined<typeof encoderMap> = {
      ...encoderMap,
    };

    // Filter out entries where the feature test fails
    await Promise.all(
      Object.entries(encoderMap).map(async ([encoderName, details]) => {
        if ('featureTest' in details && !(await details.featureTest())) {
          delete supportedEncoderMap[encoderName as keyof typeof encoderMap];
        }
      }),
    );

    return supportedEncoderMap;
  })();

export default class Options extends Component<Props, State> {
  state: State = {
    supportedEncoderMap: undefined,
  };

  constructor() {
    super();
    supportedEncoderMapP.then((supportedEncoderMap) =>
      this.setState({ supportedEncoderMap }),
    );
  }

  private onEncoderTypeChange = (event: Event) => {
    const el = event.currentTarget as HTMLSelectElement;

    // The select element only has values matching encoder types,
    // so 'as' is safe here.
    const type = el.value as OutputType;
    this.props.onEncoderTypeChange(this.props.index, type);
  };

  private onProcessorEnabledChange = (event: Event) => {
    const el = event.currentTarget as HTMLInputElement;
    const processor = el.name.split('.')[0] as keyof ProcessorState;

    this.props.onProcessorOptionsChange(
      this.props.index,
      cleanSet(this.props.processorState, `${processor}.enabled`, el.checked),
    );
  };

  private onResizeOptionsChange = (opts: ProcessorOptions['resize']) => {
    this.props.onProcessorOptionsChange(
      this.props.index,
      cleanMerge(this.props.processorState, 'resize', opts),
    );
  };

  private onEncoderOptionsChange = (newOptions: EncoderOptions) => {
    this.props.onEncoderOptionsChange(this.props.index, newOptions);
  };

  private onResetSettingsClick = () => {
    this.props.onResetSettings(this.props.index);
  };

  private onFilenameLowercaseChange = (event: Event) => {
    this.props.onFilenameSettingsChange(
      normalizeFilenameSettings({
        ...this.props.filenameSettings,
        lowercase: (event.currentTarget as HTMLInputElement).checked,
      }),
    );
  };

  private onFilenameReplaceSpaceChange = (event: Event) => {
    this.props.onFilenameSettingsChange(
      normalizeFilenameSettings({
        ...this.props.filenameSettings,
        replaceSpaceWithUnderscore: (event.currentTarget as HTMLInputElement)
          .checked,
      }),
    );
  };

  private onFilenamePrefixChange = (event: Event) => {
    this.props.onFilenameSettingsChange(
      normalizeFilenameSettings({
        ...this.props.filenameSettings,
        prefix: (event.currentTarget as HTMLInputElement).value,
      }),
    );
  };

  private onFilenameSuffixChange = (event: Event) => {
    this.props.onFilenameSettingsChange(
      normalizeFilenameSettings({
        ...this.props.filenameSettings,
        suffix: (event.currentTarget as HTMLInputElement).value,
      }),
    );
  };

  render(
    { source, encoderState, processorState, index, filenameSettings }: Props,
    { supportedEncoderMap }: State,
  ) {
    const isOriginalSide = index === 0;
    const encoder = encoderState && encoderMap[encoderState.type];
    const EncoderOptionComponent =
      encoder && 'Options' in encoder ? encoder.Options : undefined;
    const previewFileName =
      source && encoder
        ? createOutputFilename(
            source.file.name,
            encoder.meta.extension,
            filenameSettings,
          )
        : source
        ? source.file.name
        : '';

    return (
      <div
        class={
          style.optionsScroller +
          ' ' +
          (isOriginalSide || !encoderState ? style.originalImage : '')
        }
      >
        {isOriginalSide ? (
          <>
            <h3 class={style.optionsTitle}>Original</h3>

            <section class={`${style.optionOneCell} ${style.optionsSection}`}>
              {source ? source.file.name : 'Original image'}
            </section>
          </>
        ) : (
          <>
            <Expander>
              {!encoderState ? null : (
                <div>
                  <h3 class={style.optionsTitle}>
                    <div class={style.titleAndButtons}>
                      Edit
                      <button
                        class={style.resetButton}
                        title="Reset settings to defaults"
                        onClick={this.onResetSettingsClick}
                      >
                        <ResetIcon />
                      </button>
                    </div>
                  </h3>
                  <label class={style.sectionEnabler}>
                    Resize
                    <Toggle
                      name="resize.enable"
                      checked={!!processorState.resize.enabled}
                      onChange={this.onProcessorEnabledChange}
                    />
                  </label>
                  <Expander>
                    {processorState.resize.enabled ? (
                      <ResizeOptionsComponent
                        isVector={Boolean(source && source.vectorImage)}
                        inputWidth={source ? source.preprocessed.width : 1}
                        inputHeight={source ? source.preprocessed.height : 1}
                        options={processorState.resize}
                        onChange={this.onResizeOptionsChange}
                      />
                    ) : null}
                  </Expander>
                </div>
              )}
            </Expander>

            <h3 class={style.optionsTitle}>Compress</h3>

            <section class={style.optionsSection}>
              <label class={style.optionToggle}>
                Lowercase filename
                <Toggle
                  checked={filenameSettings.lowercase}
                  onChange={this.onFilenameLowercaseChange}
                />
              </label>

              <label class={style.optionToggle}>
                Replace spaces with _
                <Toggle
                  checked={filenameSettings.replaceSpaceWithUnderscore}
                  onChange={this.onFilenameReplaceSpaceChange}
                />
              </label>

              <label
                class={style.optionTextFirst}
                htmlFor={`filename-prefix-${index}`}
              >
                Prefix
                <input
                  id={`filename-prefix-${index}`}
                  class={style.textField}
                  value={filenameSettings.prefix}
                  onInput={this.onFilenamePrefixChange}
                />
              </label>

              <label
                class={style.optionTextFirst}
                htmlFor={`filename-suffix-${index}`}
              >
                Suffix
                <input
                  id={`filename-suffix-${index}`}
                  class={style.textField}
                  value={filenameSettings.suffix}
                  onInput={this.onFilenameSuffixChange}
                />
              </label>

              {previewFileName ? (
                <div class={style.filenamePreview}>
                  <span>Preview</span>
                  <strong>{previewFileName}</strong>
                </div>
              ) : null}
            </section>

            <section class={`${style.optionOneCell} ${style.optionsSection}`}>
              {supportedEncoderMap ? (
                <Select
                  value={encoderState ? encoderState.type : 'identity'}
                  onChange={this.onEncoderTypeChange}
                  large
                >
                  <option value="identity">{`Original Image ${
                    this.props.source ? `(${this.props.source.file.name})` : ''
                  }`}</option>
                  {Object.entries(supportedEncoderMap).map(
                    ([type, encoder]) => (
                      <option value={type}>{encoder.meta.label}</option>
                    ),
                  )}
                </Select>
              ) : (
                <Select large>
                  <option>Loading…</option>
                </Select>
              )}
            </section>

            <Expander>
              {EncoderOptionComponent && (
                <EncoderOptionComponent
                  options={
                    // Casting options, as encoderOptionsComponentMap[encodeData.type] ensures
                    // the correct type, but typescript isn't smart enough.
                    encoderState!.options as any
                  }
                  onChange={this.onEncoderOptionsChange}
                />
              )}
            </Expander>
          </>
        )}
      </div>
    );
  }
}
