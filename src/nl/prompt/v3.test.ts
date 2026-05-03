import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createPromptRegistryV3 } from './v3.js';
import type { PromptExample } from './types.js';

describe('PromptRegistryV3', () => {
  let registry: ReturnType<typeof createPromptRegistryV3>;
  let tmpDir: string;

  beforeEach(() => {
    registry = createPromptRegistryV3();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-prompt-test-'));
  });

  describe('register and get', () => {
    it('should register and retrieve a prompt', () => {
      registry.register({
        id: 'test-1',
        name: 'Test Prompt',
        version: '1.0.0',
        description: 'A test prompt',
        category: 'testing',
        tags: ['test'],
        systemTemplate: 'You are a test assistant.',
        userTemplate: '{{input}}',
        variables: [{ name: 'input', type: 'string', required: true }],
        metadata: {
          author: 'Test',
          createdAt: new Date('2026-05-01'),
          lastUpdated: new Date('2026-05-01'),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      const prompt = registry.get('test-1');
      expect(prompt).toBeDefined();
      expect(prompt!.id).toBe('test-1');
      expect(prompt!.name).toBe('Test Prompt');
    });

    it('should return undefined for non-existent prompt', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list all prompts when no category specified', () => {
      const prompts = registry.list();
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should filter prompts by category', () => {
      const parsingPrompts = registry.list('parsing');
      for (const p of parsingPrompts) {
        expect(p.category).toBe('parsing');
      }
    });
  });

  describe('build', () => {
    it('should render system and user templates with variables', async () => {
      registry.register({
        id: 'build-test',
        name: 'Build Test',
        version: '1.0.0',
        description: 'Build test',
        category: 'test',
        tags: [],
        systemTemplate: 'Intent list: {{intentList}}',
        userTemplate: 'User said: {{userInput}}',
        variables: [
          { name: 'intentList', type: 'string', required: true },
          { name: 'userInput', type: 'string', required: true },
        ],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      const result = await registry.build('build-test', {
        intentList: 'FILE_FIND, GIT_WORKFLOW',
        userInput: 'find all ts files',
      });

      expect(result.system).toBe('Intent list: FILE_FIND, GIT_WORKFLOW');
      expect(result.user).toBe('User said: find all ts files');
    });

    it('should throw for non-existent prompt', async () => {
      await expect(registry.build('non-existent', {})).rejects.toThrow('not found');
    });

    it('should throw when required variable is missing', async () => {
      registry.register({
        id: 'required-test',
        name: 'Required Test',
        version: '1.0.0',
        description: 'Test',
        category: 'test',
        tags: [],
        systemTemplate: '{{requiredVar}}',
        userTemplate: 'test',
        variables: [
          { name: 'requiredVar', type: 'string', required: true },
        ],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      await expect(registry.build('required-test', {})).rejects.toThrow('requiredVar');
    });

    it('should use default values for optional variables', async () => {
      registry.register({
        id: 'default-test',
        name: 'Default Test',
        version: '1.0.0',
        description: 'Test',
        category: 'test',
        tags: [],
        systemTemplate: 'Mode: {{mode}}',
        userTemplate: '{{input}}',
        variables: [
          { name: 'mode', type: 'string', required: false, default: 'relaxed' },
          { name: 'input', type: 'string', required: true },
        ],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      const result = await registry.build('default-test', { input: 'hello' });
      expect(result.system).toBe('Mode: relaxed');
      expect(result.user).toBe('hello');
    });

    it('should stringify object variables as JSON', async () => {
      registry.register({
        id: 'object-test',
        name: 'Object Test',
        version: '1.0.0',
        description: 'Test',
        category: 'test',
        tags: [],
        systemTemplate: 'Data: {{data}}',
        userTemplate: 'test',
        variables: [
          { name: 'data', type: 'object', required: true },
        ],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      const result = await registry.build('object-test', {
        data: { key: 'value' },
      });
      expect(result.system).toContain('"key": "value"');
    });

    it('should increment uses counter after build', async () => {
      registry.register({
        id: 'uses-test',
        name: 'Uses Test',
        version: '1.0.0',
        description: 'Test',
        category: 'test',
        tags: [],
        systemTemplate: 'test',
        userTemplate: '{{input}}',
        variables: [
          { name: 'input', type: 'string', required: true },
        ],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      await registry.build('uses-test', { input: 'hello' });
      const prompt = registry.get('uses-test');
      expect(prompt!.metadata.uses).toBe(1);
    });
  });

  describe('loadFromDirectory', () => {
    it('should load prompts from JSON files', async () => {
      const promptData = {
        id: 'loaded-json',
        name: 'Loaded JSON',
        version: '1.0.0',
        description: 'Loaded from JSON',
        category: 'test',
        tags: ['loaded'],
        systemTemplate: 'System {{var}}',
        userTemplate: 'User {{var}}',
        variables: [
          { name: 'var', type: 'string', required: true },
        ],
        metadata: {
          author: 'Test',
          createdAt: '2026-05-01',
          lastUpdated: '2026-05-01',
          effectiveness: 0.8,
          uses: 0,
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'prompt.json'), JSON.stringify(promptData));
      await registry.loadFromDirectory(tmpDir);

      const loaded = registry.get('loaded-json');
      expect(loaded).toBeDefined();
      expect(loaded!.name).toBe('Loaded JSON');
    });

    it('should load prompts from YAML files', async () => {
      const yamlContent = `
id: loaded-yaml
name: Loaded YAML
version: '1.0.0'
description: Loaded from YAML
category: test
tags:
  - loaded
systemTemplate: 'System {{var}}'
userTemplate: 'User {{var}}'
variables:
  - name: var
    type: string
    required: true
metadata:
  author: Test
  createdAt: '2026-05-01'
  lastUpdated: '2026-05-01'
  effectiveness: 0.8
  uses: 0
`;
      fs.writeFileSync(path.join(tmpDir, 'prompt.yaml'), yamlContent);
      await registry.loadFromDirectory(tmpDir);

      const loaded = registry.get('loaded-yaml');
      expect(loaded).toBeDefined();
      expect(loaded!.name).toBe('Loaded YAML');
    });

    it('should not throw when directory does not exist', async () => {
      await expect(
        registry.loadFromDirectory('/non/existent/path')
      ).resolves.not.toThrow();
    });

    it('should recursively walk subdirectories', async () => {
      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);

      const promptData = {
        id: 'nested-prompt',
        name: 'Nested',
        version: '1.0.0',
        description: 'Nested prompt',
        category: 'test',
        tags: [],
        systemTemplate: 'test',
        userTemplate: '{{input}}',
        variables: [{ name: 'input', type: 'string', required: true }],
        metadata: {
          author: 'Test',
          createdAt: '2026-05-01',
          lastUpdated: '2026-05-01',
          effectiveness: 0.8,
          uses: 0,
        },
      };

      fs.writeFileSync(path.join(subDir, 'nested.json'), JSON.stringify(promptData));
      await registry.loadFromDirectory(tmpDir);

      expect(registry.get('nested-prompt')).toBeDefined();
    });
  });

  describe('evaluate', () => {
    it('should return success for matching output', async () => {
      registry.register({
        id: 'eval-test',
        name: 'Eval Test',
        version: '1.0.0',
        description: 'Test',
        category: 'test',
        tags: [],
        systemTemplate: 'test',
        userTemplate: '{{input}}',
        variables: [{ name: 'input', type: 'string', required: true }],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      const result = await registry.evaluate('eval-test', [
        {
          input: { input: 'hello' },
          output: 'expected output',
        },
      ]);

      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should return failure for non-matching output', async () => {
      registry.register({
        id: 'eval-fail',
        name: 'Eval Fail',
        version: '1.0.0',
        description: 'Test',
        category: 'test',
        tags: [],
        systemTemplate: 'test',
        userTemplate: '{{input}}',
        variables: [{ name: 'input', type: 'string', required: true }],
        metadata: {
          author: 'Test',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
        },
      });

      const testCase = { input: { input: 'hello' }, output: 'expected', validator: 'always_fail' };
      const result = await registry.evaluate('eval-fail', [testCase as unknown as PromptExample]);

      expect(result.success).toBe(false);
      expect(result.failedTests).toBe(1);
    });
  });

  describe('builtin prompts', () => {
    it('should have intent-parser-v3', () => {
      const p = registry.get('intent-parser-v3');
      expect(p).toBeDefined();
      expect(p!.category).toBe('parsing');
    });

    it('should have command-generator-v3', () => {
      const p = registry.get('command-generator-v3');
      expect(p).toBeDefined();
      expect(p!.category).toBe('generation');
    });

    it('should have workflow-generator-v3', () => {
      const p = registry.get('workflow-generator-v3');
      expect(p).toBeDefined();
      expect(p!.category).toBe('workflow');
    });

    it('should have git-workflow-v1', () => {
      const p = registry.get('git-workflow-v1');
      expect(p).toBeDefined();
      expect(p!.category).toBe('assistant');
    });

    it('should have npm-script-v1', () => {
      const p = registry.get('npm-script-v1');
      expect(p).toBeDefined();
      expect(p!.category).toBe('assistant');
    });

    it('should have code-review-v1', () => {
      const p = registry.get('code-review-v1');
      expect(p).toBeDefined();
      expect(p!.category).toBe('assistant');
    });
  });
});
