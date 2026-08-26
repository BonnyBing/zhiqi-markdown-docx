import { beforeAll, describe, expect, it } from 'vitest';

import { CONTENT_WIDTH_PX, fitImage } from '../src/word/page-layout';
import { checkImageUrlShape } from '../src/security/image-url';
import { parseMarkdown } from '../src/markdown/parser';
import { buildDocxBuffer } from '../src/word/document-builder';
import { loadImages, loadOneImage } from '../src/word/image-loader';
import { inspectDocx } from './helpers/docx-zip';
import {
  GRAPH_LOCAL_URL,
  GRAPH_PUBLIC_URL,
  mockImageFetch,
  pngBytes,
  writeGraphFixture,
} from './helpers/images';
import { GRAPH_PNG_HEIGHT, GRAPH_PNG_WIDTH } from './helpers/png';

const allowlist = ['rdfx-grade3-kg-deploy.vercel.app', 'bonnybing.github.io'];

beforeAll(async () => {
  await writeGraphFixture();
});

describe('图片 URL 安全校验', () => {
  it('拒绝非法协议与非 HTTPS', () => {
    expect(checkImageUrlShape('file:///etc/passwd').ok).toBe(false);
    expect(checkImageUrlShape('data:image/png;base64,aaa').ok).toBe(false);
    expect(checkImageUrlShape('javascript:alert(1)').ok).toBe(false);
    expect(checkImageUrlShape('http://example.com/a.png').ok).toBe(false);
  });

  it('拒绝 localhost、私有 IP 和链路本地地址', () => {
    expect(checkImageUrlShape('https://localhost/a.png').ok).toBe(false);
    expect(checkImageUrlShape('https://127.0.0.1/a.png').ok).toBe(false);
    expect(checkImageUrlShape('https://0.0.0.0/a.png').ok).toBe(false);
    expect(checkImageUrlShape('https://192.168.1.8/a.png').ok).toBe(false);
    expect(checkImageUrlShape('https://10.0.0.2/a.png').ok).toBe(false);
    expect(checkImageUrlShape('https://172.16.0.4/a.png').ok).toBe(false);
    expect(checkImageUrlShape('https://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(checkImageUrlShape('https://[::1]/a.png').ok).toBe(false);
  });

  it('白名单开启时拒绝名单外域名', () => {
    const result = checkImageUrlShape('https://evil.example/a.png', allowlist);
    expect(result.ok).toBe(false);
  });
});

describe('图片嵌入', () => {
  it('PNG 嵌入后 DOCX 中存在 word/media 与图片关系', async () => {
    const parsed = parseMarkdown(`![知识图谱连接图](${GRAPH_PUBLIC_URL})`);
    const images = await loadImages(parsed.blocks, { fetch: mockImageFetch, allowlist });
    const loaded = [...images.results.values()][0];
    expect(loaded?.ok).toBe(true);

    const buffer = await buildDocxBuffer({ blocks: parsed.blocks, images: images.results });
    const zip = await inspectDocx(buffer);
    expect(zip.media.length).toBeGreaterThan(0);
    expect(zip.rels).toMatch(/image/);
    expect(zip.documentXml).toContain('知识图谱连接图');
    expect(zip.documentXml).not.toContain(GRAPH_PUBLIC_URL);
  });

  it('图片保持宽高比且不超过页面宽度', async () => {
    const loaded = await loadOneImage(GRAPH_LOCAL_URL, '本地测试图', {
      fetch: mockImageFetch,
      allowlist,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.width).toBe(GRAPH_PNG_WIDTH);
    expect(loaded.height).toBe(GRAPH_PNG_HEIGHT);
    expect(loaded.scaledWidth).toBeLessThanOrEqual(CONTENT_WIDTH_PX);
    expect(loaded.scaledWidth / loaded.scaledHeight).toBeCloseTo(
      GRAPH_PNG_WIDTH / GRAPH_PNG_HEIGHT,
      1,
    );
    const expected = fitImage(GRAPH_PNG_WIDTH, GRAPH_PNG_HEIGHT);
    expect(loaded.scaledWidth).toBe(expected.width);
    expect(loaded.scaledHeight).toBe(expected.height);
  });

  it('图片下载失败时仍生成 Word，并返回 warnings', async () => {
    const parsed = parseMarkdown('![实验装置](https://bonnybing.github.io/missing.png)\n\n正文仍在。');
    const failingFetch: typeof fetch = async () => new Response('gone', { status: 404 });
    const images = await loadImages(parsed.blocks, { fetch: failingFetch, allowlist });
    expect(images.warnings.join('')).toMatch(/未能嵌入|404/);
    const buffer = await buildDocxBuffer({ blocks: parsed.blocks, images: images.results });
    const zip = await inspectDocx(buffer);
    expect(zip.documentXml).toContain('图片未能嵌入：实验装置');
    expect(zip.documentXml).toContain('正文仍在');
    expect(zip.media).toHaveLength(0);
  });

  it('mock 返回的字节确实是 PNG', () => {
    expect(pngBytes.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });
});
