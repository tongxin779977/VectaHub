import { describe, it, expect } from 'vitest';
import { classifyConfidence, DEFAULT_CONFIDENCE_THRESHOLDS } from './matching-pipeline.js';

describe('classifyConfidence', () => {
  it('classifies exact confidence', () => {
    expect(classifyConfidence(0.96)).toBe('exact');
    expect(classifyConfidence(1.0)).toBe('exact');
  });

  it('classifies high confidence', () => {
    expect(classifyConfidence(0.85)).toBe('high');
    expect(classifyConfidence(0.94)).toBe('high');
  });

  it('classifies medium confidence', () => {
    expect(classifyConfidence(0.7)).toBe('medium');
    expect(classifyConfidence(0.84)).toBe('medium');
  });

  it('classifies low confidence', () => {
    expect(classifyConfidence(0.5)).toBe('low');
    expect(classifyConfidence(0.64)).toBe('low');
  });

  it('classifies below_threshold', () => {
    expect(classifyConfidence(0.0)).toBe('below_threshold');
    expect(classifyConfidence(0.49)).toBe('below_threshold');
  });

  it('uses custom thresholds', () => {
    const custom = { ...DEFAULT_CONFIDENCE_THRESHOLDS, high: 0.9 };
    expect(classifyConfidence(0.88, custom)).toBe('medium');
    expect(classifyConfidence(0.92, custom)).toBe('high');
  });
});
