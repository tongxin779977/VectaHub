import { describe, it, expect } from 'vitest';
import { normalizeInput, buildNLRequestEnvelope } from './input-normalizer.js';

describe('normalizeInput', () => {
  describe('同义词归一化', () => {
    it('修复 git 上所有 actions 错误', () => {
      const result = normalizeInput('修复 git 上所有 actions 错误');
      expect(result.normalizedTerms).toContain('修复');
      expect(result.normalizedTerms).toContain('git');
      expect(result.normalizedTerms).toContain('actions');
      expect(result.normalizedTerms).toContain('错误');
      expect(result.normalizedTerms).toContain('上所有');
    });

    it('修复登录 bug 不应包含 ci', () => {
      const result = normalizeInput('修复登录 bug');
      expect(result.normalizedTerms).toContain('修复登录');
      expect(result.normalizedTerms).not.toContain('ci');
    });

    it('把 CI 全部修绿', () => {
      const result = normalizeInput('把 CI 全部修绿');
      expect(result.normalizedTerms).toContain('全部修绿');
      expect(result.normalizedTerms).toContain('ci');
    });

    it('处理 GitHub 上失败的 workflow', () => {
      const result = normalizeInput('处理 GitHub 上失败的 workflow');
      expect(result.normalizedTerms).toContain('处理');
      expect(result.normalizedTerms).toContain('上失败的');
      expect(result.normalizedTerms).toContain('workflow');
    });

    it('提交代码', () => {
      const result = normalizeInput('提交代码');
      expect(result.normalizedTerms).toContain('提交代码');
      expect(result.normalizedTerms).not.toContain('ci');
    });
  });

  describe('实体提取', () => {
    it('提取 GitHub Actions run URL', () => {
      const result = normalizeInput('分析 https://github.com/a/b/actions/runs/1234567890');
      expect(result.entities.githubActionUrls).toContain('https://github.com/a/b/actions/runs/1234567890');
      expect(result.entities.githubActionRunIds).toContain('1234567890');
    });

    it('提取带上下文的 run id', () => {
      const result = normalizeInput('查看 actions 1234567890 的日志');
      expect(result.entities.githubActionRunIds).toContain('1234567890');
    });

    it('不提取无上下文的普通数字', () => {
      const result = normalizeInput('修复登录 bug 3 次');
      expect(result.entities.githubActionRunIds).toBeUndefined();
    });

    it('提取 commit SHA', () => {
      const result = normalizeInput('回滚到 abc1234def56789012345678901234567890abcd');
      expect(result.entities.commitShas).toContain('abc1234def56789012345678901234567890abcd');
    });
  });

  describe('tokens 和 cleanText', () => {
    it('保留原始文本', () => {
      const result = normalizeInput('  hello  world  ');
      expect(result.rawText).toBe('  hello  world  ');
    });

    it('清洗后文本', () => {
      const result = normalizeInput('  hello  world  ');
      expect(result.cleanText).toBe('hello world');
    });

    it('tokens 去除标点', () => {
      const result = normalizeInput('hello, world!');
      expect(result.tokens).toContain('hello');
      expect(result.tokens).toContain('world');
    });
  });
});

describe('buildNLRequestEnvelope', () => {
  it('builds a valid envelope with required fields', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    expect(envelope.schemaVersion).toBe('1.0');
    expect(envelope.requestId).toBeDefined();
    expect(envelope.source).toBe('run');
    expect(envelope.mode).toBe('dry-run');
    expect(envelope.dryRun).toBe(true);
    expect(envelope.json).toBe(true);
    expect(envelope.cwd).toBe('/test/path');
    expect(envelope.userInput).toBe('test input');
    expect(envelope.normalizedInput).toBeDefined();
    expect(envelope.metadata.createdAt).toBeDefined();
  });

  it('includes optional fields when provided', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'document',
      mode: 'execute',
      dryRun: false,
      json: false,
      cwd: '/test/path',
      userInput: 'test input',
      language: 'zh',
      sessionId: 'session-123',
      contextId: 'context-456',
    });

    expect(envelope.language).toBe('zh');
    expect(envelope.sessionId).toBe('session-123');
    expect(envelope.contextId).toBe('context-456');
  });

  it('handles empty input without guessing', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: '',
    });

    expect(envelope.userInput).toBe('');
    expect(envelope.normalizedInput).toBeDefined();
    expect(envelope.normalizedInput!.cleanText).toBe('');
    expect(envelope.normalizedInput!.tokens).toEqual([]);
    expect(envelope.cwd).toBe('/test/path');
  });

  it('handles file input source', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'document',
      mode: 'execute',
      dryRun: false,
      json: false,
      cwd: '/workspace',
      userInput: 'read config.yaml',
    });

    expect(envelope.source).toBe('document');
    expect(envelope.cwd).toBe('/workspace');
    expect(envelope.normalizedInput).toBeDefined();
    expect(envelope.normalizedInput!.cleanText).toBe('read config.yaml');
  });

  it('cwd comes from environment not from userInput', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'execute',
      dryRun: false,
      json: false,
      cwd: '/actual/cwd',
      userInput: 'run in /some/other/path',
    });

    expect(envelope.cwd).toBe('/actual/cwd');
    expect(envelope.userInput).toBe('run in /some/other/path');
  });
});
