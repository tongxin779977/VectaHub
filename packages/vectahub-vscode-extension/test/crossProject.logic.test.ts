import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { detectPackageManager } from '../src/project/packageManager.js';
import { detectPackageTasks } from '../src/project/packageScripts.js';

describe('Project Detection Logic', () => {
  const testRoot = path.resolve(__dirname, 'fixtures');

  it('should detect npm with package-lock.json', () => {
    const projectDir = path.join(testRoot, 'npm-project');
    fs.writeFileSync(path.join(projectDir, 'package-lock.json'), '{}');
    expect(detectPackageManager(projectDir)).toBe('npm');
  });

  it('should detect pnpm with pnpm-lock.yaml', () => {
    const projectDir = path.join(testRoot, 'pnpm-project');
    fs.writeFileSync(path.join(projectDir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(projectDir)).toBe('pnpm');
  });

  it('should detect tasks from package.json', () => {
    const projectDir = path.join(testRoot, 'npm-project');
    const tasks = detectPackageTasks(projectDir, 'npm');
    
    const taskKinds = tasks.map(t => t.kind);
    expect(taskKinds).toContain('test');
    expect(taskKinds).toContain('build');
    expect(taskKinds).toContain('install');
  });

  it('should fallback typecheck if tsc is in lint', () => {
    const projectDir = path.join(testRoot, 'pnpm-project');
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      scripts: { lint: 'eslint . && tsc --noEmit' }
    }));
    const tasks = detectPackageTasks(projectDir, 'pnpm');
    expect(tasks.some(t => t.kind === 'typecheck')).toBe(true);
  });
});