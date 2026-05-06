import { describe, it, expect } from 'vitest';
import { createCategoryRouter } from './category-router.js';
import { IntentCategory } from '../types/category.js';
import { INTENT_TEMPLATES } from '../templates/index.js';

describe('category-router', () => {
  const router = createCategoryRouter();

  describe('getCategory', () => {
    it('should return QUERY category for FILE_FIND', () => {
      expect(router.getCategory('FILE_FIND')).toBe(IntentCategory.QUERY);
    });

    it('should return EXECUTE category for RUN_SCRIPT', () => {
      expect(router.getCategory('RUN_SCRIPT')).toBe(IntentCategory.EXECUTE);
    });

    it('should return GENERATE category for DATA_SCRAPING', () => {
      expect(router.getCategory('DATA_SCRAPING')).toBe(IntentCategory.GENERATE);
    });

    it('should return EXECUTE as default for unknown intent', () => {
      expect(router.getCategory('UNKNOWN_INTENT' as any)).toBe(IntentCategory.EXECUTE);
    });
  });

  describe('shouldUseLLM', () => {
    it('should return true for GENERATE category intents', () => {
      expect(router.shouldUseLLM('DATA_SCRAPING')).toBe(true);
      expect(router.shouldUseLLM('CONTENT_SUMMARY')).toBe(true);
    });

    it('should return false for QUERY category intents', () => {
      expect(router.shouldUseLLM('FILE_FIND')).toBe(false);
      expect(router.shouldUseLLM('SYSTEM_INFO')).toBe(false);
      expect(router.shouldUseLLM('NETWORK_INFO')).toBe(false);
    });

    it('should return false for EXECUTE category intents', () => {
      expect(router.shouldUseLLM('RUN_SCRIPT')).toBe(false);
      expect(router.shouldUseLLM('GIT_WORKFLOW')).toBe(false);
      expect(router.shouldUseLLM('CREATE_FILE')).toBe(false);
    });

    it('should return false for unknown intent', () => {
      expect(router.shouldUseLLM('UNKNOWN_INTENT' as any)).toBe(false);
    });
  });

  describe('requiresWorkflow', () => {
    it('should return true for QUERY category', () => {
      expect(router.requiresWorkflow('FILE_FIND')).toBe(true);
    });

    it('should return true for EXECUTE category', () => {
      expect(router.requiresWorkflow('RUN_SCRIPT')).toBe(true);
    });

    it('should return true for GENERATE category', () => {
      expect(router.requiresWorkflow('DATA_SCRAPING')).toBe(true);
    });

    it('should return false for DIALOG category', () => {
      expect(router.requiresWorkflow('UNKNOWN_INTENT' as any)).toBe(true);
    });
  });

  describe('getCategoryDescription', () => {
    it('should return correct description for each category', () => {
      expect(router.getCategoryDescription(IntentCategory.QUERY)).toContain('查询信息类');
      expect(router.getCategoryDescription(IntentCategory.EXECUTE)).toContain('执行操作类');
      expect(router.getCategoryDescription(IntentCategory.DIALOG)).toContain('对话交互类');
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
    it('should return intents grouped by QUERY category', () => {
      const queryIntents = router.getIntentsByCategory(IntentCategory.QUERY);
      expect(queryIntents).toContain('FILE_FIND');
      expect(queryIntents).toContain('SYSTEM_INFO');
      expect(queryIntents).toContain('NETWORK_INFO');
    });

    it('should return intents grouped by EXECUTE category', () => {
      const executeIntents = router.getIntentsByCategory(IntentCategory.EXECUTE);
      expect(executeIntents).toContain('RUN_SCRIPT');
      expect(executeIntents).toContain('GIT_WORKFLOW');
      expect(executeIntents).toContain('CREATE_FILE');
    });

    it('should return intents grouped by GENERATE category', () => {
      const generateIntents = router.getIntentsByCategory(IntentCategory.GENERATE);
      expect(generateIntents).toContain('DATA_SCRAPING');
      expect(generateIntents).toContain('CONTENT_SUMMARY');
    });

    it('should return DIALOG_GREETING for DIALOG category', () => {
      const dialogIntents = router.getIntentsByCategory(IntentCategory.DIALOG);
      expect(dialogIntents).toEqual(['DIALOG_GREETING']);
    });
  });

  describe('route', () => {
    const mockContext = { input: 'test' } as any;

    it('should route QUERY intent correctly', () => {
      const result = router.route('FILE_FIND', mockContext);
      expect(result.success).toBe(true);
      expect(result.intent).toBe('FILE_FIND');
      expect(result.metadata.path).toBe('direct-query');
      expect(result.metadata.requiresLLM).toBe(false);
    });

    it('should route EXECUTE intent correctly', () => {
      const result = router.route('RUN_SCRIPT', mockContext);
      expect(result.success).toBe(true);
      expect(result.intent).toBe('RUN_SCRIPT');
      expect(result.metadata.path).toBe('coordinator');
      expect(result.metadata.requiresLLM).toBe(false);
    });

    it('should route GENERATE intent correctly', () => {
      const result = router.route('DATA_SCRAPING', mockContext);
      expect(result.success).toBe(true);
      expect(result.intent).toBe('DATA_SCRAPING');
      expect(result.metadata.path).toBe('skill-pipeline');
      expect(result.metadata.requiresLLM).toBe(true);
    });

    it('should return failure for unknown intent', () => {
      const result = router.route('UNKNOWN_INTENT' as any, mockContext);
      expect(result.success).toBe(false);
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('all templates have category', () => {
    it('should have category defined for all intent templates', () => {
      const intentsWithoutCategory = Object.entries(INTENT_TEMPLATES)
        .filter(([, template]) => !template.category)
        .map(([name]) => name);

      expect(intentsWithoutCategory).toEqual([]);
    });
  });
});
