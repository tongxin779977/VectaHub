import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectPackageTasks } from '../src/project/packageScripts.js';

vi.mock('fs');
vi.mock('path');

describe('packageScripts recognition', () => {
  it('should recognize various development and quality tasks', () => {
    const mockPackageJson = {
      scripts: {
        dev: 'next dev',
        start: 'next start',
        test: 'vitest',
        lint: 'eslint .',
        build: 'next build',
        'test:watch': 'vitest watch',
        coverage: 'vitest run --coverage',
        'format:check': 'prettier --check .',
        'custom-script': 'echo hello'
      }
    };

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockPackageJson));
    (path.join as any).mockImplementation((...args: string[]) => args.join('/'));

    const tasks = detectPackageTasks('/mock/workspace', 'npm');

    const kinds = tasks.map(t => t.kind);
    const labels = tasks.map(t => t.label);

    expect(kinds).toContain('dev');
    expect(kinds).toContain('start');
    expect(kinds).toContain('test');
    expect(kinds).toContain('lint');
    expect(kinds).toContain('build');
    expect(kinds).toContain('watch');
    expect(kinds).toContain('coverage');
    expect(kinds).toContain('format');
    expect(kinds).toContain('other');

    expect(labels).toContain('启动开发服务 (Dev)');
    expect(labels).toContain('运行测试 (Test)');
    expect(labels).toContain('custom-script');
  });

  it('should handle missing scripts gracefully', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({}));
    
    const tasks = detectPackageTasks('/mock/workspace', 'npm');
    // Only install task should be there
    expect(tasks.length).toBe(1);
    expect(tasks[0].kind).toBe('install');
  });

  it('should infer typecheck from lint script', () => {
    const mockPackageJson = {
      scripts: {
        lint: 'tsc --noEmit && eslint .'
      }
    };

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockPackageJson));

    const tasks = detectPackageTasks('/mock/workspace', 'npm');
    expect(tasks.map(t => t.kind)).toContain('typecheck');
    expect(tasks.find(t => t.kind === 'typecheck')?.label).toBe('类型检查 (Inferred)');
  });
});
