import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
  entry: ['src/cli.ts', 'src/utils/gh-to-queue.ts', 'src/execution/index.ts'],
  format: ['esm'],
  minify: true,
  treeshake: true,
  clean: true,
  sourcemap: false,
  target: 'node18',
  outExtension({ format }) {
    return {
      js: '.js',
    };
  },
  onSuccess() {
    // 确保 gh-to-queue.js 在正确位置
    const srcPath = path.join('dist', 'gh-to-queue.js');
    const dstDir = path.join('dist', 'utils');
    const dstPath = path.join(dstDir, 'gh-to-queue.js');
    
    if (fs.existsSync(srcPath)) {
      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, dstPath);
    }
  },
  banner: {
    js: `
if (typeof process !== "undefined" && typeof process.setMaxListeners === "function") {
  if (!globalThis.__vectahubWarningHooked) {
    globalThis.__vectahubWarningHooked = true;
    process.setMaxListeners(50);
    process.on("warning", (warning) => {
      if (warning.name === "MaxListenersExceededWarning") {
        return;
      }
      process.stderr.write(warning.message + "\\n");
    });
  }
}
`.trimStart(),
  },
});
