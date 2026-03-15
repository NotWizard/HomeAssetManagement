import { contextBridge } from 'electron';

const API_BASE_ARG_PREFIX = '--ham-api-base-url=';

function resolveApiBaseUrl(): string | undefined {
  const argument = process.argv.find((value) => value.startsWith(API_BASE_ARG_PREFIX));
  return argument?.slice(API_BASE_ARG_PREFIX.length);
}

contextBridge.exposeInMainWorld('__HAM_RUNTIME_CONFIG__', {
  apiBaseUrl: resolveApiBaseUrl(),
});
