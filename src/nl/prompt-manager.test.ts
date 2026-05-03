import { expect, test } from 'vitest';
import {
  createPromptManager,
  DEFAULT_INTENT_PARSER_ID,
  DEFAULT_WORKFLOW_YAML_ID,
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
    system: 'Test system prompt {testVar}',
    userTemplate: '{userInput}',
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
