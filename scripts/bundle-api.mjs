import { build } from 'esbuild';

const handlers = [
  'src/http/health-handler.ts',
  'src/http/generate-handler.ts',
  'src/http/cleanup-handler.ts',
];

await build({
  entryPoints: handlers,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'src/http',
  packages: 'external',
  logLevel: 'info',
  outExtension: { '.js': '.js' },
});
