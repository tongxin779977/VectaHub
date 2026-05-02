import { describe, it, expect, beforeEach } from 'vitest';
import { createNLParser, type NLParser } from './parser.js';

describe('NLParser', () => {
  let parser: NLParser;

  beforeEach(() => {
    parser = createNLParser();
  });

  describe('parse', () => {
    it('should match GIT_WORKFLOW intent', () => {
      const result = parser.parse('提交并推送代码');
      expect(result.intent).toBe('GIT_WORKFLOW');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should match FILE_FIND intent', () => {
      const result = parser.parse('找出所有大于 100M 的文件');
      expect(result.intent).toBe('FILE_FIND');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return UNKNOWN for unrecognized input', () => {
      const result = parser.parse('你好');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('addPattern', () => {
    it('should register new intent pattern', () => {
      parser.addPattern('CUSTOM_INTENT', ['custom', 'test'], 0.8);
      const result = parser.parse('这是一个 custom 测试');
      expect(result.intent).toBe('CUSTOM_INTENT');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});