import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import postcssNested from 'postcss-nested';
import postcssSimpleVars from 'postcss-simple-vars';
import cssnano from 'cssnano';
import { featurePlugin } from './lib/vite-feature-plugin';
import { imgUrlPlugin } from './lib/vite-img-url-plugin';
import { dataUrlPlugin } from './lib/vite-data-url-plugin';
import { staticFilesPlugin } from './lib/vite-static-files-plugin';

export default defineConfig(({ mode }) => ({
  // src/copy is served as-is (favicon, icons, _redirects, etc.)
  publicDir: 'src/copy',

  plugins: [
    // Must run first — generates src/features-worker/index.ts and bridge files
    featurePlugin(),
    // Preact JSX (h factory), TypeScript, and fast refresh
    preact(),
    // ?img-url query → { default: url, width, height, mime }
    imgUrlPlugin(),
    // ?data-url / ?data-url-text query → data URI string
    dataUrlPlugin(),
    // Generates manifest.json and _headers in outDir on build
    staticFilesPlugin(),
    // Service worker via Workbox injectManifest (keeps our custom SW logic)
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'serviceworker.ts',
      outDir: 'build',
      injectRegister: null,
      manifest: false,
      injectManifest: {
        swSrc: path.resolve(__dirname, 'build/serviceworker.js'),
        swDest: path.resolve(__dirname, 'build/serviceworker.js'),
        injectionPoint: 'self.__WB_MANIFEST',
        globDirectory: path.resolve(__dirname, 'build'),
        globPatterns: ['**/*.{js,mjs,css,wasm,html}'],
        globIgnores: ['serviceworker.js'],
      },
    }),
  ],

  resolve: {
    alias: {
      'static-build': path.resolve(__dirname, 'src/static-build'),
      client: path.resolve(__dirname, 'src/client'),
      shared: path.resolve(__dirname, 'src/shared'),
      features: path.resolve(__dirname, 'src/features'),
      'features-worker': path.resolve(__dirname, 'src/features-worker'),
      'worker-shared': path.resolve(__dirname, 'src/worker-shared'),
      codecs: path.resolve(__dirname, 'codecs'),
    },
  },

  css: {
    modules: {
      localsConvention: 'camelCase',
    },
    postcss: {
      plugins: [
        postcssNested(),
        postcssSimpleVars(),
        // Only minify in production
        ...(mode === 'production' ? [cssnano({ preset: 'default' })] : []),
      ],
    },
  },

  define: {
    __PRODUCTION__: mode === 'production',
    __PRERENDER__: 'false',
  },

  // Worker bundles use ES modules (no AMD needed)
  worker: {
    format: 'es',
  },

  // Pre-built Emscripten modules must not be processed by Vite's optimizer.
  // They use import.meta.url internally for WASM loading and would break if bundled.
  optimizeDeps: {
    exclude: [
      'codecs/avif/enc/avif_enc_mt',
      'codecs/jxl/enc/jxl_enc_mt',
      'codecs/jxl/enc/jxl_enc_mt_simd',
      'codecs/wp2/enc/wp2_enc_mt',
      'codecs/wp2/enc/wp2_enc_mt_simd',
    ],
  },

  build: {
    outDir: 'build',
    // Keep /c/ URL pattern for hashed assets (matches existing service worker expectations)
    assetsDir: 'c',
    rolldownOptions: {
      // Give codec chunks stable names so the service worker can match them by pattern
      output: {
        manualChunks(id) {
          if (id.includes('codecs/avif')) return 'codec-avif';
          if (id.includes('codecs/webp')) return 'codec-webp';
          if (id.includes('codecs/jxl')) return 'codec-jxl';
          if (id.includes('codecs/oxipng')) return 'codec-oxipng';
          if (id.includes('codecs/wp2')) return 'codec-wp2';
          if (id.includes('codecs/mozjpeg')) return 'codec-mozjpeg';
          if (id.includes('codecs/resize')) return 'codec-resize';
          if (id.includes('codecs/rotate')) return 'codec-rotate';
          if (id.includes('codecs/hqx')) return 'codec-hqx';
          if (id.includes('features-worker')) return 'features-worker';
        },
      },
    },
  },

  server: {
    port: 5000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cache-Control': 'no-cache',
    },
  },

  preview: {
    port: 5000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
}));
