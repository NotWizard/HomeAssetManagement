import { join, type ParsedPath } from 'node:path';

export function buildMainWindowWebPreferences(
  currentDir: string,
  additionalArguments: string[]
) {
  return {
    preload: join(currentDir, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    additionalArguments,
  };
}
