import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNLProcessor } from './pipeline.js';
import { createKeywordFallback } from './keyword-fallback.js';
import { adaptAllTemplates } from './adapter.js';
import { INTENT_TEMPLATES } from '../templates/index.js';
import type { NLContext, NLResult, NLProcessor } from './types.js';
import type { IntentName } from '../../types/index.js';
import type { Skill, SkillResult, SkillContext, CompositeSkill } from '../../skills/types.js';
import { createSkillRegistry } from '../../skills/registry.js';
import { createSkillExecutor } from '../../skills/executor.js';
import YAML from 'yaml';

function createMockSkill<TInput = unknown, TOutput = unknown>(
  id: string,
  resultFn: (input: TInput) => SkillResult<TOutput> = () => ({ success: true, confidence: 1 }),
  options?: { canHandle?: boolean; delay?: number }
): Skill<TInput, TOutput> {
  return {
    id,
    name: `Skill ${id}`,
    version: '1.0.0',
    description: `Mock ${id}`,
    tags: ['mock'],
    canHandle: async () => options?.canHandle ?? true,
    execute: async (input: TInput) => {
      if (options?.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }
      return resultFn(input);
    },
  };
}

const mockKeywordFallback: NLProcessor = {
  parse: async () => ({
    success: true,
    intent: 'QUERY_INFO' as IntentName,
    confidence: 0.5,
    taskList: {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      originalInput: 'test',
      intent: 'QUERY_INFO' as IntentName,
      confidence: 0.5,
      entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
      tasks: [],
      warnings: [],
    },
    metadata: { path: 'keyword-fallback' as const },
  }),
};

const mockFailingKeywordFallback: NLProcessor = {
  parse: async () => ({
    success: false,
    intent: 'UNKNOWN' as IntentName,
    confidence: 0,
    metadata: { path: 'keyword-fallback' as const },
  }),
};

