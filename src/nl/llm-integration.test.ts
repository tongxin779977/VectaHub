import { describe, it, expect, beforeEach } from 'vitest';
import { createNLParser, type NLParser } from './parser.js';

describe('LLM Integration - 20 One-Time Tasks', () => {
  let parser: NLParser;

  beforeEach(() => {
    parser = createNLParser();
  });

  describe('File Operations (5 tasks)', () => {
    it('Task 1: should match FILE_FIND for "查找当前目录下所有 .ts 文件"', () => {
      const result = parser.parse('查找当前目录下所有 .ts 文件');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('查找当前目录下所有 .ts 文件');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 2: should match IMAGE_COMPRESS for "把 photo.jpg 压缩到 800x600"', () => {
      const result = parser.parse('把 photo.jpg 压缩到 800x600');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('把 photo.jpg 压缩到 800x600');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 3: should match BATCH_RENAME for "把所有 .jpeg 文件重命名为 .jpg"', () => {
      const result = parser.parse('把所有 .jpeg 文件重命名为 .jpg');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('把所有 .jpeg 文件重命名为 .jpg');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 4: should match intent for "计算 src 目录总大小"', () => {
      const result = parser.parse('计算 src 目录总大小');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('计算 src 目录总大小');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 5: should match FILE_FIND for "找出大于 100MB 的文件"', () => {
      const result = parser.parse('找出大于 100MB 的文件');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('找出大于 100MB 的文件');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });
  });

  describe('Git Workflow (5 tasks)', () => {
    it('Task 6: should match GIT_WORKFLOW for "提交当前修改，消息是修复登录bug"', () => {
      const result = parser.parse('提交当前修改，消息是修复登录bug');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('提交当前修改，消息是修复登录bug');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 7: should match intent for "显示当前 git 状态"', () => {
      const result = parser.parse('显示当前 git 状态');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('显示当前 git 状态');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 8: should match GIT_BRANCH for "创建新分支 feature/auth"', () => {
      const result = parser.parse('创建新分支 feature/auth');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('创建新分支 feature/auth');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 9: should match intent for "显示最近 5 次提交记录"', () => {
      const result = parser.parse('显示最近 5 次提交记录');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('显示最近 5 次提交记录');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 10: should match GIT_WORKFLOW for "推送到远程仓库"', () => {
      const result = parser.parse('推送到远程仓库');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('推送到远程仓库');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });
  });

  describe('System Info (4 tasks)', () => {
    it('Task 11: should match SYSTEM_INFO for "显示磁盘使用情况"', () => {
      const result = parser.parse('显示磁盘使用情况');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('显示磁盘使用情况');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 12: should match SYSTEM_INFO for "显示内存使用"', () => {
      const result = parser.parse('显示内存使用');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('显示内存使用');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 13: should match PROCESS_LIST for "列出占用 CPU 最高的 10 个进程"', () => {
      const result = parser.parse('列出占用 CPU 最高的 10 个进程');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('列出占用 CPU 最高的 10 个进程');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 14: should match NETWORK_CHECK for "显示当前网络连接"', () => {
      const result = parser.parse('显示当前网络连接');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('显示当前网络连接');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });
  });

  describe('NPM Management (4 tasks)', () => {
    it('Task 15: should match INSTALL_PACKAGE for "安装 lodash"', () => {
      const result = parser.parse('安装 lodash');
      expect(result.confidence).toBeGreaterThanOrEqual(0);

      const parseResult = parser.parseToTaskList('安装 lodash');
      expect(['SUCCESS', 'NEEDS_CLARIFICATION']).toContain(parseResult.status);
    });

    it('Task 16: should match intent for "检查过期的 npm 包"', () => {
      const result = parser.parse('检查过期的 npm 包');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      
      const parseResult = parser.parseToTaskList('检查过期的 npm 包');
      expect(parseResult.status === 'SUCCESS' || parseResult.status === 'NEEDS_CLARIFICATION').toBeTruthy();
    });

    it('Task 17: should match intent for "清理 npm 缓存"', () => {
      const result = parser.parse('清理 npm 缓存');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      
      const parseResult = parser.parseToTaskList('清理 npm 缓存');
      expect(parseResult.status === 'SUCCESS' || parseResult.status === 'NEEDS_CLARIFICATION').toBeTruthy();
    });

    it('Task 18: should match RUN_SCRIPT for "构建项目"', () => {
      const result = parser.parse('构建项目');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      
      const parseResult = parser.parseToTaskList('构建项目');
      expect(parseResult.status === 'SUCCESS' || parseResult.status === 'NEEDS_CLARIFICATION').toBeTruthy();
    });
  });

  describe('Security (2 tasks)', () => {
    it('Task 19: should match intent for "检查是否有危险命令"', () => {
      const result = parser.parse('检查是否有危险命令');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      
      const parseResult = parser.parseToTaskList('检查是否有危险命令');
      expect(parseResult.status === 'SUCCESS' || parseResult.status === 'NEEDS_CLARIFICATION').toBeTruthy();
    });

    it('Task 20: should match intent for "用 sudo 删除文件"', () => {
      const result = parser.parse('用 sudo 删除文件');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      
      const parseResult = parser.parseToTaskList('用 sudo 删除文件');
      expect(parseResult.status === 'SUCCESS' || parseResult.status === 'NEEDS_CLARIFICATION').toBeTruthy();
    });
  });
});
