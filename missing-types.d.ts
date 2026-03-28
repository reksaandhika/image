/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/// <reference types="vite/client" />
/// <reference path="./emscripten-types.d.ts" />

// ?img-url query: returns URL string + image dimensions
declare module '*?img-url' {
  const url: string;
  export default url;
  export const width: number;
  export const height: number;
  export const mime: string;
}

// ?data-url and ?data-url-text: return data URI strings
declare module '*?data-url' {
  const url: string;
  export default url;
}

declare module '*?data-url-text' {
  const url: string;
  export default url;
}

// CSS modules: typed by vite/client via *.module.css,
// but plain *.css imports that auto-inject need this fallback
declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare var ga: {
  (...args: any[]): void;
  q: any[];
};

declare const __PRODUCTION__: boolean;
declare const __PRERENDER__: boolean;
