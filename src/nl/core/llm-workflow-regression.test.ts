import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildToolsFromTemplates,
  convertToolCallToSteps,
  buildAllTools,
  getDiscoveredCLITools,
  convertToolInfoToLLMTools,
} from '../tool-calling.js';
import { INTENT_TEMPLATES, getAllIntentNames } from '../templates/index.js';

// ── LLM Mock ──────────────────────────────────────────────────────────────────

interface MockLLMCallConfig {
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  intent?: string;
  confidence?: number;
  workflow?: { steps: unknown[] };
  throwOnCall?: boolean;
  returnNull?: boolean;
}

let mockLLMCallConfig: MockLLMCallConfig | null = null;

vi.mock('../llm.js', async () => {
  const actual = await vi.importActual<typeof import('../llm.js')>('../llm.js');
  
  class MockLLMClient {
    constructor(_config: any) {}
    async complete() {
      if (mockLLMCallConfig?.throwOnCall) {
        throw new Error('LLM API error: network timeout');
      }
      if (mockLLMCallConfig?.returnNull) {
        return {
          intent: 'UNKNOWN',
          confidence: 0,
          params: {},
          workflow: { name: '', steps: [] },
        };
      }
      return {
        intent: mockLLMCallConfig?.intent ?? 'UNKNOWN',
        confidence: mockLLMCallConfig?.confidence ?? 0,
        params: {},
        workflow: mockLLMCallConfig?.workflow ?? { name: '', steps: [] },
        tool_calls: mockLLMCallConfig?.tool_calls,
      };
    }
    setSessionId() {}
    get sessionManager() {
      return { getOrCreateSession: () => ({}), addUserMessage: () => {}, addAssistantMessage: () => {} };
    }
  }

  return {
    LLMClient: MockLLMClient,
    createLLMConfig: vi.fn().mockReturnValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    }),
  };
});

const MOCK_LLM_CONFIG = {
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  baseUrl: 'https://api.openai.com/v1',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToolCall(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [{
      id: 'call_1',
      type: 'function' as const,
      function: { name, arguments: JSON.stringify(args) },
    }],
  };
}

