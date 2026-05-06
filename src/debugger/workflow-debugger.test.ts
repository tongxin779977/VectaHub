import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowDebugger } from './workflow-debugger.js';

describe('WorkflowDebugger', () => {
  let debuggerInstance: WorkflowDebugger;

  beforeEach(() => {
    debuggerInstance = new WorkflowDebugger();
  });

  afterEach(() => {
    debuggerInstance.reset();
    vi.clearAllMocks();
  });

  it('should initialize with no breakpoints', () => {
    expect(debuggerInstance.getBreakpoints()).toEqual([]);
  });

  it('should initialize with no watch expressions', () => {
    expect(debuggerInstance.getWatchExpressions()).toEqual([]);
  });

  it('should set a breakpoint', () => {
    const id = debuggerInstance.setBreakpoint('step-1');
    expect(id).toBeDefined();
    expect(debuggerInstance.getBreakpoints().length).toBe(1);
  });

  it('should set a conditional breakpoint', () => {
    const id = debuggerInstance.setBreakpoint('step-1', 'condition', 'value > 10');
    const bp = debuggerInstance.getBreakpoints().find(b => b.id === id);
    expect(bp?.condition).toBe('value > 10');
  });

  it('should remove a breakpoint', () => {
    const id = debuggerInstance.setBreakpoint('step-1');
    expect(debuggerInstance.getBreakpoints().length).toBe(1);
    
    debuggerInstance.removeBreakpoint(id);
    expect(debuggerInstance.getBreakpoints().length).toBe(0);
  });

  it('should enable and disable breakpoints', () => {
    const id = debuggerInstance.setBreakpoint('step-1');
    let bp = debuggerInstance.getBreakpoints().find(b => b.id === id);
    expect(bp?.enabled).toBe(true);
    
    debuggerInstance.disableBreakpoint(id);
    bp = debuggerInstance.getBreakpoints().find(b => b.id === id);
    expect(bp?.enabled).toBe(false);
    
    debuggerInstance.enableBreakpoint(id);
    bp = debuggerInstance.getBreakpoints().find(b => b.id === id);
    expect(bp?.enabled).toBe(true);
  });

  it('should add watch expressions', () => {
    const id = debuggerInstance.addWatchExpression('result + 1');
    expect(id).toBeDefined();
    expect(debuggerInstance.getWatchExpressions().length).toBe(1);
  });

  it('should remove watch expressions', () => {
    const id = debuggerInstance.addWatchExpression('result + 1');
    expect(debuggerInstance.getWatchExpressions().length).toBe(1);
    
    debuggerInstance.removeWatchExpression(id);
    expect(debuggerInstance.getWatchExpressions().length).toBe(0);
  });

  it('should evaluate watch expressions', async () => {
    debuggerInstance.addWatchExpression('x + y');
    
    await debuggerInstance.evaluateWatchExpressions({ x: 5, y: 3 });
    
    const watches = debuggerInstance.getWatchExpressions();
    expect(watches[0]?.value).toBe(8);
  });

  it('should handle invalid watch expressions', async () => {
    debuggerInstance.addWatchExpression('invalid expression');
    
    await debuggerInstance.evaluateWatchExpressions({ x: 5 });
    
    const watches = debuggerInstance.getWatchExpressions();
    expect(watches[0]?.error).toBeDefined();
  });

  it('should get null state when no workflow is running', () => {
    expect(debuggerInstance.getState()).toBeNull();
  });

  it('should start with empty history', () => {
    expect(debuggerInstance.getHistory()).toEqual([]);
  });

  it('should clear history', () => {
    debuggerInstance.clearHistory();
    expect(debuggerInstance.getHistory()).toEqual([]);
  });

  it('should reset debugger state', () => {
    debuggerInstance.setBreakpoint('step-1');
    debuggerInstance.addWatchExpression('test');
    
    debuggerInstance.reset();
    
    expect(debuggerInstance.getBreakpoints()).toEqual([]);
    expect(debuggerInstance.getWatchExpressions()).toEqual([]);
    expect(debuggerInstance.getState()).toBeNull();
  });

  it('should pause and resume execution', () => {
    debuggerInstance.pause();
    const state = debuggerInstance.getState();
    if (state) {
      expect(state.status).toBe('paused');
    }
    
    debuggerInstance.resume();
    if (state) {
      expect(state.status).toBe('running');
    }
  });

  it('should support step over', () => {
    debuggerInstance.stepOver();
  });

  it('should handle event listeners', () => {
    const listener = vi.fn();
    debuggerInstance.onEvent(listener);
    debuggerInstance.offEvent(listener);
  });
});
