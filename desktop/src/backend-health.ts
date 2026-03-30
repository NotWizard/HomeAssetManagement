export type HealthResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type HealthFetchLike = (
  input: string,
  init?: { signal?: AbortSignal }
) => Promise<HealthResponseLike>;

export type BackendHealthProbeResult =
  | { kind: 'ready' }
  | { kind: 'connection_refused' }
  | { kind: 'timeout' }
  | { kind: 'http_error'; status: number }
  | { kind: 'invalid_payload' }
  | { kind: 'network_error'; message: string };

export type WaitForBackendReadyOptions = {
  healthUrl: string;
  attempts: number;
  pollIntervalMs: number;
  requestTimeoutMs: number;
  isProcessExited: () => boolean;
  getExitCode: () => number | null;
  fetchImpl?: HealthFetchLike;
  sleep?: (ms: number) => Promise<void>;
};

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof value.code === 'string') {
    return value.code;
  }
  if (typeof value.cause?.code === 'string') {
    return value.cause.code;
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as { name?: unknown }).name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export async function probeBackendHealth(options: {
  healthUrl: string;
  requestTimeoutMs: number;
  fetchImpl?: HealthFetchLike;
}): Promise<BackendHealthProbeResult> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init) as Promise<HealthResponseLike>);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs);

  try {
    const response = await fetchImpl(options.healthUrl, { signal: controller.signal });
    if (!response.ok) {
      return { kind: 'http_error', status: response.status };
    }

    const payload = await response.json().catch(() => null);
    if (
      payload &&
      typeof payload === 'object' &&
      (payload as { status?: unknown }).status === 'ok'
    ) {
      return { kind: 'ready' };
    }

    return { kind: 'invalid_payload' };
  } catch (error) {
    if (isAbortError(error)) {
      return { kind: 'timeout' };
    }

    if (getErrorCode(error) === 'ECONNREFUSED') {
      return { kind: 'connection_refused' };
    }

    return { kind: 'network_error', message: getErrorMessage(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function formatBackendHealthFailure(result: BackendHealthProbeResult): string {
  switch (result.kind) {
    case 'ready':
      return '后端已就绪';
    case 'connection_refused':
      return '服务端口未监听';
    case 'timeout':
      return '健康检查请求超时';
    case 'http_error':
      return `健康检查返回 HTTP ${result.status}`;
    case 'invalid_payload':
      return '健康检查响应格式无效';
    case 'network_error':
      return `健康检查请求异常：${result.message}`;
  }
}

export async function waitForBackendReadyWithHealthCheck(
  options: WaitForBackendReadyOptions
): Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => import('node:timers/promises').then((m) => m.setTimeout(ms)));
  let lastFailure: BackendHealthProbeResult = { kind: 'connection_refused' };

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    if (options.isProcessExited()) {
      throw new Error(`后端进程提前退出，退出码: ${options.getExitCode() ?? 'unknown'}`);
    }

    const result = await probeBackendHealth({
      healthUrl: options.healthUrl,
      requestTimeoutMs: options.requestTimeoutMs,
      fetchImpl: options.fetchImpl,
    });

    if (result.kind === 'ready') {
      return;
    }

    lastFailure = result;

    if (attempt < options.attempts - 1) {
      await sleep(options.pollIntervalMs);
    }
  }

  throw new Error(`后端健康检查超时：${formatBackendHealthFailure(lastFailure)}`);
}
