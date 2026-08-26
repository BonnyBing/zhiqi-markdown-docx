import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('OpenAPI 插件描述', () => {
  const raw = readFileSync(
    join(process.cwd(), 'openapi/zhiqi-markdown-docx-plugin.yaml'),
    'utf8',
  );
  const doc = parse(raw) as Record<string, unknown>;

  it('能被解析为 OpenAPI 3.0 文档', () => {
    expect(String(doc.openapi)).toMatch(/^3\.0/);
    expect(doc.info).toBeDefined();
    expect(doc.paths).toBeDefined();
  });

  it('字段与真实接口一致', () => {
    const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;
    const post = paths['/api/generate-docx']?.post;
    expect(post).toBeDefined();
    expect(post?.operationId).toBe('generateTeachingDocx');

    const request = post?.requestBody as {
      content: { 'application/json': { schema: { $ref?: string; required?: string[]; properties?: Record<string, unknown> } } };
    };
    const requestSchema = request.content['application/json'].schema;
    const schemas = (doc.components as { schemas: Record<string, { required: string[]; properties: Record<string, unknown> }> }).schemas;
    const resolvedRequest = requestSchema.$ref
      ? schemas[requestSchema.$ref.split('/').pop() as string]
      : requestSchema;
    expect(resolvedRequest?.required).toEqual(expect.arrayContaining(['markdown', 'filename']));
    expect(Object.keys(resolvedRequest?.properties ?? {})).toEqual([
      'markdown',
      'filename',
      'document_title',
    ]);

    const responses = post?.responses as Record<
      string,
      { content: { 'application/json': { schema: { $ref?: string; properties?: Record<string, unknown> } } } }
    >;
    const responseSchema = schemas.GenerateDocxResponse;
    for (const code of ['200', '400', '401', '500']) {
      expect(responses[code]).toBeDefined();
      const ref = responses[code]!.content['application/json'].schema.$ref;
      expect(ref).toContain('GenerateDocxResponse');
    }
    expect(responseSchema).toBeDefined();
    expect(Object.keys(responseSchema!.properties)).toEqual(
      expect.arrayContaining([
        'code',
        'word_status',
        'word_url',
        'word_filename',
        'word_size_bytes',
        'word_message',
        'warnings_text',
        'expires_at',
      ]),
    );
  });
});
