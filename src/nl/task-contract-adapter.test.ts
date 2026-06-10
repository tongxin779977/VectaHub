import { describe, expect, it } from 'vitest';
import type { NLResult } from './types.js';
import { toTaskContract, toTaskContractEnvelope } from './task-contract-adapter.js';

function createBaseResult(overrides: Partial<NLResult>): NLResult {
  return {
    success: true,
    confidence: 0.9,
    metadata: {
      path: 'dialog',
    },
    ...overrides,
  };
}

describe('task-contract adapter', () => {
  it('maps reply result to reply task contract', () => {
    const rawInput = '这个项目结构是什么？';
    const result = createBaseResult({
      intent: 'QUERY_INFO',
      reply: '项目结构如下',
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('reply');
    if (contract.kind !== 'reply') {
      throw new Error('expected reply task contract');
    }
    expect(contract.answerTopic).toBe('QUERY_INFO');
    expect(contract.language).toBe('zh-CN');
    expect(contract.rawInput).toBe(rawInput);
    expect(contract.normalizedGoal).toBe(rawInput.trim());
  });

  it('maps executable doctor result to agent-runtime task contract', () => {
    const rawInput = '  帮我诊断一下这个项目  ';
    const result = createBaseResult({
      intent: 'doctor',
      metadata: {
        path: 'category-router',
        fallbackReason: 'doctor-capability',
      },
      taskList: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: '旧字段里的输入不应再作为合同输入源',
        intent: 'doctor',
        confidence: 1,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [{
          id: 'task_1',
          type: 'QUERY_EXEC',
          description: 'step_doctor',
          status: 'PENDING',
          commands: [{ cli: 'vectahub', args: ['doctor'] }],
          dependencies: [],
        }],
        warnings: [],
      },
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('execute');
    if (contract.kind !== 'execute') {
      throw new Error('expected execute task contract');
    }
    expect(contract.taskKind).toBe('diagnose');
    expect(contract.executionStrategy.mode).toBe('agent-runtime');
    expect(contract.executionStrategy.commandSurfaceId).toBeUndefined();
    expect(contract.rawInput).toBe(rawInput);
    expect(contract.normalizedGoal).toBe('帮我诊断一下这个项目');
  });

  it('maps clarification result to clarify task contract', () => {
    const rawInput = '做点什么';
    const result = createBaseResult({
      metadata: {
        path: 'category-router',
        fallbackReason: 'clarification required before execution',
      },
      taskList: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: '做点什么',
        intent: 'UNKNOWN',
        confidence: 0.4,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [],
        warnings: ['clarification required before execution'],
      },
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('clarify');
    if (contract.kind !== 'clarify') {
      throw new Error('expected clarify task contract');
    }
    expect(contract.question).toContain('clarification required');
  });

  it('maps unsupported empty result to blocked task contract', () => {
    const rawInput = '不支持的请求';
    const result = createBaseResult({
      success: false,
      confidence: 0,
      metadata: {
        path: 'no-match',
        fallbackReason: 'unsupported request',
      },
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('blocked');
    if (contract.kind !== 'blocked') {
      throw new Error('expected blocked task contract');
    }
    expect(contract.reason).toContain('unsupported request');
  });

  it('creates envelope with legacy result preserved', () => {
    const rawInput = 'hello';
    const result = createBaseResult({
      reply: 'hello',
    });

    const envelope = toTaskContractEnvelope(rawInput, result);

    expect(envelope.legacy).toBe(result);
    expect(envelope.taskContract.kind).toBe('reply');
    expect(envelope.taskContract.rawInput).toBe(rawInput);
  });

  it('prefers execute contract when reply and task list both exist', () => {
    const rawInput = '帮我诊断并说明原因';
    const result = createBaseResult({
      intent: 'doctor',
      reply: '我会先诊断项目',
      metadata: {
        path: 'category-router',
        fallbackReason: 'doctor-capability',
      },
      taskList: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: '错误的旧输入源',
        intent: 'doctor',
        confidence: 1,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [{
          id: 'task_1',
          type: 'QUERY_EXEC',
          description: 'step_doctor',
          status: 'PENDING',
          commands: [{ cli: 'vectahub', args: ['doctor'] }],
          dependencies: [],
        }],
        warnings: [],
      },
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('execute');
  });

  it('keeps doctor workflow YAML out of workflow-draft command execution', () => {
    const rawInput = '帮我系统的诊断一下这个项目';
    const result = createBaseResult({
      intent: 'doctor',
      workflowYAML: 'name: doctor\nsteps:\n  - run: vectahub doctor\n',
      metadata: {
        path: 'llm-tool-calling',
      },
      taskList: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: rawInput,
        intent: 'doctor',
        confidence: 0.9,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [{
          id: 'task_1',
          type: 'QUERY_EXEC',
          description: 'step_doctor',
          status: 'PENDING',
          commands: [{ cli: 'vectahub', args: ['doctor'] }],
          dependencies: [],
        }],
        warnings: [],
      },
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('execute');
    if (contract.kind !== 'execute') {
      throw new Error('expected execute task contract');
    }
    expect(contract.taskKind).toBe('diagnose');
    expect(contract.executionStrategy.mode).toBe('agent-runtime');
  });

  it('maps refactor-style execution to agent-runtime strategy', () => {
    const rawInput = '重构整个模块并更新相关调用';
    const result = createBaseResult({
      intent: 'refactor' as unknown as NLResult['intent'],
      taskList: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: rawInput,
        intent: 'UNKNOWN',
        confidence: 0.9,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [{
          id: 'task_agent',
          type: 'CODE_TRANSFORM',
          description: 'refactor module',
          status: 'PENDING',
          commands: [{ cli: 'vectahub', args: ['run-task'] }],
          dependencies: [],
        }],
        warnings: [],
      },
    });

    const contract = toTaskContract(rawInput, result);

    expect(contract.kind).toBe('execute');
    if (contract.kind !== 'execute') {
      throw new Error('expected execute task contract');
    }
    expect(contract.taskKind).toBe('delegate');
    expect(contract.executionStrategy.mode).toBe('agent-runtime');
  });
});
