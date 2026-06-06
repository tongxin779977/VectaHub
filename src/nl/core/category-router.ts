import type { NLContext, NLResult } from './types.js';
import type { IntentName, TaskList } from '../../types/index.js';
import { IntentCategory } from '../types/category.js';
import { INTENT_TEMPLATES } from '../templates/index.js';
import { createTaskFromIntent } from '../command-synthesizer.js';

export interface CategoryRouter {
  route(intent: IntentName, context: NLContext): NLResult;
  shouldUseLLM(intent: IntentName): boolean;
  getCategory(intent: IntentName): IntentCategory;
  requiresWorkflow(intent: IntentName): boolean;
  getCategoryDescription(category: IntentCategory): string;
  getAllCategories(): IntentCategory[];
  getIntentsByCategory(category: IntentCategory): IntentName[];
}

export interface CategoryMetadata {
  requiresLLM: boolean;
  requiresWorkflow: boolean;
  description: string;
}

const CATEGORY_MAP: Record<string, IntentCategory> = {
  'file': IntentCategory.QUERY,
  'system': IntentCategory.QUERY,
  'git': IntentCategory.EXECUTE,
  'ci': IntentCategory.EXECUTE,
  'tool': IntentCategory.EXECUTE,
  'workflow': IntentCategory.GENERATE,
  'dialog': IntentCategory.DIALOG,
};

const CATEGORY_METADATA: Record<IntentCategory, CategoryMetadata> = {
  [IntentCategory.QUERY]: {
    requiresLLM: false,
    requiresWorkflow: true,
    description: '查询信息类意图，无需LLM，直接生成命令执行',
  },
  [IntentCategory.EXECUTE]: {
    requiresLLM: false,
    requiresWorkflow: true,
    description: '执行操作类意图，无需LLM，使用模板生成workflow',
  },
  [IntentCategory.DIALOG]: {
    requiresLLM: false,
    requiresWorkflow: false,
    description: '对话交互类意图，不执行命令，直接响应',
  },
  [IntentCategory.GENERATE]: {
    requiresLLM: true,
    requiresWorkflow: true,
    description: '生成内容类意图，需要LLM生成workflow',
  },
};

export function createCategoryRouter(): CategoryRouter {
  function getCategory(intent: IntentName): IntentCategory {
    const template = INTENT_TEMPLATES.find(t => t.intent === intent);
    if (!template) return IntentCategory.EXECUTE;
    return CATEGORY_MAP[template.category] || IntentCategory.EXECUTE;
  }

  function shouldUseLLM(intent: IntentName): boolean {
    const category = getCategory(intent);
    return CATEGORY_METADATA[category].requiresLLM;
  }

  function requiresWorkflow(intent: IntentName): boolean {
    const category = getCategory(intent);
    return CATEGORY_METADATA[category].requiresWorkflow;
  }

  function getCategoryDescription(category: IntentCategory): string {
    return CATEGORY_METADATA[category].description;
  }

  function getAllCategories(): IntentCategory[] {
    return Object.values(IntentCategory);
  }

  function getIntentsByCategory(category: IntentCategory): IntentName[] {
    return INTENT_TEMPLATES
      .filter(template => CATEGORY_MAP[template.category] === category)
      .map(template => template.intent as IntentName);
  }

  function route(intent: IntentName, context: NLContext): NLResult {
    const template = INTENT_TEMPLATES.find(t => t.intent === intent);
    const category = getCategory(intent);

    if (!template) {
      return {
        success: false,
        intent: 'UNKNOWN',
        confidence: 0,
        metadata: { path: 'category-router', fallbackReason: 'Unknown intent' },
      };
    }

    switch (category) {
      case IntentCategory.QUERY:
        return createQueryResult(intent, context.input as string, template.weight ?? 0.5);

      case IntentCategory.EXECUTE:
        return createExecuteResult(intent, context.input as string, template.weight ?? 0.5);

      case IntentCategory.DIALOG:
        return createDialogResult(intent, context.input as string);

      case IntentCategory.GENERATE:
        return createGenerateResult(intent, context.input as string, template.weight ?? 0.5);

      default:
        return createExecuteResult(intent, context.input as string, template.weight ?? 0.5);
    }
  }

  function createQueryResult(intent: IntentName, userInput: string, confidence: number): NLResult {
    const taskList = createSimpleTaskList(intent, userInput, confidence);
    
    return {
      success: true,
      intent,
      confidence,
      taskList,
      metadata: {
        path: 'direct-query',
        usedSkills: [],
        requiresLLM: false,
      },
    };
  }

  function createExecuteResult(intent: IntentName, userInput: string, confidence: number): NLResult {
    const taskList = createSimpleTaskList(intent, userInput, confidence);
    
    return {
      success: true,
      intent,
      confidence,
      taskList,
      metadata: {
        path: 'category-router',
        usedSkills: [],
        requiresLLM: false,
      },
    };
  }

  function createDialogResult(intent: IntentName, _userInput: string): NLResult {
    return {
      success: true,
      intent,
      confidence: 0.9,
      metadata: {
        path: 'dialog',
        usedSkills: [],
        fallbackReason: 'Dialog intent - no workflow needed',
        requiresLLM: false,
      },
    };
  }

  function createGenerateResult(intent: IntentName, userInput: string, confidence: number): NLResult {
    return {
      success: true,
      intent,
      confidence,
      metadata: {
        path: 'category-router',
        usedSkills: [],
        requiresLLM: true,
      },
    };
  }

  function createSimpleTaskList(intent: IntentName, userInput: string, confidence: number): TaskList {
    const groupedEntities: Record<string, string[]> = {
      FILE_PATH: [],
      CLI_TOOL: [],
      PACKAGE_NAME: [],
      FUNCTION_NAME: [],
      BRANCH_NAME: [],
      ENV: [],
      OPTIONS: [],
      HOST: [],
      PORT: [],
      OWNER: [],
      MODE: [],
      FILE1: [],
      FILE2: [],
    };
    
    const task = createTaskFromIntent(intent, groupedEntities as never, userInput);
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      originalInput: userInput,
      intent,
      confidence,
      entities: groupedEntities as never,
      tasks: [task],
      warnings: [],
    };
  }

  return {
    route,
    shouldUseLLM,
    getCategory,
    requiresWorkflow,
    getCategoryDescription,
    getAllCategories,
    getIntentsByCategory,
  };
}
