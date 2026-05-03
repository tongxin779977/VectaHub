import { describe, it, expect } from 'vitest';
import { validateOutput, extractCleanOutput, createRetryPrompt } from './validator.js';

describe('validateOutput', () => {
  describe('JSON format', () => {
    it('should validate valid JSON', () => {
      const result = validateOutput('{"key": "value"}', { type: 'json' });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid JSON', () => {
      const result = validateOutput('not json', { type: 'json' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should handle empty output', () => {
      const result = validateOutput('', { type: 'json' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle whitespace-only output', () => {
      const result = validateOutput('   \n  ', { type: 'json' });
      expect(result.valid).toBe(false);
    });

    it('should strip markdown JSON fences', () => {
      const result = validateOutput('```json\n{"a":1}\n```', { type: 'json' });
      expect(result.valid).toBe(true);
    });

    it('should strip generic markdown fences', () => {
      const result = validateOutput('```\n{"a":1}\n```', { type: 'json' });
      expect(result.valid).toBe(true);
    });
  });

  describe('YAML format', () => {
    it('should validate valid YAML', () => {
      const result = validateOutput('key: value\nlist:\n  - item1', { type: 'yaml' });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid YAML', () => {
      const result = validateOutput(':\n  :\n    [invalid', { type: 'yaml' });
      expect(result.valid).toBe(false);
    });

    it('should strip markdown YAML fences', () => {
      const result = validateOutput('```yaml\nkey: value\n```', { type: 'yaml' });
      expect(result.valid).toBe(true);
    });
  });

  describe('text format', () => {
    it('should validate any non-empty text', () => {
      const result = validateOutput('hello', { type: 'text' });
      expect(result.valid).toBe(true);
    });

    it('should apply custom validation', () => {
      const result = validateOutput('hello', {
        type: 'text',
        validation: (text) => text.length > 10,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('custom validation');
    });

    it('should pass custom validation', () => {
      const result = validateOutput('hello world!', {
        type: 'text',
        validation: (text) => text.length > 10,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('unknown format', () => {
    it('should reject unknown format types', () => {
      const result = validateOutput('test', { type: 'xml' as any });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown format');
    });
  });
});

describe('extractCleanOutput', () => {
  it('should extract JSON from markdown fences', () => {
    const result = extractCleanOutput('```json\n{"key": "val"}\n```', { type: 'json' });
    expect(result).toBe('{"key": "val"}');
  });

  it('should extract YAML from markdown fences', () => {
    const result = extractCleanOutput('```yaml\nkey: val\n```', { type: 'yaml' });
    expect(result).toBe('key: val');
  });

  it('should strip generic fences', () => {
    const result = extractCleanOutput('```\nsome text\n```', { type: 'text' });
    expect(result).toBe('some text');
  });

  it('should return as-is when no fences', () => {
    const result = extractCleanOutput('plain text', { type: 'text' });
    expect(result).toBe('plain text');
  });

  it('should trim whitespace', () => {
    const result = extractCleanOutput('  {"a":1}  ', { type: 'json' });
    expect(result).toBe('{"a":1}');
  });
});

describe('createRetryPrompt', () => {
  it('should include original prompt', () => {
    const result = createRetryPrompt('do something', 'bad format', 2);
    expect(result).toContain('do something');
  });

  it('should include error message', () => {
    const result = createRetryPrompt('prompt', 'parse error', 1);
    expect(result).toContain('parse error');
  });

  it('should include attempt number', () => {
    const result = createRetryPrompt('prompt', 'err', 3);
    expect(result).toContain('Attempt 3');
  });
});
