/**
 * 图片 URL 安全校验（防 SSRF）。
 *
 * 只允许 HTTPS；拒绝 localhost、私有网段、链路本地、云元数据地址，
 * 以及 file / data / javascript 等协议。若配置了 ALLOWED_IMAGE_HOSTS，
 * 则最终跳转地址也必须落在白名单内。
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { getConfig } from '../config';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'kubernetes.default.svc',
]);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.invalid'];

export type UrlCheckResult =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

const isIPv4InCidr = (ip: string, prefix: string, bits: number): boolean => {
  const ipNum = ipv4ToInt(ip);
  const prefixNum = ipv4ToInt(prefix);
  if (ipNum === null || prefixNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (prefixNum & mask);
};

const ipv4ToInt = (ip: string): number | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number.parseInt(part, 10));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((nums[0] ?? 0) << 24) | ((nums[1] ?? 0) << 16) | ((nums[2] ?? 0) << 8) | (nums[3] ?? 0)) >>> 0;
};

const stripIpv6Brackets = (host: string): string =>
  host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

const extractIpv4Mapped = (ip: string): string | null => {
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:')) return lower.slice(7);
  return null;
};

export const isPrivateOrDisallowedIp = (ip: string): boolean => {
  const mapped = extractIpv4Mapped(ip);
  if (mapped) return isPrivateOrDisallowedIp(mapped);

  const version = isIP(ip);
  if (version === 4) {
    return (
      isIPv4InCidr(ip, '0.0.0.0', 8) ||
      isIPv4InCidr(ip, '10.0.0.0', 8) ||
      isIPv4InCidr(ip, '127.0.0.0', 8) ||
      isIPv4InCidr(ip, '169.254.0.0', 16) ||
      isIPv4InCidr(ip, '172.16.0.0', 12) ||
      isIPv4InCidr(ip, '192.168.0.0', 16) ||
      isIPv4InCidr(ip, '100.64.0.0', 10) ||
      ip === '255.255.255.255'
    );
  }

  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fec0:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    return false;
  }

  return true;
};

export const hostMatchesAllowlist = (
  hostname: string,
  allowlist: readonly string[],
): boolean => {
  if (allowlist.length === 0) return true;
  const host = hostname.replace(/\.$/, '').toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

const isBlockedHostname = (hostname: string): boolean => {
  const host = stripIpv6Brackets(hostname).replace(/\.$/, '').toLowerCase();
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;
  if (isIP(host) && isPrivateOrDisallowedIp(host)) return true;
  return false;
};

/**
 * 同步检查 URL 形态（协议、主机名、白名单、明文私有 IP）。
 * DNS 解析在 `assertSafeImageUrl` 中进行。
 */
export const checkImageUrlShape = (
  raw: string,
  allowlist: readonly string[] = getConfig().allowedImageHosts,
): UrlCheckResult => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: '图片地址为空。' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: '图片地址不是合法 URL。' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'file:' || protocol === 'data:' || protocol === 'javascript:' || protocol === 'vbscript:') {
    return { ok: false, reason: `不允许使用 ${protocol} 协议下载图片。` };
  }
  if (protocol !== 'https:') {
    return { ok: false, reason: '只允许通过 HTTPS 下载图片。' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: '图片地址不得包含用户名或密码。' };
  }

  const hostname = parsed.hostname;
  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: '拒绝访问本地、内网或元数据地址。' };
  }

  if (!hostMatchesAllowlist(hostname, allowlist)) {
    return { ok: false, reason: '图片域名不在允许列表中。' };
  }

  return { ok: true, url: parsed };
};

/**
 * 完整校验：形态 + DNS 解析结果不得指向私有 IP。
 */
export const assertSafeImageUrl = async (
  raw: string,
  allowlist: readonly string[] = getConfig().allowedImageHosts,
): Promise<UrlCheckResult> => {
  const shape = checkImageUrlShape(raw, allowlist);
  if (!shape.ok) return shape;

  const host = stripIpv6Brackets(shape.url.hostname);
  if (isIP(host)) {
    if (isPrivateOrDisallowedIp(host)) {
      return { ok: false, reason: '拒绝访问本地、内网或元数据地址。' };
    }
    return shape;
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) {
      return { ok: false, reason: '无法解析图片域名。' };
    }
    if (records.some((record) => isPrivateOrDisallowedIp(record.address))) {
      return { ok: false, reason: '图片域名解析到了内网或保留地址，已拒绝下载。' };
    }
  } catch {
    return { ok: false, reason: '无法解析图片域名。' };
  }

  return shape;
};
