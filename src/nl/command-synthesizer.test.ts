import { describe, it, expect, beforeEach } from 'vitest';
import { createCommandSynthesizer, createTaskFromIntent } from './command-synthesizer.js';

const EMPTY_ENTITIES = {
  FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [],
  BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [],
  OWNER: [], MODE: [], FILE1: [], FILE2: [],
};

describe('CommandSynthesizer', () => {
  let synthesizer: ReturnType<typeof createCommandSynthesizer>;

  beforeEach(() => {
    synthesizer = createCommandSynthesizer();
  });

  describe('synthesize', () => {
    it('should synthesize GIT_OPERATION commands', () => {
      const result = synthesizer.synthesize('GIT_OPERATION', { message: 'test commit' });
      expect(result.cli).toBe('git');
      expect(result.args).toContain('commit');
      expect(result.args).toContain('test commit');
    });

    it('should synthesize PACKAGE_INSTALL commands with npm', () => {
      const result = synthesizer.synthesize('PACKAGE_INSTALL', { package: 'lodash' }, 'npm');
      expect(result.cli).toBe('npm');
      expect(result.args).toContain('install');
      expect(result.args).toContain('lodash');
    });

    it('should synthesize BUILD_VERIFY commands', () => {
      const result = synthesizer.synthesize('BUILD_VERIFY', {}, 'npm');
      expect(result.cli).toBe('npm');
      expect(result.args).toContain('run');
      expect(result.args).toContain('build');
    });

    it('should return empty for unknown task type', () => {
      const result = synthesizer.synthesize('UNKNOWN_TYPE' as any, {});
      expect(result.cli).toBe('');
      expect(result.args).toEqual([]);
    });
  });

  describe('createTaskFromIntent', () => {
    it('should create GIT_WORKFLOW task', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['git'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, '提交代码');
      expect(task.type).toBe('GIT_OPERATION');
      expect(task.status).toBe('PENDING');
    });

    it('should create FILE_FIND task', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['find'] };
      const task = createTaskFromIntent('FILE_FIND', entities, '查找文件');
      expect(task.type).toBe('QUERY_EXEC');
    });

    it('should generate pull command when OPTIONS contains "pull"', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['git'], OPTIONS: ['pull'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, 'pull代码');
      expect(task.commands.length).toBe(1);
      expect(task.commands[0].args).toEqual(['pull']);
    });

    it('should generate push command when OPTIONS contains "push" only', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['git'], BRANCH_NAME: ['main'], OPTIONS: ['push'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, 'push到main分支');
      expect(task.commands.length).toBe(1);
      expect(task.commands[0].args).toEqual(['push', 'origin', 'main']);
    });

    it('should generate clone command when OPTIONS contains "clone"', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['git'], OPTIONS: ['clone'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, 'clone仓库');
      expect(task.commands.length).toBe(1);
      expect(task.commands[0].args[0]).toEqual('clone');
    });

    it('should generate commit command when OPTIONS contains "commit" only', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['git'], OPTIONS: ['commit', 'fix bug'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, 'commit修复');
      expect(task.commands.length).toBe(1);
      expect(task.commands[0].args).toEqual(['commit', '-m', '修复']);
    });

    it('should generate default add/commit workflow when no specific options', () => {
      const entities = { ...EMPTY_ENTITIES, CLI_TOOL: ['git'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, '提交代码');
      expect(task.commands.length).toBe(2);
      expect(task.commands[0].args).toEqual(['add', '-A']);
      expect(task.commands[1].args[0]).toEqual('commit');
    });

    it('should create FILE_ARCHIVE task with zip', () => {
      const task = createTaskFromIntent('FILE_ARCHIVE', EMPTY_ENTITIES, '压缩文件');
      expect(task.commands[0].cli).toBe('tar');
      expect(task.commands[0].args).toContain('-czf');
    });

    it('should create FILE_ARCHIVE task with unzip', () => {
      const task = createTaskFromIntent('FILE_ARCHIVE', EMPTY_ENTITIES, '解压文件');
      expect(task.commands[0].cli).toBe('tar');
      expect(task.commands[0].args).toContain('-xzf');
    });

    it('should create NETWORK_INFO task with ping', () => {
      const entities = { ...EMPTY_ENTITIES, HOST: ['example.com'] };
      const task = createTaskFromIntent('NETWORK_INFO', entities, 'ping example.com');
      expect(task.commands[0].cli).toBe('ping');
    });

    it('should create NETWORK_INFO task with dns', () => {
      const entities = { ...EMPTY_ENTITIES, HOST: ['example.com'] };
      const task = createTaskFromIntent('NETWORK_INFO', entities, 'dns解析 example.com');
      expect(task.commands[0].cli).toBe('nslookup');
    });

    it('should create SYSTEM_MONITOR task for cpu', () => {
      const task = createTaskFromIntent('SYSTEM_MONITOR', EMPTY_ENTITIES, '查看cpu使用率');
      expect(task.commands[0].cli).toBe('top');
    });

    it('should create SYSTEM_MONITOR task default', () => {
      const task = createTaskFromIntent('SYSTEM_MONITOR', EMPTY_ENTITIES, '系统监控');
      expect(task.commands[0].cli).toBe('df');
    });

    it('should create FILE_PERMISSION task with check', () => {
      const task = createTaskFromIntent('FILE_PERMISSION', EMPTY_ENTITIES, '查看文件权限');
      expect(task.commands[0].cli).toBe('ls');
      expect(task.commands[0].args).toContain('-la');
    });

    it('should create FILE_DIFF task', () => {
      const entities = { ...EMPTY_ENTITIES, FILE1: ['a.txt'], FILE2: ['b.txt'] };
      const task = createTaskFromIntent('FILE_DIFF', entities, '比较文件');
      expect(task.commands[0].cli).toBe('diff');
      expect(task.commands[0].args).toContain('-u');
    });

    it('should create SYSTEM_INFO task for disk', () => {
      const task = createTaskFromIntent('SYSTEM_INFO', EMPTY_ENTITIES, '查看磁盘使用');
      expect(task.commands[0].cli).toBe('df');
    });

    it('should create SYSTEM_INFO task for memory', () => {
      const task = createTaskFromIntent('SYSTEM_INFO', EMPTY_ENTITIES, '查看内存');
      expect(task.commands[0].cli).toBe('top');
    });

    it('should create RUN_SCRIPT task for build', () => {
      const task = createTaskFromIntent('RUN_SCRIPT', EMPTY_ENTITIES, '运行构建');
      expect(task.commands[0].cli).toBe('npm');
      expect(task.commands[0].args).toContain('build');
    });

    it('should create default task for unknown intent', () => {
      const task = createTaskFromIntent('UNKNOWN', EMPTY_ENTITIES, '随便做点什么');
      expect(task.commands.length).toBeGreaterThan(0);
    });

    it('should generate commit with extracted message from input', () => {
      const entities = { ...EMPTY_ENTITIES, OPTIONS: ['commit'] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, 'commit修复登录bug');
      expect(task.commands[0].args).toContain('-m');
      expect(task.commands[0].args).toContain('修复登录bug');
    });
  });
});