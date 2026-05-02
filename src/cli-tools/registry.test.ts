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

  it('should get tools by category', () => {
    const tool1: CliTool = { 
      name: 'tool1', 
      description: 'Tool 1', 
      version: '>=1.0.0', 
      category: 'cat1', 
      commands: {} 
    };
    const tool2: CliTool = { 
      name: 'tool2', 
      description: 'Tool 2', 
      version: '>=1.0.0', 
      category: 'cat1', 
      commands: {} 
    };
    const tool3: CliTool = { 
      name: 'tool3', 
      description: 'Tool 3', 
      version: '>=1.0.0', 
      category: 'cat2', 
      commands: {} 
    };

    registry.register(tool1);
    registry.register(tool2);
    registry.register(tool3);

    const cat1Tools = registry.getToolsByCategory('cat1');
    expect(cat1Tools.length).toBe(2);
    expect(cat1Tools.map(t => t.name)).toContain('tool1');
    expect(cat1Tools.map(t => t.name)).toContain('tool2');

    const cat2Tools = registry.getToolsByCategory('cat2');
    expect(cat2Tools.length).toBe(1);
    expect(cat2Tools[0].name).toBe('tool3');

    const emptyCategory = registry.getToolsByCategory('nonexistent');
    expect(emptyCategory.length).toBe(0);
  });

  it('should get all categories', () => {
    const tool1: CliTool = { 
      name: 'tool1', 
      description: 'Tool 1', 
      version: '>=1.0.0', 
      category: 'cat1', 
      commands: {} 
    };
    const tool2: CliTool = { 
      name: 'tool2', 
      description: 'Tool 2', 
      version: '>=1.0.0', 
      category: 'cat2', 
      commands: {} 
    };
    const tool3: CliTool = { 
      name: 'tool3', 
      description: 'Tool 3', 
      version: '>=1.0.0', 
      // no category
      commands: {} 
    };

    registry.register(tool1);
    registry.register(tool2);
    registry.register(tool3);

    const categories = registry.getAllCategories();
    expect(categories.length).toBe(2);
    expect(categories).toContain('cat1');
    expect(categories).toContain('cat2');
  });

  it('should search tools', () => {
    const tool1: CliTool = { 
      name: 'git', 
      description: 'Distributed version control system', 
      version: '>=2.0.0', 
      category: 'version-control',
      tags: ['git', 'vcs'],
      commands: {} 
    };
    const tool2: CliTool = { 
      name: 'npm', 
      description: 'Node package manager', 
      version: '>=6.0.0', 
      category: 'package-management',
      tags: ['node', 'npm'],
      commands: {} 
    };

    registry.register(tool1);
    registry.register(tool2);

    // Search by name
    expect(registry.searchTools('git').length).toBe(1);
    expect(registry.searchTools('npm').length).toBe(1);

    // Search by description
    expect(registry.searchTools('package').length).toBe(1);
    expect(registry.searchTools('version').length).toBe(1);

    // Search by category
    expect(registry.searchTools('version-control').length).toBe(1);

    // Search by tag
    expect(registry.searchTools('vcs').length).toBe(1);
    expect(registry.searchTools('node').length).toBe(1);

    // Case insensitive
    expect(registry.searchTools('GIT').length).toBe(1);
    expect(registry.searchTools('PACKAGE').length).toBe(1);

    // No match
    expect(registry.searchTools('nonexistent').length).toBe(0);
  });

  it('should search commands', () => {
    const tool: CliTool = { 
      name: 'git', 
      description: 'Git', 
      version: '>=2.0.0', 
      commands: {
        status: {
          name: 'status',
          description: 'Show git status',
          usage: 'git status',
          examples: [],
        },
        commit: {
          name: 'commit',
          description: 'Commit changes',
          usage: 'git commit',
          examples: [],
          tags: ['save', 'changes'],
        },
      } 
    };

    registry.register(tool);

    // Search by command name
    expect(registry.searchCommands('status').length).toBe(1);
    expect(registry.searchCommands('commit').length).toBe(1);

    // Search by description
    expect(registry.searchCommands('changes').length).toBe(1);

    // Search by tag
    expect(registry.searchCommands('save').length).toBe(1);

    // Case insensitive
    expect(registry.searchCommands('STATUS').length).toBe(1);

    // No match
    expect(registry.searchCommands('nonexistent').length).toBe(0);
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

describe('NPM Tool Definition', () => {
  it('should have correct structure', async () => {
    const { npmTool } = await import('./tools/npm.js');

    expect(npmTool.name).toBe('npm');
    expect(npmTool.description).toBe('Node package manager');
    expect(npmTool.version).toBe('>=6.0.0');
    expect(npmTool.category).toBe('package-management');
    expect(npmTool.tags).toContain('node');
    expect(npmTool.tags).toContain('npm');
    expect(npmTool.dangerousCommands).toContain('publish');
    expect(npmTool.dangerousCommands).toContain('unpublish');
  });

  it('should have all required commands', async () => {
    const { npmTool } = await import('./tools/npm.js');
    const requiredCommands = ['init', 'install', 'uninstall', 'update', 'run', 'test', 'start', 'build', 'publish', 'unpublish', 'list', 'outdated', 'audit', 'cache'];

    for (const cmd of requiredCommands) {
      expect(npmTool.commands[cmd]).toBeDefined();
      expect(npmTool.commands[cmd].name).toBe(cmd);
      expect(npmTool.commands[cmd].description).toBeTruthy();
      expect(npmTool.commands[cmd].usage).toBeTruthy();
    }
  });

  it('should have dangerous commands properly marked', async () => {
    const { npmTool } = await import('./tools/npm.js');

    expect(npmTool.commands['publish']?.dangerous).toBe(true);
    expect(npmTool.commands['publish']?.dangerLevel).toBe('high');
    expect(npmTool.commands['publish']?.requiresConfirmation).toBe(true);

    expect(npmTool.commands['unpublish']?.dangerous).toBe(true);
    expect(npmTool.commands['unpublish']?.dangerLevel).toBe('critical');
    expect(npmTool.commands['unpublish']?.requiresConfirmation).toBe(true);
  });

  it('should have examples', async () => {
    const { npmTool } = await import('./tools/npm.js');
    
    expect(npmTool.examples).toBeDefined();
    expect(npmTool.examples.length).toBeGreaterThan(0);
    expect(npmTool.examples[0].description).toBeTruthy();
    expect(npmTool.examples[0].command).toBeTruthy();
  });
});
