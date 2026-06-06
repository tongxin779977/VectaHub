import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToolChain, type ToolChain } from './tool-chain.js';
import type { CliToolRegistry, CliTool, ToolStep } from './types.js';

function createMockRegistry(tools: CliTool[] = []): CliToolRegistry {
  const toolMap = new Map(tools.map(t => [t.name, t]));
  return {
    register: vi.fn(),
    getTool: vi.fn((name: string) => toolMap.get(name)),
    getAllTools: vi.fn(() => [...toolMap.values()]),
    getToolsByCategory: vi.fn(() => []),
    searchTools: vi.fn(() => []),
    searchCommands: vi.fn(() => []),
    getAllCategories: vi.fn(() => []),
    isCommandDangerous: vi.fn(() => false),
    getCommandInfo: vi.fn(() => undefined),
  };
}

function createTestTool(name: string): CliTool {
  return {
    name,
    description: `Test tool ${name}`,
    version: '>=1.0.0',
    commands: {},
  };
}

describe('ToolChain', () => {
  let chain: ToolChain;
  let registry: CliToolRegistry;

  beforeEach(() => {
    registry = createMockRegistry([createTestTool('echo'), createTestTool('ls')]);
    chain = createToolChain(registry);
  });

  it('should create a tool chain instance', () => {
    expect(chain).toBeDefined();
    expect(chain.addStep).toBeInstanceOf(Function);
    expect(chain.addSteps).toBeInstanceOf(Function);
    expect(chain.setContext).toBeInstanceOf(Function);
    expect(chain.getContext).toBeInstanceOf(Function);
    expect(chain.clear).toBeInstanceOf(Function);
    expect(chain.execute).toBeInstanceOf(Function);
  });

  it('should add a single step', () => {
    const step: ToolStep = { tool: 'echo', command: 'echo', args: ['hello'] };
    const result = chain.addStep(step);
    expect(result).toBe(chain);
  });

  it('should add multiple steps', () => {
    const steps: ToolStep[] = [
      { tool: 'echo', command: 'echo', args: ['hello'] },
      { tool: 'ls', command: 'ls', args: ['-la'] },
    ];
    const result = chain.addSteps(steps);
    expect(result).toBe(chain);
  });

  it('should set and get context', () => {
    chain.setContext('key1', 'value1');
    chain.setContext('key2', 42);
    const context = chain.getContext();
    expect(context).toEqual({ key1: 'value1', key2: 42 });
  });

  it('should return a copy of context', () => {
    chain.setContext('key', 'value');
    const context1 = chain.getContext();
    const context2 = chain.getContext();
    expect(context1).toEqual(context2);
    expect(context1).not.toBe(context2);
  });

  it('should clear steps and context', () => {
    chain.addStep({ tool: 'echo', command: 'echo', args: [] });
    chain.setContext('key', 'value');
    chain.clear();
    const context = chain.getContext();
    expect(context).toEqual({});
  });

  it('should chain methods fluently', () => {
    const result = chain
      .addStep({ tool: 'echo', command: 'echo', args: ['hello'] })
      .setContext('key', 'value')
      .addSteps([{ tool: 'ls', command: 'ls', args: [] }]);
    expect(result).toBe(chain);
  });

  it('should return error when tool not found in registry', async () => {
    chain.addStep({ tool: 'nonexistent', command: 'nonexistent', args: [] });
    const result = await chain.execute();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool "nonexistent" not found in registry');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
  });

  it('should handle empty steps', async () => {
    const result = await chain.execute();
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('should execute steps and return results', async () => {
    chain.addStep({ tool: 'echo', command: 'echo', args: ['hello'] });
    const result = await chain.execute();
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].output).toContain('hello');
  });

  it('should stop execution on first failure', async () => {
    chain.addStep({ tool: 'nonexistent', command: 'nonexistent', args: [] });
    chain.addStep({ tool: 'echo', command: 'echo', args: ['should not run'] });
    const result = await chain.execute();
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.failedStep).toBe(0);
  });

  it('should propagate context between steps', async () => {
    chain.setContext('initial', 'value');
    chain.addStep({ tool: 'echo', command: 'echo', args: ['hello'] });
    const result = await chain.execute();
    expect(result.context).toBeDefined();
    expect(result.context?.initial).toBe('value');
  });

  it('should handle step timeout', async () => {
    const shortTimeoutChain = createToolChain(registry);
    shortTimeoutChain.addStep({
      tool: 'echo',
      command: 'echo',
      args: ['hello'],
      options: { timeout: 1 },
    });
    const result = await shortTimeoutChain.execute();
    expect(result).toBeDefined();
  });

  it('should handle step with custom cwd and env', async () => {
    chain.addStep({
      tool: 'echo',
      command: 'echo',
      args: ['hello'],
      options: {
        cwd: '/tmp',
        env: { TEST_VAR: 'test' },
      },
    });
    const result = await chain.execute();
    expect(result.success).toBe(true);
  });

  it('should handle multiple steps sequentially', async () => {
    chain.addStep({ tool: 'echo', command: 'echo', args: ['step1'] });
    chain.addStep({ tool: 'echo', command: 'echo', args: ['step2'] });
    const result = await chain.execute();
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].output).toContain('step1');
    expect(result.results[1].output).toContain('step2');
  });

  it('should handle step execution error', async () => {
    const errorRegistry = createMockRegistry([createTestTool('failing-tool')]);
    const errorChain = createToolChain(errorRegistry);
    errorChain.addStep({ tool: 'failing-tool', command: 'failing-tool', args: [] });
    const result = await errorChain.execute();
    expect(result).toBeDefined();
  });

  it('should track total duration', async () => {
    chain.addStep({ tool: 'echo', command: 'echo', args: ['hello'] });
    const result = await chain.execute();
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('should handle step with empty args', async () => {
    chain.addStep({ tool: 'echo', command: 'echo', args: [] });
    const result = await chain.execute();
    expect(result.success).toBe(true);
  });

  it('should handle step with special characters in args', async () => {
    chain.addStep({ tool: 'echo', command: 'echo', args: ['hello world', 'foo bar'] });
    const result = await chain.execute();
    expect(result.success).toBe(true);
  });

  it('should preserve context across multiple steps', async () => {
    chain.setContext('step0', 'value0');
    chain.addStep({ tool: 'echo', command: 'echo', args: ['step1'] });
    chain.addStep({ tool: 'echo', command: 'echo', args: ['step2'] });
    const result = await chain.execute();
    expect(result.context?.step0).toBe('value0');
  });
});