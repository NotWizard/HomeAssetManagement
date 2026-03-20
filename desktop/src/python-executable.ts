import { join } from 'node:path';

export type ResolvePythonExecutableOptions = {
  projectRoot: string;
  platform: NodeJS.Platform;
  existsSync: (path: string) => boolean;
  isCommandAvailable: (command: string) => boolean;
};

export function resolvePythonExecutable(options: ResolvePythonExecutableOptions): string {
  const venvPython =
    options.platform === 'win32'
      ? join(options.projectRoot, '.venv', 'Scripts', 'python.exe')
      : join(options.projectRoot, '.venv', 'bin', 'python');

  if (options.existsSync(venvPython)) {
    return venvPython;
  }

  if (options.isCommandAvailable('python3')) {
    return 'python3';
  }

  return 'python';
}

