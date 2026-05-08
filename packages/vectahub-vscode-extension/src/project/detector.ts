import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectTask } from './taskModel.js';
import { detectPackageManager } from './packageManager.js';
import { detectPackageTasks } from './packageScripts.js';

export async function detectProjectTasks(): Promise<ProjectTask[]> {
  const activeEditor = vscode.window.activeTextEditor;
  let workspaceFolder: string | undefined;

  if (activeEditor) {
    workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
  }

  if (!workspaceFolder) {
    workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  if (!workspaceFolder) {
    return [];
  }

  const tasks: ProjectTask[] = [];
  const pm = detectPackageManager(workspaceFolder);

  // 1. Git Detection
  if (fs.existsSync(path.join(workspaceFolder, '.git'))) {
    tasks.push({
      id: 'git-status',
      kind: 'git-status',
      label: 'Git Status',
      source: 'git',
      available: true,
      command: { cli: 'git', args: ['status'] }
    });
  }

  // 2. Package Detection
  const pkgTasks = detectPackageTasks(workspaceFolder, pm);
  tasks.push(...pkgTasks);

  // 3. VectaHub Base Tasks
  tasks.push({
    id: 'vh-doctor',
    kind: 'doctor',
    label: 'Doctor',
    source: 'vectahub',
    available: true,
    command: { cli: 'vectahub', args: ['doctor'] }
  });

  return tasks;
}