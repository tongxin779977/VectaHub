const assert = require('node:assert/strict');
const fs = require('node:fs');
const vscode = require('vscode');

function extractChoices(items) {
  return items.filter((item) => typeof item === 'string');
}

function pickChoice(items, preferred) {
  const choices = extractChoices(items);
  for (const label of preferred) {
    if (choices.includes(label)) {
      return label;
    }
  }
  return choices[0];
}

function readCliCalls(logPath) {
  if (!fs.existsSync(logPath)) {
    return [];
  }
  return fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function hasCliCall(calls, expectedArgs) {
  return calls.some((entry) => JSON.stringify(entry.args) === JSON.stringify(expectedArgs));
}

async function waitFor(check, timeoutMs = 10000) {
  const startedAt = Date.now();
  for (;;) {
    const result = await check();
    if (result) {
      return result;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function run() {
  const docPath = process.env.VECTAHUB_E2E_DOC_PATH;
  const cliLogPath = process.env.VECTAHUB_E2E_CLI_LOG_PATH;
  const resultPath = process.env.VECTAHUB_E2E_RESULT_PATH;
  assert.ok(docPath, 'Missing VECTAHUB_E2E_DOC_PATH');
  assert.ok(cliLogPath, 'Missing VECTAHUB_E2E_CLI_LOG_PATH');
  assert.ok(resultPath, 'Missing VECTAHUB_E2E_RESULT_PATH');
  assert.ok(fs.existsSync(docPath), `Doc file does not exist: ${docPath}`);

  const infoMessages = [];
  const warningMessages = [];
  const errorMessages = [];
  const terminals = [];

  const originalShowInformationMessage = vscode.window.showInformationMessage.bind(vscode.window);
  const originalShowWarningMessage = vscode.window.showWarningMessage.bind(vscode.window);
  const originalShowErrorMessage = vscode.window.showErrorMessage.bind(vscode.window);
  const originalShowInputBox = vscode.window.showInputBox.bind(vscode.window);
  const originalShowQuickPick = vscode.window.showQuickPick.bind(vscode.window);
  const originalShowOpenDialog = vscode.window.showOpenDialog.bind(vscode.window);
  const originalWithProgress = vscode.window.withProgress.bind(vscode.window);
  const originalCreateTerminal = vscode.window.createTerminal.bind(vscode.window);

  vscode.window.showInformationMessage = async (message, ...items) => {
    infoMessages.push({ message, items });
    return pickChoice(items, ['确认执行', '确认启动', '开始修复', '查看详情']);
  };
  vscode.window.showWarningMessage = async (message, ...items) => {
    warningMessages.push({ message, items });
    return pickChoice(items, ['开始处理', '开始修复', '删除', '清空队列', '重试']);
  };
  vscode.window.showErrorMessage = async (message, ...items) => {
    errorMessages.push({ message, items });
    return pickChoice(items, ['查看分析']);
  };
  vscode.window.showInputBox = async () => 'git status';
  vscode.window.showQuickPick = async (items) => Array.isArray(items) ? items[0] : undefined;
  vscode.window.showOpenDialog = async () => [vscode.Uri.file(docPath)];
  vscode.window.withProgress = async (_options, task) => task(
    { report() {} },
    { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) },
  );
  vscode.window.createTerminal = (options = {}) => {
    const name = typeof options === 'string' ? options : options.name || '';
    const record = { name, sent: [], shown: false };
    terminals.push(record);
    return {
      show() {
        record.shown = true;
      },
      sendText(text) {
        record.sent.push(text);
      },
      dispose() {},
      hide() {},
    };
  };

  try {
    const extension = vscode.extensions.getExtension('vectahub.vectahub-vscode-extension');
    assert.ok(extension, 'Extension should be installed in host');
    await extension.activate();

    await waitFor(async () => {
      const commands = await vscode.commands.getCommands(true);
      return commands.includes('vectahubTasks.doctor');
    });

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('vectahubTasks.installCli'));
    assert.ok(commands.includes('vectahubTasks.configLlm'));
    assert.ok(commands.includes('vectahubTasks.selectDocFile'));
    assert.ok(commands.includes('vectahubTasks.runAllDocTasks'));
    assert.ok(commands.includes('vectahubTasks.syncAndFixCi'));

    await vscode.commands.executeCommand('vectahubTasks.refreshProjectTasks');
    await vscode.commands.executeCommand('vectahubTasks.installCli');
    await vscode.commands.executeCommand('vectahubTasks.configLlm');
    await vscode.commands.executeCommand('vectahubTasks.doctor');
    await vscode.commands.executeCommand('vectahubTasks.listTools');
    await vscode.commands.executeCommand('vectahubTasks.testSecurity');
    await vscode.commands.executeCommand('vectahubTasks.selectDocFile');
    await vscode.commands.executeCommand('vectahubTasks.selectAgentCli');
    await vscode.commands.executeCommand('vectahubTasks.runAllDocTasks');
    await vscode.commands.executeCommand('vectahubTasks.syncAndFixCi');
    await vscode.commands.executeCommand('vectahubTasks.removeQueueTask', 'queue-pending-1');
    await vscode.commands.executeCommand('vectahubTasks.clearQueue');

    const cliCalls = readCliCalls(cliLogPath);
    assert.ok(hasCliCall(cliCalls, ['doctor', '--json']));
    assert.ok(hasCliCall(cliCalls, ['tools', 'list', '--json']));
    assert.ok(hasCliCall(cliCalls, ['security', 'test', '--json', 'git status']));
    assert.ok(hasCliCall(cliCalls, ['parse-doc', docPath, '--json']));
    assert.ok(hasCliCall(cliCalls, ['tools', 'agents', '--json', '--sync-config']));
    assert.ok(hasCliCall(cliCalls, ['run', '-f', 'sys:fetch-gh-actions-errors', '--json']));
    assert.ok(hasCliCall(cliCalls, ['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed', '--json']));
    assert.ok(hasCliCall(cliCalls, ['queue', 'remove', 'queue-pending-1', '--json']));
    assert.ok(hasCliCall(cliCalls, ['queue', 'clear', '--json', '--force']));
    assert.ok(cliCalls.filter((entry) => entry.args[0] === 'run-task').length >= 2);

    const installTerminal = terminals.find((terminal) => terminal.name === 'VectaHub 安装');
    assert.ok(
      installTerminal && (
        installTerminal.sent.includes('npm install -g .')
        || installTerminal.sent.includes('npm install -g vectahub')
      ),
      `Expected install terminal command, got: ${JSON.stringify(terminals)}`,
    );
    assert.ok(terminals.some((terminal) => terminal.name === 'VectaHub LLM 配置' && terminal.sent.includes('vectahub setup')));
    assert.ok(infoMessages.some((entry) => String(entry.message).includes('解析完成')));
    const allNotificationMessages = [...infoMessages, ...warningMessages].map((entry) => String(entry.message));
    const hasCompletionNotification = allNotificationMessages.some((message) =>
      message.includes('执行成功')
      || message.includes('批量执行完成')
      || message.includes('同步并修复完成'),
    );
    assert.ok(
      hasCompletionNotification,
      `Expected completion notification, info=${JSON.stringify(infoMessages)}, warning=${JSON.stringify(warningMessages)}`,
    );
    assert.equal(errorMessages.length, 0);
    fs.writeFileSync(resultPath, JSON.stringify({ status: 'ok' }), 'utf8');
  } finally {
    vscode.window.showInformationMessage = originalShowInformationMessage;
    vscode.window.showWarningMessage = originalShowWarningMessage;
    vscode.window.showErrorMessage = originalShowErrorMessage;
    vscode.window.showInputBox = originalShowInputBox;
    vscode.window.showQuickPick = originalShowQuickPick;
    vscode.window.showOpenDialog = originalShowOpenDialog;
    vscode.window.withProgress = originalWithProgress;
    vscode.window.createTerminal = originalCreateTerminal;
  }
}

module.exports = {
  run,
};
