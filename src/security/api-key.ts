/**
 * API 密钥校验。
 *
 * 使用 SHA-256 后再做时间恒定比较，避免密钥长度不同时
 * `timingSafeEqual` 直接抛错，也避免按字符短路比较。
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { getConfig } from '../config';
import { readHeader, type HttpRequestLike } from '../response';

const hash = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

export const secretsEqual = (left: string, right: string): boolean => {
  const a = hash(left);
  const b = hash(right);
  return timingSafeEqual(a, b);
};

export type ApiKeyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 401 | 500; readonly message: string };

/**
 * 读取调用方可能提供的 API 密钥。
 * 兼容 OpenAPI 的 `x-api-key`，以及智启插件鉴权里的 Bearer / Basic。
 * Basic 会同时尝试用户名和密码，避免智启把密钥放在其中一侧。
 */
export const readProvidedApiKeys = (req: HttpRequestLike): readonly string[] => {
  const keys: string[] = [];
  const push = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !keys.includes(trimmed)) keys.push(trimmed);
  };

  push(readHeader(req, 'x-api-key'));

  const authorization = readHeader(req, 'authorization').trim();
  if (!authorization) return keys;

  const space = authorization.indexOf(' ');
  const scheme = (space === -1 ? authorization : authorization.slice(0, space)).toLowerCase();
  const credential = (space === -1 ? '' : authorization.slice(space + 1)).trim();

  if (scheme === 'bearer') {
    push(credential);
    return keys;
  }
  if (scheme === 'basic') {
    for (const part of decodeBasicCredential(credential)) push(part);
  }
  return keys;
};

const decodeBasicCredential = (credential: string): readonly string[] => {
  try {
    const decoded = Buffer.from(credential, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) return decoded.trim() ? [decoded.trim()] : [];
    const username = decoded.slice(0, colon).trim();
    const password = decoded.slice(colon + 1).trim();
    return [username, password].filter((item) => item.length > 0);
  } catch {
    return [];
  }
};

/**
 * 校验转换接口密钥。
 * 服务端未配置密钥时拒绝全部请求（500），避免接口在未设防状态下对外可用。
 */
export const verifyApiKey = (req: HttpRequestLike): ApiKeyResult => {
  const { apiKey } = getConfig();
  if (!apiKey) {
    return {
      ok: false,
      code: 500,
      message: '服务未配置 DOCX_API_KEY，已拒绝转换。',
    };
  }

  const provided = readProvidedApiKeys(req);
  if (provided.length === 0) {
    return { ok: false, code: 401, message: '缺少 API 密钥。请提供 x-api-key，或 Authorization Bearer/Basic。' };
  }
  if (!provided.some((item) => secretsEqual(item, apiKey))) {
    return { ok: false, code: 401, message: 'API 密钥无效。' };
  }
  return { ok: true };
};

/**
 * 校验清理接口的密钥。
 * 接受 Vercel Cron 自动附加的 `Authorization: Bearer <CRON_SECRET>`，
 * 也接受手动调用时的 `x-cron-secret`。
 */
export const verifyCronSecret = (req: HttpRequestLike): ApiKeyResult => {
  const { cronSecret } = getConfig();
  if (!cronSecret) {
    return {
      ok: false,
      code: 401,
      message: '服务未配置 CRON_SECRET，已拒绝清理请求。',
    };
  }

  const bearer = readHeader(req, 'authorization').trim();
  const headerSecret = readHeader(req, 'x-cron-secret').trim();
  const fromBearer = bearer.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : '';
  const provided = fromBearer || headerSecret;

  if (!provided) {
    return { ok: false, code: 401, message: '缺少 Cron 鉴权信息。' };
  }
  if (!secretsEqual(provided, cronSecret)) {
    return { ok: false, code: 401, message: 'Cron 鉴权无效。' };
  }
  return { ok: true };
};
