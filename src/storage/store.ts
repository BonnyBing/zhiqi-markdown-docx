/**
 * 按环境变量选择存储后端：
 * 1. LOCAL_STORAGE_DIR → 本机目录（公司 Docker）
 * 2. BLOB_READ_WRITE_TOKEN → Vercel Blob
 */

import { getConfig } from '../config';
import { createVercelBlobStore, type BlobStore } from './blob-storage';
import { createLocalFileStore } from './local-storage';

export const createDefaultStore = (): BlobStore => {
  const { storageBackend } = getConfig();
  if (storageBackend === 'local') return createLocalFileStore();
  if (storageBackend === 'vercel_blob') return createVercelBlobStore();
  throw new Error(
    '未配置存储：请设置 LOCAL_STORAGE_DIR（自建/Docker）或 BLOB_READ_WRITE_TOKEN（Vercel）。',
  );
};
