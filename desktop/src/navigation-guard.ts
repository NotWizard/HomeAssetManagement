/**
 * 渲染进程导航白名单判定（从 main.ts 抽出以便单测）。
 *
 * 收窄理由：preload 对窗口内所有文档暴露带 token 的完整 __HBS_DESKTOP__ 桥，
 * 若只按 hostname 白名单，渲染窗口一旦被导航到 http://127.0.0.1:<其他端口>
 * （如恶意本地服务），该页面就拿到全量本地 API 读写能力。因此必须精确到
 * 当前后端端口同源；程序化 loadURL（loading/错误页/主界面）不触发
 * will-navigate，不受此收窄影响。
 */
export function isInternalNavigationUrl(
  url: string,
  backendPort: number | null
): boolean {
  if (url.startsWith('file://')) return true;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return false;
    }
    return backendPort !== null && parsed.port === String(backendPort);
  } catch {
    return false;
  }
}

/** 是否应交给系统浏览器打开的 http(s) 外链。 */
export function isExternalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
