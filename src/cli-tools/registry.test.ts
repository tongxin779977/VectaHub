import { describe, it, expect, beforeEach } from 'vitest';
import { getCliToolRegistry, resetRegistry, type CliToolRegistry, type CliTool } from './index.js';

describe('CLI Tool Registry', () => {
  let registry: CliToolRegistry;

  beforeEach(() => {
    resetRegistry();
    registry = getCliToolRegistry();
  });

  it('should create a singleton registry', () => {
    const r1 = getCliToolRegistry();
    const r2 = getCliToolRegistry();
    expect(r1).toBe(r2);
  });

  it('should register and retrieve a tool', () => {
    const tool: CliTool = {
      name: 'test-tool',
      description: 'A test tool',
      version: '>=1.0.0',
      commands: {
        run: {
          name: 'run',
          description: 'Run the tool',
          usage: 'test-tool run',
          examples: ['test-tool run'],
        },
      },
    };

    registry.register(tool);
    const retrieved = registry.getTool('test-tool');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test-tool');
    expect(retrieved?.description).toBe('A test tool');
  });

  it('should return all registered tools', () => {
    const tool1: CliTool = { name: 'tool1', description: 'Tool 1', version: '>=1.0.0', commands: {} };
    const tool2: CliTool = { name: 'tool2', description: 'Tool 2', version: '>=1.0.0', commands: {} };

    registry.register(tool1);
    registry.register(tool2);

    const tools = registry.getAllTools();
    expect(tools.length).toBe(2);
    expect(tools.map(t => t.name)).toContain('tool1');
    expect(tools.map(t => t.name)).toContain('tool2');
  });

  it('should return undefined for non-existent tool', () => {
    expect(registry.getTool('nonexistent')).toBeUndefined();
  });

  it('should detect dangerous commands', () => {
    const tool: CliTool = {
      name: 'git',
      description: 'Git',
      version: '>=2.0.0',
      dangerousCommands: ['push --force', 'reset --hard'],
      commands: {
        'push --force': {
          name: 'push --force',
          description: 'Force push',
          usage: 'git push --force',
          examples: [],
          dangerous: true,
          dangerLevel: 'high',
          requiresConfirmation: true,
        },
        status: {
          name: 'status',
          description: 'Show status',
          usage: 'git status',
          examples: [],
        },
      },
    };

    registry.register(tool);

    expect(registry.isCommandDangerous('git', 'push --force')).toBe(true);
    expect(registry.isCommandDangerous('git', 'status')).toBe(false);
    expect(registry.isCommandDangerous('nonexistent', 'push --force')).toBe(false);
  });

  it('should get command info', () => {
    const tool: CliTool = {
      name: 'docker',
      description: 'Docker',
      version: '>=20.0.0',
      commands: {
        rm: {
          name: 'rm',
          description: 'Remove a container',
          usage: 'docker rm <container>',
          examples: ['docker rm my-container'],
          dangerous: true,
          dangerLevel: 'medium',
        },
      },
    };

    registry.register(tool);

    const cmd = registry.getCommandInfo('docker', 'rm');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('rm');
    expect(cmd?.dangerous).toBe(true);
    expect(cmd?.dangerLevel).toBe('medium');
  });

  it('should return undefined for non-existent command info', () => {
    expect(registry.getCommandInfo('git', 'nonexistent')).toBeUndefined();
  });
});

describe('Git Tool Definition', () => {
  it('should have correct structure', async () => {
    const { gitTool } = await import('./tools/git.js');

    expect(gitTool.name).toBe('git');
    expect(gitTool.description).toBe('Distributed version control system');
    expect(gitTool.version).toBe('>=2.0.0');
    expect(gitTool.dangerousCommands).toContain('push --force');
    expect(gitTool.dangerousCommands).toContain('reset --hard');
    expect(gitTool.dangerousCommands).toContain('clean -fd');
    expect(gitTool.dangerousCommands).toContain('filter-branch');
    expect(gitTool.dangerousCommands).toContain('push --delete');
  });

  it('should have all required commands', async () => {
    const { gitTool } = await import('./tools/git.js');
    const requiredCommands = ['init', 'clone', 'add', 'commit', 'push', 'pull', 'fetch', 'merge', 'rebase', 'branch', 'checkout', 'switch', 'status', 'log', 'diff', 'reset', 'stash', 'tag', 'remote', 'clean'];

    for (const cmd of requiredCommands) {
      expect(gitTool.commands[cmd]).toBeDefined();
      expect(gitTool.commands[cmd].name).toBe(cmd);
      expect(gitTool.commands[cmd].description).toBeTruthy();
      expect(gitTool.commands[cmd].usage).toBeTruthy();
    }
  });

  it('should have dangerous commands properly marked', async () => {
    const { gitTool } = await import('./tools/git.js');

    expect(gitTool.commands['push --force']?.dangerous).toBe(true);
    expect(gitTool.commands['push --force']?.dangerLevel).toBe('high');
    expect(gitTool.commands['push --force']?.requiresConfirmation).toBe(true);

    expect(gitTool.commands['reset --hard']?.dangerous).toBe(true);
    expect(gitTool.commands['reset --hard']?.dangerLevel).toBe('high');
  });

  it('should register via registry', async () => {
    const { gitTool } = await import('./tools/git.js');
    const testRegistry = getCliToolRegistry();

    testRegistry.register(gitTool);

    expect(testRegistry.getTool('git')).toBe(gitTool);
    expect(testRegistry.isCommandDangerous('git', 'push --force')).toBe(true);
    expect(testRegistry.isCommandDangerous('git', 'pull')).toBe(false);
  });
});
