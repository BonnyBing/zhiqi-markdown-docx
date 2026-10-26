/**
 * 本机目录存储（Docker volume / 自建服务器）。
 *
 * 文件写到 LOCAL_STORAGE_DIR/{uuid}.docx，对外 URL 为
 * {PUBLIC_BASE_URL}/files/{uuid}.docx（由 HTTP 服务提供下载）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '../config';
import { logEvent, safeErrorMessage } from '../log';
import {
  isManagedDocxPath,
  type BlobStore,
  type StoredBlob,
  type UploadedBlob,
} from './blob-storage';

const FILES_PREFIX = '/files/';

const requireLocalDir = (): string => {
  const { localStorageDir, hasLocalStorage } = getConfig();
  if (!hasLocalStorage) {
    throw new Error('未配置 LOCAL_STORAGE_DIR，无法写入本机 Word 文件。');
  }
  return localStorageDir;
};

const requirePublicBase = (): string => {
  const base = getConfig().publicBaseUrl.replace(/\/$/, '');
  if (!base) {
    throw new Error('使用本机存储时必须配置 PUBLIC_BASE_URL。');
  }
  return base;
};

const absoluteFile = (dir: string, pathname: string): string => {
  const safe = path.basename(pathname);
  if (!isManagedDocxPath(safe) || safe.includes('..')) {
    throw new Error('非法文件路径。');
  }
  return path.join(dir, safe);
};

const publicUrlFor = (pathname: string): string =>
  `${requirePublicBase()}${FILES_PREFIX}${path.basename(pathname)}`;

export const createLocalFileStore = (): BlobStore => ({
  async putDocx(pathname, body) {
    const dir = requireLocalDir();
    await fs.mkdir(dir, { recursive: true });
    const filePath = absoluteFile(dir, pathname);
    try {
      await fs.writeFile(filePath, body, { flag: 'wx' });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EEXIST') {
        throw new Error('目标文件已存在，拒绝覆盖。');
      }
      throw error;
    }
    const url = publicUrlFor(pathname);
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('本机存储未返回有效的 HTTP(S) 地址。');
    }
    return { url, pathname: path.basename(pathname) } satisfies UploadedBlob;
  },

  async listDocx() {
    const dir = requireLocalDir();
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return [];
      throw error;
    }
    const blobs: StoredBlob[] = [];
    for (const name of names) {
      if (!isManagedDocxPath(name)) continue;
      const full = path.join(dir, name);
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      blobs.push({
        url: publicUrlFor(name),
        pathname: name,
        uploadedAt: stat.mtime,
      });
    }
    return blobs;
  },

  async delete(url) {
    const dir = requireLocalDir();
    let pathname: string;
    try {
      const parsed = new URL(url);
      const base = path.basename(parsed.pathname);
      if (!isManagedDocxPath(base)) {
        throw new Error('不是本服务管理的文件 URL。');
      }
      pathname = base;
    } catch (error) {
      logEvent('local_delete_bad_url', { message: safeErrorMessage(error) });
      throw new Error('无法解析待删除文件地址。');
    }
    const filePath = absoluteFile(dir, pathname);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
  },
});
