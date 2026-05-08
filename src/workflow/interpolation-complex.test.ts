import { describe, it, expect, beforeEach } from 'vitest';
import { interpolateString, type InterpolationContext } from './interpolation.js';
import { contextManager } from './context-manager.js';

describe('Complex Interpolation', () => {
  const executionId = 'test-exec-id';
  
  beforeEach(() => {
    contextManager.clear();
    contextManager.createContext('wf-1', executionId, 'session-1', {
      user: 'admin',
      count: 10
    });
    contextManager.setStepOutput(executionId, 'step1', 'SUCCESS_DATA', { exitCode: 0, stdout: 'Done' });
  });

  it('should interpolate using expression engine', () => {
    const context: InterpolationContext = {
      variables: {},
      previousOutputs: {},
      executionId
    };

    expect(interpolateString('User is ${vars.user}', context)).toBe('User is admin');
    expect(interpolateString('Count is ${vars.count}', context)).toBe('Count is 10');
    expect(interpolateString('Step1 result: ${steps.step1.output}', context)).toBe('Step1 result: SUCCESS_DATA');
    expect(interpolateString('Condition: ${steps.step1.exitCode == 0}', context)).toBe('Condition: true');
  });

  it('should fallback to legacy lookup if expression fails', () => {
    const context: InterpolationContext = {
      variables: { legacyVar: ['legacyValue'] },
      previousOutputs: { step1: ['legacyOutput'] },
      executionId
    };

    // previousOutputs has priority in interpolateString implementation
    expect(interpolateString('Legacy: ${legacyVar}', context)).toBe('Legacy: legacyValue');
    expect(interpolateString('Output: ${step1}', context)).toBe('Output: legacyOutput');
  });
});
