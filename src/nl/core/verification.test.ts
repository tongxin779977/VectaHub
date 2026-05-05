import { describe, it, expect } from 'vitest';
import { createCoordinator } from './coordinator.js';
import { adaptAllTemplates } from './adapter.js';
import { INTENT_TEMPLATES } from '../templates/index.js';
import type { IntentPattern } from '../types.js';

const BASE_PATTERNS = adaptAllTemplates(INTENT_TEMPLATES);

const ENRICHED_PATTERNS: IntentPattern[] = BASE_PATTERNS.map(p => {
  const template = Object.values(INTENT_TEMPLATES).find(t => t.name === p.intent);
  if (template?.weightedKeywords) p.keywords = template.weightedKeywords;
  if (template?.phrases) p.phrases = template.phrases;
  if (template?.negativeKeywords) p.negativeKeywords = template.negativeKeywords;
  if (template?.priority) p.priority = template.priority;
  return p;
});

const coordinator = createCoordinator(ENRICHED_PATTERNS);

describe('Architecture Verification: 19 Failure Cases', () => {
  describe('FILE_FIND (8 failures expected → 8/8)', () => {
    const FILE_FIND_CASES = [
      { input: '查找ts文件', expected: 'FILE_FIND', desc: 'regex phrase "查找.*文件"' },
      { input: '搜索文件', expected: 'FILE_FIND', desc: 'core keyword "搜索"' },
      { input: 'find files', expected: 'FILE_FIND', desc: 'english keyword "find"' },
      { input: '查找最近修改的文件', expected: 'FILE_FIND', desc: 'regex phrase "搜索.*修改"' },
      { input: '查找src目录下的文件', expected: 'FILE_FIND', desc: 'phrase "目录下查找"' },
      { input: '搜索所有ts文件', expected: 'FILE_FIND', desc: 'combined core + generic' },
      { input: '查找package.json', expected: 'FILE_FIND', desc: 'specific file name' },
      { input: 'find ts files', expected: 'FILE_FIND', desc: 'english with generic' },
    ];

    FILE_FIND_CASES.forEach(({ input, expected, desc }) => {
      it(`FILE_FIND: "${input}" → ${expected} (${desc})`, () => {
        const result = coordinator.match(input);
        expect(result.intents[0].intent).toBe(expected);
      });
    });
  });

  describe('SYSTEM_INFO vs SYSTEM_MONITOR (3 failures expected)', () => {
    it('"查看系统信息" → SYSTEM_INFO not SYSTEM_MONITOR', () => {
      const result = coordinator.match('查看系统信息');
      expect(result.intents[0].intent).toBe('SYSTEM_INFO');
    });

    it('"系统信息" → SYSTEM_INFO', () => {
      const result = coordinator.match('系统信息');
      expect(result.intents[0].intent).toBe('SYSTEM_INFO');
    });

    it('"查看磁盘使用" → SYSTEM_INFO', () => {
      const result = coordinator.match('查看磁盘使用');
      expect(result.intents[0].intent).toBe('SYSTEM_INFO');
    });
  });

  describe('FILE_ARCHIVE (1 failure expected)', () => {
    it('"打包目录" → FILE_ARCHIVE not CREATE_FILE', () => {
      const result = coordinator.match('打包目录');
      expect(result.intents[0].intent).toBe('FILE_ARCHIVE');
    });
  });

  describe('FILE_PERMISSION (1 failure expected)', () => {
    it('"修改文件权限" → FILE_PERMISSION not CREATE_FILE', () => {
      const result = coordinator.match('修改文件权限');
      expect(result.intents[0].intent).toBe('FILE_PERMISSION');
    });
  });
});

