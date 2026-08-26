import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGraphPng } from './png';

const root = fileURLToPath(new URL('../..', import.meta.url));

export const GRAPH_PUBLIC_URL =
  'https://rdfx-grade3-kg-deploy.vercel.app/api/graph-image?record_id=RR-M-U6-X-DISSOLVE';
export const GRAPH_LOCAL_URL = 'https://bonnybing.github.io/fixtures/graph.png';

export const pngBytes = createGraphPng();

export const mockImageFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes('rdfx-grade3-kg-deploy.vercel.app') || url.includes('bonnybing.github.io')) {
    return new Response(pngBytes, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  }
  return new Response('not found', { status: 404 });
};

export const writeGraphFixture = async (): Promise<string> => {
  const target = join(root, 'tests', 'fixtures', 'graph.png');
  await mkdir(join(root, 'tests', 'fixtures'), { recursive: true });
  await writeFile(target, pngBytes);
  return target;
};
