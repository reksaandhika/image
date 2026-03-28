# Squoosh (Fork)

A modernized fork of [Squoosh] — a browser-based image compression app that shrinks images using a wide range of codecs. This fork migrates the build toolchain to **Vite**, adds a **Batch Compress** mode, and ships a **simplified UI**.

## What's different from Squoosh

| Area              | Upstream Squoosh               | This fork                                             |
| ----------------- | ------------------------------ | ----------------------------------------------------- |
| Build tool        | Rollup / custom scripts        | **Vite 8** + `@preact/preset-vite`                    |
| PWA               | workbox-cli                    | **vite-plugin-pwa** (injectManifest)                  |
| Compression modes | Single image                   | Single image **+ Batch**                              |
| UI                | Full side-by-side compare view | Simplified single-panel view with streamlined options |
| Resize in batch   | —                              | Resize by width **or** height before encoding         |
| Output            | Individual download            | Individual download **+ ZIP download** for batches    |

## Features

- **Single image compression** — side-by-side before/after preview with live codec options.
- **Batch compression** — drop multiple images, pick a codec + resize settings, and download all results as a ZIP.
- **All original codecs** — MozJPEG, WebP, AVIF, JXL, OxiPNG, QOI, WebP 2, and more.
- **100% client-side** — no images ever leave your browser.
- **PWA** — installable, works offline.

## Privacy

All processing happens locally in your browser. No images are uploaded to any server.

This fork removes the Google Analytics dependency from the original Squoosh.

## Developing

```sh
# 1. Clone the repo
git clone https://github.com/GoogleChromeLabs/squoosh
cd squoosh

# 2. Install dependencies
npm install

# 3. Start the dev server (with hot module replacement)
npm run dev

# 4. Or build for production
npm run build

# 5. Preview the production build locally
npm run preview
```

Type-checking only (no emit):

```sh
npm run typecheck
```

## Tech stack

- **Preact** — lightweight UI components
- **Vite** — dev server and production bundler
- **Comlink** — typed Web Worker RPC
- **JSZip** — client-side ZIP generation for batch downloads
- **PostCSS** (nested + simple-vars + cssnano) — CSS processing

## Contributing

Squoosh is an open-source project that appreciates all community involvement. To contribute to the project, follow the [contribute guide](/CONTRIBUTING.md).

[squoosh]: https://squoosh.app
