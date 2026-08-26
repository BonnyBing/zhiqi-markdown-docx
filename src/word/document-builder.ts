/**
 * 把内部文档模型转换为 Word 原生对象并打包为 DOCX。
 *
 * 只使用 docx 库的 Paragraph / Table / ImageRun / HeadingLevel 等对象，
 * 不把 HTML 字符串塞进 Word。
 */

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  FileChild,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';

import type {
  DocumentBlock,
  HeadingBlock,
  InlineNode,
  ListItemBlock,
  TableBlock,
  TableCellModel,
} from '../types';
import { inlineToPlainText } from '../markdown/inline-converter';
import {
  BODY_FONT,
  BODY_LINE_SPACING,
  BODY_SIZE_HALF_POINTS,
  BODY_SPACING_AFTER,
  BULLET_REFERENCE,
  CODE_SHADING,
  COLOR_CODE_TEXT,
  COLOR_LINK,
  COLOR_MUTED,
  COLOR_TEXT,
  DIVIDER_BORDER,
  FIRST_LINE_INDENT_CHARS,
  HEADING_FONT,
  HEADING_SIZE_HALF_POINTS,
  INDENT_STEP_TWIPS,
  MONO_FONT,
  ORDERED_REFERENCE,
  QUOTE_LEFT_BORDER,
  TABLE_BORDERS,
  TABLE_HEADER_SHADING,
  buildNumbering,
  buildStyles,
} from './styles';
import {
  A4_HEIGHT_TWIPS,
  A4_WIDTH_TWIPS,
  CONTENT_WIDTH_TWIPS,
  PAGE_MARGIN_TWIPS,
  computeColumnWidths,
} from './page-layout';
import {
  imageFallbackText,
  type ImageLoadResult,
  type LoadedImage,
} from './image-loader';

const HEADING_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

const CJK_START = /[\u3400-\u9fff\uf900-\ufaff]/;

const isSafeHttpUrl = (href: string): boolean => {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const wrapCodeLine = (line: string, width = 40): string => {
  if (line.length <= width) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += width) {
    parts.push(line.slice(i, i + width));
  }
  return parts.join('\u200b');
};

const textRun = (options: IRunOptions): TextRun => new TextRun(options);

const convertInlines = (
  nodes: readonly InlineNode[],
  images: Map<string, ImageLoadResult>,
  extra: IRunOptions = {},
): ParagraphChild[] => {
  const children: ParagraphChild[] = [];

  const pushText = (node: Extract<InlineNode, { kind: 'text' }>): void => {
    children.push(
      textRun({
        text: node.text,
        bold: node.bold || extra.bold,
        italics: node.italic || extra.italics,
        strike: node.strike || extra.strike,
        font: node.code ? MONO_FONT : extra.font,
        color: node.code ? COLOR_CODE_TEXT : extra.color,
        size: extra.size,
      }),
    );
  };

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        pushText(node);
        break;
      case 'break':
        children.push(textRun({ break: 1 }));
        break;
      case 'link': {
        const label = inlineToPlainText(node.children) || node.href;
        if (isSafeHttpUrl(node.href)) {
          children.push(
            new ExternalHyperlink({
              link: node.href,
              children: [
                textRun({
                  text: label,
                  style: 'Hyperlink',
                  color: COLOR_LINK,
                  italics: extra.italics,
                  bold: extra.bold,
                }),
              ],
            }),
          );
        } else {
          children.push(textRun({ text: label, ...extra }));
        }
        break;
      }
      case 'image':
        children.push(...imageChildren(node.src, node.alt, images));
        break;
      default:
        break;
    }
  }
  return children;
};

const imageChildren = (
  src: string,
  alt: string,
  images: Map<string, ImageLoadResult>,
): ParagraphChild[] => {
  const loaded = images.get(src);
  if (loaded?.ok) {
    return [toImageRun(loaded)];
  }
  return [textRun({ text: imageFallbackText(alt), color: COLOR_MUTED, italics: true })];
};

const toImageRun = (image: LoadedImage): ImageRun =>
  new ImageRun({
    type: image.type,
    data: image.data,
    transformation: {
      width: image.scaledWidth,
      height: image.scaledHeight,
    },
    altText: {
      title: image.alt || 'image',
      description: image.alt || 'embedded image',
      name: image.alt || 'image',
    },
  });

