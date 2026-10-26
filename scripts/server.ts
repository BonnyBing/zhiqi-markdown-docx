/**
 * 自建 / Docker 常驻 HTTP 服务。
 *
 *   POST /api/generate-docx
 *   GET  /api/health
 *   GET|POST /api/cleanup-docx
 *   GET  /files/<uuid>.docx
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '../src/config';
import { handleCleanupDocx } from '../src/http/cleanup-handler';
import { handleGenerateDocx } from '../src/http/generate-handler';
import { handleHealth } from '../src/http/health-handler';
import { isManagedDocxPath } from '../src/storage/blob-storage';
import type { HttpRequestLike, HttpResponseLike } from '../src/response';

const port = Number.parseInt(process.env.PORT || '8100', 10);
const host = process.env.HOST || '0.0.0.0';

const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const toHandlerReq = (
  req: http.IncomingMessage,
  body: unknown,
): HttpRequestLike => ({
  method: req.method,
  headers: req.headers as Record<string, string | string[] | undefined>,
  body,
  url: req.url,
});

const decorateRes = (res: http.ServerResponse): HttpResponseLike => {
  const api: HttpResponseLike = {
    status(code: number) {
      res.statusCode = code;
      return api;
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
      return api;
    },
    json(obj: unknown) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(obj));
      return api;
    },
    end(body?: unknown) {
      if (body !== undefined) res.end(body as string | Buffer);
      else res.end();
      return api;
    },
  };
  return api;
};

const serveFile = async (
  res: http.ServerResponse,
  filePath: string,
  downloadName?: string,
): Promise<void> => {
  try {
    const data = await fsp.readFile(filePath);
    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (downloadName) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadName}"`,
      );
    }
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 404, message: '文件不存在。' }));
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const handlerRes = decorateRes(res);

  try {
    if (pathname === '/api/health') {
      const raw = await readBody(req);
      handleHealth(toHandlerReq(req, raw.length ? raw.toString('utf8') : undefined), handlerRes);
      return;
    }

    if (pathname === '/api/generate-docx') {
      const raw = await readBody(req);
      let body: unknown = undefined;
      if (raw.length) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          body = raw.toString('utf8');
        }
      }
      await handleGenerateDocx(toHandlerReq(req, body), handlerRes);
      return;
    }

    if (pathname === '/api/cleanup-docx') {
      await readBody(req);
      await handleCleanupDocx(toHandlerReq(req, undefined), handlerRes);
      return;
    }

    const fileMatch = pathname.match(/^\/files\/([^/]+)$/);
    if (fileMatch && (req.method || 'GET').toUpperCase() === 'GET') {
      const name = decodeURIComponent(fileMatch[1] || '');
      if (!isManagedDocxPath(name)) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const { localStorageDir } = getConfig();
      if (!localStorageDir) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const filePath = path.join(localStorageDir, path.basename(name));
      if (!filePath.startsWith(path.resolve(localStorageDir))) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      await serveFile(res, filePath, name);
      return;
    }

    if (pathname === '/' || pathname === '/favicon.ico') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          service: 'zhiqi-markdown-docx',
          endpoints: ['/api/health', '/api/generate-docx', '/api/cleanup-docx', '/files/:id.docx'],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 404, message: '路径不存在。' }));
  } catch (error) {
    console.error(`[${req.method} ${pathname}]`, error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: 500, message: '服务器内部错误。' }));
    }
  }
});

server.listen(port, host, () => {
  const cfg = getConfig();
  console.log(`zhiqi-markdown-docx listening on http://${host}:${port}`);
  console.log(`storage_backend=${cfg.storageBackend} public_base_url=${cfg.publicBaseUrl || '(unset)'}`);
});
