import { describe, it, expect } from 'vitest';
import { gitTool } from './git.js';
import { npmTool } from './npm.js';

describe('gitTool', () => {
  it('should have correct metadata', () => {
    expect(gitTool.name).toBe('git');
    expect(gitTool.category).toBe('version-control');
    expect(gitTool.tags).toContain('git');
    expect(gitTool.version).toBe('>=2.0.0');
  });

  it('should have examples', () => {
    expect(gitTool.examples!.length).toBeGreaterThan(0);
    expect(gitTool.examples![0].command).toBeTruthy();
  });

  it('should have dangerousCommands list', () => {
    expect(gitTool.dangerousCommands).toContain('push --force');
    expect(gitTool.dangerousCommands).toContain('reset --hard');
  });

  it('should have all standard commands defined', () => {
    const standardCmds = ['init', 'clone', 'add', 'commit', 'push', 'pull', 'status', 'log', 'diff', 'branch', 'merge'];
    for (const cmd of standardCmds) {
      expect(gitTool.commands[cmd]).toBeDefined();
      expect(gitTool.commands[cmd].name).toBe(cmd);
    }
  });

  it('should mark dangerous commands correctly', () => {
    expect(gitTool.commands['push --force']?.dangerous).toBe(true);
    expect(gitTool.commands['push --force']?.dangerLevel).toBe('high');
    expect(gitTool.commands['push --force']?.requiresConfirmation).toBe(true);
  });

  it('should mark safe commands as not dangerous', () => {
    expect(gitTool.commands['pull']?.dangerous).toBeFalsy();
    expect(gitTool.commands['status']?.dangerous).toBeFalsy();
  });

  it('should have options for commands', () => {
    expect(gitTool.commands['commit'].options).toBeDefined();
    expect(gitTool.commands['commit'].options!.length).toBeGreaterThan(0);
  });
});

describe('npmTool', () => {
  it('should have correct metadata', () => {
    expect(npmTool.name).toBe('npm');
    expect(npmTool.category).toBe('package-management');
    expect(npmTool.tags).toContain('npm');
  });

  it('should have standard commands', () => {
    const cmds = ['init', 'install', 'uninstall', 'update', 'run', 'test', 'start', 'build', 'publish', 'list', 'audit'];
    for (const cmd of cmds) {
      expect(npmTool.commands[cmd]).toBeDefined();
    }
  });

  it('should mark publish as dangerous', () => {
    expect(npmTool.commands['publish']?.dangerous).toBe(true);
    expect(npmTool.commands['publish']?.dangerLevel).toBe('high');
  });

  it('should mark unpublish as critical', () => {
    expect(npmTool.commands['unpublish']?.dangerous).toBe(true);
    expect(npmTool.commands['unpublish']?.dangerLevel).toBe('critical');
  });

  it('should have related tools', () => {
    expect(npmTool.relatedTools).toContain('git');
    expect(npmTool.relatedTools).toContain('node');
  });

  it('should list dangerous commands', () => {
    expect(npmTool.dangerousCommands).toContain('publish');
    expect(npmTool.dangerousCommands).toContain('unpublish');
  });
});
