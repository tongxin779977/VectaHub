import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommandSkill, CommandSkill } from './command-skill.js';
import { join } from 'path';
import { getVectaHubHome } from '../infrastructure/paths/index.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn((cmd: string) => {
      if (cmd.includes('ls')) return 'file1.txt\nfile2.txt';
      if (cmd.includes('git')) return 'On branch main';
      return '';
    }),
  };
});

describe('CommandSkill', () => {
  let skill: CommandSkill;

  beforeEach(() => {
    skill = createCommandSkill();
  });

  it('should have correct metadata', () => {
    expect(skill.id).toBe('vectahub.file-ops');
    expect(skill.name).toBe('File Operations');
    expect(skill.tags).toContain('file');
  });

  it('should execute file read command', async () => {
    const result = await skill.execute('read file /path/to/file.txt', {
      userInput: 'read file /path/to/file.txt',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should list files', async () => {
    const result = await skill.execute('list files in /tmp', {
      userInput: 'list files in /tmp',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should handle search files', async () => {
    const result = await skill.execute('search for *.ts files', {
      userInput: 'search for *.ts files',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
  });

  it('should search files by query', () => {
    const results = skill.searchFiles('package', [getVectaHubHome()]);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should execute system commands', async () => {
    const result = await skill.execute('run ls -la', {
      userInput: 'run ls -la',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle git operations', async () => {
    const result = await skill.execute('git commit', {
      userInput: 'git commit',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should provide help when asked', async () => {
    const result = await skill.execute('what can you do?', {
      userInput: 'what can you do?',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle clarify intent', async () => {
    const result = await skill.execute('how to use this?', {
      userInput: 'how to use this?',
      sessionId: 'test-session',
    });
    expect(result).toBeDefined();
  });
});
