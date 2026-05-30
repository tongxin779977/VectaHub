import { describe, it, expect } from 'vitest';
import { createCategoryRouter } from './category-router.js';
import { IntentCategory } from '../types/category.js';
import { INTENT_TEMPLATES } from '../templates/index.js';

describe('category-router', () => {
  const router = createCategoryRouter();

  describe('getCategory', () => {
    it('should return category for known intent', () => {
      const template = INTENT_TEMPLATES[0];
      const category = router.getCategory(template.intent as any);
      expect(category).toBeDefined();
    });

    it('should return EXECUTE as default for unknown intent', () => {
      expect(router.getCategory('UNKNOWN_INTENT' as any)).toBe(IntentCategory.EXECUTE);
    });
  });

  describe('shouldUseLLM', () => {
    it('should return false for QUERY category intents', () => {
      const template = INTENT_TEMPLATES.find(t => t.category === 'file');
      if (template) {
        expect(router.shouldUseLLM(template.intent as any)).toBe(false);
      }
    });
  });

  describe('requiresWorkflow', () => {
    it('should return true for most categories', () => {
      const template = INTENT_TEMPLATES[0];
      expect(router.requiresWorkflow(template.intent as any)).toBe(true);
    });
  });

  describe('getCategoryDescription', () => {
    it('should return correct description for QUERY category', () => {
      expect(router.getCategoryDescription(IntentCategory.QUERY)).toContain('查询信息类');
    });

    it('should return correct description for EXECUTE category', () => {
      expect(router.getCategoryDescription(IntentCategory.EXECUTE)).toContain('执行操作类');
    });

    it('should return correct description for DIALOG category', () => {
      expect(router.getCategoryDescription(IntentCategory.DIALOG)).toContain('对话交互类');
    });

    it('should return correct description for GENERATE category', () => {
      expect(router.getCategoryDescription(IntentCategory.GENERATE)).toContain('生成内容类');
    });
  });

  describe('getAllCategories', () => {
    it('should return all intent categories', () => {
      const categories = router.getAllCategories();
      expect(categories).toContain(IntentCategory.QUERY);
      expect(categories).toContain(IntentCategory.EXECUTE);
      expect(categories).toContain(IntentCategory.DIALOG);
      expect(categories).toContain(IntentCategory.GENERATE);
      expect(categories.length).toBe(4);
    });
  });

  describe('getIntentsByCategory', () => {
    it('should return intents for QUERY category', () => {
      const queryIntents = router.getIntentsByCategory(IntentCategory.QUERY);
      expect(queryIntents.length).toBeGreaterThan(0);
    });

    it('should return intents for EXECUTE category', () => {
      const executeIntents = router.getIntentsByCategory(IntentCategory.EXECUTE);
      expect(executeIntents.length).toBeGreaterThan(0);
    });

    it('should return DIALOG_GREETING for DIALOG category', () => {
      const dialogIntents = router.getIntentsByCategory(IntentCategory.DIALOG);
      expect(dialogIntents).toContain('DIALOG_GREETING');
    });
  });

  describe('route', () => {
    const mockContext = { input: 'test' } as any;

    it('should route known intent correctly', () => {
      const template = INTENT_TEMPLATES[0];
      const result = router.route(template.intent as any, mockContext);
      expect(result.success).toBe(true);
      expect(result.intent).toBe(template.intent);
    });

    it('should return failure for unknown intent', () => {
      const result = router.route('UNKNOWN_INTENT' as any, mockContext);
      expect(result.success).toBe(false);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    it('should route DIALOG_GREETING as DIALOG category with no workflow', () => {
      const result = router.route('DIALOG_GREETING' as any, mockContext);
      expect(result.success).toBe(true);
      expect(result.intent).toBe('DIALOG_GREETING');
      expect(result.metadata?.path).toBe('dialog');
      expect(result.taskList).toBeUndefined();
      expect(result.workflowYAML).toBeUndefined();
    });

    it('should return DIALOG category for DIALOG_GREETING', () => {
      expect(router.getCategory('DIALOG_GREETING' as any)).toBe(IntentCategory.DIALOG);
    });

    it('should not require workflow for DIALOG_GREETING', () => {
      expect(router.requiresWorkflow('DIALOG_GREETING' as any)).toBe(false);
    });

    it('should not require LLM for DIALOG_GREETING', () => {
      expect(router.shouldUseLLM('DIALOG_GREETING' as any)).toBe(false);
    });
  });

  describe('all templates have category', () => {
    it('should have category defined for all intent templates', () => {
      const intentsWithoutCategory = INTENT_TEMPLATES
        .filter(template => !template.category)
        .map(template => template.intent);

      expect(intentsWithoutCategory).toEqual([]);
    });
  });
});
