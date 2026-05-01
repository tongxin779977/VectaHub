import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRuleEngine, createCommandRuleEngine } from './engine.js';
import type { RuleEngineConfig } from './types.js';

describe('CommandRuleEngine', () => {
  let engine: CommandRuleEngine;

  const baseConfig: RuleEngineConfig = {
    globalBlocklist: [
      { id: 'bl-001', pattern: 'sudo *', action: 'block', reason: '禁止 sudo 提权' },
      { id: 'bl-002', pattern: 'rm -rf /', action: 'block', reason: '禁止删除根目录' },
      { id: 'bl-003', pattern: 'chmod 777 *', action: 'block', reason: '禁止全开权限' },
    ],
    globalAllowlist: [
      { id: 'wl-001', pattern: 'git status', action: 'allow', description: '查看状态' },
      { id: 'wl-002', pattern: 'git log *', action: 'allow', description: '查看日志' },
      { id: 'wl-003', pattern: 'npm install *', action: 'allow', description: '安装依赖' },
    ],
  };

  beforeEach(() => {
    engine = createCommandRuleEngine(baseConfig);
  });

  describe('evaluate', () => {
    it('should block commands matching global blocklist', () => {
      const result = engine.evaluate('sudo rm -rf /');
      expect(result.decision).toBe('block');
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('bl-001');
      expect(result.scope).toBe('global');
    });

    it('should block commands matching project blocklist', () => {
      const engineWithProject = createCommandRuleEngine({
        ...baseConfig,
        projectBlocklist: [
          { id: 'proj-bl-001', pattern: 'git push --force *', action: 'block', reason: '禁止强制推送' },
        ],
      });

      const result = engineWithProject.evaluate('git push --force origin main');
      expect(result.decision).toBe('block');
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('proj-bl-001');
      expect(result.scope).toBe('project');
    });

    it('should allow commands matching global allowlist', () => {
      const result = engine.evaluate('git status');
      expect(result.decision).toBe('allow');
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('wl-001');
      expect(result.scope).toBe('global');
    });

    it('should allow commands matching project allowlist', () => {
      const engineWithProject = createCommandRuleEngine({
        ...baseConfig,
        projectAllowlist: [
          { id: 'proj-wl-001', pattern: 'docker-compose *', action: 'allow', description: '允许 docker-compose' },
        ],
      });

      const result = engineWithProject.evaluate('docker-compose up -d');
      expect(result.decision).toBe('allow');
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('proj-wl-001');
      expect(result.scope).toBe('project');
    });

    it('should prioritize blocklist over allowlist', () => {
      const engineWithConflict = createCommandRuleEngine({
        globalBlocklist: [
          { id: 'bl-001', pattern: 'git push *', action: 'block', reason: '禁止推送' },
        ],
        globalAllowlist: [
          { id: 'wl-001', pattern: 'git push *', action: 'allow', description: '允许推送' },
        ],
      });

      const result = engineWithConflict.evaluate('git push origin main');
      expect(result.decision).toBe('block');
    });

    it('should pass through commands not matching any list', () => {
      const result = engine.evaluate('echo hello');
      expect(result.decision).toBe('passthrough');
      expect(result.matched).toBe(false);
    });

    it('should handle wildcard patterns', () => {
      const result = engine.evaluate('sudo apt update');
      expect(result.decision).toBe('block');
      expect(result.rule?.id).toBe('bl-001');
    });

    it('should handle git log with arguments', () => {
      const result = engine.evaluate('git log --oneline -10');
      expect(result.decision).toBe('allow');
      expect(result.rule?.id).toBe('wl-002');
    });
  });

  describe('getters', () => {
    it('should return copies of rule lists', () => {
      const blocklist = engine.getGlobalBlocklist();
      expect(blocklist).toEqual(baseConfig.globalBlocklist);
      expect(blocklist).not.toBe(baseConfig.globalBlocklist);
    });

    it('should return project rule lists when empty', () => {
      const projectBlocklist = engine.getProjectBlocklist();
      expect(projectBlocklist).toEqual([]);
    });

    it('should return project rule lists when set', () => {
      const engineWithProject = createCommandRuleEngine({
        ...baseConfig,
        projectBlocklist: [
          { id: 'proj-bl-001', pattern: 'test *', action: 'block', reason: 'test' },
        ],
      });

      const projectBlocklist = engineWithProject.getProjectBlocklist();
      expect(projectBlocklist).toHaveLength(1);
      expect(projectBlocklist[0].id).toBe('proj-bl-001');
    });
  });
});