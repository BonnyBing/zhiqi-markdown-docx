import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateDocx } from '../src/generate';
import { handleGenerateDocx } from '../src/http/generate-handler';
import { handleHealth } from '../src/http/health-handler';
import { handleCleanupDocx } from '../src/http/cleanup-handler';
import type { BlobStore } from '../src/storage/blob-storage';
import type { GenerateDocxResponse } from '../src/types';
import { mockImageFetch } from './helpers/images';
import { mockRequest, mockResponse } from './helpers/http';

const lessonPlan = readFileSync(
  join(process.cwd(), 'tests/fixtures/lesson-plan.md'),
  'utf8',
);

const httpsUrl = 'https://test.public.blob.vercel-storage.com/docx/2026/08/uuid-demo.docx';

const successStore = (): BlobStore => ({
  putDocx: async () => ({ url: httpsUrl, pathname: 'docx/2026/08/uuid-demo.docx' }),
  listDocx: async () => [],
  delete: async () => undefined,
});

const failingStore = (): BlobStore => ({
  putDocx: async () => {
    throw new Error('blob unavailable');
  },
  listDocx: async () => [],
  delete: async () => undefined,
});

beforeEach(() => {
  process.env.DOCX_API_KEY = 'test-api-key';
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_placeholder_not_real';
  process.env.MAX_MARKDOWN_BYTES = '122880';
  process.env.ALLOWED_IMAGE_HOSTS =
    'rdfx-grade3-kg-deploy.vercel.app,bonnybing.github.io';
  process.env.CLEANUP_ENABLED = 'false';
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.ALLOWED_ORIGINS = '';
});

afterEach(() => {
  delete process.env.CLEANUP_ENABLED;
});

describe('POST /api/generate-docx', () => {
  it('缺少 API 密钥返回 401，word_url 为空', async () => {
    const req = mockRequest({ headers: { 'content-type': 'application/json' } });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    const body = res.body as GenerateDocxResponse;
    expect(res.statusCode).toBe(401);
    expect(body.word_status).toBe('error');
    expect(body.word_url).toBe('');
  });

  it('接受 Authorization Bearer', async () => {
    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-api-key',
      },
      body: { markdown: '   ', filename: '教案' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as GenerateDocxResponse).word_message).toContain('markdown');
  });

  it('接受智启 Basic（密钥放在用户名、密码为空）', async () => {
    const encoded = Buffer.from('test-api-key:', 'utf8').toString('base64');
    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${encoded}`,
      },
      body: { markdown: '   ', filename: '教案' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as GenerateDocxResponse).word_message).toContain('markdown');
  });

  it('接受智启 Basic（密钥放在密码、用户名为空）', async () => {
    const encoded = Buffer.from(':test-api-key', 'utf8').toString('base64');
    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${encoded}`,
      },
      body: { markdown: '   ', filename: '教案' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as GenerateDocxResponse).word_message).toContain('markdown');
  });

  it('错误 API 密钥返回 401', async () => {
    const req = mockRequest({
      headers: { 'content-type': 'application/json', 'x-api-key': 'wrong' },
      body: { markdown: '# 标题', filename: 'a' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(401);
    expect((res.body as GenerateDocxResponse).word_url).toBe('');
  });

  it('空 Markdown 返回 400', async () => {
    const req = mockRequest({ body: { markdown: '   ', filename: '教案' } });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(400);
    const body = res.body as GenerateDocxResponse;
    expect(body.word_status).toBe('error');
    expect(body.word_url).toBe('');
    expect(body.word_message).toContain('markdown');
  });

  it('JSON 格式错误返回 400', async () => {
    const req = mockRequest({ body: '{not-json' });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as GenerateDocxResponse).word_message).toContain('JSON');
  });

  it('超长 Markdown 返回 413', async () => {
    process.env.MAX_MARKDOWN_BYTES = '64';
    const req = mockRequest({
      body: { markdown: '这是一段明显超过六十四字节的中文内容，用于触发上限。', filename: '教案' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(413);
    expect((res.body as GenerateDocxResponse).word_status).toBe('error');
  });

  it('Content-Length 超限返回 413', async () => {
    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-api-key',
        'content-length': '9999999',
      },
      body: { markdown: '# a', filename: 'a' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(413);
  });
});

describe('generateDocx 成功与上传失败', () => {
  it('成功时 word_url 为真实 HTTPS 地址', async () => {
    const result = await generateDocx(
      {
        markdown: lessonPlan,
        filename: '小学三年级数学-乘除法的应用（二）-科学跨学科教案',
        documentTitle: '乘除法的应用（二）——溶解速度公平实验',
      },
      { blobStore: successStore(), fetch: mockImageFetch },
    );
    expect(result.code).toBe(200);
    expect(result.word_status).toBe('success');
    expect(result.word_url).toBe(httpsUrl);
    expect(result.word_url.startsWith('https://')).toBe(true);
    expect(result.word_filename).toBe(
      '小学三年级数学-乘除法的应用（二）-科学跨学科教案.docx',
    );
    expect(result.word_size_bytes).toBeGreaterThan(0);
    expect(result.expires_at).toBe('');
  });

  it('Blob 上传失败时 word_url 为空', async () => {
    const result = await generateDocx(
      { markdown: '# 标题\n\n正文', filename: '测试文档' },
      { blobStore: failingStore(), fetch: mockImageFetch },
    );
    expect(result.code).toBe(500);
    expect(result.word_status).toBe('error');
    expect(result.word_url).toBe('');
    expect(result.word_filename).toBe('');
    expect(result.word_size_bytes).toBe(0);
    expect(result.word_message).toContain('上传失败');
  });

  it('清理未启用时 expires_at 为空，启用后返回 ISO 时间', async () => {
    process.env.CLEANUP_ENABLED = 'true';
    process.env.FILE_RETENTION_HOURS = '72';
    const result = await generateDocx(
      { markdown: '# 标题\n\n正文', filename: '测试文档' },
      { blobStore: successStore(), fetch: mockImageFetch },
    );
    expect(result.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('GET /api/health', () => {
  it('返回服务状态且不泄露密钥', () => {
    const req = mockRequest({ method: 'GET', url: '/api/health', body: undefined });
    const res = mockResponse();
    handleHealth(req, res);
    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.body);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'zhiqi-markdown-docx',
      storage_configured: true,
      version: '1.0.0',
    });
    expect(body).not.toContain('test-api-key');
    expect(body).not.toContain('vercel_blob_rw_test_placeholder_not_real');
    expect(body).not.toContain('BLOB_READ_WRITE_TOKEN');
  });
});

describe('OPTIONS 预检', () => {
  it('未配置来源时不回放任意 Origin', async () => {
    const req = mockRequest({
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    const res = mockResponse();
    await handleGenerateDocx(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('清理接口鉴权', () => {
  it('缺少 CRON_SECRET 时拒绝', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/cleanup-docx' });
    const res = mockResponse();
    await handleCleanupDocx(req, res);
    expect(res.statusCode).toBe(401);
  });
});
