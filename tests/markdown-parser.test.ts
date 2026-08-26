import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../src/markdown/parser';
import { inlineToPlainText } from '../src/markdown/inline-converter';
import type { HeadingBlock, ListItemBlock, ParagraphBlock, TableBlock } from '../src/types';

describe('Markdown 解析：标题', () => {
  it('H1~H6 解析为对应层级的标题块', () => {
    const md = ['# 一级', '## 二级', '### 三级', '#### 四级', '##### 五级', '###### 六级'].join(
      '\n\n',
    );
    const { blocks } = parseMarkdown(md);
    const headings = blocks.filter((b): b is HeadingBlock => b.kind === 'heading');
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(inlineToPlainText(headings[0]!.children)).toBe('一级');
    expect(inlineToPlainText(headings[5]!.children)).toBe('六级');
  });
});

describe('Markdown 解析：段落与行内样式', () => {
  it('中文段落保持原文', () => {
    const { blocks } = parseMarkdown('这是一段普通的中文教案说明文字。');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('paragraph');
    expect(inlineToPlainText((blocks[0] as ParagraphBlock).children)).toBe(
      '这是一段普通的中文教案说明文字。',
    );
  });

  it('粗体、斜体、删除线、行内代码不残留 Markdown 标记', () => {
    const { blocks } = parseMarkdown('**重点**与*强调*以及~~删除~~还有`code`。');
    const nodes = (blocks[0] as ParagraphBlock).children;
    const text = inlineToPlainText(nodes);
    expect(text).toBe('重点与强调以及删除还有code。');
    expect(text).not.toContain('*');
    expect(text).not.toContain('~');
    expect(text).not.toContain('`');

    const bold = nodes.find((n) => (n as { bold?: boolean }).bold === true);
    const italic = nodes.find((n) => (n as { italic?: boolean }).italic === true);
    const strike = nodes.find((n) => (n as { strike?: boolean }).strike === true);
    const code = nodes.find((n) => (n as { code?: boolean }).code === true);
    expect(bold).toBeDefined();
    expect(italic).toBeDefined();
    expect(strike).toBeDefined();
    expect(code).toBeDefined();
  });

  it('超链接解析为 link 节点并保留 href', () => {
    const { blocks } = parseMarkdown('参考[知识图谱](https://example.com/kg)。');
    const nodes = (blocks[0] as ParagraphBlock).children;
    const link = nodes.find((n) => n.kind === 'link');
    expect(link?.href).toBe('https://example.com/kg');
  });

  it('<br> 转换为换行节点，其他 HTML 降级为文本并给出告警', () => {
    const result = parseMarkdown('第一行<br>第二行 <span>普通</span>');
    const nodes = (result.blocks[0] as ParagraphBlock).children;
    expect(nodes.some((n) => n.kind === 'break')).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('script 标签被移除且不出现在正文中', () => {
    const result = parseMarkdown('<script>alert(1)</script>\n\n正文段落');
    const text = result.blocks.map((b) => JSON.stringify(b)).join('');
    expect(text).not.toContain('alert');
    expect(result.warnings.join('')).toContain('脚本');
  });
});

describe('Markdown 解析：列表', () => {
  it('有序列表与无序列表分别标记 ordered，且不残留 1. 或 -', () => {
    const md = ['1. 第一步', '2. 第二步', '', '- 要点甲', '- 要点乙'].join('\n');
    const { blocks } = parseMarkdown(md);
    const items = blocks.filter((b): b is ListItemBlock => b.kind === 'listItem');
    expect(items).toHaveLength(4);
    expect(items.slice(0, 2).every((i) => i.ordered)).toBe(true);
    expect(items.slice(2).every((i) => !i.ordered)).toBe(true);
    for (const item of items) {
      const text = inlineToPlainText(item.children);
      expect(text).not.toMatch(/^\s*(\d+\.|[-*+])\s/);
    }
    // 两个列表使用不同 instance，Word 编号才能各自从 1 开始
    expect(items[0]!.instance).not.toBe(items[2]!.instance);
  });

  it('三级嵌套列表保留层级', () => {
    const md = ['- 一级', '  - 二级', '    - 三级'].join('\n');
    const { blocks } = parseMarkdown(md);
    const items = blocks.filter((b): b is ListItemBlock => b.kind === 'listItem');
    expect(items.map((i) => i.level)).toEqual([0, 1, 2]);
  });

  it('超过三级的嵌套列表给出告警并按第三级显示', () => {
    const md = ['- 一级', '  - 二级', '    - 三级', '      - 四级'].join('\n');
    const result = parseMarkdown(md);
    const items = result.blocks.filter((b): b is ListItemBlock => b.kind === 'listItem');
    expect(items.map((i) => i.level)).toEqual([0, 1, 2, 2]);
    expect(result.warnings.join('')).toContain('三级');
  });
});

describe('Markdown 解析：表格', () => {
  it('三列表格拆出表头与数据行，且不含分隔行', () => {
    const md = [
      '| 环节 | 时间 | 学生活动 |',
      '| --- | :---: | ---: |',
      '| 导入 | 5分钟 | 观察实验 |',
      '| 探究 | 15分钟 | **小组**讨论 |',
    ].join('\n');
    const { blocks } = parseMarkdown(md);
    const table = blocks.find((b): b is TableBlock => b.kind === 'table');
    expect(table).toBeDefined();
    expect(table!.columnCount).toBe(3);
    expect(table!.header.map((c) => inlineToPlainText(c.children))).toEqual([
      '环节',
      '时间',
      '学生活动',
    ]);
    expect(table!.rows).toHaveLength(2);
    expect(table!.alignments).toEqual(['default', 'center', 'right']);

    const flat = JSON.stringify(table);
    expect(flat).not.toContain('---');
    expect(flat).not.toContain('|');
  });

  it('缺列的行会被补齐到统一列数', () => {
    const md = ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 |'].join('\n');
    const { blocks } = parseMarkdown(md);
    const table = blocks.find((b): b is TableBlock => b.kind === 'table')!;
    expect(table.rows[0]).toHaveLength(3);
  });
});

describe('Markdown 解析：图片、代码、引用与分隔线', () => {
  it('独立成段的图片提升为块级图片并保留 alt', () => {
    const { blocks } = parseMarkdown('![知识图谱连接图](https://example.com/a.png)');
    expect(blocks[0]).toMatchObject({
      kind: 'image',
      src: 'https://example.com/a.png',
      alt: '知识图谱连接图',
    });
  });

  it('围栏代码块保留语言与换行缩进', () => {
    const md = ['```python', 'def f():', '    return 1', '```'].join('\n');
    const { blocks } = parseMarkdown(md);
    expect(blocks[0]).toMatchObject({ kind: 'code', language: 'python' });
    expect((blocks[0] as { text: string }).text).toBe('def f():\n    return 1');
  });

  it('引用块标记 quoteLevel', () => {
    const { blocks } = parseMarkdown('> 教学提示：注意公平实验的变量控制。');
    expect(blocks[0]!.kind).toBe('paragraph');
    expect((blocks[0] as { quoteLevel?: number }).quoteLevel).toBe(1);
  });

  it('分隔线解析为 divider', () => {
    const { blocks } = parseMarkdown('段落\n\n---\n\n段落2');
    expect(blocks.some((b) => b.kind === 'divider')).toBe(true);
  });
});
