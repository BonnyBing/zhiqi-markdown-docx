/**
 * 行内 token → InlineNode。
 *
 * 只处理 markdown-it 的 inline token children，不生成也不解析 HTML 字符串。
 */

import type Token from 'markdown-it/lib/token.mjs';

import type { InlineNode, InlineStyle } from '../types';

const BR_PATTERN = /^<br\s*\/?>$/i;
const TAG_PATTERN = /^<\/?[a-zA-Z][^>]*>$/;
/** 明确禁止执行、且连内容都不应保留的危险标签。 */
const DANGEROUS_TAG_PATTERN = /^<\/?\s*(script|style|iframe|object|embed|link|meta|svg)\b/i;

const HTML_ENTITY_WARNING = '文档中的部分原始 HTML 标签已被忽略，仅保留其文字内容。';
const DANGEROUS_HTML_WARNING = '文档中的脚本或样式类 HTML 已被移除，未写入 Word。';

type Styles = InlineStyle;

const withStyle = (styles: Styles, text: string): InlineNode => ({
  kind: 'text',
  text,
  ...(styles.bold ? { bold: true } : {}),
  ...(styles.italic ? { italic: true } : {}),
  ...(styles.strike ? { strike: true } : {}),
  ...(styles.code ? { code: true } : {}),
});

const pushWarning = (warnings: string[], message: string): void => {
  if (!warnings.includes(message)) warnings.push(message);
};

/**
 * 把 inline token 的 children 转换为行内节点数组。
 *
 * @param token markdown-it 的 `inline` token（可为空，返回空数组）
 * @param warnings 收集器：被忽略的 HTML 等信息会写入这里
 */
export const convertInlineToken = (
  token: Token | undefined,
  warnings: string[],
): InlineNode[] => {
  if (!token || !token.children) {
    // 极少数情况下 markdown-it 会给出没有 children 的 inline token。
    return token && token.content ? [withStyle({}, token.content)] : [];
  }
  const { nodes } = convertChildren(token.children, 0, {}, warnings, null);
  return nodes;
};

type ConvertResult = {
  readonly nodes: InlineNode[];
  /** 停止时的下标（指向 stopType 对应的 token）。 */
  readonly index: number;
};

/**
 * 递归转换 children。遇到 stopType 时停止（用于 link_close 等成对标记）。
 */
const convertChildren = (
  children: readonly Token[],
  start: number,
  styles: Styles,
  warnings: string[],
  stopType: string | null,
): ConvertResult => {
  const nodes: InlineNode[] = [];
  let index = start;
  let current: Styles = styles;

  while (index < children.length) {
    const child = children[index];
    if (!child) break;
    if (stopType && child.type === stopType) return { nodes, index };

    switch (child.type) {
      case 'text': {
        if (child.content.length > 0) nodes.push(withStyle(current, child.content));
        index += 1;
        break;
      }
      case 'code_inline': {
        nodes.push(withStyle({ ...current, code: true }, child.content));
        index += 1;
        break;
      }
      case 'strong_open': {
        current = { ...current, bold: true };
        index += 1;
        break;
      }
      case 'strong_close': {
        current = { ...current, bold: false };
        index += 1;
        break;
      }
      case 'em_open': {
        current = { ...current, italic: true };
        index += 1;
        break;
      }
      case 'em_close': {
        current = { ...current, italic: false };
        index += 1;
        break;
      }
      case 's_open': {
        current = { ...current, strike: true };
        index += 1;
        break;
      }
      case 's_close': {
        current = { ...current, strike: false };
        index += 1;
        break;
      }
      case 'softbreak':
      case 'hardbreak': {
        nodes.push({ kind: 'break' });
        index += 1;
        break;
      }
      case 'image': {
        nodes.push({
          kind: 'image',
          src: (child.attrGet('src') ?? '').trim(),
          alt: readImageAlt(child),
        });
        index += 1;
        break;
      }
      case 'link_open': {
        const href = (child.attrGet('href') ?? '').trim();
        const inner = convertChildren(children, index + 1, current, warnings, 'link_close');
        nodes.push({ kind: 'link', href, children: inner.nodes });
        // inner.index 指向 link_close（或数组末尾）
        index = inner.index + 1;
        break;
      }
      case 'html_inline': {
        const raw = child.content.trim();
        if (BR_PATTERN.test(raw)) {
          nodes.push({ kind: 'break' });
        } else if (DANGEROUS_TAG_PATTERN.test(raw)) {
          pushWarning(warnings, DANGEROUS_HTML_WARNING);
        } else if (TAG_PATTERN.test(raw)) {
          pushWarning(warnings, HTML_ENTITY_WARNING);
        } else if (raw.length > 0) {
          // 不是完整标签的片段，按纯文本保留。
          nodes.push(withStyle(current, child.content));
        }
        index += 1;
        break;
      }
      default: {
        // 未显式支持的行内类型（例如脚注引用）降级为纯文本，绝不丢内容。
        if (child.content.length > 0) nodes.push(withStyle(current, child.content));
        index += 1;
        break;
      }
    }
  }

  return { nodes, index };
};

const readImageAlt = (token: Token): string => {
  if (token.children && token.children.length > 0) {
    return token.children.map((child) => child.content).join('').trim();
  }
  return (token.content ?? '').trim();
};

/** 把行内节点拼成纯文本，用于图注、日志与降级显示。 */
export const inlineToPlainText = (nodes: readonly InlineNode[]): string =>
  nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
          return node.text;
        case 'break':
          return '\n';
        case 'link':
          return inlineToPlainText(node.children);
        case 'image':
          return node.alt;
        default:
          return '';
      }
    })
    .join('');
