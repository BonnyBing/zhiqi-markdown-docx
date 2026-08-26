/**
 * 安全日志。
 *
 * 禁止输出完整 Markdown、API 密钥、Blob Token 或图片 URL 中的查询参数。
 */

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|authorization|password|blob)/i;

export const redactUrl = (raw: string): string => {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid-url]';
  }
};

export const safeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.replace(/vercel_blob_rw_[A-Za-z0-9]+/g, '[redacted]');
  }
  return '未知错误';
};

const sanitizeValue = (key: string, value: unknown): unknown => {
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]';
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return redactUrl(value);
  if (typeof value === 'string' && value.length > 200) return `[string:${value.length}chars]`;
  return value;
};

export const logEvent = (event: string, data: Record<string, unknown> = {}): void => {
  const sanitized: Record<string, unknown> = { event };
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = sanitizeValue(key, value);
  }
  console.log(JSON.stringify(sanitized));
};