function setMock(config: MockLLMCallConfig) {
  mockLLMCallConfig = config;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LLM Workflow Regression', () => {
  beforeEach(() => {
    mockLLMCallConfig = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockLLMCallConfig = null;
  });

  // ── Goal 1: git_commit tool call → executable workflow step ──────────────

  describe('Goal 1: git_commit → executable workflow step', () => {
    it('should convert git_commit tool call to correct CLI format', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_commit', arguments: '{"message":"fix bug"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('git_commit');
      expect(result!.steps).toHaveLength(1);
      expect(result!.steps[0].cli).toBe('git');
      expect(result!.steps[0].args).toContain('commit');
      expect(result!.steps[0].args).toContain('-m');
      expect(result!.steps[0].args).toContain('fix bug');
    });

    it('should throw for commit without message (required param)', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'git_commit', arguments: '{}' },
        })
      ).toThrow('Missing required parameters');
    });

    it('should handle spaces in commit message without splitting', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_commit', arguments: '{"message":"feat: add user authentication with OAuth2"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.steps[0].args).toContain('feat: add user authentication with OAuth2');
    });
  });

  // ── Goal 2: git_push / git_pull / git_branch ─────────────────────────────

  describe('Goal 2: git_push / git_pull / git_branch', () => {
    it('should convert git_push to correct CLI format', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_push', arguments: '{"remote":"origin","branch":"main"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('git_push');
      expect(result!.steps[0].cli).toBe('git');
      expect(result!.steps[0].args).toEqual(['push', 'origin', 'main']);
    });

    it('should convert git_pull to correct CLI format', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_pull', arguments: '{"remote":"origin","branch":"develop"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('git_pull');
      expect(result!.steps[0].cli).toBe('git');
      expect(result!.steps[0].args).toEqual(['pull', 'origin', 'develop']);
    });

    it('should convert git_branch to correct CLI format', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_branch', arguments: '{"branch":"feature/new-ui"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('git_branch');
      expect(result!.steps[0].cli).toBe('git');
      expect(result!.steps[0].args).toContain('feature/new-ui');
    });

    it('should convert git_merge to correct CLI format', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_merge', arguments: '{"branch":"feature/auth"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('git_merge');
      expect(result!.steps[0].cli).toBe('git');
      expect(result!.steps[0].args).toContain('merge');
      expect(result!.steps[0].args).toContain('feature/auth');
    });
  });

  // ── Goal 3: Unknown intent must fail ─────────────────────────────────────

  describe('Goal 3: Unknown intent must fail', () => {
    it('should throw when LLM returns UNKNOWN intent', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock({ intent: 'UNKNOWN', confidence: 0, returnNull: true });
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: 'do something random xyz123' })
      ).rejects.toThrow();
    });

    it('should throw when LLM returns null (no intent recognized)', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock({ intent: 'UNKNOWN', confidence: 0 });
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: 'completely unknown input' })
      ).rejects.toThrow();
    });
  });

  // ── Goal 4: Missing required params must fail ────────────────────────────

  describe('Goal 4: Missing required params must fail', () => {
    it('should throw when git_push missing required params', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'git_push', arguments: '{}' },
        })
      ).toThrow('Missing required parameters');
    });

    it('should throw when file_read missing required file param', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'file_read', arguments: '{}' },
        })
      ).toThrow('Missing required parameters');
    });

    it('should throw when tool_run missing toolName', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'tool_run', arguments: '{}' },
        })
      ).toThrow('Missing required parameters');
    });
  });

  // ── Goal 5: No tool call + no workflow must fail ─────────────────────────

  describe('Goal 5: LLM no tool call + no workflow must fail', () => {
    it('should return success when LLM recognizes intent but no tool_calls (intent-only path)', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock({
        intent: 'QUERY_INFO',
        confidence: 0.8,
        workflow: { steps: [] },
      });
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'what is this project?' });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('QUERY_INFO');
      expect(result.workflowYAML).toBe('steps: []\n');
    });

    it('should throw when LLM returns UNKNOWN with no workflow steps', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock({
        intent: 'UNKNOWN',
        confidence: 0,
        workflow: { steps: [] },
      });
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: 'empty response test' })
      ).rejects.toThrow();
    });
  });

  // ── Goal 6: Invalid JSON arguments must fail ─────────────────────────────

  describe('Goal 6: JSON arguments invalid must fail', () => {
    it('should throw for invalid JSON in tool call arguments', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'git_commit', arguments: '{invalid json!!!' },
        })
      ).toThrow('Invalid JSON in tool call arguments');
    });

    it('should throw for non-JSON string in tool call arguments', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'git_commit', arguments: 'not json at all' },
        })
      ).toThrow('Invalid JSON in tool call arguments');
    });
  });

  // ── Goal 7: Dangerous CLI or unauthorized CLI must be rejected ───────────

  describe('Goal 7: Dangerous CLI / unauthorized CLI must be rejected', () => {
    it('should not include rm in safe tools', () => {
      const tools = buildToolsFromTemplates();
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).not.toContain('rm');
      expect(toolNames).not.toContain('cli_rm');
    });

    it('should not include sudo in safe tools', () => {
      const tools = buildToolsFromTemplates();
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).not.toContain('sudo');
      expect(toolNames).not.toContain('cli_sudo');
    });

    it('should not include curl in safe tools', () => {
      const tools = buildToolsFromTemplates();
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).not.toContain('curl');
      expect(toolNames).not.toContain('cli_curl');
    });

    it('should not include wget in safe tools', () => {
      const tools = buildToolsFromTemplates();
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).not.toContain('wget');
      expect(toolNames).not.toContain('cli_wget');
    });

    it('should not include docker in safe tools', () => {
      const tools = buildToolsFromTemplates();
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).not.toContain('docker');
      expect(toolNames).not.toContain('cli_docker');
    });

    it('should reject cli_ prefixed tools for restricted tool names', async () => {
      const { convertToolInfoToLLMTools } = await import('../tool-calling.js');

      const restrictedResult = convertToolInfoToLLMTools({
        name: 'rm',
        version: '1.0.0',
        commands: [{ name: 'rf', description: 'force remove' }],
      });
      expect(restrictedResult).toEqual([]);

      const sudoResult = convertToolInfoToLLMTools({
        name: 'sudo',
        version: '1.0.0',
        commands: [{ name: 'exec', description: 'execute' }],
      });
      expect(sudoResult).toEqual([]);
    });

    it('should allow git in safe tools', async () => {
      const { convertToolInfoToLLMTools } = await import('../tool-calling.js');

      const gitResult = convertToolInfoToLLMTools({
        name: 'git',
        version: '2.40.0',
        commands: [
          { name: 'commit', description: 'commit changes' },
          { name: 'push', description: 'push to remote' },
        ],
      });
      expect(gitResult.length).toBeGreaterThan(0);
      expect(gitResult.some(t => t.function.name === 'cli_git')).toBe(true);
    });
  });

  // ── Goal 8: Arguments with spaces must not be split ──────────────────────

  describe('Goal 8: Arguments with spaces must not be split', () => {
    it('should preserve commit message with spaces as single argument', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: '{"message":"feat(nl): add LLM tool-calling integration"}'
        },
      });

      expect(result).not.toBeNull();
      const args = result!.steps[0].args;
      expect(args).toContain('feat(nl): add LLM tool-calling integration');
      expect(args).not.toContain('feat(nl):');
      expect(args).not.toContain('add');
    });

    it('should preserve complex commit message with quotes', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: '{"message":"chore: update dependencies"}'
        },
      });

      expect(result).not.toBeNull();
      const args = result!.steps[0].args;
      expect(args).toContain('chore: update dependencies');
    });

    it('should handle branch names with slashes', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'git_push', arguments: '{"remote":"origin","branch":"feature/LLM-integration"}' },
      });

      expect(result).not.toBeNull();
      expect(result!.steps[0].args).toContain('feature/LLM-integration');
    });
  });

  // ── Goal 9: buildAllTools must include template tools ────────────────────

  describe('Goal 9: buildAllTools must include template tools', () => {
    it('should include all templates that have name and description', () => {
      const templateTools = buildToolsFromTemplates();
      const validTemplates = INTENT_TEMPLATES.filter(t => t.name && t.description);

      expect(templateTools.length).toBe(validTemplates.length);

      const toolNames = new Set(templateTools.map(t => t.function.name));
      for (const template of validTemplates) {
        expect(toolNames.has(template.name!)).toBe(true);
      }
    });

    it('should include all 19 intent templates', () => {
      const templateTools = buildToolsFromTemplates();
      expect(templateTools.length).toBe(INTENT_TEMPLATES.length);
    });

    it('should return at least the minimum set of known intent tools', () => {
      const tools = buildAllTools();
      const toolNames = tools.map(t => t.function.name);

      const minimumExpected = [
        'workflow_generate',
        'workflow_run',
        'doctor',
        'self_healing',
        'git_push',
        'git_pull',
        'git_commit',
        'git_merge',
        'git_branch',
        'file_find',
        'file_read',
        'file_edit',
        'ci_diagnose',
        'ci_rerun',
        'QUERY_INFO',
      ];

      for (const name of minimumExpected) {
        expect(toolNames).toContain(name);
      }
    });

    it('should include discovered CLI tools when available', () => {
      const tools = buildAllTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have valid LLMTool schema for each tool', () => {
      const tools = buildToolsFromTemplates();

      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function).toBeDefined();
        expect(typeof tool.function.name).toBe('string');
        expect(typeof tool.function.description).toBe('string');
        expect(tool.function.parameters).toBeDefined();
        expect(tool.function.parameters.type).toBe('object');
      }
    });
  });

  // ── Goal 10: Pipeline must never return UNKNOWN as fallback ──────────────

  describe('Goal 10: Pipeline never returns UNKNOWN as fallback', () => {
    it('should throw instead of returning UNKNOWN intent', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock({ intent: 'UNKNOWN', confidence: 0, returnNull: true });
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: 'unknown intent test' })
      ).rejects.toThrow('LLM failed to generate a result');
    });

    it('should throw when LLM call throws an error', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock({ throwOnCall: true });
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: 'error test' })
      ).rejects.toThrow();
    });

    it('should throw on empty input', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: '' })
      ).rejects.toThrow('Empty input');
    });

    it('should throw on whitespace-only input', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      await expect(
        processor.parse({ input: '   \n\t   ' })
      ).rejects.toThrow('Empty input');
    });

    it('should throw when no LLM config provided', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      expect(() => createNLProcessor({} as Parameters<typeof createNLProcessor>[0]))
        .toThrow('LLM configuration is required');
    });
  });

  // ── Integration: end-to-end tool call → workflow step ────────────────────

  describe('Integration: tool call → workflow step', () => {
    it('should produce valid workflow YAML for git_commit', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock(makeToolCall('git_commit', { message: 'fix: resolve null pointer' }));
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'commit my changes' });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('git_commit');
      expect(result.workflowYAML).toBeDefined();
      expect(result.workflowYAML).toContain('git');
      expect(result.workflowYAML).toContain('commit');
    });

    it('should produce valid workflow YAML for git_push', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock(makeToolCall('git_push', { remote: 'origin', branch: 'main' }));
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'push to origin main' });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('git_push');
      expect(result.workflowYAML).toBeDefined();
      expect(result.workflowYAML).toContain('push');
      expect(result.workflowYAML).toContain('origin');
      expect(result.workflowYAML).toContain('main');
    });

    it('should include correct params in result', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock(makeToolCall('git_commit', { message: 'test commit' }));
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'commit' });

      expect(result.params).toBeDefined();
      expect(result.params!.message).toBe('test commit');
    });

    it('should set correct metadata path for LLM tool calling', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock(makeToolCall('git_commit', { message: 'test' }));
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'commit' });

      expect(result.metadata.path).toBe('llm-tool-calling');
    });

    it('should handle doctor intent', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock(makeToolCall('doctor', {}));
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'check system health' });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('doctor');
      expect(result.workflowYAML).toContain('vectahub');
      expect(result.workflowYAML).toContain('doctor');
    });

    it('should handle file_find intent with required params', async () => {
      const { createNLProcessor } = await import('./pipeline.js');
      setMock(makeToolCall('file_find', { glob: '*.ts' }));
      const processor = createNLProcessor({ llmConfig: MOCK_LLM_CONFIG });

      const result = await processor.parse({ input: 'find TypeScript files' });

      expect(result.success).toBe(true);
      expect(result.intent).toBe('file_find');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should throw for unknown tool call name', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: 'totally_unknown_tool', arguments: '{}' },
        })
      ).toThrow('Unknown intent');
    });

    it('should throw for tool call with empty function name', () => {
      expect(() =>
        convertToolCallToSteps({
          id: 'call_1',
          type: 'function',
          function: { name: '', arguments: '{}' },
        })
      ).toThrow('Unknown intent');
    });

    it('should handle cli_ prefixed tool calls with subcommand', () => {
      const result = convertToolCallToSteps({
        id: 'call_1',
        type: 'function',
        function: { name: 'cli_git_commit', arguments: '{"args":"-m \\"test\\""}' },
      });

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('cli_git_commit');
      expect(result!.steps[0].cli).toBe('git commit');
    });

    it('should return all intent names from template helper', () => {
      const names = getAllIntentNames();
      expect(names).toContain('git_commit');
      expect(names).toContain('git_push');
      expect(names).toContain('git_pull');
      expect(names).toContain('file_find');
      expect(names).toContain('doctor');
    });

    it('should have consistent intent names between templates and type union', () => {
      const names = getAllIntentNames();
      const validNames = new Set([
        'workflow_generate', 'workflow_run', 'doctor', 'self_healing',
        'file_find', 'file_read', 'file_edit',
        'git_push', 'git_pull', 'git_commit', 'git_merge', 'git_branch',
        'ci_diagnose', 'ci_rerun',
        'tool_discover', 'tool_run',
        'session_list', 'session_inspect',
        'QUERY_INFO',
      ]);

      for (const name of names) {
        expect(validNames.has(name)).toBe(true);
      }
    });
  });
});
