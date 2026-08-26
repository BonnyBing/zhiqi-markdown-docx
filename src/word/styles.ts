/**
 * Word 字体、字号、段落间距、编号定义与表格样式。
 *
 * 说明：中文字体通过 `eastAsia` 指定（宋体/黑体），英文与数字用 ascii/hAnsi 指定，
 * 这样在 Word 中中英文各自使用合适的字形，中文不会变成方框。
 */

import {
  AlignmentType,
  BorderStyle,
  LevelFormat,
  ShadingType,
  type IBorderOptions,
  type IFontAttributesProperties,
  type INumberingOptions,
  type IShadingAttributesProperties,
  type IStylesOptions,
} from 'docx';

/* ---------------------------- 字体 ---------------------------- */

export const BODY_FONT: IFontAttributesProperties = {
  ascii: 'Times New Roman',
  hAnsi: 'Times New Roman',
  eastAsia: '宋体',
  cs: 'Times New Roman',
};

export const HEADING_FONT: IFontAttributesProperties = {
  ascii: 'Arial',
  hAnsi: 'Arial',
  eastAsia: '黑体',
  cs: 'Arial',
};

export const MONO_FONT: IFontAttributesProperties = {
  ascii: 'Consolas',
  hAnsi: 'Consolas',
  eastAsia: '宋体',
  cs: 'Consolas',
};

export const SYMBOL_FONT: IFontAttributesProperties = {
  ascii: 'Arial',
  hAnsi: 'Arial',
  eastAsia: '宋体',
};

/* --------------------------- 字号（半磅） --------------------------- */

/** 正文 10.5 磅。 */
export const BODY_SIZE_HALF_POINTS = 21;
export const CODE_SIZE_HALF_POINTS = 18; // 9 磅
export const CAPTION_SIZE_HALF_POINTS = 19; // 9.5 磅
export const TITLE_SIZE_HALF_POINTS = 44; // 22 磅
export const HEADING_SIZE_HALF_POINTS: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 36, // 18 磅
  2: 32, // 16 磅
  3: 28, // 14 磅
  4: 26, // 13 磅
  5: 24, // 12 磅
  6: 22, // 11 磅
};

/* --------------------------- 间距 --------------------------- */

/** 1.5 倍行距（240 = 单倍行距）。 */
export const BODY_LINE_SPACING = 360;
export const BODY_SPACING_AFTER = 120; // 6 磅
export const BODY_SPACING_BEFORE = 0;
/** 中文段落首行缩进 2 字符（单位 1/100 字符）。 */
export const FIRST_LINE_INDENT_CHARS = 200;
/** 列表 / 引用每级缩进（twip），0.5 英寸。 */
export const INDENT_STEP_TWIPS = 720;

/* --------------------------- 颜色 --------------------------- */

export const COLOR_TEXT = '000000';
export const COLOR_MUTED = '595959';
export const COLOR_LINK = '1155CC';
export const COLOR_CODE_TEXT = 'A31515';
export const COLOR_TABLE_BORDER = 'A6A6A6';
export const SHADE_TABLE_HEADER = 'DEEAF6';
export const SHADE_CODE_BLOCK = 'F2F2F2';

export const CODE_SHADING: IShadingAttributesProperties = {
  type: ShadingType.CLEAR,
  color: 'auto',
  fill: SHADE_CODE_BLOCK,
};

export const TABLE_HEADER_SHADING: IShadingAttributesProperties = {
  type: ShadingType.CLEAR,
  color: 'auto',
  fill: SHADE_TABLE_HEADER,
};

const thinBorder: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 4, // 0.5 磅
  color: COLOR_TABLE_BORDER,
};

export const TABLE_BORDERS = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
  insideHorizontal: thinBorder,
  insideVertical: thinBorder,
};

export const QUOTE_LEFT_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 12,
  color: 'BFBFBF',
};

export const DIVIDER_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: 'BFBFBF',
};

/* --------------------------- 文档样式 --------------------------- */

const headingStyle = (level: 1 | 2 | 3 | 4 | 5 | 6) => ({
  run: {
    font: HEADING_FONT,
    size: HEADING_SIZE_HALF_POINTS[level],
    bold: true,
    color: COLOR_TEXT,
  },
  paragraph: {
    alignment: level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: {
      before: level === 1 ? 240 : 240,
      after: level === 1 ? 240 : 120,
      line: level === 1 ? 400 : 340,
      lineRule: 'auto' as const,
    },
    keepNext: true,
    keepLines: true,
  },
});

export const buildStyles = (): IStylesOptions => ({
  default: {
    document: {
      run: {
        font: BODY_FONT,
        size: BODY_SIZE_HALF_POINTS,
        color: COLOR_TEXT,
      },
      paragraph: {
        spacing: {
          line: BODY_LINE_SPACING,
          lineRule: 'auto',
          before: BODY_SPACING_BEFORE,
          after: BODY_SPACING_AFTER,
        },
      },
    },
    title: {
      run: {
        font: HEADING_FONT,
        size: TITLE_SIZE_HALF_POINTS,
        bold: true,
        color: COLOR_TEXT,
      },
      paragraph: {
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 360, line: 460, lineRule: 'auto' },
      },
    },
    heading1: headingStyle(1),
    heading2: headingStyle(2),
    heading3: headingStyle(3),
    heading4: headingStyle(4),
    heading5: headingStyle(5),
    heading6: headingStyle(6),
    listParagraph: {
      run: { font: BODY_FONT, size: BODY_SIZE_HALF_POINTS },
      paragraph: {
        spacing: { line: BODY_LINE_SPACING, lineRule: 'auto', after: 60 },
      },
    },
    hyperlink: {
      run: { color: COLOR_LINK, underline: {} },
    },
  },
  paragraphStyles: [
    {
      id: 'ZhiqiCaption',
      name: 'Zhiqi Caption',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { font: BODY_FONT, size: CAPTION_SIZE_HALF_POINTS, color: COLOR_MUTED },
      paragraph: {
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 180, line: 260, lineRule: 'auto' },
      },
    },
    {
      id: 'ZhiqiCode',
      name: 'Zhiqi Code',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { font: MONO_FONT, size: CODE_SIZE_HALF_POINTS },
      paragraph: {
        spacing: { before: 0, after: 0, line: 260, lineRule: 'auto' },
      },
    },
  ],
});

/* --------------------------- 列表编号 --------------------------- */

export const BULLET_REFERENCE = 'zhiqi-bullet';
export const ORDERED_REFERENCE = 'zhiqi-ordered';

const listIndent = (level: number) => ({
  left: INDENT_STEP_TWIPS * (level + 1),
  hanging: 360,
});

export const buildNumbering = (): INumberingOptions => ({
  config: [
    {
      reference: BULLET_REFERENCE,
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: ['\u25CF', '\u25CB', '\u25AA'][level] ?? '\u25CF',
        alignment: AlignmentType.LEFT,
        style: {
          run: { font: SYMBOL_FONT },
          paragraph: { indent: listIndent(level) },
        },
      })),
    },
    {
      reference: ORDERED_REFERENCE,
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: listIndent(0) } },
        },
        {
          level: 1,
          format: LevelFormat.LOWER_LETTER,
          text: '%2)',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: listIndent(1) } },
        },
        {
          level: 2,
          format: LevelFormat.LOWER_ROMAN,
          text: '%3.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: listIndent(2) } },
        },
      ],
    },
  ],
});