describe('NLProcessor', () => {
  describe('types', () => {
    it('should define NLContext with required fields', () => {
      const context: NLContext = { input: 'test' };
      expect(context.input).toBe('test');
    });

    it('should define NLResult with required fields', () => {
      const result: NLResult = {
        success: true,
        confidence: 0.8,
        metadata: {
          path: 'skill-pipeline',
          usedSkills: ['test'],
        },
      };
      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.metadata.path).toBe('skill-pipeline');
    });

    it('should define NLContext with optional fields', () => {
      const context: NLContext = {
        input: 'test',
        sessionId: 'session-123',
        options: {
          useLLM: false,
        },
      };
      expect(context.sessionId).toBe('session-123');
      expect(context.options?.useLLM).toBe(false);
    });

    it('should define NLResult with optional fields', () => {
      const result: NLResult = {
        success: false,
        confidence: 0.2,
        metadata: {
          path: 'keyword-fallback',
          usedSkills: [],
          fallbackReason: 'No skills matched',
        },
      };
      expect(result.metadata.fallbackReason).toBe('No skills matched');
    });
  });

  describe('createNLProcessor', () => {
    it('should create a processor with required dependencies', () => {
      const registry = createSkillRegistry();
      const processor = createNLProcessor(registry, mockKeywordFallback);
      expect(processor).toBeDefined();
      expect(typeof processor.parse).toBe('function');
    });

    it('should accept confidence threshold in options', () => {
      const registry = createSkillRegistry();
      const processor = createNLProcessor(registry, mockKeywordFallback, {
        confidenceThreshold: 0.9,
      });
      expect(processor).toBeDefined();
    });

    it('should accept executor in options', () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();
      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      expect(processor).toBeDefined();
    });
  });

  describe('useLLM disabled', () => {
    it('should fallback to keyword parser when useLLM is false', async () => {
      const registry = createSkillRegistry();
      const processor = createNLProcessor(registry, mockKeywordFallback);

      const result = await processor.parse({
        input: 'test input',
        options: { useLLM: false },
      });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('QUERY_INFO');
      expect(result.metadata.path).toBe('keyword-only');
      expect(result.metadata.usedSkills).toEqual([]);
      expect(result.metadata.fallbackReason).toBe('LLM disabled');
    });

    it('should fallback when useLLM is not specified (defaults to true, no executor → keyword)', async () => {
      const registry = createSkillRegistry();
      const processor = createNLProcessor(registry, mockKeywordFallback);

      const result = await processor.parse({ input: 'test' });

      expect(result.metadata.path).toBe('keyword-only');
    });

    it('should fallback even with failing keyword parser', async () => {
      const registry = createSkillRegistry();
      const processor = createNLProcessor(registry, mockFailingKeywordFallback);

      const result = await processor.parse({
        input: 'test',
        options: { useLLM: false },
      });

      expect(result.success).toBe(false);
      expect(result.metadata.path).toBe('keyword-only');
    });

    it('should work with real createKeywordFallback (NLProcessor) when useLLM is false', async () => {
      const registry = createSkillRegistry();
      const patterns = adaptAllTemplates(INTENT_TEMPLATES);
      const realKeywordFallback = createKeywordFallback(patterns);
      const processor = createNLProcessor(registry, realKeywordFallback);

      const result = await processor.parse({
        input: 'git commit',
        options: { useLLM: false },
      });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('GIT_WORKFLOW');
      expect(result.metadata.path).toBe('keyword-only');
    });
  });

  describe('no executor configured', () => {
    it('should fallback to keyword when no executor', async () => {
      const registry = createSkillRegistry();
      const processor = createNLProcessor(registry, mockKeywordFallback);

      const result = await processor.parse({
        input: 'test',
        options: { useLLM: true },
      });

      expect(result.metadata.path).toBe('keyword-fallback');
      expect(result.metadata.fallbackReason).toBe('No executor available');
    });
  });

  describe('executor-based pipeline skill', () => {
    it('should execute pipeline skill and return NLResult', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const pipelineSkill = createMockSkill<string, { workflowYAML: string }>(
        'vectahub.pipeline',
        () => ({
          success: true,
          data: {
            workflowYAML: 'version: "2.0"\nsteps:\n  - name: Build\n    exec: npm run build',
          },
          confidence: 0.95,
        })
      );

      registry.register(pipelineSkill);

      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      const result = await processor.parse({
        input: 'build the project',
        options: { useLLM: true },
      });

      expect(result.success).toBe(true);
      expect(result.metadata.path).toBe('skill-pipeline');
      expect(result.metadata.usedSkills).toEqual(['vectahub.pipeline']);
      expect(result.confidence).toBe(0.95);
    });

    it('should populate taskList from workflow YAML', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const pipelineSkill = createMockSkill<string, { workflowYAML: string }>(
        'vectahub.pipeline',
        () => ({
          success: true,
          data: {
            workflowYAML: 'version: "2.0"\nsteps:\n  - name: Test\n    exec: npm test',
          },
          confidence: 0.9,
        })
      );
      registry.register(pipelineSkill);

      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      const result = await processor.parse({
        input: 'run tests',
        options: { useLLM: true },
      });

      expect(result.taskList).toBeDefined();
      expect(result.taskList?.tasks.length).toBeGreaterThan(0);
    });

    it('should fallback when pipeline skill fails', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const pipelineSkill = createMockSkill<string, { workflowYAML: string }>(
        'vectahub.pipeline',
        () => ({
          success: false,
          error: 'Pipeline failed',
          confidence: 0,
        })
      );
      registry.register(pipelineSkill);

      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      const result = await processor.parse({
        input: 'test',
        options: { useLLM: true },
      });

      expect(result.metadata.path).toBe('keyword-fallback');
    });

    it('should fallback when pipeline skill confidence below threshold', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor({ maxRetries: 0 });

      const pipelineSkill = createMockSkill<string, { workflowYAML: string }>(
        'vectahub.pipeline',
        () => ({
          success: true,
          data: { workflowYAML: 'version: "2.0"' },
          confidence: 0.3,
        })
      );
      registry.register(pipelineSkill);

      const processor = createNLProcessor(registry, mockKeywordFallback, {
        executor,
        confidenceThreshold: 0.7,
      });
      const result = await processor.parse({
        input: 'test',
        options: { useLLM: true },
      });

      expect(result.metadata.path).toBe('skill-pipeline');
      expect(result.success).toBe(true);
    });
  });

  describe('executor-based individual skills', () => {
    it('should execute individual skills when no pipeline skill', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const intentSkill = createMockSkill<string, { intent: string }>(
        'vectahub.intent',
        () => ({
          success: true,
          data: { intent: 'BUILD_PROJECT' },
          confidence: 0.9,
        })
      );
      registry.register(intentSkill);

      const workflowSkill = createMockSkill<string, { workflowYAML: string; intent: string }>(
        'vectahub.workflow',
        () => ({
          success: true,
          data: { 
            workflowYAML: 'version: "2.0"\nsteps:\n  - name: Build\n    exec: npm run build',
            intent: 'BUILD_PROJECT'
          },
          confidence: 0.85,
        })
      );
      registry.register(workflowSkill);

      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      const result = await processor.parse({
        input: 'build the project',
        options: { useLLM: true },
      });

      expect(result.success).toBe(true);
      expect(result.metadata.path).toBe('skill-pipeline');
      expect(result.metadata.usedSkills).toContain('vectahub.intent');
      expect(result.intent).toBe('BUILD_PROJECT');
    });

    it('should chain skills that return commands', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const intentSkill = createMockSkill<string, { intent: string }>(
        'vectahub.intent',
        () => ({
          success: true,
          data: { intent: 'BUILD_PROJECT' },
          confidence: 0.9,
        })
      );

      const workflowSkill = createMockSkill<string, { workflowYAML: string }>(
        'vectahub.workflow',
        () => ({
          success: true,
          data: { workflowYAML: 'version: "2.0"\nsteps:\n  - name: Build\n    exec: npm run build' },
          confidence: 0.85,
        })
      );

      registry.register(intentSkill);
      registry.register(workflowSkill);

      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      const result = await processor.parse({
        input: 'build the project',
        options: { useLLM: true },
      });

      expect(result.success).toBe(true);
      expect(result.metadata.usedSkills).toContain('vectahub.intent');
      expect(result.metadata.usedSkills).toContain('vectahub.workflow');
    });
  });

  describe('error handling', () => {
    it('should fallback on exception', async () => {
      const registry = createSkillRegistry();
      registry.register({
        id: 'broken-skill',
        name: 'Broken',
        version: '1.0.0',
        description: '',
        tags: ['broken', 'error', 'many-tags'],
        canHandle: async () => true,
        execute: async () => { throw new Error('boom'); },
      });

      const executor = createSkillExecutor({ maxRetries: 0 });

      const processor = createNLProcessor(registry, mockKeywordFallback, { executor });
      const result = await processor.parse({
        input: 'test',
        options: { useLLM: true },
      });

      expect(result.metadata.path).toBe('keyword-fallback');
    });
  });
});

