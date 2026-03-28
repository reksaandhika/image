/**
 * Vite plugin that generates manifest.json and _headers in the output directory.
 * Replaces the static-build step from the original Rollup setup.
 *
 * manifest.json — PWA manifest with icons and screenshots
 * _headers      — Netlify/Cloudflare Pages headers for COOP/COEP
 */
import * as path from 'path';
import { promises as fsp } from 'fs';
import { imageSize } from 'image-size';
import { lookup as lookupMime } from 'mime-types';
import type { Plugin, ResolvedConfig } from 'vite';

const assetsDir = path.resolve(process.cwd(), 'src/static-build/assets');

function dims(filename: string) {
  const full = path.join(assetsDir, filename);
  const d = imageSize(full);
  return { width: d.width ?? 0, height: d.height ?? 0 };
}

function manifestSize(filename: string) {
  const d = dims(filename);
  return `${d.width}x${d.height}`;
}

function formFactor(filename: string): 'wide' | 'narrow' {
  const d = dims(filename);
  return d.width > d.height ? 'wide' : 'narrow';
}

const screenshots = [
  'screenshot1.png',
  'screenshot2.jpg',
  'screenshot3.jpg',
  'screenshot4.png',
  'screenshot5.jpg',
  'screenshot6.jpg',
];

export function staticFilesPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'static-files-plugin',
    enforce: 'post',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    async closeBundle() {
      // Only emit during actual builds, not during dev server
      if (config.command !== 'build') return;

      const outDir = config.build.outDir;

      // --- manifest.json ---
      const manifest = {
        name: 'Squoosh',
        short_name: 'Squoosh',
        start_url: '/?utm_medium=PWA&utm_source=launcher',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fff',
        theme_color: '#ff3385',
        icons: [
          {
            src: '/icon-large.png',
            type: lookupMime('icon-large.png') || 'image/png',
            sizes: manifestSize('icon-large.png'),
          },
          {
            src: '/icon-large-maskable.png',
            type: lookupMime('icon-large-maskable.png') || 'image/png',
            sizes: manifestSize('icon-large-maskable.png'),
            purpose: 'maskable',
          },
        ],
        description:
          'Compress and compare images with different codecs, right in your browser.',
        lang: 'en',
        categories: ['photo', 'productivity', 'utilities'],
        screenshots: screenshots.map((filename) => ({
          src: `/${filename}`,
          type: lookupMime(filename) || 'image/png',
          sizes: manifestSize(filename),
          form_factor: formFactor(filename),
        })),
        share_target: {
          action: '/?utm_medium=PWA&utm_source=share-target&share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'file', accept: ['image/*'] }],
          },
        },
      };

      await fsp.writeFile(
        path.join(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      // --- _headers ---
      const headers = `/*
  Cache-Control: no-cache

# COOP+COEP for WebAssembly threads.
/*
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
`;
      await fsp.writeFile(path.join(outDir, '_headers'), headers);

      console.log('[static-files-plugin] Generated manifest.json and _headers');
    },
  };
}
