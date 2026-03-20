import type { HbsRuntimeConfig } from '../config/runtime';

declare global {
  var __HBS_RUNTIME_CONFIG__: HbsRuntimeConfig | undefined;

  interface Window {
    __HBS_RUNTIME_CONFIG__?: HbsRuntimeConfig;
  }
}

export {};
