import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('doc task contract runtime path', () => {
  it('编译产物引用包名且本地运行时模块存在', () => {
    const root = path.resolve(__dirname, '..');
    const contractOut = fs.readFileSync(path.join(root, 'out', 'project', 'docTaskContract.js'), 'utf8');
    const runStoreOut = fs.readFileSync(path.join(root, 'out', 'project', 'docTaskRunStore.js'), 'utf8');
    expect(contractOut).toContain('@vectahub/doc-task-contract-core');
    expect(runStoreOut).toContain('@vectahub/doc-task-contract-core');
    expect(contractOut).not.toContain('../../../doc-task-contract-core/src');
    expect(runStoreOut).not.toContain('../../../doc-task-contract-core/src');

    const runtimePkg = path.join(
      root,
      'out',
      'node_modules',
      '@vectahub',
      'doc-task-contract-core',
      'package.json',
    );
    expect(fs.existsSync(runtimePkg)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(runtimePkg, 'utf8')) as { main?: string };
    expect(pkg.main).toBe('index.js');
    expect(
      fs.existsSync(path.join(root, 'out', 'node_modules', '@vectahub', 'doc-task-contract-core', 'index.js')),
    ).toBe(true);
  });
});
