import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { waitForCliReady } from '../cli/readiness.js';
import { isDangerousCommand, getDangerousMatch } from '../cli/dangerDetection.js';

interface SecurityResult {
  isDangerous: boolean;
  severity?: string;
  rule?: { name: string };
}

const SECURITY_TEST_TIMEOUT = 15000;

export function registerTestSecurityCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.testSecurity', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const text = selection ? editor.document.getText(selection) : '';
    
    const command = text || await vscode.window.showInputBox({
      prompt: '输入要进行安全合规性测试的命令',
      placeHolder: '例如: rm -rf /'
    });

    if (!command) return;

    const dangerousMatch = getDangerousMatch(command);
    if (dangerousMatch) {
      logToOutput(`[testSecurity] 本地危险检测命中: ${dangerousMatch}`);
      vscode.window.showErrorMessage(`🚨 危险命令! 命中本地规则: "${dangerousMatch}"`);
      return;
    }

    const ready = await waitForCliReady();
    if (!ready) {
      logToOutput('[testSecurity] CLI 未就绪，使用本地检测结果');
      if (isDangerousCommand(command)) {
        vscode.window.showErrorMessage('🚨 命令被本地安全规则标记为危险');
      } else {
        vscode.window.showInformationMessage('⚠️ CLI 未就绪，本地检测未发现危险模式');
      }
      return;
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) {
      vscode.window.showWarningMessage('未打开工作区，安全检测将在默认目录下执行');
    }

    logToOutput(`[testSecurity] 正在进行安全测试，命令: "${command}"`);

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "VectaHub: 正在进行安全检测...",
      cancellable: true
    }, async (progress, token) => {
      const result = await runCli<SecurityResult>(
        ['security', 'test', '--json', command],
        { token, timeout: SECURITY_TEST_TIMEOUT, cwd }
      );

      if (!result.ok) {
        if (result.error?.code === 'CANCELLED') {
          logToOutput('[testSecurity] 安全检测已取消');
          return;
        }
        const errMsg = result.error?.message || result.stderr || '未知错误';
        logToOutput(`[testSecurity] CLI 安全检测失败: ${errMsg}，回退到本地检测`, 'warn');
        
        if (isDangerousCommand(command)) {
          vscode.window.showErrorMessage('🚨 命令被本地安全规则标记为危险 (CLI 检测失败)');
        } else {
          vscode.window.showWarningMessage(`安全检测异常: ${errMsg}，本地检测未发现危险模式`);
        }
        return;
      }

      if (result.data?.isDangerous) {
        vscode.window.showErrorMessage(`🚨 危险命令! 风险等级: ${result.data.severity}. 命中规则: ${result.data.rule?.name}`);
        logToOutput(`[testSecurity] 安全警报: ${result.data.rule?.name} (风险: ${result.data.severity})`, 'warn');
      } else {
        vscode.window.showInformationMessage('✅ 命令安全合规。');
        logToOutput('[testSecurity] 安全检查: 通过。');
      }
    });
  });
  context.subscriptions.push(disposable);
}
