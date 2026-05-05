import { describe, it, expect } from 'vitest';
import { createCoordinator } from './coordinator.js';
import type { IntentPattern } from '../types.js';

const PATTERNS: IntentPattern[] = [
  {
    intent: 'FILE_FIND',
    keywords: [
      { text: '查找', tier: 'core' },
      { text: '搜索', tier: 'core' },
      { text: '文件', tier: 'generic' },
    ],
    phrases: [
      { pattern: '查找.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [{ text: '创建', strength: 'soft' }],
    weight: 0.85,
    priority: 5,
  },
  {
    intent: 'GIT_WORKFLOW',
    keywords: [
      { text: '提交', tier: 'core' },
      { text: '推送', tier: 'core' },
      { text: 'git', tier: 'important' },
    ],
    weight: 1.0,
    priority: 3,
  },
  {
    intent: 'CREATE_FILE',
    keywords: [
      { text: '创建', tier: 'core' },
      { text: '新建', tier: 'core' },
      { text: '文件', tier: 'generic' },
    ],
    phrases: [
      { pattern: '创建.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [{ text: '查找', strength: 'soft' }],
    weight: 0.95,
    priority: 3,
  },
  {
    intent: 'FILE_ARCHIVE',
    keywords: [
      { text: '压缩', tier: 'core' },
      { text: '打包', tier: 'core' },
      { text: '目录', tier: 'generic' },
    ],
    phrases: [{ pattern: '打包目录', isRegex: false, weight: 1.0, bonus: 2.0 }],
    weight: 0.95,
    priority: 4,
  },
  {
    intent: 'FILE_PERMISSION',
    keywords: [
      { text: '权限', tier: 'core' },
      { text: 'chmod', tier: 'core' },
    ],
    phrases: [
      { pattern: '修改权限', isRegex: false, weight: 1.0, bonus: 1.5 },
    ],
    weight: 0.95,
    priority: 5,
  },
  {
    intent: 'INSTALL_PACKAGE',
    keywords: [
      { text: '安装', tier: 'core' },
      { text: '依赖', tier: 'important' },
    ],
    weight: 0.95,
  },
  {
    intent: 'RUN_SCRIPT',
    keywords: [
      { text: '构建', tier: 'core' },
      { text: 'build', tier: 'core' },
    ],
    weight: 0.95,
  },
  {
    intent: 'SYSTEM_INFO',
    keywords: [
      { text: '系统信息', tier: 'core' },
      { text: '磁盘', tier: 'important' },
    ],
    weight: 0.95,
  },
  {
    intent: 'SYSTEM_MONITOR',
    keywords: [
      { text: '监控', tier: 'core' },
      { text: '内存占用', tier: 'core' },
    ],
    negativeKeywords: [{ text: '查看', strength: 'soft' }],
    weight: 0.85,
  },
];

describe('Coordinator', () => {
  const coordinator = createCoordinator(PATTERNS);

  describe('single intent', () => {
    it('matches FILE_FIND for "查找文件"', () => {
      const result = coordinator.match('查找文件');
      expect(result.isMultiIntent).toBe(false);
      expect(result.intents).toHaveLength(1);
      expect(result.intents[0].intent).toBe('FILE_FIND');
    });

    it('matches CREATE_FILE for "创建文件"', () => {
      const result = coordinator.match('创建文件');
      expect(result.isMultiIntent).toBe(false);
      expect(result.intents[0].intent).toBe('CREATE_FILE');
    });

    it('matches FILE_ARCHIVE for "打包目录"', () => {
      const result = coordinator.match('打包目录');
      expect(result.intents[0].intent).toBe('FILE_ARCHIVE');
    });

    it('matches FILE_PERMISSION for "修改权限"', () => {
      const result = coordinator.match('修改权限');
      expect(result.intents[0].intent).toBe('FILE_PERMISSION');
    });
  });

  describe('multi intent', () => {
    it('splits "查找文件并提交" into two intents', () => {
      const result = coordinator.match('查找文件并提交');
      expect(result.isMultiIntent).toBe(true);
      expect(result.intents.length).toBeGreaterThanOrEqual(2);
      const intentNames = result.intents.map(i => i.intent);
      expect(intentNames).toContain('FILE_FIND');
      expect(intentNames).toContain('GIT_WORKFLOW');
    });

    it('splits "安装依赖然后构建" into two intents', () => {
      const result = coordinator.match('安装依赖然后构建');
      expect(result.isMultiIntent).toBe(true);
      const intentNames = result.intents.map(i => i.intent);
      expect(intentNames).toContain('INSTALL_PACKAGE');
      expect(intentNames).toContain('RUN_SCRIPT');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = coordinator.match('');
      expect(result.isMultiIntent).toBe(false);
      expect(result.intents[0].intent).toBe('UNKNOWN');
    });

    it('preserves rawInput', () => {
      const result = coordinator.match('查找文件');
      expect(result.rawInput).toBe('查找文件');
    });

    it('returns clauses for multi-intent', () => {
      const result = coordinator.match('查找文件并提交');
      expect(result.clauses).toBeDefined();
      expect(result.clauses!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
