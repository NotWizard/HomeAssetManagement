import type { HbsDesktopBridge, HbsRuntimeConfig } from '../config/runtime';

declare global {
  var __HBS_RUNTIME_CONFIG__: HbsRuntimeConfig | undefined;
  var __HBS_DESKTOP__: HbsDesktopBridge | undefined;

  interface Window {
    __HBS_RUNTIME_CONFIG__?: HbsRuntimeConfig;
    __HBS_DESKTOP__?: HbsDesktopBridge;
  }
}

export {};