describe('createTaskListFromWorkflow', () => {
  it('should parse workflow YAML and generate real tasks', async () => {
    const workflowYAML = YAML.stringify({
      name: 'Test Workflow',
      description: 'Test',
      mode: 'relaxed',
      steps: [
        { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
        { id: 'step2', type: 'exec', cli: 'ls', args: ['-la'] },
      ],
    });

    const registry = createSkillRegistry();
    const executor = createSkillExecutor();
    const patterns = adaptAllTemplates(INTENT_TEMPLATES);
    const keywordFallback = createKeywordFallback(patterns);
    
    const pipelineSkill: Skill<string, { workflowYAML: string }> = {
      id: 'vectahub.pipeline',
      name: 'Pipeline Skill',
      version: '1.0.0',
      description: 'Test',
      tags: [],
      canHandle: async () => true,
      execute: async () => ({
        success: true,
        data: { workflowYAML },
        confidence: 0.9,
      }),
    };
    registry.register(pipelineSkill);

    const nlProcessor = createNLProcessor(registry, keywordFallback, { executor });
    const result = await nlProcessor.parse({
      input: 'test workflow',
      options: { useLLM: true },
    });

    expect(result.taskList).toBeDefined();
    expect(result.taskList!.tasks.length).toBeGreaterThan(0);
    
    const commands = result.taskList!.tasks.flatMap(t => t.commands);
    expect(commands.some(c => c.cli === 'echo')).toBe(true);
    expect(commands.some(c => c.cli === 'ls')).toBe(true);
    expect(commands.some(c => c.args?.includes('hello'))).toBe(true);
    expect(commands.some(c => c.args?.includes('-la'))).toBe(true);
  });

  it('should parse multi-document YAML and extract first document', async () => {
    const workflowYAML = `name: "First Workflow"
description: "First"
mode: relaxed
steps:
  - id: step1
    type: exec
    cli: grep
    args: ["-c", "TODO", "/tmp/test.md"]
---
name: "Second Workflow"
description: "Second"
mode: relaxed
steps:
  - id: step2
    type: exec
    cli: wc
    args: ["-l", "/tmp/test.md"]`;

    const registry = createSkillRegistry();
    const executor = createSkillExecutor();
    const patterns = adaptAllTemplates(INTENT_TEMPLATES);
    const keywordFallback = createKeywordFallback(patterns);
    
    const pipelineSkill: Skill<string, { workflowYAML: string }> = {
      id: 'vectahub.pipeline',
      name: 'Pipeline Skill',
      version: '1.0.0',
      description: 'Test',
      tags: [],
      canHandle: async () => true,
      execute: async () => ({
        success: true,
        data: { workflowYAML },
        confidence: 0.9,
      }),
    };
    registry.register(pipelineSkill);

    const nlProcessor = createNLProcessor(registry, keywordFallback, { executor });
    const result = await nlProcessor.parse({
      input: 'test workflow',
      options: { useLLM: true },
    });

    expect(result.taskList).toBeDefined();
    expect(result.taskList!.tasks.length).toBe(1);
    
    const commands = result.taskList!.tasks.flatMap(t => t.commands);
    expect(commands.some(c => c.cli === 'grep')).toBe(true);
    expect(commands.some(c => c.args?.includes('TODO'))).toBe(true);
    expect(commands.some(c => c.cli === 'wc')).toBe(false);
  });
});
