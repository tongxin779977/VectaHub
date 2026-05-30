import { expect, test } from 'vitest';
import {
  createPromptManager,
  DEFAULT_INTENT_PARSER_ID,
  DEFAULT_WORKFLOW_YAML_ID,
  DOC_TASK_PARSER_ID,
  AGENT_CMD_GENERATOR_ID,
  NL_PROCESSOR_TOOL_CALLING_ID,
} from './prompt-manager.js';

test('should create prompt manager with built-in prompts', () => {
  const manager = createPromptManager();
  const allPrompts = manager.list();
  
  expect(allPrompts.length).toBeGreaterThan(0);
  expect(manager.get(DEFAULT_INTENT_PARSER_ID)).toBeDefined();
  expect(manager.get(DEFAULT_WORKFLOW_YAML_ID)).toBeDefined();
});

test('should get prompt by category', () => {
  const manager = createPromptManager();
  const parsingPrompts = manager.list('parsing');
  const workflowPrompts = manager.list('workflow');
  
  expect(parsingPrompts.length).toBeGreaterThan(0);
  expect(workflowPrompts.length).toBeGreaterThan(0);
});

test('should build system prompt with context', () => {
  const manager = createPromptManager();
  const context = {
    intentList: '- test1\n- test2',
  };
  
  const systemPrompt = manager.buildSystemPrompt(DEFAULT_INTENT_PARSER_ID, context);
  
  expect(systemPrompt).toContain('test1');
  expect(systemPrompt).toContain('test2');
});

test('should track prompt uses', () => {
  const manager = createPromptManager();
  const prompt = manager.get(DEFAULT_INTENT_PARSER_ID);
  
  const initialUses = prompt?.metadata.uses || 0;
  manager.buildSystemPrompt(DEFAULT_INTENT_PARSER_ID);
  
  const updatedPrompt = manager.get(DEFAULT_INTENT_PARSER_ID);
  expect(updatedPrompt?.metadata.uses).toBe(initialUses + 1);
});

test('should add and update prompts', () => {
  const manager = createPromptManager();
  
  const newPrompt = {
    id: 'custom-prompt-v1',
    name: 'Custom Prompt',
    version: '1.0.0',
    description: 'A test prompt',
    category: 'assistant' as const,
    tags: ['test'],
    systemTemplate: 'Test system prompt {{testVar}}',
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'testVar', type: 'string' as const, required: true },
      { name: 'userInput', type: 'string' as const, required: true },
    ],
    examples: [],
    constraints: [],
    metadata: {
      author: 'Test',
      createdAt: new Date(),
      lastUpdated: new Date(),
      effectiveness: 1.0,
      uses: 0,
    },
  };
  
  manager.add(newPrompt);
  expect(manager.get('custom-prompt-v1')).toBeDefined();
  
  manager.update({
    ...newPrompt,
    metadata: {
      ...newPrompt.metadata,
      effectiveness: 0.9,
    },
  });
  
  const updated = manager.get('custom-prompt-v1');
  expect(updated?.metadata.effectiveness).toBe(0.9);
});

test('should select prompt by action and domains', () => {
  const manager = createPromptManager();

  const selected = manager.selectPrompt({
    action: 'run',
    domains: ['npm'],
  });

  expect(selected).toBeDefined();
  expect(selected?.tags).toContain('npm');
});

test('should select parsing prompt for parsing category', () => {
  const manager = createPromptManager();

  const selected = manager.selectPrompt({ category: 'parsing' });

  expect(selected).toBeDefined();
  expect(selected?.category).toBe('parsing');
});

test('should select workflow prompt for workflow category', () => {
  const manager = createPromptManager();

  const selected = manager.selectPrompt({ category: 'workflow' });

  expect(selected).toBeDefined();
  expect(selected?.category).toBe('workflow');
});

test('should record outcome and update effectiveness', () => {
  const manager = createPromptManager();
  const promptBefore = manager.get(DEFAULT_INTENT_PARSER_ID);
  const effectivenessBefore = promptBefore?.metadata.effectiveness ?? 0.5;

  manager.recordOutcome(DEFAULT_INTENT_PARSER_ID, true);

  const promptAfter = manager.get(DEFAULT_INTENT_PARSER_ID);
  expect(promptAfter?.metadata.successRate).toBeDefined();
  expect(promptAfter?.metadata.successRate).toBeGreaterThan(0);
  expect(promptAfter?.metadata.effectiveness).not.toBe(effectivenessBefore);
});

