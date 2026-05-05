import { describe, it, expect } from 'vitest';
import { adaptTemplateToPattern, adaptAllTemplates } from './adapter.js';
import type { IntentTemplate } from '../templates/index.js';

describe('Adapter', () => {
  const mockTemplate: IntentTemplate = {
    name: 'FILE_FIND',
    description: '查找文件',
    keywords: ['find', 'search', '查找'],
    weight: 0.85,
    cli: ['find', 'fd'],
    params: {
      path: { type: 'string', required: false, default: '.', description: '搜索路径' },
    },
    steps: [],
  };

  describe('adaptTemplateToPattern', () => {
    it('converts keywords to WeightedKeyword format', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.intent).toBe('FILE_FIND');
      expect(result.keywords).toHaveLength(3);
      expect(result.keywords[0].text).toBe('find');
      expect(result.keywords[0].tier).toBeDefined();
    });

    it('preserves weight from template', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.weight).toBe(0.85);
    });

    it('preserves cli from template', () => {
      const result = adaptTemplateToPattern(mockTemplate);
      expect(result.cli).toEqual(['find', 'fd']);
    });

    it('classifies short keywords as core', () => {
      const template: IntentTemplate = {
        ...mockTemplate,
        keywords: ['查找'],
      };
      const result = adaptTemplateToPattern(template);
      expect(result.keywords[0].tier).toBe('core');
    });

    it('classifies long keywords as generic', () => {
      const template: IntentTemplate = {
        ...mockTemplate,
        keywords: ['这是一个很长的关键词'],
      };
      const result = adaptTemplateToPattern(template);
      expect(result.keywords[0].tier).toBe('generic');
    });
  });

  describe('adaptAllTemplates', () => {
    it('converts all templates to enriched patterns', () => {
      const templates: Record<string, IntentTemplate> = {
        FILE_FIND: mockTemplate,
        GIT_WORKFLOW: {
          ...mockTemplate,
          name: 'GIT_WORKFLOW',
          keywords: ['git', 'commit', 'push'],
        },
      };
      const result = adaptAllTemplates(templates);
      expect(result).toHaveLength(2);
      expect(result[0].intent).toBe('FILE_FIND');
      expect(result[1].intent).toBe('GIT_WORKFLOW');
    });

    it('handles empty templates', () => {
      const result = adaptAllTemplates({});
      expect(result).toHaveLength(0);
    });
  });
});
