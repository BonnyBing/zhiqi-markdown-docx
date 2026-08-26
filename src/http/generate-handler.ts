/**
 * POST /api/generate-docx
 */

import { generateDocx } from '../generate';
import { logEvent } from '../log';
import {
  applyCors,
  buildError,
  handlePreflight,
  readHeader,
  sendJson,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../response';
import { verifyApiKey } from '../security/api-key';
import { checkContentLength } from '../security/request-limits';

const parseBody = (req: HttpRequestLike): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } => {
  const body = req.body;
  if (body === undefined || body === null || body === '') {
    return { ok: false, message: '请求体不能为空。' };
  }
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: '请求体必须是 JSON 对象。' };
      }
      return { ok: true, value: parsed as Record<string, unknown> };
    } catch {
      return { ok: false, message: 'JSON 格式错误。' };
    }
  }
  if (typeof body === 'object' && !Array.isArray(body)) {
    return { ok: true, value: body as Record<string, unknown> };
  }
  return { ok: false, message: '请求体必须是 JSON 对象。' };
};

export const handleGenerateDocx = async (
  req: HttpRequestLike,
  res: HttpResponseLike,
): Promise<void> => {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'POST') {
    sendJson(res, 405, buildError(405, '只允许 POST /api/generate-docx。'));
    return;
  }

  const contentType = readHeader(req, 'content-type').toLowerCase();
  if (contentType && !contentType.includes('application/json') && typeof req.body === 'string') {
    sendJson(res, 400, buildError(400, 'Content-Type 必须是 application/json。'));
    return;
  }

  const size = checkContentLength(req);
  if (!size.ok) {
    sendJson(res, size.code, buildError(size.code, size.message));
    return;
  }

  const auth = verifyApiKey(req);
  if (!auth.ok) {
    sendJson(res, auth.code, buildError(auth.code, auth.message));
    return;
  }

  const parsed = parseBody(req);
  if (!parsed.ok) {
    sendJson(res, 400, buildError(400, parsed.message));
    return;
  }

  // 客户端指定存储路径或远程地址一律忽略，不作为输入使用。
  const { markdown, filename, document_title: documentTitle } = parsed.value;

  try {
    const result = await generateDocx({
      markdown,
      filename,
      documentTitle,
    });
    sendJson(res, result.code, result);
  } catch (error) {
    logEvent('generate_unhandled', { message: error instanceof Error ? error.message : 'unknown' });
    sendJson(res, 500, buildError(500, '转换服务内部错误。'));
  }
};

export default handleGenerateDocx;
