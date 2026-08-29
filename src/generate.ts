/**
 * Markdown → DOCX → Blob 的主编排。
 *
 * HTTP 层只负责鉴权、限流和响应格式；真正的转换失败/成功在这里决定。
 * 核心生成或上传失败时 word_url 必须为空。
 */

import { getConfig } from './config';
import { logEvent, safeErrorMessage } from './log';
import { parseMarkdown } from './markdown/parser';
import { buildError, buildSuccess, joinWarnings } from './response';
import { checkMarkdown } from './security/request-limits';
import {
  createVercelBlobStore,
  uploadDocx,
  type BlobStore,
} from './storage/blob-storage';
import type { GenerateDocxResponse } from './types';
import { sanitizeFilename } from './word/filename';
import { buildDocxBuffer } from './word/document-builder';
import { loadImages, type ImageFetch } from './word/image-loader';

export type GenerateDeps = {
  readonly blobStore?: BlobStore;
  readonly fetch?: ImageFetch;
};

export type GenerateInput = {
  readonly markdown: unknown;
  readonly filename: unknown;
  readonly documentTitle?: unknown;
};

const expiresAtIso = (): string => {
  const { cleanupEnabled, fileRetentionHours } = getConfig();
  if (!cleanupEnabled) return '';
  return new Date(Date.now() + fileRetentionHours * 60 * 60 * 1000).toISOString();
};

export const generateDocx = async (
  input: GenerateInput,
  deps: GenerateDeps = {},
): Promise<GenerateDocxResponse> => {
  const markdownCheck = checkMarkdown(input.markdown);
  if (!markdownCheck.ok) {
    return buildError(markdownCheck.code, markdownCheck.message);
  }

  if (input.documentTitle !== undefined && typeof input.documentTitle !== 'string') {
    return buildError(400, 'document_title 必须是字符串。');
  }

  const filename = sanitizeFilename(input.filename);
  if (!filename.ok) {
    return buildError(400, filename.error);
  }

  const parsed = parseMarkdown(markdownCheck.text);
  const warnings = [...parsed.warnings, ...filename.warnings];

  let images;
  try {
    images = await loadImages(parsed.blocks, { fetch: deps.fetch });
    warnings.push(...images.warnings);
  } catch (error) {
    logEvent('image_load_unexpected', { message: safeErrorMessage(error) });
    return buildError(500, '图片处理失败。', warnings);
  }

  let buffer: Buffer;
  try {
    buffer = await buildDocxBuffer({
      blocks: parsed.blocks,
      documentTitle: typeof input.documentTitle === 'string' ? input.documentTitle : undefined,
      images: images.results,
    });
  } catch (error) {
    logEvent('docx_build_failed', { message: safeErrorMessage(error) });
    return buildError(500, 'Word 文档生成失败。', warnings);
  }

  const store = deps.blobStore ?? createVercelBlobStore();
  try {
    const uploaded = await uploadDocx(store, buffer);
    if (!uploaded.url.startsWith('https://')) {
      return buildError(500, '存储返回的地址不是 HTTPS，已拒绝作为下载链接。', warnings);
    }
    return buildSuccess({
      wordUrl: uploaded.url,
      wordFilename: filename.downloadName,
      wordSizeBytes: buffer.byteLength,
      warnings: warnings,
      expiresAt: expiresAtIso(),
    });
  } catch (error) {
    logEvent('docx_upload_failed', { message: safeErrorMessage(error) });
    return buildError(500, 'Word 文件已生成但上传失败，未提供下载链接。', warnings);
  }
};

/** 仅用于本地样例：生成 DOCX 缓冲区，不上传 Blob。 */
export const generateDocxBuffer = async (
  markdown: string,
  documentTitle?: string,
  deps: Pick<GenerateDeps, 'fetch'> = {},
): Promise<{ buffer: Buffer; warnings: string[]; filenameWarnings: string[] }> => {
  const parsed = parseMarkdown(markdown);
  const images = await loadImages(parsed.blocks, { fetch: deps.fetch });
  const buffer = await buildDocxBuffer({
    blocks: parsed.blocks,
    documentTitle,
    images: images.results,
  });
  return {
    buffer,
    warnings: [...parsed.warnings, ...images.warnings],
    filenameWarnings: [],
  };
};

export const warningsText = joinWarnings;
