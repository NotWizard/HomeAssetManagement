/**
 * 与 runtime/getApiBaseUrl/getDesktopBridge 解耦的网络底层工具：
 * - 错误类型：ApiError / ApiTimeoutError
 * - safeParseJson：把 fetch Response 转成 JSON，避免 5xx 的 HTML 直接抛 SyntaxError
 * - fetchWithTimeout：合并外部 signal 与超时，超时以 ApiTimeoutError 作为 abort reason
 * - withRequestTimeout：给不经 fetch 的桌面桥 Promise 包同样的超时/取消语义
 *
 * 抽到独立模块的目的是让单元测试不必加载整个 runtime 树。
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class ApiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`请求超时（${timeoutMs}ms）`);
    this.name = 'ApiTimeoutError';
  }
}

export type RequestExtras = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export async function safeParseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    throw new ApiError(
      `服务返回非 JSON 响应（${response.status}）：${snippet}`,
      response.status
    );
  }
}

/**
 * 给桌面桥（IPC）Promise 包一层与 fetchWithTimeout 对齐的超时/取消语义。
 *
 * 桌面桥的 Promise 挂起时（主进程卡住）原本没有 30s 兜底，React Query 的卸载
 * 取消也不生效；这里补齐：超时 reject ApiTimeoutError，外部 signal 取消透传原因。
 */
export function withRequestTimeout<T>(
  promise: Promise<T>,
  extras: RequestExtras = {}
): Promise<T> {
  const timeoutMs = extras.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const externalSignal = extras.signal;

  return new Promise<T>((resolvePromise, rejectPromise) => {
    const cleanup = () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    };
    const onExternalAbort = () => {
      cleanup();
      rejectPromise(externalSignal?.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      rejectPromise(new ApiTimeoutError(timeoutMs));
    }, timeoutMs);

    if (externalSignal?.aborted) {
      onExternalAbort();
      return;
    }
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    promise.then(
      (value) => {
        cleanup();
        resolvePromise(value);
      },
      (error) => {
        cleanup();
        rejectPromise(error);
      }
    );
  });
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  extras: RequestExtras,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const timeoutMs = extras.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const externalSignal = extras.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  const timeoutHandle = setTimeout(() => {
    controller.abort(new ApiTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof ApiTimeoutError
    ) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
