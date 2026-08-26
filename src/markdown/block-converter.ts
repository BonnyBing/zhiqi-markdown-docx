/**
 * 块级 token → DocumentBlock。
 *
 * 直接消费 markdown-it 的 token 流（不经过 HTML），
 * 输出的块结构会被 Word 生成层逐块映射为原生 Word 元素。
 */

import type Token from 'markdown-it/lib/token.mjs';

import type {
  DocumentBlock,
  HeadingBlock,
  InlineNode,
  ListItemBlock,
} from '../types';
import { convertInlineToken } from './inline-converter';
import { parseTable } from './table-converter';

/** 最多支持三级嵌套列表，更深的层级统一按第三级显示。 */
const MAX_LIST_LEVEL = 2;

const DEEP_LIST_WARNING = '列表嵌套超过三级，超出部分已按第三级缩进显示。';
const HTML_BLOCK_WARNING = '文档中的原始 HTML 块已转换为纯文本。';
const DANGEROUS_HTML_WARNING = '文档中的脚本或样式类 HTML 已被移除，未写入 Word。';

type Context = {
  /** 引用块嵌套层级。 */
  readonly quoteLevel: number;
  /** 已进入的列表层数，0 表示不在列表中。 */
  readonly listDepth: number;
  /** 额外缩进层级（列表项内的后续段落等）。 */
  readonly indentLevel: number;
};

const ROOT_CONTEXT: Context = { quoteLevel: 0, listDepth: 0, indentLevel: 0 };

const contextFields = (ctx: Context): { indentLevel: number; quoteLevel: number } => ({
  indentLevel: ctx.indentLevel,
  quoteLevel: ctx.quoteLevel,
});

const pushWarning = (warnings: string[], message: string): void => {
  if (!warnings.includes(message)) warnings.push(message);
};

const HEADING_LEVELS: Record<string, HeadingBlock['level']> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** 只由图片（以及空白文字）组成的段落会被提升为块级图片，便于居中并生成图注。 */
const extractStandaloneImages = (nodes: readonly InlineNode[]): InlineNode[] | null => {
  const images = nodes.filter((node) => node.kind === 'image');
  if (images.length === 0) return null;
  const hasMeaningfulText = nodes.some(
    (node) =>
      (node.kind === 'text' && node.text.trim().length > 0) || node.kind === 'link',
  );
  if (hasMeaningfulText) return null;
  return images;
};

const stripHtml = (raw: string): string =>
  raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .trim();

const DANGEROUS_BLOCK_PATTERN = /<\s*(script|style|iframe|object|embed|link|meta)\b/i;

export class BlockConverter {
  private position = 0;
  private listInstance = 0;

  public constructor(
    private readonly tokens: readonly Token[],
    private readonly warnings: string[],
  ) {}

  public convert(): DocumentBlock[] {
    return this.parseBlocks(ROOT_CONTEXT, null);
  }

