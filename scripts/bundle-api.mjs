import { mkdir, unlink } from 'node:fs/promises';
import { build } from 'esbuild';

const entries = ['health', 'generate-docx', 'cleanup-docx'];

await mkdir('api', { recursive: true });

for (const name of entries) {
  await build({
    entryPoints: [`api/${name}.ts`],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: `api/${name}.js`,
    packages: 'external',
    logLevel: 'info',
  });
}

if (process.env.VERCEL) {
  for (const name of entries) {
    await unlink(`api/${name}.ts`);
  }
}
