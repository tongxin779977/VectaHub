import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRuleEngine, type CommandRuleEngineDeps } from './engine.js';
import type { CommandRule } from './types.js';

describe('CommandRuleEngine', () => {
  let engine: CommandRuleEngine;
  let deps: CommandRuleEngineDeps;

  beforeEach(() => {
    deps = { logger: { warn: vi.fn() } };
    engine = new CommandRuleEngine(undefined, deps);
  });

  it('should create an engine with default rules', () => {
    expect(engine).toBeDefined();
    const rules = engine.getRules();
    expect(rules.length).toBeGreaterThan(0);
  });

  it('should create an engine with custom rules', () => {
    const customRules: CommandRule[] = [
      { id: 'test-rule', pattern: 'test', action: 'allow' },
    ];
    const customEngine = new CommandRuleEngine(customRules, deps);
    expect(customEngine.getRules()).toEqual(customRules);
  });

  it('should set rules', () => {
    const newRules: CommandRule[] = [
      { id: 'new-rule', pattern: 'new', action: 'block' },
    ];
    engine.setRules(newRules);
    expect(engine.getRules()).toEqual(newRules);
  });

  it('should load template', () => {
    engine.loadTemplate('strict');
    const rules = engine.getRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.id === 'block-all-sudo')).toBe(true);
  });

  it('should load relaxed template', () => {
    engine.loadTemplate('relaxed');
    const rules = engine.getRules();
    expect(rules.some(r => r.id === 'allow-everything')).toBe(true);
  });

  it('should load default template', () => {
    engine.loadTemplate('default');
    const rules = engine.getRules();
    expect(rules.some(r => r.id === 'block-rm-rf')).toBe(true);
  });

  it('should analyze dangerous command', () => {
    const analysis = engine.analyzeCommand('rm', ['-rf', '/'], '/tmp');
    expect(analysis.isDangerous).toBe(true);
    expect(analysis.dangerLevel).toBeDefined();
    expect(analysis.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('should analyze safe command', () => {
    const analysis = engine.analyzeCommand('git', ['status'], '/tmp');
    expect(analysis.isDangerous).toBe(false);
    expect(analysis.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('should analyze unknown command', () => {
    const analysis = engine.analyzeCommand('unknown', ['command'], '/tmp');
    expect(analysis.isDangerous).toBe(false);
    expect(analysis.matchedPatterns.length).toBe(0);
  });

  it('should infer critical danger level for rm -rf /', () => {
    const analysis = engine.analyzeCommand('rm', ['-rf', '/'], '/tmp');
    expect(analysis.dangerLevel).toBe('critical');
  });

  it('should infer high danger level for sudo', () => {
    const analysis = engine.analyzeCommand('sudo', ['rm', '-rf', '*'], '/tmp');
    expect(analysis.dangerLevel).toBe('high');
  });

  it('should infer medium danger level for rm -rf with block rule', () => {
    engine.setRules([
      { id: 'block-rm-rf', pattern: 'rm -rf', action: 'block' },
    ]);
    const analysis = engine.analyzeCommand('rm', ['-rf', 'dir'], '/tmp');
    expect(analysis.dangerLevel).toBe('medium');
  });

  it('should evaluate dangerous command as block', () => {
    const result = engine.evaluate('rm', ['-rf', '/'], '/tmp');
    expect(result.decision).toBe('block');
    expect(result.rule).toBeDefined();
    expect(result.rule?.id).toBe('block-rm-rf');
  });

  it('should evaluate safe command as allow', () => {
    const result = engine.evaluate('git', ['status'], '/tmp');
    expect(result.decision).toBe('allow');
    expect(result.rule).toBeDefined();
  });

  it('should evaluate unknown command as allow', () => {
    const result = engine.evaluate('unknown', ['command'], '/tmp');
    expect(result.decision).toBe('allow');
    expect(result.rule).toBeUndefined();
  });

  it('should add a rule', () => {
    const newRule: CommandRule = {
      id: 'new-rule',
      pattern: 'new-pattern',
      action: 'prompt',
    };
    engine.addRule(newRule);
    expect(engine.getRules()).toContain(newRule);
  });

  it('should remove a rule', () => {
    const initialRules = engine.getRules();
    const ruleToRemove = initialRules[0];
    engine.removeRule(ruleToRemove.id);
    expect(engine.getRules()).not.toContain(ruleToRemove);
  });

  it('should not remove non-existent rule', () => {
    const initialRulesCount = engine.getRules().length;
    engine.removeRule('non-existent-id');
    expect(engine.getRules().length).toBe(initialRulesCount);
  });

  it('should handle invalid regex pattern', () => {
    const warnSpy = vi.fn();
    const engineWithSpy = new CommandRuleEngine(undefined, { logger: { warn: warnSpy } });
    engineWithSpy.setRules([
      { id: 'invalid', pattern: '[invalid', action: 'block' },
    ]);
    const analysis = engineWithSpy.analyzeCommand('test', [], '/tmp');
    expect(analysis.isDangerous).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should handle prompt action', () => {
    engine.setRules([
      { id: 'prompt-rule', pattern: 'prompt-cmd', action: 'prompt' },
    ]);
    const result = engine.evaluate('prompt-cmd', [], '/tmp');
    expect(result.decision).toBe('prompt');
  });

  it('should handle sanitize action', () => {
    engine.setRules([
      { id: 'sanitize-rule', pattern: 'sanitize-cmd', action: 'sanitize' },
    ]);
    const result = engine.evaluate('sanitize-cmd', [], '/tmp');
    expect(result.decision).toBe('sanitize');
  });

  it('should return a copy of rules', () => {
    const rules1 = engine.getRules();
    const rules2 = engine.getRules();
    expect(rules1).toEqual(rules2);
    expect(rules1).not.toBe(rules2);
  });

  it('should use default logger when not provided', () => {
    const engineWithoutDeps = new CommandRuleEngine();
    expect(engineWithoutDeps).toBeDefined();
  });

  it('should analyze command with multiple args', () => {
    const analysis = engine.analyzeCommand('git', ['push', '--force', 'origin', 'main'], '/tmp');
    expect(analysis.command).toBe('git');
    expect(analysis.args).toEqual(['push', '--force', 'origin', 'main']);
    expect(analysis.cwd).toBe('/tmp');
  });

  it('should evaluate chmod 777 as block', () => {
    const result = engine.evaluate('chmod', ['777', '/'], '/tmp');
    expect(result.decision).toBe('block');
  });

  it('should evaluate sudo rm -rf * as block', () => {
    const result = engine.evaluate('sudo', ['rm', '-rf', '*'], '/tmp');
    expect(result.decision).toBe('block');
  });

  it('should evaluate git add as allow', () => {
    const result = engine.evaluate('git', ['add', '.'], '/tmp');
    expect(result.decision).toBe('allow');
  });

  it('should evaluate npm install as allow', () => {
    const result = engine.evaluate('npm', ['install'], '/tmp');
    expect(result.decision).toBe('allow');
  });

  it('should handle scope in rules', () => {
    engine.setRules([
      { id: 'scoped-rule', pattern: 'scoped-cmd', action: 'block', scope: 'restricted' },
    ]);
    const result = engine.evaluate('scoped-cmd', [], '/tmp');
    expect(result.scope).toBe('restricted');
  });

  it('should handle rules without scope', () => {
    engine.setRules([
      { id: 'no-scope-rule', pattern: 'no-scope-cmd', action: 'block' },
    ]);
    const result = engine.evaluate('no-scope-cmd', [], '/tmp');
    expect(result.scope).toBeDefined();
  });

  it('should match first pattern when multiple match', () => {
    engine.setRules([
      { id: 'first', pattern: 'test', action: 'allow' },
      { id: 'second', pattern: 'test', action: 'block' },
    ]);
    const analysis = engine.analyzeCommand('test', [], '/tmp');
    expect(analysis.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('should handle empty args', () => {
    const analysis = engine.analyzeCommand('git', [], '/tmp');
    expect(analysis.command).toBe('git');
    expect(analysis.args).toEqual([]);
  });

  it('should handle special characters in command', () => {
    const analysis = engine.analyzeCommand('echo', ['hello', 'world'], '/tmp');
    expect(analysis.command).toBe('echo');
    expect(analysis.args).toEqual(['hello', 'world']);
  });
});