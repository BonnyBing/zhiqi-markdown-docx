/**
 * 内部文档模型与 API 契约类型。
 *
 * Markdown 解析层只产出这里定义的结构，Word 生成层只消费这里定义的结构，
 * 两层之间不传递 HTML 字符串，也不传递 markdown-it 的 token。
 */

/* ------------------------------------------------------------------ */
/* 行内节点                                                            */
/* ------------------------------------------------------------------ */

export type InlineStyle = {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly strike?: boolean;
  readonly code?: boolean;
};

export type InlineText = InlineStyle & {
  readonly kind: 'text';
  readonly text: string;
};

/** 软/硬换行以及 `<br>`。 */
export type InlineBreak = {
  readonly kind: 'break';
};

export type InlineLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly children: readonly InlineNode[];
};

export type InlineImage = {
  readonly kind: 'image';
  readonly src: string;
  readonly alt: string;
};

export type InlineNode = InlineText | InlineBreak | InlineLink | InlineImage;

/* ------------------------------------------------------------------ */
/* 块级节点                                                            */
/* ------------------------------------------------------------------ */

/** 引用层级与列表缩进层级，用于在 Word 中还原视觉层次。 */
export type BlockContext = {
  /** 列表/引用内的缩进层级，0 表示正文顶层。 */
  readonly indentLevel?: number;
  /** 引用块嵌套层级，0 或缺失表示不在引用中。 */
  readonly quoteLevel?: number;
};

export type HeadingBlock = BlockContext & {
  readonly kind: 'heading';
  /** 1~6，对应 Word Heading 1~6。 */
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly InlineNode[];
};

export type ParagraphBlock = BlockContext & {
  readonly kind: 'paragraph';
  readonly children: readonly InlineNode[];
};

export type ListItemBlock = BlockContext & {
  readonly kind: 'listItem';
  readonly ordered: boolean;
  /** 0~2，最多三级嵌套。 */
  readonly level: 0 | 1 | 2;
  /** 同一个 Markdown 列表共享一个 instance，保证 Word 编号各自从 1 开始。 */
  readonly instance: number;
  readonly children: readonly InlineNode[];
};

export type CodeBlock = BlockContext & {
  readonly kind: 'code';
  readonly text: string;
  readonly language: string;
};

export type DividerBlock = BlockContext & {
  readonly kind: 'divider';
};

/** 独立成段的图片（段落中只有一张图片时会提升为块级图片，便于居中和加图注）。 */
export type ImageBlock = BlockContext & {
  readonly kind: 'image';
  readonly src: string;
  readonly alt: string;
};

export type TableCellModel = {
  readonly children: readonly InlineNode[];
};

export type TableAlignment = 'left' | 'center' | 'right' | 'default';

export type TableBlock = BlockContext & {
  readonly kind: 'table';
  readonly header: readonly TableCellModel[];
  readonly rows: readonly (readonly TableCellModel[])[];
  readonly alignments: readonly TableAlignment[];
  readonly columnCount: number;
};

/** 无法安全渲染的原始 HTML，降级为纯文本。 */
export type HtmlFallbackBlock = BlockContext & {
  readonly kind: 'htmlText';
  readonly text: string;
};

export type DocumentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListItemBlock
  | CodeBlock
  | DividerBlock
  | ImageBlock
  | TableBlock
  | HtmlFallbackBlock;

export type ParsedDocument = {
  readonly blocks: readonly DocumentBlock[];
  /** 解析阶段产生的告警（例如被忽略的 HTML、超过三级的嵌套列表）。 */
  readonly warnings: readonly string[];
};

/* ------------------------------------------------------------------ */
/* API 契约                                                            */
/* ------------------------------------------------------------------ */

export type GenerateDocxRequest = {
  readonly markdown: string;
  readonly filename: string;
  readonly document_title?: string;
};

/**
 * 智启数据提取节点只能读取顶层字段，因此响应必须保持扁平结构。
 */
export type GenerateDocxResponse = {
  readonly code: number;
  readonly word_status: 'success' | 'error';
  readonly word_url: string;
  readonly word_filename: string;
  readonly word_size_bytes: number;
  readonly word_message: string;
  readonly warnings_text: string;
  /** 仅在定时清理确实启用时给出 ISO 时间，否则为空字符串。 */
  readonly expires_at: string;
};

export type HealthResponse = {
  readonly status: 'ok';
  readonly service: string;
  readonly storage_configured: boolean;
  readonly version: string;
};

export type CleanupResponse = {
  readonly code: number;
  readonly status: 'success' | 'error';
  readonly scanned: number;
  readonly deleted: number;
  readonly retention_hours: number;
  readonly message: string;
};
