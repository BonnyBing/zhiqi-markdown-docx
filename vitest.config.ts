import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 本地 esbuild 会生成 src/http/*.js；测试必须优先走 TypeScript 源码。
    extensions: ['.ts', '.js'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
