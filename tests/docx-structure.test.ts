import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../src/markdown/parser';
import { buildDocxBuffer } from '../src/word/document-builder';
import { loadImages } from '../src/word/image-loader';
import { inspectDocx } from './helpers/docx-zip';
import { mockImageFetch, writeGraphFixture } from './helpers/images';

const lessonPlan = readFileSync(join(process.cwd(), 'tests/fixtures/lesson-plan.md'), 'utf8');
const allowlist = ['rdfx-grade3-kg-deploy.vercel.app', 'bonnybing.github.io'];

describe('DOCX 结构验收', () => {
  it('完整教案 Markdown 生成可打开的 DOCX，并含标题、列表、表格、图片', async () => {
    await writeGraphFixture();
    const parsed = parseMarkdown(lessonPlan);
    const images = await loadImages(parsed.blocks, { fetch: mockImageFetch, allowlist });
    const buffer = await buildDocxBuffer({
      blocks: parsed.blocks,
      documentTitle: '乘除法的应用（二）——溶解速度公平实验',
      images: images.results,
    });

    const outputDir = join(process.cwd(), 'tests/output');
    await mkdir(outputDir, { recursive: true });
    const outputPath = join(outputDir, 'lesson-plan.docx');
    await writeFile(outputPath, buffer);

    const zip = await inspectDocx(buffer);
    expect(zip.contentTypes.length).toBeGreaterThan(0);
    expect(zip.names).toContain('[Content_Types].xml');
    expect(zip.names).toContain('word/document.xml');
    expect(zip.documentXml).toContain('w:document');

    expect(zip.documentXml).toContain('Heading1');
    expect(zip.documentXml).toContain('Heading2');
    expect(zip.documentXml).toContain('Heading3');

    expect(zip.documentXml).toContain('教学目标');
    expect(zip.documentXml).toContain('普通中文段落');
    expect(zip.documentXml).not.toContain('**普通中文段落**');
    expect(zip.documentXml).not.toContain('*独立*');

    expect(zip.documentXml).toContain('w:numPr');
    expect(zip.documentXml).toContain('<w:tbl');
    expect(zip.documentXml).not.toContain('| --- |');
    expect(zip.documentXml).not.toContain('| 环节 |');

    expect(zip.media.length).toBeGreaterThan(0);
    expect(zip.rels).toMatch(/image/);
    expect(zip.documentXml).toContain('知识图谱连接图');
  });
});