describe('Architecture Verification: 6 Multi-Intent Cases', () => {
  const MULTI_INTENT_CASES = [
    { input: '查找文件并提交', intents: ['FILE_FIND', 'GIT_WORKFLOW'] },
    { input: '安装依赖然后构建', intents: ['INSTALL_PACKAGE', 'RUN_SCRIPT'] },
    { input: '创建文件并修改权限', intents: ['CREATE_FILE', 'FILE_PERMISSION'] },
  ];

  MULTI_INTENT_CASES.forEach(({ input, intents }) => {
    it(`multi-intent: "${input}" → [${intents.join(', ')}]`, () => {
      const result = coordinator.match(input);
      expect(result.isMultiIntent).toBe(true);
      expect(result.intents.length).toBeGreaterThanOrEqual(2);
      const intentNames = result.intents.map(i => i.intent);
      for (const expected of intents) {
        expect(intentNames).toContain(expected);
      }
    });
  });

  it('splits "查找文件然后帮我提交"', () => {
    const result = coordinator.match('查找文件然后帮我提交');
    expect(result.isMultiIntent).toBe(true);
    const intentNames = result.intents.map(i => i.intent);
    expect(intentNames).toContain('FILE_FIND');
    expect(intentNames).toContain('GIT_WORKFLOW');
  });

  it('splits "压缩目录并且提交"', () => {
    const result = coordinator.match('压缩目录并且提交');
    expect(result.isMultiIntent).toBe(true);
    const intentNames = result.intents.map(i => i.intent);
    expect(intentNames).toContain('FILE_ARCHIVE');
    expect(intentNames).toContain('GIT_WORKFLOW');
  });

  it('splits "find files and commit"', () => {
    const result = coordinator.match('find files and commit');
    expect(result.isMultiIntent).toBe(true);
    const intentNames = result.intents.map(i => i.intent);
    expect(intentNames).toContain('FILE_FIND');
    expect(intentNames).toContain('GIT_WORKFLOW');
  });
});

describe('Architecture Verification: Intent Precedence', () => {
  it('FILE_PERMISSION > CREATE_FILE when both match', () => {
    const result = coordinator.match('修改权限');
    expect(result.intents[0].intent).toBe('FILE_PERMISSION');
  });

  it('FILE_ARCHIVE > CREATE_FILE when both match', () => {
    const result = coordinator.match('压缩目录');
    expect(result.intents[0].intent).toBe('FILE_ARCHIVE');
  });

  it('FILE_FIND > QUERY_INFO for search-like input', () => {
    const result = coordinator.match('查找文件');
    expect(result.intents[0].intent).toBe('FILE_FIND');
  });
});

describe('Architecture Verification: DOCKER_BUILD (newly added)', () => {
  const DOCKER_CASES = [
    { input: 'docker build', expected: 'DOCKER_BUILD', desc: 'english exact match' },
    { input: '构建镜像', expected: 'DOCKER_BUILD', desc: 'chinese core keyword' },
    { input: 'docker构建镜像', expected: 'DOCKER_BUILD', desc: 'mixed lang' },
    { input: 'build docker image', expected: 'DOCKER_BUILD', desc: 'english phrase' },
  ];

  DOCKER_CASES.forEach(({ input, expected, desc }) => {
    it(`DOCKER_BUILD: "${input}" → ${expected} (${desc})`, () => {
      const result = coordinator.match(input);
      expect(result.intents[0].intent).toBe(expected);
    });
  });
});

describe('Architecture Verification: Backward Compatibility', () => {
  it('single-intent inputs still work correctly', () => {
    const cases = [
      { input: '提交代码', expected: 'GIT_WORKFLOW' },
      { input: '提交代码到git', expected: 'GIT_WORKFLOW' },
      { input: '创建目录', expected: 'CREATE_FILE' },
      { input: 'npm install', expected: 'INSTALL_PACKAGE' },
      { input: '查看文件差异', expected: 'FILE_DIFF' },
      { input: '解压zip文件', expected: 'FILE_ARCHIVE' },
    ];
    for (const { input, expected } of cases) {
      const result = coordinator.match(input);
      expect(result.intents[0].intent).toBe(expected);
    }
  });
});
