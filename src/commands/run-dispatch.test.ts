import { describe, it, expect } from 'vitest';
import { createRunDispatch } from './run-dispatch.js';

describe('createRunDispatch', () => {
  describe('validateStep for vectahub subcommands', () => {
    it('should block unregistered vectahub subcommand', () => {
      const result = createRunDispatch({
        text: 'test',
        steps: [{ cli: 'vectahub', args: ['tool', 'run', 'ls'] }],
      });
      expect(result.kind).toBe('blocked');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('not registered');
    });

    it('should allow run-command subcommand for tool_run intent', () => {
      const result = createRunDispatch({
        text: 'list all files',
        steps: [{ cli: 'vectahub', args: ['run-command', 'ls'] }],
      });
      expect(result.kind).toBe('workflow');
      expect(result.executable).toBe(true);
    });

    it('should allow run-command subcommand with additional args', () => {
      const result = createRunDispatch({
        text: 'list all files with details',
        steps: [{ cli: 'vectahub', args: ['run-command', 'ls', '-la'] }],
      });
      expect(result.kind).toBe('workflow');
      expect(result.executable).toBe(true);
    });
  });

  describe('direct local commands', () => {
    it('should classify ls as direct-command', () => {
      const result = createRunDispatch({
        text: 'list files',
        steps: [{ cli: 'ls', args: [] }],
      });
      expect(result.kind).toBe('direct-command');
      expect(result.executable).toBe(true);
    });

    it('should classify git as direct-command', () => {
      const result = createRunDispatch({
        text: 'git status',
        steps: [{ cli: 'git', args: ['status'] }],
      });
      expect(result.kind).toBe('direct-command');
      expect(result.executable).toBe(true);
    });
  });

  describe('empty steps', () => {
    it('should return clarify when no steps and no reply', () => {
      const result = createRunDispatch({
        text: 'something unclear',
        steps: [],
      });
      expect(result.kind).toBe('clarify');
      expect(result.executable).toBe(false);
    });

    it('should return dialog when no steps but has reply', () => {
      const result = createRunDispatch({
        text: 'hello',
        steps: [],
        reply: 'Hi there!',
      });
      expect(result.kind).toBe('dialog');
      expect(result.executable).toBe(false);
    });
  });

  describe('missing cli in step', () => {
    it('should block step with empty cli', () => {
      const result = createRunDispatch({
        text: 'test',
        steps: [{ cli: '', args: ['something'] }],
      });
      expect(result.kind).toBe('blocked');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('missing cli');
    });
  });
});
