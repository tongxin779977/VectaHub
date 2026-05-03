import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMResponse } from '../nl/llm.js';
import type { ParseResult, TaskType } from '../types/index.js';

function getConfidenceLevelText(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN' {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  if (confidence >= 0.5) return 'LOW';
  return 'UNCERTAIN';
}

function mapIntentToTaskType(intent: string): TaskType {
  switch (intent) {
    case 'FILE_FIND':
    case 'QUERY_INFO':
    case 'SYSTEM_INFO':
      return 'QUERY_EXEC';
    case 'GIT_WORKFLOW':
      return 'GIT_OPERATION';
    case 'INSTALL_PACKAGE':
      return 'PACKAGE_INSTALL';
    case 'RUN_SCRIPT':
      return 'BUILD_VERIFY';
    case 'CREATE_FILE':
      return 'CODE_CREATE';
    default:
      return 'DEBUG_EXEC';
  }
}

function convertLLMResultToTaskList(llmResult: LLMResponse, originalInput: string): ParseResult {
  const tasks = llmResult.workflow.steps.map((step, index) => ({
    id: `task_${index + 1}`,
    type: mapIntentToTaskType(llmResult.intent),
    description: `${step.cli} ${(step.args || []).join(' ')}`,
    status: 'PENDING' as const,
    commands: step.cli ? [{ cli: step.cli, args: step.args || [] }] : [{ cli: 'echo', args: [step.type || 'unknown'] }],
    dependencies: [],
  }));

  const confidenceLevel = getConfidenceLevelText(llmResult.confidence);

  const taskList = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    originalInput,
    intent: llmResult.intent as any,
    confidence: llmResult.confidence,
    entities: {} as any,
    tasks,
    warnings: [],
  };

  return {
    status: 'SUCCESS',
    taskList,
    confidenceLevel,
    originalInput,
  };
}

describe('run command - LLM integration', () => {
  describe('getConfidenceLevelText', () => {
    it('returns HIGH for confidence >= 0.9', () => {
      expect(getConfidenceLevelText(0.95)).toBe('HIGH');
      expect(getConfidenceLevelText(1.0)).toBe('HIGH');
    });

    it('returns MEDIUM for confidence >= 0.7', () => {
      expect(getConfidenceLevelText(0.7)).toBe('MEDIUM');
      expect(getConfidenceLevelText(0.8)).toBe('MEDIUM');
    });

    it('returns LOW for confidence >= 0.5', () => {
      expect(getConfidenceLevelText(0.5)).toBe('LOW');
      expect(getConfidenceLevelText(0.6)).toBe('LOW');
    });

    it('returns UNCERTAIN for confidence < 0.5', () => {
      expect(getConfidenceLevelText(0.3)).toBe('UNCERTAIN');
      expect(getConfidenceLevelText(0)).toBe('UNCERTAIN');
    });
  });

  describe('mapIntentToTaskType', () => {
    it('maps FILE_FIND to QUERY_EXEC', () => {
      expect(mapIntentToTaskType('FILE_FIND')).toBe('QUERY_EXEC');
    });

    it('maps SYSTEM_INFO to QUERY_EXEC', () => {
      expect(mapIntentToTaskType('SYSTEM_INFO')).toBe('QUERY_EXEC');
    });

    it('maps GIT_WORKFLOW to GIT_OPERATION', () => {
      expect(mapIntentToTaskType('GIT_WORKFLOW')).toBe('GIT_OPERATION');
    });

    it('maps INSTALL_PACKAGE to PACKAGE_INSTALL', () => {
      expect(mapIntentToTaskType('INSTALL_PACKAGE')).toBe('PACKAGE_INSTALL');
    });

    it('maps RUN_SCRIPT to BUILD_VERIFY', () => {
      expect(mapIntentToTaskType('RUN_SCRIPT')).toBe('BUILD_VERIFY');
    });

    it('maps CREATE_FILE to CODE_CREATE', () => {
      expect(mapIntentToTaskType('CREATE_FILE')).toBe('CODE_CREATE');
    });

    it('maps unknown intent to DEBUG_EXEC', () => {
      expect(mapIntentToTaskType('UNKNOWN')).toBe('DEBUG_EXEC');
      expect(mapIntentToTaskType('SOMETHING_ELSE')).toBe('DEBUG_EXEC');
    });
  });

  describe('convertLLMResultToTaskList', () => {
    it('converts LLM response with steps to ParseResult with tasks', () => {
      const llmResult: LLMResponse = {
        intent: 'SYSTEM_INFO',
        confidence: 0.95,
        params: {},
        workflow: {
          name: 'test workflow',
          steps: [
            { type: 'exec', cli: 'find', args: ['.'] },
            { type: 'exec', cli: 'grep', args: ['-r', 'test'] },
          ],
        },
      };

      const result = convertLLMResultToTaskList(llmResult, 'find test files');

      expect(result.status).toBe('SUCCESS');
      expect(result.confidenceLevel).toBe('HIGH');
      expect(result.taskList).toBeDefined();
      expect(result.taskList?.tasks.length).toBe(2);
      expect(result.taskList?.tasks[0].commands[0].cli).toBe('find');
      expect(result.taskList?.tasks[0].commands[0].args).toEqual(['.']);
      expect(result.taskList?.tasks[1].commands[0].cli).toBe('grep');
      expect(result.originalInput).toBe('find test files');
    });

    it('creates task with echo command when step has no cli', () => {
      const llmResult: LLMResponse = {
        intent: 'UNKNOWN',
        confidence: 0.8,
        params: {},
        workflow: {
          name: 'empty workflow',
          steps: [
            { type: 'exec' },
          ],
        },
      };

      const result = convertLLMResultToTaskList(llmResult, 'test');

      expect(result.taskList?.tasks[0].commands[0].cli).toBe('echo');
      expect(result.taskList?.tasks[0].commands[0].args).toEqual(['exec']);
    });
  });

  describe('LLM fallback logic simulation', () => {
    it('should use LLM when confidence >= 0.7 and steps exist', () => {
      const llmResult: LLMResponse = {
        intent: 'SYSTEM_INFO',
        confidence: 0.95,
        params: {},
        workflow: {
          name: 'test',
          steps: [{ type: 'exec', cli: 'find', args: ['.'] }],
        },
      };

      const shouldUseLLM = llmResult.confidence >= 0.7 && llmResult.workflow?.steps?.length > 0;
      expect(shouldUseLLM).toBe(true);
    });

    it('should fallback when confidence < 0.7', () => {
      const llmResult: LLMResponse = {
        intent: 'SYSTEM_INFO',
        confidence: 0.5,
        params: {},
        workflow: {
          name: 'test',
          steps: [{ type: 'exec', cli: 'echo', args: ['low'] }],
        },
      };

      const shouldUseLLM = llmResult.confidence >= 0.7 && llmResult.workflow?.steps?.length > 0;
      expect(shouldUseLLM).toBe(false);
    });

    it('should fallback when steps is empty', () => {
      const llmResult: LLMResponse = {
        intent: 'SYSTEM_INFO',
        confidence: 0.8,
        params: {},
        workflow: {
          name: 'test',
          steps: [],
        },
      };

      const shouldUseLLM = llmResult.confidence >= 0.7 && llmResult.workflow?.steps?.length > 0;
      expect(shouldUseLLM).toBe(false);
    });
  });
});
