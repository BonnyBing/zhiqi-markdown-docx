/**
 * 请求体与 Markdown 长度限制。
 */

import { REQUEST_BODY_SLACK_BYTES, getConfig } from '../config';
import { readHeader, type HttpRequestLike } from '../response';

export const utf8ByteLength = (text: string): number => Buffer.byteLength(text, 'utf8');

export type LimitError = {
  readonly ok: false;
  readonly code: 400 | 413;
  readonly message: string;
};

export const checkContentLength = (req: HttpRequestLike): LimitError | { readonly ok: true } => {
  const { maxMarkdownBytes } = getConfig();
  const maxBody = maxMarkdownBytes + REQUEST_BODY_SLACK_BYTES;
  const raw = readHeader(req, 'content-length').trim();
  if (!raw) return { ok: true };
  const length = Number.parseInt(raw, 10);
  if (!Number.isFinite(length) || length < 0) {
    return { ok: false, code: 400, message: 'Content-Length 无效。' };
  }
  if (length > maxBody) {
    return {
      ok: false,
      code: 413,
      message: `请求体超过 ${maxBody} 字节上限。`,
    };
  }
  return { ok: true };
};

export const checkMarkdown = (
  markdown: unknown,
  maxBytes: number = getConfig().maxMarkdownBytes,
): { readonly ok: true; readonly text: string } | LimitError => {
  if (typeof markdown !== 'string') {
    return { ok: false, code: 400, message: 'markdown 必须是字符串。' };
  }
  if (markdown.trim().length === 0) {
    return { ok: false, code: 400, message: 'markdown 不能为空。' };
  }
  const bytes = utf8ByteLength(markdown);
  if (bytes > maxBytes) {
    return {
      ok: false,
      code: 413,
      message: `markdown 超过 ${maxBytes} 字节上限。`,
    };
  }
  return { ok: true, text: markdown };
};