  /** 连续解析块，直到遇到 stopType（会消费掉该 token）或 token 用尽。 */
  private parseBlocks(ctx: Context, stopType: string | null): DocumentBlock[] {
    const blocks: DocumentBlock[] = [];
    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position];
      if (!token) break;
      if (stopType && token.type === stopType) {
        this.position += 1;
        return blocks;
      }
      blocks.push(...this.parseOneBlock(ctx));
    }
    return blocks;
  }

  /** 解析当前位置的一个块级构造，并推进 position。 */
  private parseOneBlock(ctx: Context): DocumentBlock[] {
    const token = this.tokens[this.position];
    if (!token) return [];

    switch (token.type) {
      case 'heading_open':
        return this.parseHeading(ctx, token);
      case 'paragraph_open':
        return this.parseParagraph(ctx);
      case 'bullet_list_open':
        return this.parseList(ctx, false);
      case 'ordered_list_open':
        return this.parseList(ctx, true);
      case 'blockquote_open': {
        this.position += 1;
        return this.parseBlocks(
          { ...ctx, quoteLevel: ctx.quoteLevel + 1 },
          'blockquote_close',
        );
      }
      case 'hr': {
        this.position += 1;
        return [{ kind: 'divider', ...contextFields(ctx) }];
      }
      case 'fence':
      case 'code_block': {
        this.position += 1;
        const text = token.content.replace(/\n+$/, '');
        return [
          {
            kind: 'code',
            text,
            language: (token.info ?? '').trim(),
            ...contextFields(ctx),
          },
        ];
      }
      case 'table_open': {
        const result = parseTable(this.tokens, this.position, this.warnings);
        this.position = result.nextIndex;
        return result.block ? [{ ...result.block, ...contextFields(ctx) }] : [];
      }
      case 'html_block': {
        this.position += 1;
        if (DANGEROUS_BLOCK_PATTERN.test(token.content)) {
          pushWarning(this.warnings, DANGEROUS_HTML_WARNING);
          return [];
        }
        const text = stripHtml(token.content);
        if (text.length === 0) return [];
        pushWarning(this.warnings, HTML_BLOCK_WARNING);
        return [{ kind: 'htmlText', text, ...contextFields(ctx) }];
      }
      case 'inline': {
        // 理论上不会出现在块层，做兜底避免内容丢失。
        this.position += 1;
        const children = convertInlineToken(token, this.warnings);
        return children.length > 0
          ? [{ kind: 'paragraph', children, ...contextFields(ctx) }]
          : [];
      }
      default: {
        this.position += 1;
        return [];
      }
    }
  }

  private parseHeading(ctx: Context, openToken: Token): DocumentBlock[] {
    const level = HEADING_LEVELS[openToken.tag] ?? 1;
    this.position += 1;
    const inlineToken = this.tokens[this.position];
    const children =
      inlineToken && inlineToken.type === 'inline'
        ? convertInlineToken(inlineToken, this.warnings)
        : [];
    if (inlineToken && inlineToken.type === 'inline') this.position += 1;
    if (this.tokens[this.position]?.type === 'heading_close') this.position += 1;
    return [{ kind: 'heading', level, children, ...contextFields(ctx) }];
  }

  /** 读取 paragraph_open / inline / paragraph_close，返回行内节点。 */
  private consumeParagraphInline(): InlineNode[] {
    this.position += 1; // paragraph_open
    const inlineToken = this.tokens[this.position];
    const children =
      inlineToken && inlineToken.type === 'inline'
        ? convertInlineToken(inlineToken, this.warnings)
        : [];
    if (inlineToken && inlineToken.type === 'inline') this.position += 1;
    if (this.tokens[this.position]?.type === 'paragraph_close') this.position += 1;
    return children;
  }

  private parseParagraph(ctx: Context): DocumentBlock[] {
    const children = this.consumeParagraphInline();
    if (children.length === 0) return [];

    const standaloneImages = extractStandaloneImages(children);
    if (standaloneImages) {
      return standaloneImages.map((node) => ({
        kind: 'image' as const,
        src: node.kind === 'image' ? node.src : '',
        alt: node.kind === 'image' ? node.alt : '',
        ...contextFields(ctx),
      }));
    }

    return [{ kind: 'paragraph', children, ...contextFields(ctx) }];
  }

  private parseList(ctx: Context, ordered: boolean): DocumentBlock[] {
    const level = Math.min(ctx.listDepth, MAX_LIST_LEVEL) as ListItemBlock['level'];
    if (ctx.listDepth > MAX_LIST_LEVEL) pushWarning(this.warnings, DEEP_LIST_WARNING);

    this.listInstance += 1;
    const instance = this.listInstance;
    const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';
    const innerCtx: Context = {
      quoteLevel: ctx.quoteLevel,
      listDepth: ctx.listDepth + 1,
      indentLevel: level + 1,
    };

    this.position += 1; // *_list_open
    const blocks: DocumentBlock[] = [];

    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position];
      if (!token) break;
      if (token.type === closeType) {
        this.position += 1;
        break;
      }
      if (token.type === 'list_item_open') {
        blocks.push(...this.parseListItem(innerCtx, ordered, level, instance));
        continue;
      }
      // 列表内的意外 token（例如空 list_item_close）直接跳过。
      this.position += 1;
    }

    return blocks;
  }

  private parseListItem(
    ctx: Context,
    ordered: boolean,
    level: ListItemBlock['level'],
    instance: number,
  ): DocumentBlock[] {
    this.position += 1; // list_item_open
    const blocks: DocumentBlock[] = [];
    let firstParagraphTaken = false;

    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position];
      if (!token) break;
      if (token.type === 'list_item_close') {
        this.position += 1;
        break;
      }

      if (token.type === 'paragraph_open' && !firstParagraphTaken) {
        const children = this.consumeParagraphInline();
        firstParagraphTaken = true;
        blocks.push({
          kind: 'listItem',
          ordered,
          level,
          instance,
          children,
          quoteLevel: ctx.quoteLevel,
        });
        continue;
      }

      blocks.push(...this.parseOneBlock(ctx));
    }

    return blocks;
  }
}
