import { describe, it, expect } from 'vitest';
import { createLLMDialogControlSkill } from './index.js';

describe('createLLMDialogControlSkill', () => {
  it('should create skill with default config', () => {
    const skill = createLLMDialogControlSkill();
    expect(skill.getConfig().provider).toBe('openai');
    expect(skill.getConfig().model).toBe('gpt-4o-mini');
    expect(skill.getConfig().temperature).toBe(0.3);
  });

  it('should merge custom config', () => {
    const skill = createLLMDialogControlSkill({ model: 'gpt-4', temperature: 0.7 });
    expect(skill.getConfig().model).toBe('gpt-4');
    expect(skill.getConfig().temperature).toBe(0.7);
    expect(skill.getConfig().provider).toBe('openai');
  });

  it('should merge custom options', () => {
    const skill = createLLMDialogControlSkill({}, { maxRetries: 5, timeout: 60000 });
    expect(skill.getOptions().maxRetries).toBe(5);
    expect(skill.getOptions().timeout).toBe(60000);
  });

  it('should have generateJSON method', () => {
    const skill = createLLMDialogControlSkill();
    expect(typeof skill.generateJSON).toBe('function');
  });

  it('should have generateYAML method', () => {
    const skill = createLLMDialogControlSkill();
    expect(typeof skill.generateYAML).toBe('function');
  });

  it('should have generateText method', () => {
    const skill = createLLMDialogControlSkill();
    expect(typeof skill.generateText).toBe('function');
  });

  it('should have session management methods', () => {
    const skill = createLLMDialogControlSkill();
    expect(typeof skill.createSession).toBe('function');
    expect(typeof skill.getSession).toBe('function');
    expect(typeof skill.closeSession).toBe('function');
  });

  it('should create and retrieve sessions', () => {
    const skill = createLLMDialogControlSkill();
    const session = skill.createSession('test-session', 'default', 5);
    expect(session.sessionId).toBe('test-session');

    const retrieved = skill.getSession('test-session');
    expect(retrieved).toBeDefined();
    expect(retrieved?.sessionId).toBe('test-session');
  });

  it('should close sessions', () => {
    const skill = createLLMDialogControlSkill();
    skill.createSession('to-close');
    skill.closeSession('to-close');
    const session = skill.getSession('to-close');
    expect(session).toBeUndefined();
  });

  it('should have controller property', () => {
    const skill = createLLMDialogControlSkill();
    expect(skill.controller).toBeDefined();
    expect(typeof skill.controller.executeWithRetry).toBe('function');
  });
});
