import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
  entry: ['src/cli.ts', 'src/utils/gh-to-queue.ts'],
  format: ['esm'],
  clean: true,
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
  process.setMaxListeners(20);
  process.on("warning", (warning) => {
    if (warning.name === "MaxListenersExceededWarning" && warning.message.includes("exit listeners")) {
      return;
    }
    process.stderr.write(warning.message + "\\n");
  });
}
`.trimStart(),
  },
});
