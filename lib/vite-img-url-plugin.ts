/**
 * Vite plugin that handles the `?img-url` query suffix.
 * Returns default (URL), width, height, and mime exports,
 * replacing the old `img-url:path` Rollup prefix.
 *
 * Usage: import * as icon from './icon.png?img-url'
 *   icon.default → hashed asset URL
 *   icon.width   → image width in pixels
 *   icon.height  → image height in pixels
 */
import { imageSize } from 'image-size';
import { lookup as lookupMime } from 'mime-types';
import type { Plugin } from 'vite';

const IMG_URL_RE = /\?img-url$/;

export function imgUrlPlugin(): Plugin {
  return {
    name: 'img-url-plugin',
    load(id) {
      if (!IMG_URL_RE.test(id)) return;

      const filePath = id.replace(IMG_URL_RE, '');
      const dims = imageSize(filePath);
      const mime = lookupMime(filePath) || 'image/unknown';

      // Re-import the file so Vite's built-in asset pipeline handles URL hashing
      return `
import __url from ${JSON.stringify(filePath)};
export default __url;
export const width = ${dims.width};
export const height = ${dims.height};
export const mime = ${JSON.stringify(mime)};
`;
    },
    resolveId(source, importer) {
      if (!IMG_URL_RE.test(source)) return;
      // Resolve relative paths
      if (source.startsWith('.') && importer) {
        const { resolve, dirname } = require('path') as typeof import('path');
        const base = source.replace(IMG_URL_RE, '');
        const resolved = resolve(dirname(importer), base);
        return resolved + '?img-url';
      }
      return source;
    },
  };
}
