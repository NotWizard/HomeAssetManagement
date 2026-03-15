import type { HamRuntimeConfig } from '../config/runtime';

declare global {
  var __HAM_RUNTIME_CONFIG__: HamRuntimeConfig | undefined;

  interface Window {
    __HAM_RUNTIME_CONFIG__?: HamRuntimeConfig;
  }
}

export {};
