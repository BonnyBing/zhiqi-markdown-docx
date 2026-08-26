import { describe, expect, it } from 'vitest';

import { sanitizeFilename, stripDocxExtension } from '../src/word/filename';

describe('文件名清洗', () => {
  it('去掉末尾重复的 .docx 后只追加一次', () => {
    expect(stripDocxExtension('教案.docx.docx')).toBe('教案');
    const result = sanitizeFilename('小学三年级数学-乘除法的应用（二）-科学跨学科教案.docx');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.downloadName).toBe('小学三年级数学-乘除法的应用（二）-科学跨学科教案.docx');
    expect(result.downloadName.match(/\.docx$/i)).toHaveLength(1);
  });

  it('非法字符被安全清洗为 -', () => {
    const result = sanitizeFilename('教案/测试:*?.docx');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.downloadName).toBe('教案-测试.docx');
    expect(result.warnings.join('')).toContain('非法字符');
  });

  it('拒绝空文件名和超长文件名', () => {
    expect(sanitizeFilename('   ').ok).toBe(false);
    expect(sanitizeFilename('a'.repeat(81)).ok).toBe(false);
  });

  it('拒绝清洗后为空的文件名', () => {
    expect(sanitizeFilename('...').ok).toBe(false);
    expect(sanitizeFilename('///').ok).toBe(false);
  });
});
