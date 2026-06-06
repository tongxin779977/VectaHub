import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolService, getToolService, resetToolService, type ToolServiceOptions, type ToolServiceDeps } from './tool-service.js';
import type { CliToolRegistry, CliTool } from './types.js';

function createMockRegistry(): CliToolRegistry {
  const tools = new Map<string, CliTool>();
  return {
    register: vi.fn((tool: CliTool) => tools.set(tool.name, tool)),
    getTool: vi.fn((name: string) => tools.get(name)),
    getAllTools: vi.fn(() => [...tools.values()]),
    getToolsByCategory: vi.fn((category: string) => 
      [...tools.values()].filter(t => t.category === category)
    ),
    searchTools: vi.fn(() => []),
    searchCommands: vi.fn(() => []),
    getAllCategories: vi.fn(() => [...new Set([...tools.values()].map(t => t.category).filter(Boolean))] as string[]),
    isCommandDangerous: vi.fn(() => false),
    getCommandInfo: vi.fn(() => undefined),
  };
}

function createTestTool(name: string, category?: string): CliTool {
  return {
    name,
    description: `Test tool ${name}`,
    version: '>=1.0.0',
    category,
    commands: {},
  };
}

describe('ToolService', () => {
  let registry: CliToolRegistry;
  let deps: ToolServiceDeps;

  beforeEach(() => {
    registry = createMockRegistry();
    deps = { logger: { warn: vi.fn() } };
    resetToolService();
  });

  it('should create a ToolService instance', () => {
    const service = new ToolService(registry, {}, deps);
    expect(service).toBeDefined();
    expect(service.getRegistry()).toBe(registry);
  });

  it('should register a tool', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tool = createTestTool('test-tool');
    service.register(tool);
    expect(registry.register).toHaveBeenCalledWith(tool);
  });

  it('should register multiple tools', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tools = [createTestTool('tool1'), createTestTool('tool2')];
    service.registerMany(tools);
    expect(registry.register).toHaveBeenCalledTimes(2);
  });

  it('should get a tool by name', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tool = createTestTool('test-tool');
    registry.register(tool);
    const retrieved = service.getTool('test-tool');
    expect(retrieved).toBe(tool);
  });

  it('should return undefined for non-existent tool', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const retrieved = service.getTool('nonexistent');
    expect(retrieved).toBeUndefined();
  });

  it('should get all tools', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tools = [createTestTool('tool1'), createTestTool('tool2')];
    tools.forEach(t => registry.register(t));
    const allTools = service.getAllTools();
    expect(allTools).toHaveLength(2);
  });

  it('should get tools by category', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tools = [
      createTestTool('tool1', 'cat1'),
      createTestTool('tool2', 'cat1'),
      createTestTool('tool3', 'cat2'),
    ];
    tools.forEach(t => registry.register(t));
    const cat1Tools = service.getToolsByCategory('cat1');
    expect(cat1Tools).toHaveLength(2);
  });

  it('should get all categories', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tools = [
      createTestTool('tool1', 'cat1'),
      createTestTool('tool2', 'cat2'),
    ];
    tools.forEach(t => registry.register(t));
    const categories = service.getAllCategories();
    expect(categories).toContain('cat1');
    expect(categories).toContain('cat2');
  });

  it('should search tools', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    service.searchTools('test');
    expect(registry.searchTools).toHaveBeenCalledWith('test');
  });

  it('should check if command is dangerous', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    service.isCommandDangerous('git', 'push --force');
    expect(registry.isCommandDangerous).toHaveBeenCalledWith('git', 'push --force');
  });

  it('should get command info', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    service.getCommandInfo('git', 'commit');
    expect(registry.getCommandInfo).toHaveBeenCalledWith('git', 'commit');
  });

  it('should include builtin tools by default', () => {
    const service = new ToolService(registry, {}, deps);
    expect(registry.register).toHaveBeenCalled();
  });

  it('should not include builtin tools when disabled', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    expect(registry.register).not.toHaveBeenCalled();
  });

  it('should get discovery summary', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tools = [
      createTestTool('tool1', 'cat1'),
      createTestTool('tool2', 'cat1'),
      createTestTool('tool3', 'cat2'),
    ];
    tools.forEach(t => registry.register(t));
    const summary = service.getDiscoverySummary();
    expect(summary.totalRegistered).toBe(3);
    expect(summary.categories).toContain('cat1');
    expect(summary.categories).toContain('cat2');
    expect(summary.toolsByCategory['cat1']).toContain('tool1');
    expect(summary.toolsByCategory['cat1']).toContain('tool2');
    expect(summary.toolsByCategory['cat2']).toContain('tool3');
  });

  it('should handle uncategorized tools in discovery summary', () => {
    const service = new ToolService(registry, { includeBuiltin: false }, deps);
    const tool = createTestTool('uncategorized-tool');
    registry.register(tool);
    const summary = service.getDiscoverySummary();
    expect(summary.toolsByCategory['uncategorized']).toContain('uncategorized-tool');
  });

  it('should log warning when builtin tool registration fails', () => {
    const warnSpy = vi.fn();
    const failingRegistry: CliToolRegistry = {
      ...registry,
      register: vi.fn(() => { throw new Error('Registration failed'); }),
    };
    const service = new ToolService(failingRegistry, { includeBuiltin: true }, { logger: { warn: warnSpy } });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should use default options when not provided', () => {
    const service = new ToolService(registry, undefined, deps);
    expect(service).toBeDefined();
  });

  it('should use default deps when not provided', () => {
    const service = new ToolService(registry, { includeBuiltin: false });
    expect(service).toBeDefined();
  });
});

describe('getToolService', () => {
  beforeEach(() => {
    resetToolService();
  });

  it('should return a singleton ToolService', () => {
    const service1 = getToolService();
    const service2 = getToolService();
    expect(service1).toBe(service2);
  });

  it('should create new instance after reset', () => {
    const service1 = getToolService();
    resetToolService();
    const service2 = getToolService();
    expect(service1).not.toBe(service2);
  });

  it('should pass options to constructor', () => {
    const service = getToolService({ includeBuiltin: false });
    expect(service).toBeDefined();
  });

  it('should pass deps to constructor', () => {
    const warnSpy = vi.fn();
    const service = getToolService({ includeBuiltin: false }, { logger: { warn: warnSpy } });
    expect(service).toBeDefined();
  });
});

describe('resetToolService', () => {
  it('should reset the global ToolService instance', () => {
    const service1 = getToolService();
    resetToolService();
    const service2 = getToolService();
    expect(service1).not.toBe(service2);
  });

  it('should not throw when called multiple times', () => {
    expect(() => {
      resetToolService();
      resetToolService();
    }).not.toThrow();
  });
});