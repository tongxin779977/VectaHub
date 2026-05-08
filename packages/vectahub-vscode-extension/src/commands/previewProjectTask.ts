import * as vscode from 'vscode';
import { ProjectTask, ProjectTaskKind } from '../project/taskModel.js';
import { previewIntent } from './previewIntent.js';

export function mapKindToIntent(kind: ProjectTaskKind): string {
  switch (kind) {
    case 'git-status': return '查看 git 状态';
    case 'install': return '安装依赖';
    case 'test': return '运行测试';
    case 'build': return '构建项目';
    case 'lint': return '运行 lint';
    case 'typecheck': return '运行 typecheck';
    default: return '';
  }
}

export async function previewProjectTask(task: ProjectTask) {
  const intent = mapKindToIntent(task.kind);
  if (!intent) {
    // Fallback for custom scripts or unknown kinds
    if (task.command) {
      vscode.window.showInformationMessage(`Fallback: 展示任务命令\n${task.command.cli} ${task.command.args.join(' ')}`);
      return { ok: true, intent: task.label, steps: [{ cli: task.command.cli, args: task.command.args }] };
    }
    return undefined;
  }

  return await previewIntent(intent);
}

export function registerPreviewProjectTaskCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('vectahubTasks.previewProjectTask', async (task: ProjectTask) => {
    await previewProjectTask(task);
  });
  context.subscriptions.push(disposable);
}