test('should handle recordOutcome for non-existent prompt', () => {
  const manager = createPromptManager();
  expect(() => manager.recordOutcome('non-existent', true)).not.toThrow();
});

test('should register doc-task-parser prompt', () => {
  const manager = createPromptManager();
  const prompt = manager.get(DOC_TASK_PARSER_ID);

  expect(prompt).toBeDefined();
  expect(prompt?.id).toBe(DOC_TASK_PARSER_ID);
  expect(prompt?.category).toBe('parsing');
  expect(prompt?.tags).toContain('doc-task');
  expect(prompt?.systemTemplate).toContain('{{docContent}}');
  expect(prompt?.variables.some(v => v.name === 'docContent')).toBe(true);
  expect(prompt?.constraints.length).toBeGreaterThan(0);
});

test('should register agent-cmd-generator prompt', () => {
  const manager = createPromptManager();
  const prompt = manager.get(AGENT_CMD_GENERATOR_ID);

  expect(prompt).toBeDefined();
  expect(prompt?.id).toBe(AGENT_CMD_GENERATOR_ID);
  expect(prompt?.category).toBe('generation');
  expect(prompt?.tags).toContain('agent-cmd');
  expect(prompt?.systemTemplate).toContain('{{toolName}}');
  expect(prompt?.systemTemplate).toContain('{{helpOutput}}');
  expect(prompt?.systemTemplate).toContain('{{taskId}}');
  expect(prompt?.variables.some(v => v.name === 'toolName')).toBe(true);
  expect(prompt?.variables.some(v => v.name === 'helpOutput')).toBe(true);
});

test('should build doc-task-parser system prompt with docContent', () => {
  const manager = createPromptManager();
  const docContent = '## 1. 实现登录\n### 1.1 前端表单';

  const systemPrompt = manager.buildSystemPrompt(DOC_TASK_PARSER_ID, {
    docContent,
  });

  expect(systemPrompt).toContain('## 1. 实现登录');
  expect(systemPrompt).toContain('### 1.1 前端表单');
  expect(systemPrompt).toContain('JSON 数组');
});

test('should build agent-cmd-generator system prompt with tool info', () => {
  const manager = createPromptManager();

  const systemPrompt = manager.buildSystemPrompt(AGENT_CMD_GENERATOR_ID, {
    toolName: 'aider',
    helpOutput: 'Usage: aider [options]',
    taskId: '1.1',
    taskLabel: '实现登录',
    docPath: '/path/to/doc.md',
  });

  expect(systemPrompt).toContain('aider');
  expect(systemPrompt).toContain('Usage: aider [options]');
  expect(systemPrompt).toContain('1.1');
  expect(systemPrompt).toContain('实现登录');
  expect(systemPrompt).toContain('/path/to/doc.md');
});

test('should list doc-task prompts by category', () => {
  const manager = createPromptManager();

  const parsingPrompts = manager.list('parsing');
  const docTaskParser = parsingPrompts.find(p => p.id === DOC_TASK_PARSER_ID);
  expect(docTaskParser).toBeDefined();

  const generationPrompts = manager.list('generation');
  const agentCmdGenerator = generationPrompts.find(p => p.id === AGENT_CMD_GENERATOR_ID);
  expect(agentCmdGenerator).toBeDefined();
});

test('should register nl-processor-tool-calling prompt', () => {
  const manager = createPromptManager();
  const prompt = manager.get(NL_PROCESSOR_TOOL_CALLING_ID);

  expect(prompt).toBeDefined();
  expect(prompt?.id).toBe(NL_PROCESSOR_TOOL_CALLING_ID);
  expect(prompt?.category).toBe('parsing');
  expect(prompt?.tags).toContain('tool-calling');
  expect(prompt?.systemTemplate).toContain('tool');
  expect(prompt?.systemTemplate).toContain('安全约束');
  expect(prompt?.variables.some(v => v.name === 'userInput')).toBe(true);
  expect(prompt?.constraints.length).toBeGreaterThan(0);
});

test('should build nl-processor-tool-calling system prompt', () => {
  const manager = createPromptManager();

  const systemPrompt = manager.buildSystemPrompt(NL_PROCESSOR_TOOL_CALLING_ID, {});

  expect(systemPrompt).toContain('VectaHub');
  expect(systemPrompt).toContain('tool');
  expect(systemPrompt).toContain('安全约束');
});
