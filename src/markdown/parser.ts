/**
 * Markdown 解析入口。
 *
 * 使用 markdown-it 的 token 流，不生成 HTML、不执行 HTML。
 */

import MarkdownIt from 'markdown-it';

import type { ParsedDocument } from '../types';
import { BlockConverter } from './block-converter';

/**
 * html: true 只是为了拿到 html_inline / html_block token 以便我们自己判断：
 * `<br>` 转换为换行，危险标签丢弃，其余降级为纯文本。渲染器从不被调用，
 * 因此不存在 HTML/JS/CSS 被执行的路径。
 *
 * breaks: true 让 Markdown 中的单个换行在 Word 里也表现为换行，
 * 更符合教师在编辑器里看到的样子。
 */
const createParser = (): MarkdownIt =>
  new MarkdownIt({
    html: true,
    linkify: false,
    breaks: true,
    typographer: false,
  });

let cachedParser: MarkdownIt | null = null;

const getParser = (): MarkdownIt => {
  if (!cachedParser) cachedParser = createParser();
  return cachedParser;
};

/** 把 Markdown 文本解析为内部文档模型。 */
export const parseMarkdown = (markdown: string): ParsedDocument => {
  const warnings: string[] = [];
  // 统一换行符，避免 \r\n 影响围栏代码块与表格识别。
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const tokens = getParser().parse(normalized, {});
  const blocks = new BlockConverter(tokens, warnings).convert();
  return { blocks, warnings };
};