const quoteBorder = (quoteLevel: number | undefined) =>
  quoteLevel && quoteLevel > 0 ? { left: QUOTE_LEFT_BORDER } : undefined;

const quoteIndent = (block: DocumentBlock): number | undefined => {
  const extra = (block.quoteLevel ?? 0) > 0 ? INDENT_STEP_TWIPS : 0;
  const indent = (block.indentLevel ?? 0) * INDENT_STEP_TWIPS;
  const total = extra + indent;
  return total > 0 ? total : undefined;
};

const looksLikeChineseParagraph = (nodes: readonly InlineNode[]): boolean => {
  const text = inlineToPlainText(nodes).trimStart();
  return CJK_START.test(text.charAt(0));
};

const convertHeading = (
  block: HeadingBlock,
  images: Map<string, ImageLoadResult>,
): Paragraph =>
  new Paragraph({
    heading: HEADING_LEVEL[block.level],
    border: quoteBorder(block.quoteLevel),
    indent: quoteIndent(block) ? { left: quoteIndent(block) } : undefined,
    children: convertInlines(block.children, images, {
      font: HEADING_FONT,
      bold: true,
      size: HEADING_SIZE_HALF_POINTS[block.level],
    }),
  });

const convertParagraph = (
  block: Extract<DocumentBlock, { kind: 'paragraph' | 'htmlText' }>,
  images: Map<string, ImageLoadResult>,
): Paragraph => {
  const children =
    block.kind === 'htmlText'
      ? [textRun({ text: block.text })]
      : convertInlines(block.children, images);
  const firstLine = block.kind === 'paragraph' && looksLikeChineseParagraph(block.children);
  return new Paragraph({
    spacing: {
      line: BODY_LINE_SPACING,
      lineRule: 'auto',
      after: BODY_SPACING_AFTER,
    },
    border: quoteBorder(block.quoteLevel),
    indent: {
      left: quoteIndent(block),
      firstLineChars: firstLine ? FIRST_LINE_INDENT_CHARS : undefined,
    },
    children: children.length > 0 ? children : [textRun({ text: '' })],
  });
};

const convertListItem = (
  block: ListItemBlock,
  images: Map<string, ImageLoadResult>,
): Paragraph =>
  new Paragraph({
    numbering: {
      reference: block.ordered ? ORDERED_REFERENCE : BULLET_REFERENCE,
      level: block.level,
      instance: block.instance,
    },
    border: quoteBorder(block.quoteLevel),
    children: convertInlines(block.children, images),
  });

const convertCode = (text: string, quoteLevel?: number): Paragraph[] => {
  const lines = text.replace(/\t/g, '    ').split('\n');
  const source = lines.length > 0 ? lines : [''];
  return source.map(
    (line, index) =>
      new Paragraph({
        style: 'ZhiqiCode',
        shading: CODE_SHADING,
        wordWrap: true,
        border: quoteBorder(quoteLevel),
        indent: quoteLevel ? { left: INDENT_STEP_TWIPS } : undefined,
        spacing: {
          before: index === 0 ? 80 : 0,
          after: index === source.length - 1 ? 160 : 0,
          line: 260,
          lineRule: 'auto',
        },
        children: [
          textRun({
            text: wrapCodeLine(line.length === 0 ? ' ' : line),
            font: MONO_FONT,
            size: 18,
          }),
        ],
      }),
  );
};

const convertDivider = (): Paragraph =>
  new Paragraph({
    border: { bottom: DIVIDER_BORDER },
    spacing: { before: 120, after: 120 },
    children: [textRun({ text: '' })],
  });

const convertImageBlock = (
  src: string,
  alt: string,
  images: Map<string, ImageLoadResult>,
): FileChild[] => {
  const loaded = images.get(src);
  const children: FileChild[] = [];
  if (loaded?.ok) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: alt.trim() ? 40 : 160 },
        children: [toImageRun(loaded)],
      }),
    );
  } else {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 80 },
        children: [
          textRun({
            text: imageFallbackText(alt),
            italics: true,
            color: COLOR_MUTED,
            size: BODY_SIZE_HALF_POINTS,
          }),
        ],
      }),
    );
  }
  if (alt.trim()) {
    children.push(
      new Paragraph({
        style: 'ZhiqiCaption',
        alignment: AlignmentType.CENTER,
        children: [textRun({ text: alt.trim(), color: COLOR_MUTED, size: 19, font: BODY_FONT })],
      }),
    );
  }
  return children;
};

