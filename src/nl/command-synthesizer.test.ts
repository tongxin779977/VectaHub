import { describe, it, expect, beforeEach } from 'vitest';
import { createCommandSynthesizer, createTaskFromIntent } from './command-synthesizer.js';

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
      const entities = { FILE_PATH: [], CLI_TOOL: ['git'], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [] };
      const task = createTaskFromIntent('GIT_WORKFLOW', entities, '提交代码');
      expect(task.type).toBe('GIT_OPERATION');
      expect(task.status).toBe('PENDING');
    });

    it('should create FILE_FIND task', () => {
      const entities = { FILE_PATH: [], CLI_TOOL: ['find'], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [] };
      const task = createTaskFromIntent('FILE_FIND', entities, '查找文件');
      expect(task.type).toBe('QUERY_EXEC');
    });
  });
});