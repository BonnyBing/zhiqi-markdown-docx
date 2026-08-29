/**
 * 文件名清洗。
 *
 * `downloadName` 返回给智启与教师，保留中文，末尾只有一个 .docx。
 * Blob 存储路径由服务端用 UUID 生成，不使用这份中文文件名，以免下载链接过长。
 *
 * 客户端永远不能指定 Blob 路径，只能影响 word_filename。
 */

import { MAX_FILENAME_CHARS } from '../config';

/** Windows / OOXML 禁止出现在文件名中的字符，以及换行与控制字符。 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;

export type FilenameResult =
  | {
      readonly ok: true;
      /** 含 .docx 的最终文件名。 */
      readonly downloadName: string;
      /** 不含扩展名的清洗结果。 */
      readonly baseName: string;
      /** 清洗过程中的提示信息。 */
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

/** 去掉末尾重复出现的 .docx（大小写不敏感）。 */
export const stripDocxExtension = (input: string): string => {
  let result = input;
  while (/\.docx\s*$/i.test(result)) {
    result = result.replace(/\.docx\s*$/i, '');
  }
  return result;
};

/**
 * 清洗用户提供的文件名。
 *
 * 非法字符会被替换为 `-`（安全清洗，而不是直接拒绝），
 * 但长度超限、清洗后为空这类无法自动修复的问题会返回 ok: false。
 */
export const sanitizeFilename = (rawInput: unknown): FilenameResult => {
  if (typeof rawInput !== 'string') {
    return { ok: false, error: 'filename 必须是字符串。' };
  }

  const warnings: string[] = [];
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'filename 不能为空。' };
  }
  if (Array.from(trimmed).length > MAX_FILENAME_CHARS + '.docx'.length) {
    return {
      ok: false,
      error: `filename 超过 ${MAX_FILENAME_CHARS} 个字符上限。`,
    };
  }

  const withoutExt = stripDocxExtension(trimmed).trim();
  if (Array.from(withoutExt).length > MAX_FILENAME_CHARS) {
    return {
      ok: false,
      error: `filename 超过 ${MAX_FILENAME_CHARS} 个字符上限。`,
    };
  }

  let base = withoutExt.replace(FORBIDDEN_CHARS, '-');
  if (base !== withoutExt) {
    warnings.push('文件名中的非法字符已被替换为“-”。');
  }

  // Windows 不允许文件名以点或空格结尾；连续的 - 合并。
  base = base
    .replace(/-{2,}/g, '-')
    .replace(/^[.\s-]+/, '')
    .replace(/[.\s-]+$/, '')
    .trim();

  if (base.length === 0) {
    return { ok: false, error: 'filename 清洗后为空，请提供有效的文件名。' };
  }

  return {
    ok: true,
    downloadName: `${base}.docx`,
    baseName: base,
    warnings,
  };
};
