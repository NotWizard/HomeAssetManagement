const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * 转义进入 ECharts tooltip 的用户可控字符串。
 *
 * ECharts tooltip 默认 renderMode: 'html'，formatter 返回的字符串直接拼进
 * innerHTML；持仓名 / 成员名是用户输入（含 CSV 导入渠道），不转义即 HTML 注入。
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}
