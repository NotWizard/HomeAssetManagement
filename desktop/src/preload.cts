import { contextBridge, ipcRenderer } from 'electron';

import {
  createDesktopBridge,
  type UpdateListener,
} from './preload-bridge.js';

contextBridge.exposeInMainWorld(
  '__HBS_DESKTOP__',
  createDesktopBridge({
    argv: process.argv,
    fetchImpl: fetch,
    invokeIpc: (channel: string) => ipcRenderer.invoke(channel),
    subscribeToUpdateState: (listener: UpdateListener) => {
      const wrapped = (_event: unknown, payload: unknown) => {
        listener(payload);
      };
      ipcRenderer.on('hbs:update:changed', wrapped);
      return () => {
        ipcRenderer.removeListener('hbs:update:changed', wrapped);
      };
    },
  })
);

