import { describe, expect, it } from 'vitest';

import { buildBlobPathname, isManagedDocxPath } from '../src/storage/blob-storage';

describe('Blob 存储路径', () => {
  it('只有 UUID.docx，不含目录前缀和中文文件名', () => {
    const pathname = buildBlobPathname();
    expect(pathname).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$/i,
    );
    expect(pathname).not.toContain('/');
    expect(encodeURI(pathname)).toBe(pathname);
  });

  it('每次调用生成不同 UUID', () => {
    const first = buildBlobPathname();
    const second = buildBlobPathname();
    expect(first).not.toBe(second);
  });

  it('清理会覆盖新路径和旧的 docx/ 路径，忽略其他对象', () => {
    expect(isManagedDocxPath('af99592f-8f8c-4b0f-b795-a2867c614188.docx')).toBe(true);
    expect(isManagedDocxPath('docx/2026/08/af99592f-8f8c-4b0f-b795-a2867c614188.docx')).toBe(
      true,
    );
    expect(isManagedDocxPath('other/readme.txt')).toBe(false);
  });
});
