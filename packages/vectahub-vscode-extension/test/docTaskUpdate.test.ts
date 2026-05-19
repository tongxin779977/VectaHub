import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { updateMarkdownDocTaskStatus } from '../src/project/docTaskUpdate.js';

describe('updateMarkdownDocTaskStatus', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectahub-test-'));
    testFile = path.join(tempDir, 'test.md');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('应该能更新路线图表格中的任务状态', async () => {
    const content = `
# Roadmap

| ID | 功能 | 状态 | 备注 |
|---|---|---|---|
| TASK-1 | 登录 | 待补齐 | 需实现 |
| TASK-2 | 注册 | 已有 | |
`;
    fs.writeFileSync(testFile, content, 'utf-8');

    const result = await updateMarkdownDocTaskStatus(testFile, 'TASK-1');
    expect(result).toBe(true);

    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    expect(updatedContent).toContain('| TASK-1 | 登录 | 已有 | 需实现 |');
  });

  it('应该能更新带有 | 开头的表格', async () => {
    const content = `
| 状态 | ID | 功能 |
|:---:|:---:|---|
| 部分实现 | T1 | 搜索 |
`;
    fs.writeFileSync(testFile, content, 'utf-8');

    const result = await updateMarkdownDocTaskStatus(testFile, 'T1');
    expect(result).toBe(true);

    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    expect(updatedContent).toContain('| 已有 | T1 | 搜索 |');
  });

  it('应该能更新列表项形式的任务', async () => {
    const content = `
## 任务列表
- TASK-101. 实现文件上传
* TASK-102. 优化性能
103. 修复 Bug
`;
    fs.writeFileSync(testFile, content, 'utf-8');

    const result = await updateMarkdownDocTaskStatus(testFile, 'TASK-101');
    expect(result).toBe(true);

    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    expect(updatedContent).toContain('- TASK-101. ✅ 实现文件上传 (已完成)');
    
    const result2 = await updateMarkdownDocTaskStatus(testFile, '103');
    expect(result2).toBe(true);
    const updatedContent2 = fs.readFileSync(testFile, 'utf-8');
    expect(updatedContent2).toContain('103. ✅ 修复 Bug (已完成)');
  });

  it('如果 ID 不匹配则不更新', async () => {
    const content = `| ID | 状态 |\n|---|---|\n| T1 | 待补 |`;
    fs.writeFileSync(testFile, content, 'utf-8');

    const result = await updateMarkdownDocTaskStatus(testFile, 'T2');
    expect(result).toBe(false);

    const updatedContent = fs.readFileSync(testFile, 'utf-8');
    expect(updatedContent).toBe(content);
  });
});
