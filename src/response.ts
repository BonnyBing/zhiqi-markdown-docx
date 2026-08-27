/**
 * 统一响应构造、CORS 与 OPTIONS 处理。
 *
 * 这里刻意只依赖最小的 request/response 结构（而不是 @vercel/node 的具体类），
 * 让 handler 可以在 Vitest 中用轻量假对象直接调用。VercelRequest / VercelResponse
 * 在结构上兼容这些类型。
 */

import { getConfig } from './config';
import type { GenerateDocxResponse } from './types';

export type HttpRequestLike = {
  readonly method?: string | undefined;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body?: unknown;
  readonly url?: string | undefined;
};

export type HttpResponseLike = {
  status(code: number): HttpResponseLike;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
  end(body?: unknown): unknown;
};

/** 取单个请求头值，统一转小写键并处理数组形式。 */
export const readHeader = (req: HttpRequestLike, name: string): string => {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
};

/**
 * 下发 CORS 头。
 * 智启插件「试运行」在浏览器里跨域调用，默认允许任意 Origin；
 * 若配置了 ALLOWED_ORIGINS，则只回放白名单中的来源。
 */
export const applyCors = (req: HttpRequestLike, res: HttpResponseLike): void => {
  const { allowedOrigins } = getConfig();
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  const origin = readHeader(req, 'origin');
  if (allowedOrigins.length > 0) {
    if (origin && allowedOrigins.includes(origin.toLowerCase())) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*');
};

/** 处理预检请求；返回 true 表示请求已被响应，调用方应直接 return。 */
export const handlePreflight = (req: HttpRequestLike, res: HttpResponseLike): boolean => {
  if ((req.method ?? '').toUpperCase() !== 'OPTIONS') return false;
  applyCors(req, res);
  res.status(204).end();
  return true;
};

export const noStore = (res: HttpResponseLike): void => {
  res.setHeader('Cache-Control', 'no-store');
};

export type SuccessPayload = {
  readonly wordUrl: string;
  readonly wordFilename: string;
  readonly wordSizeBytes: number;
  readonly warnings: readonly string[];
  readonly expiresAt: string;
};

export const buildSuccess = (payload: SuccessPayload): GenerateDocxResponse => ({
  code: 200,
  word_status: 'success',
  word_url: payload.wordUrl,
  word_filename: payload.wordFilename,
  word_size_bytes: payload.wordSizeBytes,
  word_message: '',
  warnings_text: joinWarnings(payload.warnings),
  expires_at: payload.expiresAt,
});

/**
 * 任何非 200 结果都必须是 error，并且 word_url 必须为空字符串。
 * 绝不允许在失败时返回任何形式的下载链接。
 */
export const buildError = (
  code: number,
  message: string,
  warnings: readonly string[] = [],
): GenerateDocxResponse => ({
  code,
  word_status: 'error',
  word_url: '',
  word_filename: '',
  word_size_bytes: 0,
  word_message: message,
  warnings_text: joinWarnings(warnings),
  expires_at: '',
});

/** 告警拼成单行文本，方便智启在一个变量里直接展示。 */
export const joinWarnings = (warnings: readonly string[]): string => {
  const unique: string[] = [];
  for (const warning of warnings) {
    const text = warning.trim();
    if (text.length > 0 && !unique.includes(text)) unique.push(text);
  }
  return unique.join('；');
};

/** 统一以 HTTP 状态码 + 扁平 JSON 输出。 */
export const sendJson = (
  res: HttpResponseLike,
  statusCode: number,
  body: unknown,
): void => {
  noStore(res);
  res.status(statusCode).json(body);
};
