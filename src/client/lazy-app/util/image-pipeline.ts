import {
  builtinDecode,
  sniffMimeType,
  canDecodeImageType,
  abortable,
  assertSignal,
  ImageMimeTypes,
} from './index';
import {
  PreprocessorState,
  EncoderState,
  ProcessorState,
  encoderMap,
} from '../feature-meta';
import { FilenameSettings, createOutputFilename } from '../filename-settings';
import WorkerBridge from '../worker-bridge';
import { resize } from 'features/processors/resize/client';

export interface SourceImage {
  file: File;
  decoded: ImageData;
  preprocessed: ImageData;
  vectorImage?: HTMLImageElement;
}

export async function decodeImage(
  signal: AbortSignal,
  blob: Blob,
  workerBridge: WorkerBridge,
): Promise<ImageData> {
  assertSignal(signal);
  const mimeType = await abortable(signal, sniffMimeType(blob));
  const canDecode = await abortable(signal, canDecodeImageType(mimeType));

  try {
    if (!canDecode) {
      if (mimeType === 'image/avif') {
        return await workerBridge.avifDecode(signal, blob);
      }
      if (mimeType === 'image/webp') {
        return await workerBridge.webpDecode(signal, blob);
      }
      if (mimeType === 'image/jxl') {
        return await workerBridge.jxlDecode(signal, blob);
      }
      if (mimeType === 'image/webp2') {
        return await workerBridge.wp2Decode(signal, blob);
      }
      if (mimeType === 'image/qoi') {
        return await workerBridge.qoiDecode(signal, blob);
      }
    }
    return await builtinDecode(signal, blob);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    console.log(err);
    throw Error("Couldn't decode image");
  }
}

export async function preprocessImage(
  signal: AbortSignal,
  data: ImageData,
  preprocessorState: PreprocessorState,
  workerBridge: WorkerBridge,
): Promise<ImageData> {
  assertSignal(signal);
  let processedData = data;

  if (preprocessorState.rotate.rotate !== 0) {
    processedData = await workerBridge.rotate(
      signal,
      processedData,
      preprocessorState.rotate,
    );
  }

  return processedData;
}

export async function processImage(
  signal: AbortSignal,
  source: SourceImage,
  processorState: ProcessorState,
  workerBridge: WorkerBridge,
): Promise<ImageData> {
  assertSignal(signal);
  let result = source.preprocessed;

  if (processorState.resize.enabled) {
    result = await resize(signal, source, processorState.resize, workerBridge);
  }
  return result;
}

export async function compressImage(
  signal: AbortSignal,
  image: ImageData,
  encodeData: EncoderState,
  sourceFilename: string,
  filenameSettings: FilenameSettings,
  workerBridge: WorkerBridge,
): Promise<File> {
  assertSignal(signal);

  const encoder = encoderMap[encodeData.type];
  const compressedData = await encoder.encode(
    signal,
    workerBridge,
    image,
    encodeData.options as any,
  );

  const type: ImageMimeTypes = encoder.meta.mimeType;
  const fileName = createOutputFilename(
    sourceFilename,
    encoder.meta.extension,
    filenameSettings,
  );

  return new File([compressedData], fileName, { type });
}
