import type { IntentMatch, IntentName, EntityType, ParseResult, TaskList, ConfidenceLevel } from '../types/index.js';
import { createIntentMatcher, type IntentMatcher } from './intent-matcher.js';
import { createEntityExtractor } from './entity-extractor.js';
import { createCommandSynthesizer, createTaskFromIntent } from './command-synthesizer.js';

const INTENT_PATTERNS = [
  {
    intent: 'IMAGE_COMPRESS' as IntentName,
    keywords: ['压缩', '缩小', 'resize', 'compress', '图片', 'image'],
    weight: 0.9,
    cli: ['convert', 'sharp', 'cwebp'],
  },
  {
    intent: 'FILE_FIND' as IntentName,
    keywords: ['查找', '找出', 'find', 'search', '文件', 'file'],
    weight: 0.8,
    cli: ['find'],
  },
  {
    intent: 'BACKUP' as IntentName,
    keywords: ['备份', 'backup', '复制', 'copy'],
    weight: 0.85,
    cli: ['cp', 'rsync'],
  },
  {
    intent: 'CI_PIPELINE' as IntentName,
    keywords: ['测试', '部署', 'pipeline', 'ci', 'cd', 'test', 'deploy'],
    weight: 0.9,
    cli: ['npm', 'yarn', 'docker'],
  },
  {
    intent: 'BATCH_RENAME' as IntentName,
    keywords: ['重命名', 'rename', '批量', 'batch'],
    weight: 0.85,
    cli: ['rename', 'mmv'],
  },
  {
    intent: 'GIT_WORKFLOW' as IntentName,
    keywords: ['提交', 'commit', '推送', 'push', 'git', '拉取', 'pull'],
    weight: 0.95,
    cli: ['git'],
  },
];

export interface NLParser {
  parse(input: string): IntentMatch;
  parseToTaskList(input: string): ParseResult;
  addPattern(intent: string, keywords: string[], weight?: number): void;
}

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  if (confidence >= 0.5) return 'LOW';
  return 'UNCERTAIN';
}

function groupEntitiesByType(entities: { type: EntityType; value: string }[]): Record<EntityType, string[]> {
  const grouped: Record<EntityType, string[]> = {
    FILE_PATH: [],
    CLI_TOOL: [],
    PACKAGE_NAME: [],
    FUNCTION_NAME: [],
    BRANCH_NAME: [],
    ENV: [],
    OPTIONS: [],
  };

  for (const entity of entities) {
    if (!grouped[entity.type].includes(entity.value)) {
      grouped[entity.type].push(entity.value);
    }
  }

  return grouped;
}

export function createNLParser(): NLParser {
  const matcher = createIntentMatcher([...INTENT_PATTERNS]);
  const extractor = createEntityExtractor();
  const synthesizer = createCommandSynthesizer();

  return {
    parse(input: string): IntentMatch {
      return matcher.match(input);
    },

    parseToTaskList(input: string): ParseResult {
      const intentMatch = matcher.match(input);
      const confidenceLevel = getConfidenceLevel(intentMatch.confidence);

      if (intentMatch.intent === 'UNKNOWN' || confidenceLevel === 'UNCERTAIN') {
        return {
          status: 'NEEDS_CLARIFICATION',
          confidenceLevel,
          originalInput: input,
          candidates: [
            { intent: 'IMAGE_COMPRESS', description: '压缩图片' },
            { intent: 'FILE_FIND', description: '查找文件' },
            { intent: 'GIT_WORKFLOW', description: 'Git 操作' },
            { intent: 'CI_PIPELINE', description: 'CI/CD 流程' },
          ],
        };
      }

      const entities = extractor.extract(input);
      const groupedEntities = groupEntitiesByType(entities);
      const task = createTaskFromIntent(intentMatch.intent, groupedEntities, input);

      if (groupedEntities.CLI_TOOL.length > 0) {
        const detectedCLI = groupedEntities.CLI_TOOL[0];
        const params: Record<string, string | string[] | undefined> = {};

        for (const [type, values] of Object.entries(groupedEntities)) {
          if (values.length > 0 && type !== 'CLI_TOOL') {
            params[type.toLowerCase()] = values.length === 1 ? values[0] : values;
          }
        }

        task.commands = [synthesizer.synthesize(task.type, params, detectedCLI)];
      }

      const taskList: TaskList = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: input,
        intent: intentMatch.intent,
        confidence: intentMatch.confidence,
        entities: groupedEntities,
        tasks: [task],
        warnings: [],
      };

      return {
        status: 'SUCCESS',
        taskList,
        confidenceLevel,
        originalInput: input,
      };
    },

    addPattern(intent: IntentName, keywords: string[], weight = 0.8): void {
      matcher.registerPattern({ intent, keywords, weight });
    },
  };
}

export type { IntentMatcher } from './intent-matcher.js';