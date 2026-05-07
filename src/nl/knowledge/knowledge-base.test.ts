import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKnowledgeBase } from './knowledge-base.js';
import type { ToolInfo, CommandInfo } from '../types/command.js';

describe('KnowledgeBase', () => {
  let kb: ReturnType<typeof createKnowledgeBase>;

  beforeEach(async () => {
    kb = createKnowledgeBase();
  });

  it('should add and retrieve tool', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      version: '1.0.0',
      commands: [{ name: 'test-cmd', description: 'Test command', usage: 'test-tool test-cmd', category: 'test-tool' }],
      lastScanned: new Date().toISOString(),
    };
    kb.addTool(tool);
    const cmd = kb.getCommand('test-cmd');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('test-cmd');
  });

  it('should search commands by keyword', () => {
    const tool: ToolInfo = {
      name: 'git',
      version: '2.39.0',
      commands: [
        { name: 'clone', description: 'Clone repository', usage: 'git clone', category: 'git' },
        { name: 'commit', description: 'Commit changes', usage: 'git commit', category: 'git' },
      ],
      lastScanned: new Date().toISOString(),
    };
    kb.addTool(tool);
    
    const results = kb.searchCommands('commit');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('commit');
  });

  it('should return undefined for non-existent command', () => {
    const cmd = kb.getCommand('non-existent-cmd');
    expect(cmd).toBeUndefined();
  });

  it('should return empty array when no tools added', () => {
    const results = kb.searchCommands('any');
    expect(results).toEqual([]);
  });

  it('should return all tools', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      version: '1.0.0',
      commands: [],
      lastScanned: new Date().toISOString(),
    };
    kb.addTool(tool);
    const tools = kb.getAllTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('test-tool');
  });
});