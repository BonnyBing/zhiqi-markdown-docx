/**
 * GET /api/health
 *
 * 不返回任何密钥、Token 或环境变量原文。
 */

import { SERVICE_NAME, SERVICE_VERSION, getConfig } from '../config';
import {
  applyCors,
  handlePreflight,
  sendJson,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../response';
import type { HealthResponse } from '../types';

export const handleHealth = (req: HttpRequestLike, res: HttpResponseLike): void => {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    sendJson(res, 405, { status: 'error', message: '只允许 GET /api/health。' });
    return;
  }

  const body: HealthResponse = {
    status: 'ok',
    service: SERVICE_NAME,
    storage_configured: getConfig().hasBlobToken,
    version: SERVICE_VERSION,
  };
  sendJson(res, 200, body);
};

export default handleHealth;
