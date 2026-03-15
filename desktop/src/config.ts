import { join } from 'node:path';

export type DesktopPathOptions = {
  userDataDir: string;
  projectRoot: string;
  resourcesPath?: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
};

export type BackendEnvironmentOptions = {
  port: number;
  storageDir: string;
  databaseUrl: string;
  frontendDistDir?: string;
};

export type DesktopPaths = {
  backendEntry: string;
  databaseUrl: string;
  frontendDistDir: string;
  storageDir: string;
};

function toSqliteUrl(filePath: string): string {
  return `sqlite:///${filePath.replace(/\\/g, '/')}`;
}

export function buildDesktopPaths(options: DesktopPathOptions): DesktopPaths {
  const storageDir = join(options.userDataDir, 'data');
  const frontendDistDir = options.isPackaged
    ? join(resolveResourcesPath(options), 'frontend-dist')
    : join(options.projectRoot, 'frontend', 'dist');
  const backendEntry = options.isPackaged
    ? join(
        resolveResourcesPath(options),
        'backend',
        'ham-backend',
        options.platform === 'win32' ? 'ham-backend.exe' : 'ham-backend'
      )
    : join(options.projectRoot, 'backend', 'desktop_server.py');

  return {
    backendEntry,
    databaseUrl: toSqliteUrl(join(storageDir, 'app.db')),
    frontendDistDir,
    storageDir,
  };
}

function resolveResourcesPath(options: DesktopPathOptions): string {
  if (!options.resourcesPath) {
    throw new Error('打包模式下缺少 resourcesPath');
  }

  return options.resourcesPath;
}

export function buildBackendEnvironment(
  options: BackendEnvironmentOptions
): Record<string, string> {
  const env: Record<string, string> = {
    HAM_APP_ENV: 'desktop',
    HAM_APP_HOST: '127.0.0.1',
    HAM_APP_PORT: String(options.port),
    HAM_DATABASE_URL: options.databaseUrl,
    HAM_STORAGE_DIR: options.storageDir,
  };

  if (options.frontendDistDir) {
    env.HAM_FRONTEND_DIST_DIR = options.frontendDistDir;
  }

  return env;
}

export function buildApiBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/v1`;
}

export function buildAppUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
