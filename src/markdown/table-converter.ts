/**
 * Markdown 表格 token → TableBlock。
 *
 * 表格在这里就被拆成表头行与数据行的结构化模型，
 * `| --- |` 之类的分隔行只存在于 Markdown 源码里，永远不会进入内部模型，
 * 因此也不可能出现在 Word 正文中。
 */

import type Token from 'markdown-it/lib/token.mjs';

import type { InlineNode, TableAlignment, TableBlock, TableCellModel } from '../types';
import { convertInlineToken } from './inline-converter';

export type TableParseResult = {
  readonly block: TableBlock | null;
  /** 消费结束后的下标（指向 table_close 之后）。 */
  readonly nextIndex: number;
};

const readAlignment = (token: Token): TableAlignment => {
  const style = token.attrGet('style') ?? '';
  if (style.includes('text-align:center')) return 'center';
  if (style.includes('text-align:right')) return 'right';
  if (style.includes('text-align:left')) return 'left';
  return 'default';
};

/**
 * 从 `table_open` 开始解析，直到 `table_close`。
 *
 * @param tokens 完整 token 数组
 * @param start `table_open` 的下标
 */
export const parseTable = (
  tokens: readonly Token[],
  start: number,
  warnings: string[],
): TableParseResult => {
  let index = start + 1;
  const headerCells: TableCellModel[] = [];
  const alignments: TableAlignment[] = [];
  const bodyRows: TableCellModel[][] = [];

  let inHeader = false;
  let currentRow: TableCellModel[] | null = null;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;

    if (token.type === 'table_close') {
      index += 1;
      break;
    }

    switch (token.type) {
      case 'thead_open': {
        inHeader = true;
        index += 1;
        break;
      }
      case 'thead_close': {
        inHeader = false;
        index += 1;
        break;
      }
      case 'tr_open': {
        currentRow = [];
        index += 1;
        break;
      }
      case 'tr_close': {
        if (currentRow && !inHeader) bodyRows.push(currentRow);
        currentRow = null;
        index += 1;
        break;
      }
      case 'th_open':
      case 'td_open': {
        const inlineToken = tokens[index + 1];
        const children: InlineNode[] =
          inlineToken && inlineToken.type === 'inline'
            ? convertInlineToken(inlineToken, warnings)
            : [];
        const cell: TableCellModel = { children };
        if (inHeader) {
          headerCells.push(cell);
          alignments.push(readAlignment(token));
        } else if (currentRow) {
          currentRow.push(cell);
        }
        // 跳过 open + inline + close
        index += inlineToken && inlineToken.type === 'inline' ? 3 : 2;
        break;
      }
      default: {
        index += 1;
        break;
      }
    }
  }

  if (headerCells.length === 0 && bodyRows.length === 0) {
    warnings.push('检测到无法解析的 Markdown 表格，已跳过。');
    return { block: null, nextIndex: index };
  }

  const columnCount = Math.max(
    headerCells.length,
    ...bodyRows.map((row) => row.length),
    1,
  );

  const padRow = (row: readonly TableCellModel[]): TableCellModel[] => {
    const padded = [...row];
    while (padded.length < columnCount) padded.push({ children: [] });
    return padded.slice(0, columnCount);
  };

  const paddedAlignments: TableAlignment[] = [...alignments];
  while (paddedAlignments.length < columnCount) paddedAlignments.push('default');

  return {
    block: {
      kind: 'table',
      header: padRow(headerCells),
      rows: bodyRows.map(padRow),
      alignments: paddedAlignments,
      columnCount,
    },
    nextIndex: index,
  };
};
