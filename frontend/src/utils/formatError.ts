/**
 * 把任意 thrown 值格式化为面向用户的字符串。
 *
 * - `Error` 实例 → 取 `message`（避免暴露 stack）
 * - 字符串 → 原样返回
 * - 其它 → 默认兜底文案
 *
 * 不要直接用 `String(error)`：那会得到 `"Error: 文件编码错误"` 这种带前缀的不友好串。
 */
export function formatError(
  error: unknown,
  fallback = '操作失败，请稍后重试'
): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
}
