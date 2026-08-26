/**
 * 下载公网图片并校验类型、尺寸，供 Word ImageRun 嵌入。
 *
 * 生产路径只走 HTTPS；测试可通过注入 fetch 返回本地夹具，绝不开启 file: 协议。
 */

import { imageSize } from 'image-size';

import {
  IMAGE_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REDIRECTS,
  MAX_REMOTE_IMAGES,
  getConfig,
} from '../config';
import { logEvent, redactUrl, safeErrorMessage } from '../log';
import { assertSafeImageUrl } from '../security/image-url';
import type { DocumentBlock, InlineNode } from '../types';
import { fitImage } from './page-layout';

export type ImageType = 'png' | 'jpg' | 'gif' | 'bmp';

export type LoadedImage = {
  readonly ok: true;
  readonly type: ImageType;
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly scaledWidth: number;
  readonly scaledHeight: number;
  readonly alt: string;
  readonly src: string;
};

export type FailedImage = {
  readonly ok: false;
  readonly src: string;
  readonly alt: string;
  readonly reason: string;
};

export type ImageLoadResult = LoadedImage | FailedImage;

export type ImageFetch = (
  input: string,
  init?: {
    readonly redirect?: 'follow' | 'error' | 'manual';
    readonly signal?: AbortSignal;
    readonly headers?: Record<string, string>;
  },
) => Promise<Response>;

export type ImageLoaderOptions = {
  readonly fetch?: ImageFetch;
  readonly allowlist?: readonly string[];
  readonly maxImages?: number;
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIG = [0xff, 0xd8, 0xff];
const GIF_SIG = [0x47, 0x49, 0x46, 0x38];
const BMP_SIG = [0x42, 0x4d];

const sniffImageType = (bytes: Uint8Array): ImageType | 'svg' | null => {
  if (bytes.length >= 4 && PNG_SIG.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 3 && JPEG_SIG.every((b, i) => bytes[i] === b)) return 'jpg';
  if (bytes.length >= 4 && GIF_SIG.every((b, i) => bytes[i] === b)) return 'gif';
  if (bytes.length >= 2 && BMP_SIG.every((b, i) => bytes[i] === b)) return 'bmp';

  const head = Buffer.from(bytes.slice(0, 256)).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
};

const ALLOWED_CONTENT_TYPES: Record<string, ImageType | 'svg'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/svg+xml': 'svg',
};

const fail = (src: string, alt: string, reason: string): FailedImage => ({
  ok: false,
  src,
  alt,
  reason,
});

const walkInlines = (nodes: readonly InlineNode[], acc: { src: string; alt: string }[]): void => {
  for (const node of nodes) {
    if (node.kind === 'image') acc.push({ src: node.src, alt: node.alt });
    if (node.kind === 'link') walkInlines(node.children, acc);
  }
};

export const collectImageRefs = (
  blocks: readonly DocumentBlock[],
): { src: string; alt: string }[] => {
  const acc: { src: string; alt: string }[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'image':
        acc.push({ src: block.src, alt: block.alt });
        break;
      case 'heading':
      case 'paragraph':
      case 'listItem':
        walkInlines(block.children, acc);
        break;
      case 'table':
        for (const cell of [...block.header, ...block.rows.flat()]) {
          walkInlines(cell.children, acc);
        }
        break;
      default:
        break;
    }
  }

  const seen = new Set<string>();
  const unique: { src: string; alt: string }[] = [];
  for (const ref of acc) {
    const key = ref.src.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ src: key, alt: ref.alt });
  }
  return unique;
};

const readLimitedBody = async (response: Response, maxBytes: number): Promise<Uint8Array> => {
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`图片超过 ${maxBytes} 字节上限。`);
  }

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error(`图片超过 ${maxBytes} 字节上限。`);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`图片超过 ${maxBytes} 字节上限。`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
};

