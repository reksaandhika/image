import { simd } from 'wasm-feature-detect';
import webpDataUrl from './tiny.webp?data-url';
import avifDataUrl from './tiny.avif?data-url';
import checkThreadsSupport from 'worker-shared/supports-wasm-threads';

// Give TypeScript the correct global.
declare var self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa (Workbox injectManifest).
// Contains all versioned assets from the build output.
declare var self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

export function shouldCacheDynamically(url: string) {
  return url.startsWith('/c/demo-');
}

// All static assets are in __WB_MANIFEST — precache the whole thing.
export const initial: string[] = ['/'];

export const theRest = (async () => {
  const [supportsThreads, supportsSimd, supportsWebP, supportsAvif] =
    await Promise.all([
      checkThreadsSupport(),
      simd(),
      ...[webpDataUrl, avifDataUrl].map(async (dataUrl) => {
        if (!self.createImageBitmap) return false;
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        return createImageBitmap(blob).then(
          () => true,
          () => false,
        );
      }),
    ]);

  const manifest = self.__WB_MANIFEST ?? [];
  const items: string[] = [];

  // Match assets from the precache manifest by filename patterns.
  // manualChunks in vite.config.ts gives codec chunks stable names.
  function addMatching(pattern: RegExp) {
    for (const entry of manifest) {
      if (pattern.test(entry.url)) items.push(entry.url);
    }
  }

  // The shared features-worker chunk
  addMatching(/features-worker/);

  // Decoders — only needed if browser can't decode natively
  if (!supportsAvif) addMatching(/avif_dec|codec-avif.*dec/);
  if (!supportsWebP) addMatching(/webp_dec|codec-webp.*dec/);

  // AVIF encoder
  if (supportsThreads) {
    addMatching(/avif_enc_mt/);
  } else {
    addMatching(/avif_enc(?!_mt)/);
  }

  // JXL encoder
  if (supportsThreads && supportsSimd) {
    addMatching(/jxl_enc_mt_simd/);
  } else if (supportsThreads) {
    addMatching(/jxl_enc_mt(?!_simd)/);
  } else {
    addMatching(/jxl_enc(?!_mt)/);
  }

  // Oxipng (PNG optimizer)
  if (supportsThreads) {
    addMatching(/codec-oxipng.*parallel|squoosh_oxipng.*parallel/);
  } else {
    addMatching(/codec-oxipng(?!.*parallel)|squoosh_oxipng(?!.*parallel)/);
  }

  // WebP encoder
  if (supportsSimd) {
    addMatching(/webp_enc_simd/);
  } else {
    addMatching(/webp_enc(?!_simd)/);
  }

  // WP2 encoder
  if (supportsThreads && supportsSimd) {
    addMatching(/wp2_enc_mt_simd/);
  } else if (supportsThreads) {
    addMatching(/wp2_enc_mt(?!_simd)/);
  } else {
    addMatching(/wp2_enc(?!_mt)/);
  }

  // MozJPEG, resize, rotate, hqx, QOI — include always
  addMatching(/codec-mozjpeg|mozjpeg_enc/);
  addMatching(/codec-resize|squoosh_resize/);
  addMatching(/codec-rotate|rotate\.wasm/);
  addMatching(/codec-hqx/);
  addMatching(/qoi_enc|qoi_dec/);

  return [...new Set(items)];
})();
