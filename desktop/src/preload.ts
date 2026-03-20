import { contextBridge, ipcRenderer } from 'electron';

const API_BASE_ARG_PREFIX = '--hbs-api-base-url=';
const RETRY_BOOTSTRAP_CHANNEL = 'hbs:retry-bootstrap';

function resolveApiBaseUrl(): string | undefined {
  const argument = process.argv.find((value) => value.startsWith(API_BASE_ARG_PREFIX));
  return argument?.slice(API_BASE_ARG_PREFIX.length);
}

contextBridge.exposeInMainWorld('__HBS_RUNTIME_CONFIG__', {
  apiBaseUrl: resolveApiBaseUrl(),
});

contextBridge.exposeInMainWorld('__HBS_DESKTOP__', {
  retryBootstrap: () => ipcRenderer.invoke(RETRY_BOOTSTRAP_CHANNEL),
});
