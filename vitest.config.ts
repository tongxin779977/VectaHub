import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 删除对不存在的 test-setup.ts 的引用
  },
});
