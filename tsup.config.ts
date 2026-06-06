import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
  entry: [
    'src/cli.ts',
    'src/utils/gh-to-queue.ts',
    'src/utils/process-diagnostic-queue.ts',
    'src/execution/index.ts',
    'src/commands/chat.ts',
    'src/commands/run.ts',
    'src/commands/doctor.ts',
    'src/commands/serve.ts',
    'src/commands/security.ts',
    'src/commands/audit-cmd.ts',
    'src/commands/tools.ts',
    'src/commands/list.ts',
    'src/commands/mode.ts',
    'src/commands/history.ts',
    'src/commands/detail.ts',
    'src/commands/rerun.ts',
    'src/commands/resume.ts',
    'src/commands/archive.ts',
    'src/commands/run-command.ts',
    'src/commands/generate.ts',
    'src/commands/schedule.ts',
    'src/commands/daemon.ts',
    'src/commands/templates.ts',
    'src/commands/verify.ts',
    'src/commands/monitor.ts',
    'src/commands/debug.ts',
    'src/commands/export.ts',
    'src/commands/vscode-diagnostic.ts',
    'src/commands/parse-doc.ts',
    'src/commands/run-task.ts',
    'src/commands/trace.ts',
    'src/commands/doc-task-runs.ts',
    'src/commands/recover-task.ts',
    'src/commands/provider.ts',
    'src/commands/queue.ts',
    'src/commands/status.ts',
    'src/commands/module.ts',
    'src/commands/validate.ts',
    'src/commands/test.ts',
    'src/commands/build.ts',
    'src/agent-runtime/config-loader.ts',
    'src/cli-tools/index.ts',
    'src/cli-tools/tools/git.ts',
    'src/cli-tools/tools/npm.ts',
    'src/cli-tools/tools/docker.ts',
    'src/cli-tools/tools/curl.ts',
  ],
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
