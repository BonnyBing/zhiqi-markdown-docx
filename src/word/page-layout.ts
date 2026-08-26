/**
 * A4 页面尺寸与正文可用宽度。
 *
 * Word 内部长度单位：
 * - twip（DXA）：1 英寸 = 1440 twip，用于页面、页边距、缩进、表格列宽
 * - 像素：docx 的 ImageRun transformation 以 96dpi 像素为单位（1 px = 9525 EMU）
 */

/** A4 纵向宽度：21cm。 */
export const A4_WIDTH_TWIPS = 11906;
/** A4 纵向高度：29.7cm。 */
export const A4_HEIGHT_TWIPS = 16838;

/** 上下左右页边距 2.54cm = 1 英寸。 */
export const PAGE_MARGIN_TWIPS = 1440;

/** 正文可用宽度（twip）：21cm - 2 × 2.54cm ≈ 15.92cm。 */
export const CONTENT_WIDTH_TWIPS = A4_WIDTH_TWIPS - PAGE_MARGIN_TWIPS * 2;

/** 正文可用高度（twip），用于限制图片高度避免单张图片撑破一页。 */
export const CONTENT_HEIGHT_TWIPS = A4_HEIGHT_TWIPS - PAGE_MARGIN_TWIPS * 2;

const TWIPS_PER_INCH = 1440;
const PIXELS_PER_INCH = 96;

export const twipsToPixels = (twips: number): number =>
  Math.floor((twips / TWIPS_PER_INCH) * PIXELS_PER_INCH);

/** 正文可用宽度（像素，96dpi）：约 601px。图片宽度不得超过该值。 */
export const CONTENT_WIDTH_PX = twipsToPixels(CONTENT_WIDTH_TWIPS);

/** 图片最大高度（像素）：留出图注与上下文空间，约为正文高度的 80%。 */
export const MAX_IMAGE_HEIGHT_PX = Math.floor(twipsToPixels(CONTENT_HEIGHT_TWIPS) * 0.8);

export type ScaledSize = { readonly width: number; readonly height: number };

/**
 * 按原始宽高等比缩放到页面可用区域内。
 * 图片本身比页面窄时不会被放大，避免糊图。
 */
export const fitImage = (
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = CONTENT_WIDTH_PX,
  maxHeight: number = MAX_IMAGE_HEIGHT_PX,
): ScaledSize => {
  const safeWidth = naturalWidth > 0 ? naturalWidth : maxWidth;
  const safeHeight = naturalHeight > 0 ? naturalHeight : maxWidth;
  const ratio = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
};

/** 按列数均分表格列宽（twip），最后一列吸收取整误差。 */
export const computeColumnWidths = (
  columnCount: number,
  totalWidth: number = CONTENT_WIDTH_TWIPS,
): number[] => {
  const count = Math.max(1, columnCount);
  const base = Math.floor(totalWidth / count);
  const widths = new Array<number>(count).fill(base);
  const remainder = totalWidth - base * count;
  if (remainder > 0) widths[count - 1] = base + remainder;
  return widths;
};
