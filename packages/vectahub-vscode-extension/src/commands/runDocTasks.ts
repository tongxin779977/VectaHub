import * as vscode from 'vscode';
import { runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { DocTask, TasksViewProvider } from '../views/tasksView.js';

interface ParseDocResult {
  ok: boolean;
  tasks?: DocTask[];
  error?: string;
}

interface RunTaskResult {
  ok: boolean;
  command?: string;
  output?: string;
  error?: string;
}

interface AgentCliInfo {
  name: string;
  installed: boolean;
  version?: string;
  enabled: boolean;
  has_permission: boolean;
}

interface AgentsListResult {
  ok: boolean;
  agents: AgentCliInfo[];
}

function formatCliError(raw: string, taskLabel: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return `${taskLabel}: ${parsed.message}`;
  } catch { /* not JSON */ }
  return `${taskLabel}: ${raw}`;
}

export function registerDocTaskCommands(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.selectDocFile', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          '文档文件': ['md', 'txt', 'rst', 'adoc'],
          '所有文件': ['*']
        },
        title: '选择开发文档'
      });

      if (!uris || uris.length === 0) return;

      const filePath = uris[0].fsPath;
      tasksProvider.setSelectedDocPath(filePath);
      tasksProvider.setDocTasks([]);
      tasksProvider.setIsDocParsing(false);
      tasksProvider.refresh();

      logToOutput(`已选择文档: ${filePath}`);

      await vscode.commands.executeCommand('vectahubTasks.parseDocTasks');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.parseDocTasks', async () => {
      const docPath = tasksProvider.getSelectedDocPath();
      if (!docPath) {
        vscode.window.showWarningMessage('请先选择文档文件');
        return;
      }

      tasksProvider.setIsDocParsing(true);
      tasksProvider.refresh();

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '正在解析文档任务...',
          cancellable: false
        }, async () => {
          const result = await runCli<ParseDocResult>(['parse-doc', docPath, '--json']);

          if (result.ok && result.data?.tasks) {
            tasksProvider.setDocTasks(result.data.tasks);
            logToOutput(`解析完成，共 ${result.data.tasks.length} 个任务`);
            vscode.window.showInformationMessage(`解析完成，共 ${result.data.tasks.length} 个任务`);
          } else {
            const errMsg = result.data?.error || result.error?.message || '解析失败';
            logToOutput(`解析失败: ${errMsg}`, 'error');
            vscode.window.showErrorMessage(`解析失败: ${errMsg}`);
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToOutput(`解析异常: ${msg}`, 'error');
        vscode.window.showErrorMessage(`解析异常: ${msg}`);
      } finally {
        tasksProvider.setIsDocParsing(false);
        tasksProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.selectAgentCli', async () => {
      const result = await runCli<AgentsListResult>(['tools', 'agents', '--json']);

      const items: vscode.QuickPickItem[] = [];

      if (result.ok && result.data?.agents) {
        const installedAgents = result.data.agents.filter(a => a.installed);

        if (installedAgents.length === 0) {
          vscode.window.showWarningMessage('未检测到已安装的 AI Agent CLI，请先安装 gemini/claude/codex/aider 等工具');
        }

        for (const agent of installedAgents) {
          items.push({
            label: agent.name,
            description: agent.version
          });
        }
      }

      items.push({
        label: '手动输入',
        description: '输入自定义 Agent CLI 名称'
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择 Agent CLI 执行器',
        title: '选择执行文档任务的 Agent CLI'
      });

      if (!selected) return;

      if (selected.label === '手动输入') {
        const customName = await vscode.window.showInputBox({
          prompt: '输入 Agent CLI 名称',
          placeHolder: 'aider'
        });
        if (customName) {
          tasksProvider.setSelectedAgentCli(customName);
          tasksProvider.refresh();
        }
      } else {
        tasksProvider.setSelectedAgentCli(selected.label);
        tasksProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.runDocTask', async (task: DocTask) => {
      const docPath = tasksProvider.getSelectedDocPath();
      let agentCli = tasksProvider.getSelectedAgentCli();

      if (!agentCli) {
        await vscode.commands.executeCommand('vectahubTasks.selectAgentCli');
        agentCli = tasksProvider.getSelectedAgentCli();
        if (!agentCli) {
          vscode.window.showWarningMessage('请先选择 Agent CLI 执行器');
          return;
        }
      }

      const args = [
        'run-task',
        '--tool', agentCli,
        '--task-id', task.id,
        '--task-label', task.label,
        '--json'
      ];

      if (docPath) {
        args.push('--doc', docPath);
      }

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `正在执行任务 ${task.id}: ${task.label}`,
          cancellable: true
        }, async (_progress, token) => {
          logToOutput(`开始执行任务: ${task.id} - ${task.label} (工具: ${agentCli})`);

          const result = await runCli<RunTaskResult>(args, {
            timeout: 600000,
            token
          });

          if (result.ok) {
            const output = result.data?.output || '';
            logToOutput(`任务 ${task.id} 执行成功`);
            if (output) {
              logToOutput(output);
            }
            vscode.window.showInformationMessage(`任务 ${task.id} 执行成功`);
          } else {
            const errMsg = result.data?.error || result.data?.output || result.error?.message || '执行失败';
            logToOutput(`任务 ${task.id} 执行失败: ${errMsg}`, 'error');
            vscode.window.showErrorMessage(`任务 ${task.id} 执行失败: ${errMsg}`);
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToOutput(`任务 ${task.id} 执行异常: ${msg}`, 'error');
        vscode.window.showErrorMessage(`任务执行异常: ${msg}`);
      }
    })
  );
}
