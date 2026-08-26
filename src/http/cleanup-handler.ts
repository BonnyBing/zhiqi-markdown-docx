/**
 * GET/POST /api/cleanup-docx
 *
 * 仅接受 Vercel Cron（Authorization: Bearer CRON_SECRET）或持有同一密钥的手动调用。
 * 错误信息不得包含 Blob Token。
 */

import { getConfig } from '../config';
import { logEvent, safeErrorMessage } from '../log';
import {
  applyCors,
  handlePreflight,
  sendJson,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../response';
import { verifyCronSecret } from '../security/api-key';
import { createVercelBlobStore, deleteExpiredDocx } from '../storage/blob-storage';
import type { CleanupResponse } from '../types';

export const handleCleanupDocx = async (
  req: HttpRequestLike,
  res: HttpResponseLike,
): Promise<void> => {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, {
      code: 405,
      status: 'error',
      scanned: 0,
      deleted: 0,
      retention_hours: getConfig().fileRetentionHours,
      message: '只允许 GET 或 POST /api/cleanup-docx。',
    } satisfies CleanupResponse);
    return;
  }

  const auth = verifyCronSecret(req);
  if (!auth.ok) {
    sendJson(res, auth.code, {
      code: auth.code,
      status: 'error',
      scanned: 0,
      deleted: 0,
      retention_hours: getConfig().fileRetentionHours,
      message: auth.message,
    } satisfies CleanupResponse);
    return;
  }

  const { fileRetentionHours } = getConfig();
  try {
    const result = await deleteExpiredDocx(createVercelBlobStore(), fileRetentionHours);
    sendJson(res, 200, {
      code: 200,
      status: 'success',
      scanned: result.scanned,
      deleted: result.deleted,
      retention_hours: fileRetentionHours,
      message: `已扫描 ${result.scanned} 个文件，删除 ${result.deleted} 个过期文件。`,
    } satisfies CleanupResponse);
  } catch (error) {
    logEvent('cleanup_failed', { message: safeErrorMessage(error) });
    sendJson(res, 500, {
      code: 500,
      status: 'error',
      scanned: 0,
      deleted: 0,
      retention_hours: fileRetentionHours,
      message: '清理任务失败。',
    } satisfies CleanupResponse);
  }
};

export default handleCleanupDocx;
