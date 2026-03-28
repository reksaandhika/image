/**
 * Vite plugin that handles `?data-url` and `?data-url-text` query suffixes.
 * Replaces the old `data-url:path` and `data-url-text:path` Rollup prefixes.
 *
 * Usage:
 *   import dataUrl from './tiny.webp?data-url'      → base64 data URI string
 *   import textUrl from './file.txt?data-url-text'  → percent-encoded data URI string
 */
import { promises as fsp } from 'fs';
import * as path from 'path';
import type { Plugin } from 'vite';

const DATA_URL_RE = /\?data-url$/;
const DATA_URL_TEXT_RE = /\?data-url-text$/;

export function dataUrlPlugin(): Plugin {
  return {
    name: 'data-url-plugin',

    resolveId(source, importer) {
      const isDataUrl = DATA_URL_RE.test(source);
      const isDataUrlText = DATA_URL_TEXT_RE.test(source);
      if (!isDataUrl && !isDataUrlText) return;

      if (source.startsWith('.') && importer) {
        const suffix = isDataUrl ? '?data-url' : '?data-url-text';
        const base = source.replace(
          isDataUrl ? DATA_URL_RE : DATA_URL_TEXT_RE,
          '',
        );
        const resolved = path.resolve(path.dirname(importer), base);
        return resolved + suffix;
      }
      return source;
    },

    async load(id) {
      if (DATA_URL_RE.test(id)) {
        const filePath = id.replace(DATA_URL_RE, '');
        const buf = await fsp.readFile(filePath);
        const ext = path.extname(filePath).slice(1);
        const mime = getMime(ext);
        const b64 = buf.toString('base64');
        return `export default ${JSON.stringify(
          `data:${mime};base64,${b64}`,
        )};`;
      }

      if (DATA_URL_TEXT_RE.test(id)) {
        const filePath = id.replace(DATA_URL_TEXT_RE, '');
        const text = await fsp.readFile(filePath, 'utf8');
        const ext = path.extname(filePath).slice(1);
        const mime = getMime(ext);
        const encoded = encodeURIComponent(text);
        return `export default ${JSON.stringify(`data:${mime},${encoded}`)};`;
      }
    },
  };
}

function getMime(ext: string): string {
  const map: Record<string, string> = {
    webp: 'image/webp',
    avif: 'image/avif',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    js: 'application/javascript',
    css: 'text/css',
  };
  return map[ext] || 'application/octet-stream';
}
