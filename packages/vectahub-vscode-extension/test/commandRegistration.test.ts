import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface ExtensionPackageJson {
  contributes?: {
    commands?: Array<{
      command: string;
    }>;
  };
}

function collectTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectRegisteredCommands(sourceRoot: string): Set<string> {
  const registered = new Set<string>();
  for (const filePath of collectTypeScriptFiles(sourceRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const match of content.matchAll(/registerCommand\(['"`]([^'"`]+)['"`]/g)) {
      registered.add(match[1]);
    }
  }
  return registered;
}

describe('VS Code command registration', () => {
  const extensionRoot = path.resolve(import.meta.dirname, '..');
  const packageJsonPath = path.join(extensionRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as ExtensionPackageJson;
  const contributedCommands = packageJson.contributes?.commands?.map(item => item.command) ?? [];
  const registeredCommands = collectRegisteredCommands(path.join(extensionRoot, 'src'));

  it('registers every contributed command in source', () => {
    const missing = contributedCommands.filter(command => !registeredCommands.has(command));
    expect(missing).toEqual([]);
  });

  it('keeps core task commands registered', () => {
    expect(registeredCommands.has('vectahubTasks.refreshProjectTasks')).toBe(true);
    expect(registeredCommands.has('vectahubTasks.runDocTask')).toBe(true);
    expect(registeredCommands.has('vectahubTasks.runAllDocTasks')).toBe(true);
    expect(registeredCommands.has('vectahubTasks.selectAgentCli')).toBe(true);
  });
});