const fetchFollowingRedirects = async (
  startUrl: string,
  fetchFn: ImageFetch,
  allowlist: readonly string[],
): Promise<{ response: Response; finalUrl: string }> => {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop += 1) {
    const safe = await assertSafeImageUrl(current, allowlist);
    if (!safe.ok) throw new Error(safe.reason);

    const response = await fetchFn(safe.url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: {
        Accept: 'image/png,image/jpeg,image/gif,image/bmp,image/*;q=0.8',
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('图片重定向缺少 Location。');
      current = new URL(location, safe.url).href;
      continue;
    }

    return { response, finalUrl: safe.url.href };
  }
  throw new Error(`图片重定向超过 ${MAX_IMAGE_REDIRECTS} 次。`);
};

export const loadOneImage = async (
  src: string,
  alt: string,
  options: ImageLoaderOptions = {},
): Promise<ImageLoadResult> => {
  const allowlist = options.allowlist ?? getConfig().allowedImageHosts;
  const fetchFn = options.fetch ?? fetch;

  try {
    const { response, finalUrl } = await fetchFollowingRedirects(src, fetchFn, allowlist);
    if (!response.ok) {
      return fail(src, alt, `图片下载失败（HTTP ${response.status}）。`);
    }

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (contentType && contentType in ALLOWED_CONTENT_TYPES && ALLOWED_CONTENT_TYPES[contentType] === 'svg') {
      return fail(src, alt, '第一版不支持 SVG，已跳过嵌入。');
    }
    if (contentType && contentType.startsWith('image/') && !(contentType in ALLOWED_CONTENT_TYPES)) {
      return fail(src, alt, `不支持的图片类型：${contentType}。`);
    }

    const data = await readLimitedBody(response, MAX_IMAGE_BYTES);
    const sniffed = sniffImageType(data);
    if (sniffed === 'svg') {
      return fail(src, alt, '第一版不支持 SVG，已跳过嵌入。');
    }
    if (!sniffed) {
      return fail(src, alt, '下载内容不是 PNG/JPEG/GIF/BMP 图片。');
    }

    if (contentType && contentType in ALLOWED_CONTENT_TYPES) {
      const declared = ALLOWED_CONTENT_TYPES[contentType];
      if (declared && declared !== 'svg' && declared !== sniffed) {
        logEvent('image_type_mismatch', { src: redactUrl(src), declared, sniffed });
      }
    }

    let width = 0;
    let height = 0;
    try {
      const size = imageSize(data);
      width = size.width ?? 0;
      height = size.height ?? 0;
    } catch {
      return fail(src, alt, '无法读取图片尺寸。');
    }
    if (width <= 0 || height <= 0) {
      return fail(src, alt, '图片宽高无效。');
    }

    const scaled = fitImage(width, height);
    return {
      ok: true,
      type: sniffed,
      data,
      width,
      height,
      scaledWidth: scaled.width,
      scaledHeight: scaled.height,
      alt,
      src: finalUrl,
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    if (message.includes('timeout') || message.includes('Timeout') || message.includes('aborted')) {
      return fail(src, alt, '图片下载超时。');
    }
    return fail(src, alt, message);
  }
};

export const loadImages = async (
  blocks: readonly DocumentBlock[],
  options: ImageLoaderOptions = {},
): Promise<{ results: Map<string, ImageLoadResult>; warnings: string[] }> => {
  const refs = collectImageRefs(blocks);
  const maxImages = options.maxImages ?? MAX_REMOTE_IMAGES;
  const warnings: string[] = [];
  const results = new Map<string, ImageLoadResult>();

  if (refs.length > maxImages) {
    warnings.push(`文档包含 ${refs.length} 张远程图片，超过 ${maxImages} 张上限，多余图片未嵌入。`);
  }

  const selected = refs.slice(0, maxImages);
  for (const ref of selected) {
    const loaded = await loadOneImage(ref.src, ref.alt, options);
    results.set(ref.src, loaded);
    if (!loaded.ok) {
      warnings.push(`图片未能嵌入（${ref.alt || '无说明'}）：${loaded.reason}`);
    }
  }

  for (const extra of refs.slice(maxImages)) {
    results.set(extra.src, fail(extra.src, extra.alt, `超过单篇 ${maxImages} 张图片上限。`));
  }

  return { results, warnings };
};

export const imageFallbackText = (alt: string): string =>
  `图片未能嵌入：${alt.trim() || '无说明'}`;
