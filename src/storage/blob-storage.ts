/**
 * Vercel Blob 存储。
 *
 * 路径由服务端生成（仅 UUID.docx），不接受客户端指定路径。
 * 中文文件名只出现在 API 的 word_filename 中，不写入 Blob 路径。
 * 上传使用 public 访问、禁止覆盖；失败时不得对外声称成功。
 */

import { del, list, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

import {
  BLOB_PREFIX,
  DOCX_CONTENT_TYPE,
  getConfig,
} from '../config';
import { logEvent, safeErrorMessage } from '../log';

export type UploadedBlob = {
  readonly url: string;
  readonly pathname: string;
};

export type StoredBlob = {
  readonly url: string;
  readonly pathname: string;
  readonly uploadedAt: Date;
};

export type BlobStore = {
  putDocx(pathname: string, body: Buffer): Promise<UploadedBlob>;
  listDocx(): Promise<readonly StoredBlob[]>;
  delete(url: string): Promise<void>;
};

const UUID_DOCX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$/i;

/** 本服务管理的对象：新路径为 {uuid}.docx，旧路径以 docx/ 开头。 */
export const isManagedDocxPath = (pathname: string): boolean =>
  UUID_DOCX.test(pathname) || pathname.startsWith(`${BLOB_PREFIX}/`);

/** Blob 路径只含 ASCII：{uuid}.docx */
export const buildBlobPathname = (): string => `${randomUUID()}.docx`;

const requireToken = (): string => {
  const { blobToken, hasBlobToken } = getConfig();
  if (!hasBlobToken) {
    throw new Error('未配置 BLOB_READ_WRITE_TOKEN，无法上传 Word 文件。');
  }
  return blobToken;
};

export const createVercelBlobStore = (): BlobStore => ({
  async putDocx(pathname, body) {
    const token = requireToken();
    const result = await put(pathname, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: DOCX_CONTENT_TYPE,
      token,
    });
    if (!result.url || !result.url.startsWith('https://')) {
      throw new Error('Blob 上传未返回有效的 HTTPS 地址。');
    }
    return { url: result.url, pathname: result.pathname };
  },

  async listDocx() {
    const token = requireToken();
    const blobs: StoredBlob[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        token,
        cursor,
        limit: 1000,
      });
      for (const blob of page.blobs) {
        if (!isManagedDocxPath(blob.pathname)) continue;
        blobs.push({
          url: blob.url,
          pathname: blob.pathname,
          uploadedAt: blob.uploadedAt,
        });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return blobs;
  },

  async delete(url) {
    const token = requireToken();
    await del(url, { token });
  },
});

export const uploadDocx = async (
  store: BlobStore,
  body: Buffer,
): Promise<UploadedBlob> => {
  const pathname = buildBlobPathname();
  try {
    return await store.putDocx(pathname, body);
  } catch (error) {
    logEvent('blob_upload_failed', { message: safeErrorMessage(error) });
    throw new Error('Word 文件上传失败。');
  }
};

export const deleteExpiredDocx = async (
  store: BlobStore,
  retentionHours: number,
  now: Date = new Date(),
): Promise<{ scanned: number; deleted: number }> => {
  const blobs = await store.listDocx();
  const cutoff = now.getTime() - retentionHours * 60 * 60 * 1000;
  let deleted = 0;
  for (const blob of blobs) {
    if (blob.uploadedAt.getTime() > cutoff) continue;
    try {
      await store.delete(blob.url);
      deleted += 1;
    } catch (error) {
      logEvent('blob_delete_failed', { message: safeErrorMessage(error) });
    }
  }
  return { scanned: blobs.length, deleted };
};
