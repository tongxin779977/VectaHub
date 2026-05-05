import { describe, it, expect } from 'vitest';
import { createPrecedenceResolver, BUILTIN_PRECEDENCE_RULES } from './precedence-rules.js';
import type { IntentMatch } from '../types.js';

describe('PrecedenceResolver', () => {
  const resolver = createPrecedenceResolver();

  describe('builtin rules', () => {
    it('FILE_PERMISSION > CREATE_FILE', () => {
      const matches: IntentMatch[] = [
        { intent: 'FILE_PERMISSION', confidence: 0.8, params: {}, matchedKeywords: ['权限'] },
        { intent: 'CREATE_FILE', confidence: 0.9, params: {}, matchedKeywords: ['创建'] },
      ];
      const resolved = resolver.resolve(matches);
      expect(resolved.intent).toBe('FILE_PERMISSION');
    });

    it('FILE_ARCHIVE > CREATE_FILE', () => {
      const matches: IntentMatch[] = [
        { intent: 'FILE_ARCHIVE', confidence: 0.8, params: {}, matchedKeywords: ['打包'] },
        { intent: 'CREATE_FILE', confidence: 0.9, params: {}, matchedKeywords: ['创建'] },
      ];
      const resolved = resolver.resolve(matches);
      expect(resolved.intent).toBe('FILE_ARCHIVE');
    });

    it('FILE_FIND > QUERY_INFO', () => {
      const matches: IntentMatch[] = [
        { intent: 'FILE_FIND', confidence: 0.7, params: {}, matchedKeywords: ['查找'] },
        { intent: 'QUERY_INFO', confidence: 0.8, params: {}, matchedKeywords: ['查看'] },
      ];
      const resolved = resolver.resolve(matches);
      expect(resolved.intent).toBe('FILE_FIND');
    });

    it('SYSTEM_INFO > SYSTEM_MONITOR', () => {
      const matches: IntentMatch[] = [
        { intent: 'SYSTEM_INFO', confidence: 0.6, params: {}, matchedKeywords: ['系统'] },
        { intent: 'SYSTEM_MONITOR', confidence: 0.8, params: {}, matchedKeywords: ['监控'] },
      ];
      const resolved = resolver.resolve(matches);
      expect(resolved.intent).toBe('SYSTEM_INFO');
    });
  });

  describe('custom rules', () => {
    it('applies custom precedence rules', () => {
      const customResolver = createPrecedenceResolver([
        { when: ['A', 'B'], prefer: 'A', reason: 'test' },
      ]);
      const matches: IntentMatch[] = [
        { intent: 'B', confidence: 0.9, params: {}, matchedKeywords: [] },
        { intent: 'A', confidence: 0.5, params: {}, matchedKeywords: [] },
      ];
      const resolved = customResolver.resolve(matches);
      expect(resolved.intent).toBe('A');
    });
  });

  describe('fallback to confidence', () => {
    it('returns highest confidence when no rule applies', () => {
      const matches: IntentMatch[] = [
        { intent: 'INSTALL_PACKAGE', confidence: 0.6, params: {}, matchedKeywords: [] },
        { intent: 'FETCH_HOT_NEWS', confidence: 0.8, params: {}, matchedKeywords: [] },
      ];
      const resolved = resolver.resolve(matches);
      expect(resolved.intent).toBe('FETCH_HOT_NEWS');
    });

    it('returns single match directly', () => {
      const matches: IntentMatch[] = [
        { intent: 'FILE_FIND', confidence: 0.8, params: {}, matchedKeywords: ['查找'] },
      ];
      const resolved = resolver.resolve(matches);
      expect(resolved.intent).toBe('FILE_FIND');
    });
  });

  describe('builtin rules count', () => {
    it('has 6 builtin rules', () => {
      expect(BUILTIN_PRECEDENCE_RULES.length).toBe(6);
    });
  });
});
