import { describe, it, expect } from 'vitest';
import { matchPattern, parseCommand } from './matcher.js';

describe('matcher', () => {
  describe('matchPattern', () => {
    it('should match exact patterns', () => {
      expect(matchPattern('git status', 'git status')).toBe(true);
      expect(matchPattern('git status', 'git status -s')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(matchPattern('git *', 'git status')).toBe(true);
      expect(matchPattern('git *', 'git push origin main')).toBe(true);
      expect(matchPattern('* -rf', 'rm -rf')).toBe(true);
      expect(matchPattern('rm *', 'rm -rf /')).toBe(true);
    });

    it('should handle multi-part wildcards', () => {
      expect(matchPattern('docker rm -f *', 'docker rm -f my-container')).toBe(true);
      expect(matchPattern('docker rm -f *', 'docker rm -f abc')).toBe(true);
      expect(matchPattern('docker rm -f *', 'docker rm my-container')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(matchPattern('GIT STATUS', 'git status')).toBe(true);
      expect(matchPattern('Git Status', 'GIT STATUS')).toBe(true);
    });

    it('should handle special characters in patterns', () => {
      expect(matchPattern('echo test', 'echo test')).toBe(true);
      expect(matchPattern('echo "hello world"', 'echo "hello world"')).toBe(true);
    });
  });

  describe('parseCommand', () => {
    it('should parse simple commands', () => {
      const result = parseCommand('ls -la');
      expect(result.tool).toBe('ls');
      expect(result.subcommand).toBe('-la');
      expect(result.args).toEqual([]);
      expect(result.fullCommand).toBe('ls -la');
    });

    it('should parse commands with arguments', () => {
      const result = parseCommand('git commit -m "fix: bug"');
      expect(result.tool).toBe('git');
      expect(result.subcommand).toBe('commit');
      expect(result.args.length).toBe(3);
      expect(result.args[0]).toBe('-m');
    });

    it('should handle empty commands', () => {
      const result = parseCommand('');
      expect(result.tool).toBe('');
      expect(result.subcommand).toBe('');
      expect(result.args).toEqual([]);
    });
  });
});