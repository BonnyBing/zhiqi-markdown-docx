import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateDocxBuffer } from '../src/generate';
import { mockImageFetch, writeGraphFixture } from '../tests/helpers/images';

const root = fileURLToPath(new URL('..', import.meta.url));

const main = async (): Promise<void> => {
  process.env.ALLOWED_IMAGE_HOSTS ||=
    'rdfx-grade3-kg-deploy.vercel.app,bonnybing.github.io';
  await writeGraphFixture();
  const markdown = await readFile(join(root, 'tests/fixtures/lesson-plan.md'), 'utf8');
  const { buffer, warnings } = await generateDocxBuffer(
    markdown,
    '乘除法的应用（二）——溶解速度公平实验',
    { fetch: mockImageFetch },
  );
  const outDir = join(root, 'tests/output');
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, 'lesson-plan.docx');
  await writeFile(outFile, buffer);
  console.log(`已生成 ${outFile}（${buffer.byteLength} 字节）`);
  if (warnings.length > 0) {
    console.log(`warnings: ${warnings.join('；')}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