const alignmentMap = (value: TableBlock['alignments'][number]) => {
  switch (value) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    default:
      return AlignmentType.LEFT;
  }
};

const convertTableCell = (
  cell: TableCellModel,
  width: number,
  alignment: TableBlock['alignments'][number],
  images: Map<string, ImageLoadResult>,
  header: boolean,
): TableCell => {
  const runs = convertInlines(cell.children, images, header ? { bold: true } : {});
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? TABLE_HEADER_SHADING : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: TABLE_BORDERS,
    children: [
      new Paragraph({
        alignment: alignmentMap(alignment),
        wordWrap: true,
        spacing: { after: 0, line: 276, lineRule: 'auto' },
        children: runs.length > 0 ? runs : [textRun({ text: '', bold: header })],
      }),
    ],
  });
};

const convertTable = (block: TableBlock, images: Map<string, ImageLoadResult>): Table => {
  const widths = computeColumnWidths(block.columnCount);
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: block.header.map((cell, index) =>
      convertTableCell(cell, widths[index] ?? widths[0]!, block.alignments[index] ?? 'default', images, true),
    ),
  });
  const bodyRows = block.rows.map(
    (row) =>
      new TableRow({
        cantSplit: true,
        children: row.map((cell, index) =>
          convertTableCell(cell, widths[index] ?? widths[0]!, block.alignments[index] ?? 'default', images, false),
        ),
      }),
  );
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [headerRow, ...bodyRows],
  });
};

const convertBlock = (
  block: DocumentBlock,
  images: Map<string, ImageLoadResult>,
): FileChild[] => {
  switch (block.kind) {
    case 'heading':
      return [convertHeading(block, images)];
    case 'paragraph':
    case 'htmlText':
      return [convertParagraph(block, images)];
    case 'listItem':
      return [convertListItem(block, images)];
    case 'code':
      return convertCode(block.text, block.quoteLevel);
    case 'divider':
      return [convertDivider()];
    case 'image':
      return convertImageBlock(block.src, block.alt, images);
    case 'table':
      return [convertTable(block, images)];
    default:
      return [];
  }
};

export type BuildDocxInput = {
  readonly blocks: readonly DocumentBlock[];
  readonly documentTitle?: string;
  readonly images?: Map<string, ImageLoadResult>;
};

const titleParagraph = (title: string): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [textRun({ text: title, font: HEADING_FONT, bold: true, size: 44, color: COLOR_TEXT })],
  });

const shouldInsertTitle = (title: string | undefined, blocks: readonly DocumentBlock[]): string | null => {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  const first = blocks[0];
  if (first?.kind === 'heading') {
    const headingText = inlineToPlainText(first.children).trim();
    if (headingText === trimmed) return null;
  }
  return trimmed;
};

export const buildDocument = (input: BuildDocxInput): Document => {
  const images = input.images ?? new Map();
  const children: FileChild[] = [];
  const title = shouldInsertTitle(input.documentTitle, input.blocks);
  if (title) children.push(titleParagraph(title));
  for (const block of input.blocks) {
    children.push(...convertBlock(block, images));
  }
  if (children.length === 0) {
    children.push(new Paragraph({ children: [textRun({ text: '' })] }));
  }

  return new Document({
    title: input.documentTitle?.trim() || '教案',
    creator: 'zhiqi-markdown-docx',
    description: '由智启 Markdown 转 Word 服务生成',
    styles: buildStyles(),
    numbering: buildNumbering(),
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: PAGE_MARGIN_TWIPS,
              right: PAGE_MARGIN_TWIPS,
              bottom: PAGE_MARGIN_TWIPS,
              left: PAGE_MARGIN_TWIPS,
              header: 720,
              footer: 720,
            },
            pageNumbers: { start: 1 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  textRun({
                    children: [PageNumber.CURRENT],
                    font: BODY_FONT,
                    size: 18,
                    color: COLOR_MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
};

export const packDocument = async (document: Document): Promise<Buffer> => {
  const raw = await Packer.toBuffer(document);
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
};

export const buildDocxBuffer = async (input: BuildDocxInput): Promise<Buffer> =>
  packDocument(buildDocument(input));
