import { join, type ParsedPath } from 'node:path';

/**
 * 构造主窗口的 webPreferences。
 *
 * 安全要点：
 * - `contextIsolation: true` + `nodeIntegration: false`：renderer 永远不能直接拿到 Node API
 * - `sandbox: true`：renderer 进程进入 OS 沙箱，进一步降低 CVE 利用面
 * - `webSecurity: true`（显式声明）：保留同源策略，禁止跨源 XHR/fetch 绕过 CORS
 * - `allowRunningInsecureContent: false`：拒绝混合内容
 * - `additionalArguments`：通过命令行参数把 API base URL 透给 preload，避免暴露给 renderer 全局。
 *   注：token 不走这里——进程级随机 token 由 preload 通过 IPC（hbs:get-runtime-token）
 *   异步获取，避免被 `ps -ef` 旁路读取命令行参数。
 */
export function buildMainWindowWebPreferences(
  currentDir: string,
  additionalArguments: string[]
) {
  return {
    preload: join(currentDir, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    additionalArguments,
  };
}
