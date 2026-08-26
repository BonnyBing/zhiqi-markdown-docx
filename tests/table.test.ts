import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../src/markdown/parser';
import { inlineToPlainText } from '../src/markdown/inline-converter';
import { buildDocxBuffer } from '../src/word/document-builder';
import { inspectDocx } from './helpers/docx-zip';
import type { TableBlock } from '../src/types';

const TABLE_MD = [
  '| 环节 | 时间 | 学生活动 |',
  '| --- | :---: | ---: |',
  '| 导入 | 5分钟 | 观察实验 |',
  '| 探究 | 15分钟 | **小组**讨论 |',
].join('\n');

describe('Markdown 表格 → Word 原生表格', () => {
  it('解析结果不含分隔行或管道符', () => {
    const { blocks } = parseMarkdown(TABLE_MD);
    const table = blocks.find((block): block is TableBlock => block.kind === 'table');
    expect(table).toBeDefined();
    expect(table!.columnCount).toBe(3);
    expect(table!.header.map((cell) => inlineToPlainText(cell.children))).toEqual([
      '环节',
      '时间',
      '学生活动',
    ]);
    const serialized = JSON.stringify(table);
    expect(serialized).not.toContain('---');
    expect(serialized).not.toMatch(/\|/);
  });

  it('生成的 DOCX 含 w:tbl，正文不含 Markdown 管道分隔行', async () => {
    const parsed = parseMarkdown(`# 表格验收\n\n${TABLE_MD}\n`);
    const buffer = await buildDocxBuffer({ blocks: parsed.blocks });
    const zip = await inspectDocx(buffer);
    expect(zip.documentXml).toContain('<w:tbl');
    expect(zip.documentXml).toContain('环节');
    expect(zip.documentXml).toContain('学生活动');
    expect(zip.documentXml).not.toContain('| --- |');
    expect(zip.documentXml).not.toContain('| 环节 |');
  });
});
