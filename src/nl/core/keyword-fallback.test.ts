import { describe, it, expect } from 'vitest';
import { createKeywordFallback } from './keyword-fallback.js';
import { adaptAllTemplates } from './adapter.js';
import { INTENT_TEMPLATES } from '../templates/index.js';
import type { NLContext } from './types.js';

function createContext(input: string): NLContext {
  return { input, sessionId: 'test', options: { useLLM: false } };
}

describe('createKeywordFallback', () => {
  const patterns = adaptAllTemplates(INTENT_TEMPLATES);
  const fallback = createKeywordFallback(patterns);

  it('should return success for recognized input', async () => {
    const result = await fallback.parse(createContext('git commit'));

    expect(result.success).toBe(true);
    expect(result.intent).not.toBe('UNKNOWN');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.metadata?.path).toBe('keyword-fallback');
  });

  it('should return UNKNOWN for gibberish input', async () => {
    const result = await fallback.parse(createContext('xyzzy plugh'));

    expect(result.success).toBe(false);
    expect(result.intent).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(result.metadata?.path).toBe('keyword-fallback');
  });

  it('should include taskList on success', async () => {
    const result = await fallback.parse(createContext('create branch feature-x'));

    expect(result.taskList).toBeDefined();
    expect(result.taskList?.version).toBe('1.0');
    expect(result.taskList?.tasks.length).toBeGreaterThan(0);
  });
});
