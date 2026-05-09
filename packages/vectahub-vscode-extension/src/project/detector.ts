import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectTask } from './taskModel.js';
import { detectPackageManager } from './packageManager.js';
import { detectPackageTasks, PackageJson } from './packageScripts.js';

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
  
  const packageJsonPath = path.join(workspaceFolder, 'package.json');
  let pkg: PackageJson | undefined;
  if (fs.existsSync(packageJsonPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      // ignore
    }
  }

  const pm = detectPackageManager(workspaceFolder);

  if (fs.existsSync(path.join(workspaceFolder, '.git'))) {
    tasks.push({
      id: 'git-status',
      kind: 'git-status',
      label: 'Git 状态 (Status)',
      source: 'git',
      available: true,
      command: { cli: 'git', args: ['status'] }
    });
  }

  const pkgTasks = detectPackageTasks(workspaceFolder, pm, pkg);
  tasks.push(...pkgTasks);

  tasks.push({
    id: 'vh-doctor',
    kind: 'doctor',
    label: '环境检查 (Doctor)',
    source: 'vectahub',
    available: true,
    command: { cli: 'vectahub', args: ['doctor'] }
  });

  return tasks;
}
