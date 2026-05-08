import * as fs from 'fs';
import * as path from 'path';
import { ProjectTask } from './taskModel.js';
import { PackageManagerType, getRunCommand } from './packageManager.js';

export interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
}

export function detectPackageTasks(workspaceFolder: string, pm: PackageManagerType): ProjectTask[] {
  const packageJsonPath = path.join(workspaceFolder, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as PackageJson;
    const scripts = pkg.scripts || {};
    const tasks: ProjectTask[] = [];

    // Install task
    tasks.push({
      id: 'pkg-install',
      kind: 'install',
      label: 'Install Dependencies',
      source: 'package-json',
      available: true,
      command: { cli: pm, args: ['install'] }
    });

    // Mapping common scripts
    const mappings: Array<{ key: string; kind: ProjectTask['kind']; label: string }> = [
      { key: 'test', kind: 'test', label: 'Run Tests' },
      { key: 'build', kind: 'build', label: 'Build Project' },
      { key: 'lint', kind: 'lint', label: 'Lint Project' },
      { key: 'typecheck', kind: 'typecheck', label: 'Typecheck' },
    ];

    for (const mapping of mappings) {
      const scriptContent = scripts[mapping.key];
      if (scriptContent) {
        tasks.push({
          id: `pkg-${mapping.key}`,
          kind: mapping.kind,
          label: mapping.label,
          description: scriptContent,
          source: 'package-json',
          available: true,
          command: getRunCommand(pm, mapping.key)
        });
      } else if (mapping.key === 'typecheck') {
        // Fallback for typecheck in lint
        const lintScript = scripts['lint'] || '';
        if (lintScript.includes('tsc')) {
          tasks.push({
            id: 'pkg-typecheck-fallback',
            kind: 'typecheck',
            label: 'Typecheck',
            description: 'Inferred from lint script',
            source: 'package-json',
            available: true,
            command: getRunCommand(pm, 'lint')
          });
        }
      }
    }

    return tasks;
  } catch (e) {
    return [];
  }
}

export function getAllPackageScripts(workspaceFolder: string, pm: PackageManagerType): ProjectTask[] {
  const packageJsonPath = path.join(workspaceFolder, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
    const scripts = pkg.scripts || {};
    return Object.keys(scripts).map(name => ({
      id: `script-${name}`,
      kind: 'list-scripts' as const,
      label: name,
      description: scripts[name],
      source: 'package-json' as const,
      available: true,
      command: getRunCommand(pm, name)
    }));
  } catch {
    return [];
  }
}
