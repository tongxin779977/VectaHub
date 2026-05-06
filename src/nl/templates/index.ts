import type { IntentName } from '../../types/index.js';
import type { WeightedKeyword, CompositePhrase, NegativeKeyword } from '../types.js';
import { IntentCategory } from '../types/category.js';

export interface IntentTemplate {
  name: string;
  description: string;
  keywords: string[];
  weight: number;
  cli: string[];
  params: Record<string, {
    type: string;
    required: boolean;
    default?: unknown;
    description: string;
  }>;
  steps: StepTemplate[];
  weightedKeywords?: WeightedKeyword[];
  phrases?: CompositePhrase[];
  negativeKeywords?: NegativeKeyword[];
  priority?: number;
  tags?: string[];
  category?: IntentCategory;
}

export interface StepTemplate {
  type: string;
  cli?: string;
  args?: string[];
  body?: StepTemplate[];
  condition?: string;
}

export const INTENT_TEMPLATES: Record<string, IntentTemplate> = {
  FILE_FIND: {
    name: 'FILE_FIND',
    description: '查找文件',
    keywords: ['找出', 'find', 'search', '找出所有', '找出大于', '搜索最近', '在docs', '搜索twitter', '所有ts', '找出文件', '找出大于', '配置文件', '超过', '大文件', '找一下', '帮我找', '搜索文件', '查找最近'],
    weight: 0.85,
    cli: ['find', 'fd', 'locate', 'grep'],
    params: {
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '搜索路径'
      },
      name: {
        type: 'string',
        required: false,
        description: '文件名模式'
      },
      type: {
        type: 'string',
        required: false,
        default: 'f',
        description: '文件类型 (f|d|l)'
      },
      mtime: {
        type: 'string',
        required: false,
        description: '修改时间 (天数，如 -7 表示7天内)'
      },
      size: {
        type: 'string',
        required: false,
        description: '文件大小 (如 +1M, -100k)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-name', '${name:-*}']
      },
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-mtime', '${mtime}'],
        condition: '${mtime}'
      },
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-size', '${size}'],
        condition: '${size}'
      }
    ],
    weightedKeywords: [
      { text: '查找', tier: 'core' },
      { text: '找出', tier: 'core' },
      { text: '搜索', tier: 'core' },
      { text: 'find', tier: 'core' },
      { text: 'search', tier: 'core' },
      { text: '文件', tier: 'generic' },
    ],
    phrases: [
      { pattern: '查找.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '找出.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '搜索.*修改', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '搜索.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '目录下查找', isRegex: false, weight: 1.0, bonus: 1.2 },
      { pattern: '大于.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '超过.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '帮我找.*配置', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '找一下.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查找.*并统计', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '找出.*并统计', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '搜索所有', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '创建', strength: 'soft' },
      { text: '新建', strength: 'soft' },
      { text: '生成', strength: 'soft' },
      { text: '编写', strength: 'soft' },
    ],
    priority: 3,
    tags: ['file', 'search'],
    category: IntentCategory.SEARCH,
  },

  DIALOG_GREETING: {
    name: 'DIALOG_GREETING',
    description: '问候语对话',
    keywords: ['你好', '您好', '嗨', 'Hello', 'Hi', '早上好', '下午好', '晚上好'],
    weight: 1.5,
    cli: [],
    params: {},
    steps: [],
    weightedKeywords: [
      { text: '你好', tier: 'core' },
      { text: '您好', tier: 'core' },
      { text: '嗨', tier: 'core' },
      { text: 'Hello', tier: 'core' },
      { text: 'Hi', tier: 'core' },
      { text: '早上好', tier: 'core' },
      { text: '下午好', tier: 'core' },
      { text: '晚上好', tier: 'core' },
    ],
    phrases: [
      { pattern: '^你好$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^您好$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^嗨$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^Hello$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^Hi$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^早上好$', isRegex: true, weight: 1.0, bonus: 3.5 },
      { pattern: '^下午好$', isRegex: true, weight: 1.0, bonus: 3.5 },
      { pattern: '^晚上好$', isRegex: true, weight: 1.0, bonus: 3.5 },
    ],
    priority: 10,
    tags: ['dialog', 'greeting'],
    category: IntentCategory.DIALOG,
  },

  WORKFLOW_GENERATE: {
    name: 'WORKFLOW_GENERATE',
    description: '根据文档或需求生成工作流',
    keywords: ['生成workflow', '生成工作流', '创建workflow', '创建工作流', '生成几个workflow', '生成几个工作流', '帮我生成', '根据文档生成'],
    weight: 1.0,
    cli: [],
    params: {
      docPath: {
        type: 'string',
        required: false,
        description: '文档路径'
      },
      requirements: {
        type: 'string',
        required: false,
        description: '工作流需求描述'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'echo',
        args: ['Generating workflow from requirements']
      }
    ],
    weightedKeywords: [
      { text: '生成', tier: 'core' },
      { text: '工作流', tier: 'core' },
      { text: 'workflow', tier: 'core' },
      { text: '创建', tier: 'core' },
    ],
    phrases: [
      { pattern: '生成.*workflow', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '生成.*工作流', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '根据.*文档.*生成', isRegex: true, weight: 1.0, bonus: 2.5 },
    ],
    priority: 5,
    tags: ['workflow', 'generation'],
    category: IntentCategory.GENERATE,
  }
};

export function getIntentTemplate(name: string): IntentTemplate | undefined {
  return INTENT_TEMPLATES[name];
}

export function getAllIntentNames(): string[] {
  return Object.keys(INTENT_TEMPLATES);
}

export function buildKeywordSummary(): string {
  const lines: string[] = [];

  for (const template of Object.values(INTENT_TEMPLATES)) {
    lines.push(`${template.name}:`);
    const coreKw: string[] = [];
    const importantKw: string[] = [];

    if (template.weightedKeywords) {
      for (const kw of template.weightedKeywords) {
        if (kw.tier === 'core') {
          coreKw.push(kw.text);
        } else {
          importantKw.push(kw.text);
        }
      }
    }

    if (coreKw.length > 0) {
      lines.push(`  Core: ${coreKw.slice(0, 5).join(', ')}`);
    }
    if (importantKw.length > 0) {
      lines.push(`  Keywords: ${importantKw.slice(0, 5).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function detectNegation(input: string): boolean {
  const negationPatterns = [
    /\b不\b/, /\b没\b/, /\b无\b/, /\b非\b/,
    /\b不要\b/, /\b不用\b/, /\b别\b/,
    /\bnot\b/i, /\bno\b/i, /\bnever\b/i,
  ];
  return negationPatterns.some(p => p.test(input));
}

export function shouldSuppressDueToNegation(input: string, template: IntentTemplate): boolean {
  if (!detectNegation(input)) return false;

  const negativeKeywords = template.negativeKeywords || [];
  const hasNegativeKeyword = negativeKeywords.some(
    (neg) => input.includes(neg.text)
  );

  return hasNegativeKeyword && negativeKeywords.find(n => input.includes(n.text))?.strength === 'strong';
}