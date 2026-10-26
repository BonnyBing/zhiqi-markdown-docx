import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLocalFileStore } from '../src/storage/local-storage';
import { buildBlobPathname } from '../src/storage/blob-storage';

describe('本机目录存储', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'zhiqi-word-'));
    process.env.LOCAL_STORAGE_DIR = dir;
    process.env.PUBLIC_BASE_URL = 'http://10.20.0.34:8100';
  });

  afterEach(async () => {
    delete process.env.LOCAL_STORAGE_DIR;
    delete process.env.PUBLIC_BASE_URL;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('写入后返回本机可下载 URL', async () => {
    const store = createLocalFileStore();
    const pathname = buildBlobPathname();
    const body = Buffer.from('PK-fake-docx');
    const uploaded = await store.putDocx(pathname, body);
    expect(uploaded.url).toBe(`http://10.20.0.34:8100/files/${pathname}`);
    const listed = await store.listDocx();
    expect(listed.some((b) => b.pathname === pathname)).toBe(true);
    await store.delete(uploaded.url);
    const after = await store.listDocx();
    expect(after.some((b) => b.pathname === pathname)).toBe(false);
  });
});
