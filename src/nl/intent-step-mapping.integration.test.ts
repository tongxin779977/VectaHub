import { describe, it, expect } from 'vitest';
import { buildToolsFromTemplates, buildAllTools, convertToolCallToSteps } from './tool-calling.js';
import { createIntentStepMapper } from './intent-step-mapping.js';
import { INTENT_TEMPLATES } from './templates/index.js';
import { EXTRA_INTENT_MAPPINGS } from './tool-calling.js';
import type { Step } from '../types/index.js';

type ToolSchema = { name: string; requiredParams: string[]; properties: string[] };

function extractToolSchemas(): ToolSchema[] {
  const tools = buildToolsFromTemplates();
  return tools.map(tool => ({
    name: tool.function.name,
    requiredParams: (tool.function.parameters.required as string[]) ?? [],
    properties: Object.keys(tool.function.parameters.properties as Record<string, unknown>),
  }));
}

const NON_EXEC_INTENTS = new Set(['QUERY_INFO']);

describe('Intent-to-Workflow Mapping Drift Tests', () => {
  describe('1. Schema Coverage: every executable intent must have a mapping', () => {
    const mapper = createIntentStepMapper(EXTRA_INTENT_MAPPINGS);
    const schemas = extractToolSchemas();
    const registeredIntents = mapper.getRegisteredIntents();

    for (const schema of schemas) {
      if (NON_EXEC_INTENTS.has(schema.name)) continue;

      it(`${schema.name} from tool schema must exist in mapper`, () => {
        expect(registeredIntents).toContain(schema.name);
      });
    }
  });

  describe('2. Reverse Isolation: every mapper intent must exist in tool schema', () => {
    const mapper = createIntentStepMapper(EXTRA_INTENT_MAPPINGS);
    const schemas = extractToolSchemas();
    const schemaNames = new Set(schemas.map(s => s.name));

    for (const intent of mapper.getRegisteredIntents()) {
      if (NON_EXEC_INTENTS.has(intent)) continue;

      it(`${intent} from mapper must exist in tool schema`, () => {
        expect(schemaNames).toContain(intent);
      });
    }
  });

  describe('3. Step Format Contract: generated steps must match executor expectations', () => {
    const mapper = createIntentStepMapper(EXTRA_INTENT_MAPPINGS);
    const schemas = extractToolSchemas();

    const testCases: Array<{ intent: string; params: Record<string, unknown>; expectedCLI: string; expectedArgs: string[] }> = [
      { intent: 'git_commit', params: { message: 'fix: null pointer' }, expectedCLI: 'git', expectedArgs: ['commit', '-m', 'fix: null pointer'] },
      { intent: 'git_push', params: { remote: 'origin', branch: 'main' }, expectedCLI: 'git', expectedArgs: ['push', 'origin', 'main'] },
      { intent: 'git_pull', params: { remote: 'origin', branch: 'develop' }, expectedCLI: 'git', expectedArgs: ['pull', 'origin', 'develop'] },
      { intent: 'git_branch', params: { branch: 'feature/auth' }, expectedCLI: 'git', expectedArgs: ['branch', 'feature/auth'] },
      { intent: 'git_merge', params: { branch: 'feature/login' }, expectedCLI: 'git', expectedArgs: ['merge', 'feature/login'] },
      { intent: 'doctor', params: {}, expectedCLI: 'vectahub', expectedArgs: ['doctor'] },
      { intent: 'self_healing', params: {}, expectedCLI: 'vectahub', expectedArgs: ['self-heal'] },
      { intent: 'file_find', params: { glob: '*.ts' }, expectedCLI: 'ls', expectedArgs: ['*.ts'] },
      { intent: 'file_read', params: { file: 'package.json' }, expectedCLI: 'cat', expectedArgs: ['package.json'] },
      { intent: 'ci_diagnose', params: {}, expectedCLI: 'vectahub', expectedArgs: ['ci', 'diagnose'] },
      { intent: 'ci_rerun', params: { pipelineId: '123' }, expectedCLI: 'vectahub', expectedArgs: ['ci', 'rerun', '123'] },
      { intent: 'tool_discover', params: {}, expectedCLI: 'vectahub', expectedArgs: ['tools', 'list'] },
      { intent: 'session_list', params: {}, expectedCLI: 'vectahub', expectedArgs: ['session', 'list'] },
      { intent: 'session_inspect', params: { sessionId: 'abc' }, expectedCLI: 'vectahub', expectedArgs: ['session', 'inspect', 'abc'] },
      { intent: 'workflow_generate', params: { description: 'CI pipeline' }, expectedCLI: 'vectahub', expectedArgs: ['workflow', 'generate', 'CI pipeline'] },
      { intent: 'workflow_run', params: { workflowId: 'wf-1' }, expectedCLI: 'vectahub', expectedArgs: ['workflow', 'run', 'wf-1'] },
      { intent: 'vscode_diagnostic', params: {}, expectedCLI: 'vectahub', expectedArgs: ['vscode', 'diagnostic'] },
      { intent: 'self_healing_run', params: {}, expectedCLI: 'vectahub', expectedArgs: ['self-heal', 'run'] },
    ];

    for (const tc of testCases) {
      it(`${tc.intent} generates correct step structure`, () => {
        const step = mapper.toStep(tc.intent, tc.params);

        expect(step.id).toBeDefined();
        expect(step.type).toBe('exec');
        expect(step.cli).toBe(tc.expectedCLI);
        expect(step.args).toEqual(tc.expectedArgs);

        if (!Array.isArray(step.args)) {
          throw new Error(`Step args must be an array, got ${typeof step.args}`);
        }
        if (typeof step.cli !== 'string' || step.cli.trim() === '') {
          throw new Error(`Step cli must be a non-empty string`);
        }
      });
    }

    it('message with spaces stays as single arg element', () => {
      const step = mapper.toStep('git_commit', { message: 'feat(scope): add login feature [JIRA-456]' });
      expect(step.args).toHaveLength(3);
      expect(step.args[2]).toBe('feat(scope): add login feature [JIRA-456]');
    });

    it('path with spaces stays as single arg element', () => {
      const step = mapper.toStep('file_read', { file: 'src/my file.ts' });
      expect(step.args).toContain('src/my file.ts');
    });
  });

  describe('4. Exception Boundaries: unknown intent and missing params must fail', () => {
    const mapper = createIntentStepMapper(EXTRA_INTENT_MAPPINGS);

    it('unknown intent must throw with clear error', () => {
      expect(() => mapper.toStep('totally_unknown', {})).toThrow('Unknown intent');
    });

    it('empty string intent must throw', () => {
      expect(() => mapper.toStep('', {})).toThrow('Unknown intent');
    });

    it('intent resembling CLI command must not be executed', () => {
      expect(() => mapper.toStep('rm -rf /', {})).toThrow('Unknown intent');
    });

    it('intent resembling dangerous command must not be executed', () => {
      expect(() => mapper.toStep('sudo apt install', {})).toThrow('Unknown intent');
    });

    describe('required params validation for each executable intent', () => {
      const schemas = extractToolSchemas();

      for (const schema of schemas) {
        if (schema.requiredParams.length === 0) continue;
        if (NON_EXEC_INTENTS.has(schema.name)) continue;

        it(`${schema.name} must fail when all required params missing`, () => {
          expect(() => mapper.toStep(schema.name, {})).toThrow('Missing required parameters');
        });

        for (const requiredParam of schema.requiredParams) {
          it(`${schema.name} must fail when "${requiredParam}" is missing`, () => {
            const partialParams: Record<string, unknown> = {};
            for (const other of schema.requiredParams) {
              if (other !== requiredParam) {
                partialParams[other] = 'value';
              }
            }
            expect(() => mapper.toStep(schema.name, partialParams)).toThrow('Missing required parameters');
          });
        }
      }
    });

    it('null params must be handled gracefully', () => {
      expect(() => mapper.toStep('git_commit', null as any)).toThrow();
    });

    it('undefined params must be handled gracefully', () => {
      expect(() => mapper.toStep('git_push', undefined as any)).toThrow();
    });

    it('CLI not in allowlist must be rejected', () => {
      const unsafeMapper = createIntentStepMapper({
        unsafe_run: { type: 'exec', cli: '{{tool}}', args: ['{{args}}'], required: ['tool'] },
      });
      expect(() => unsafeMapper.toStep('unsafe_run', { tool: 'malicious' })).toThrow('not in the allowed list');
    });
  });

  describe('5. End-to-End: convertToolCallToSteps pipeline integration', () => {
    it('git_commit tool call produces valid workflow step', () => {
      const result = convertToolCallToSteps({
        id: 'test_1',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: JSON.stringify({ message: 'fix bug' }),
        },
      });

      expect(result.steps).toHaveLength(1);
      const step = result.steps[0] as Step;
      expect(step.type).toBe('exec');
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['commit', '-m', 'fix bug']);
    });

    it('git_push tool call produces valid workflow step', () => {
      const result = convertToolCallToSteps({
        id: 'test_2',
        type: 'function',
        function: {
          name: 'git_push',
          arguments: JSON.stringify({ remote: 'origin', branch: 'main' }),
        },
      });

      expect(result.steps).toHaveLength(1);
      const step = result.steps[0] as Step;
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['push', 'origin', 'main']);
    });

    it('invalid JSON arguments must throw', () => {
      expect(() => convertToolCallToSteps({
        id: 'test_bad',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: '{invalid json',
        },
      })).toThrow('Invalid JSON');
    });

    it('missing required params must throw', () => {
      expect(() => convertToolCallToSteps({
        id: 'test_missing',
        type: 'function',
        function: {
          name: 'git_push',
          arguments: JSON.stringify({}),
        },
      })).toThrow('Missing required parameters');
    });

    it('unknown intent must throw', () => {
      expect(() => convertToolCallToSteps({
        id: 'test_unknown',
        type: 'function',
        function: {
          name: 'unknown_intent_xyz',
          arguments: JSON.stringify({}),
        },
      })).toThrow('Unknown intent');
    });
  });

  describe('6. Mapping consistency: tool schema params must match mapping required params', () => {
    const mapper = createIntentStepMapper(EXTRA_INTENT_MAPPINGS);
    const schemas = extractToolSchemas();
    const registeredIntents = new Set(mapper.getRegisteredIntents());

    for (const schema of schemas) {
      if (!registeredIntents.has(schema.name)) continue;
      if (NON_EXEC_INTENTS.has(schema.name)) continue;

      it(`${schema.name}: tool schema requiredParams must be covered by mapping required`, () => {
        const mappingRequired = EXTRA_INTENT_MAPPINGS[schema.name]?.required ?? [];
        for (const requiredParam of schema.requiredParams) {
          expect(mappingRequired).toContain(requiredParam);
        }
      });
    }
  });

  describe('7. buildAllTools must include at least template tools', () => {
    it('buildAllTools returns non-empty list', () => {
      const allTools = buildAllTools();
      expect(allTools.length).toBeGreaterThan(0);
    });

    it('all template intents appear in buildAllTools', () => {
      const allTools = buildAllTools();
      const allToolNames = new Set(allTools.map(t => t.function.name));

      for (const template of INTENT_TEMPLATES) {
        const name = template.name ?? template.intent;
        expect(allToolNames).toContain(name);
      }
    });
  });
});
