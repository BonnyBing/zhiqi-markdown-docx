import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'tests/output', 'dist']);

const walk = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry === 'output') continue;
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (rel.startsWith('node_modules') || rel.startsWith('.git')) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|js|json|yml|yaml|md|html|env|example)$/.test(entry) || entry === '.env.example') {
      files.push(full);
    }
  }
  return files;
};

describe('仓库中不存在真实密钥', () => {
  it('源码与文档不含真实 Blob Token 或 API 密钥赋值', () => {
    const files = walk(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (/vercel_blob_rw_[A-Za-z0-9]{20,}/.test(text) && !text.includes('placeholder') && !text.includes('test_')) {
        offenders.push(relative(ROOT, file));
      }
      if (/DOCX_API_KEY=\s*['\"][^'\"]{16,}['\"]/.test(text)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
