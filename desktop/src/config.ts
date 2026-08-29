import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  apiToken?: string;
  requireAuth?: boolean;
};

export type DesktopPaths = {
  backendEntry: string;
  databaseUrl: string;
  frontendEntryUrl: string;
  frontendDistDir: string;
  storageDir: string;
};

function toSqliteUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  // 实测 SQLAlchemy URL 解析会把 '?' 之后当 query 截断，而 percent-encoding
  // （%3F）又不会被 unquote 回来（会当成字面文件名），无法转义往返；
  // 含 '?' 的路径直接 fail fast，避免静默写到错误的数据库文件。
  if (normalized.includes('?')) {
    throw new Error(`数据库路径不允许包含 '?' 字符: ${normalized}`);
  }
  return `sqlite:///${normalized}`;
}

export function buildDesktopPaths(options: DesktopPathOptions): DesktopPaths {
  const storageDir = join(options.userDataDir, 'data');
  const frontendDistDir = options.isPackaged
    ? join(resolveResourcesPath(options), 'frontend-dist')
    : join(options.projectRoot, 'frontend', 'dist');
  const frontendEntryUrl = pathToFileURL(join(frontendDistDir, 'index.html')).toString();
  const backendEntry = options.isPackaged
    ? join(
        resolveResourcesPath(options),
        'backend',
        'hbs-backend',
        options.platform === 'win32' ? 'hbs-backend.exe' : 'hbs-backend'
      )
    : join(options.projectRoot, 'backend', 'desktop_server.py');

  return {
    backendEntry,
    databaseUrl: toSqliteUrl(join(storageDir, 'app.db')),
    frontendEntryUrl,
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
    HBS_APP_ENV: 'desktop',
    HBS_APP_HOST: '127.0.0.1',
    HBS_APP_PORT: String(options.port),
    HBS_DATABASE_URL: options.databaseUrl,
    HBS_STORAGE_DIR: options.storageDir,
    // 桌面同源场景：CORSMiddleware 不挂载，避免对 sidecar 进行不必要的预检/凭据匹配。
    HBS_CORS_ORIGINS: '',
  };

  if (options.frontendDistDir) {
    env.HBS_FRONTEND_DIST_DIR = options.frontendDistDir;
  }

  if (options.apiToken) {
    env.HBS_API_TOKEN = options.apiToken;
  }

  if (options.requireAuth) {
    env.HBS_REQUIRE_AUTH = 'true';
  }

  return env;
}

export function buildApiBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/v1`;
}

export function buildAppUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
