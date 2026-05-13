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
      if (tasksProvider.getIsDocParsing()) {
        vscode.window.showWarningMessage('文档正在解析中，请稍候...');
        return;
      }

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
          const result = await runCli<ParseDocResult>(['parse-doc', docPath, '--json'], { timeout: 120000 });

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
      if (task.status === 'running') return;

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

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.runAllDocTasks', async () => {
      if (tasksProvider.getIsBatchRunning()) {
        vscode.window.showWarningMessage('批量任务正在执行中，请稍候...');
        return;
      }

      const tasks = tasksProvider.getDocTasks();
      if (!tasks || tasks.length === 0) {
        vscode.window.showWarningMessage('当前没有解析到的任务，请先解析文档');
        return;
      }

      const runningTasks = tasks.filter(t => t.status === 'running');
      if (runningTasks.length > 0) {
        vscode.window.showWarningMessage(`当前有 ${runningTasks.length} 个任务正在执行中，请等待完成后再试`);
        return;
      }

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

      const config = vscode.workspace.getConfiguration('vectahubTasks');
      const maxConcurrent = config.get<number>('maxConcurrentTasks', 3);

      const confirm = await vscode.window.showInformationMessage(
        `即将并行执行 ${tasks.length} 个任务（最大并发: ${maxConcurrent}）`,
        { modal: true },
        '确认启动',
        '取消'
      );

      if (confirm !== '确认启动') return;

      tasksProvider.setIsBatchRunning(true);

      const queue = [...tasks];
      let completedCount = 0;
      let failedCount = 0;
      const totalTasks = tasks.length;
      let cancelled = false;

      for (const task of tasks) {
        task.status = 'pending';
      }
      tasksProvider.setDocTasks(tasks);
      tasksProvider.refresh();

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `批量执行任务 (0/${totalTasks})`,
          cancellable: true
        }, async (progress, token) => {
          token.onCancellationRequested(() => {
            cancelled = true;
            logToOutput('[batch] 用户取消批量执行');
          });

          function updateProgress(taskId: string, label: string) {
            const activeCount = tasks.filter(t => t.status === 'running').length;
            progress.report({
              message: `${completedCount}/${totalTasks} 完成, ${activeCount} 运行中, ${failedCount} 失败`,
              increment: (1 / totalTasks) * 100
          });
          logToOutput(`[batch] 任务 ${taskId} ${label} (${completedCount}/${totalTasks}, 失败: ${failedCount})`);
        }

        async function runSingleTask(task: DocTask): Promise<void> {
          if (cancelled) return;

          task.status = 'running';
          tasksProvider.refresh();

          const args = [
            'run-task', '--tool', agentCli!,
            '--task-id', task.id,
            '--task-label', task.label,
            '--json'
          ];
          if (docPath) args.push('--doc', docPath);

          try {
            const result = await runCli<RunTaskResult>(args, {
              timeout: 600000,
              token
            });

            if (result.ok) {
              task.status = 'success';
              updateProgress(task.id, '完成');
            } else {
              task.status = 'failed';
              failedCount++;
              const errMsg = result.data?.error || result.data?.output || '执行失败';
              logToOutput(`[batch] 任务 ${task.id} 失败: ${errMsg}`, 'error');
              updateProgress(task.id, '失败');
            }
          } catch (err) {
            task.status = 'failed';
            failedCount++;
            const errMsg = err instanceof Error ? err.message : String(err);
            logToOutput(`[batch] 任务 ${task.id} 异常: ${errMsg}`, 'error');
            updateProgress(task.id, '异常');
          } finally {
            completedCount++;
            tasksProvider.refresh();
          }
        }

        async function runWithConcurrency(): Promise<void> {
          const active: Promise<void>[] = [];

          while (queue.length > 0 && !cancelled) {
            while (active.length < maxConcurrent && queue.length > 0 && !cancelled) {
              const task = queue.shift()!;
              const p = runSingleTask(task).then(() => {
                const idx = active.indexOf(p);
                if (idx >= 0) active.splice(idx, 1);
              });
              active.push(p);
            }
            if (active.length > 0) {
              await Promise.race(active);
            }
          }

          await Promise.allSettled(active);
        }

        await runWithConcurrency();

        const successCount = totalTasks - failedCount;
        const msg = failedCount === 0
          ? `批量执行完成: 全部 ${successCount} 个任务成功`
          : `批量执行完成: ${successCount} 成功, ${failedCount} 失败`;

        logToOutput(`[batch] ${msg}`);

        if (cancelled) {
          vscode.window.showWarningMessage(`批量执行已取消 (${successCount} 成功, ${failedCount} 失败)`);
        } else if (failedCount === 0) {
          vscode.window.showInformationMessage(msg);
        } else {
          vscode.window.showWarningMessage(msg);
        }
      });
      } finally {
        tasksProvider.setIsBatchRunning(false);
        tasksProvider.refresh();
      }
    })
  );
}
