const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function djb2Hash(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, '../e2e/runner.cjs');
  const workspacePath = '/Users/xin.tong/apps/project/test_trae/财务智能表格处理';
  const docPath = path.join(workspacePath, 'docs', 'feature_roadmap.md');
  const stubCliPath = path.resolve(__dirname, '../e2e/vectahub-stub.cjs');
  const vscodeCliPath = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vectahub-vscode-e2e-'));
  const userDataDir = path.join(tempRoot, 'user-data');
  const extensionsDir = path.join(tempRoot, 'extensions');
  const vectahubHomeDir = path.join(tempRoot, '.vectahub');
  const cliLogPath = path.join(tempRoot, 'cli-log.jsonl');
  const resultPath = path.join(tempRoot, 'runner-result.json');
  const userSettingsDir = path.join(userDataDir, 'User');
  const queueDir = path.join(vectahubHomeDir, 'projects', djb2Hash(workspacePath));
  const queuePath = path.join(queueDir, 'diagnostic-queue.json');

  fs.mkdirSync(userSettingsDir, { recursive: true });
  fs.mkdirSync(queueDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.chmodSync(stubCliPath, 0o755);

  fs.writeFileSync(
    path.join(userSettingsDir, 'settings.json'),
    JSON.stringify({
      'vectahubTasks.autoDetectCli': true,
      'vectahubTasks.cliPath': stubCliPath,
      'vectahubTasks.previewBeforeRun': false,
      'vectahubTasks.maxConcurrentTasks': 1,
    }, null, 2),
    'utf8',
  );

  fs.writeFileSync(
    queuePath,
    JSON.stringify([
      {
        id: 'queue-pending-1',
        title: 'Fix CI failure',
        description: 'Pending GitHub Actions diagnostics',
        source: 'github-actions',
        status: 'pending',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
      {
        id: 'queue-processing-1',
        title: 'Investigate lint warning',
        description: 'Processing project diagnostics',
        source: 'system',
        status: 'processing',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ], null, 2),
    'utf8',
  );

  console.log(`VectaHub E2E temp root: ${tempRoot}`);
  if (!fs.existsSync(vscodeCliPath)) {
    throw new Error(`VS Code CLI not found: ${vscodeCliPath}`);
  }

  const args = [
    '--verbose',
    '--new-window',
    '--password-store=basic',
    '--folder-uri',
    pathToFileURL(workspacePath).toString(),
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-updates',
    '--user-data-dir',
    userDataDir,
    '--extensions-dir',
    extensionsDir,
    `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
    `--extensionTestsPath=${extensionTestsPath}`,
  ];

  await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = cp.spawn(vscodeCliPath, args, {
      env: {
        ...process.env,
        VECTAHUB_HOME: vectahubHomeDir,
        VECTAHUB_E2E_DOC_PATH: docPath,
        VECTAHUB_E2E_CLI_LOG_PATH: cliLogPath,
        VECTAHUB_E2E_RESULT_PATH: resultPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0 && fs.existsSync(resultPath)) {
        resolve();
        return;
      }

      if (!fs.existsSync(resultPath)) {
        if (stdout.includes('kLSNoLaunchPermissionErr') || stderr.includes('kLSNoLaunchPermissionErr')) {
          reject(new Error('VS Code GUI launch is blocked in this environment (kLSNoLaunchPermissionErr), so extension-host E2E could not run.'));
          return;
        }
        reject(new Error(`VS Code E2E did not produce a runner result file: ${resultPath}`));
        return;
      }

      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      reject(new Error(result.message || `VS Code E2E exited with ${signal || code}`));
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
