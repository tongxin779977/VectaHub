import { describe, it, expect } from 'vitest';
import { createNLProcessor } from './pipeline.js';
import { createKeywordFallback } from './keyword-fallback.js';
import { adaptAllTemplates } from './adapter.js';
import { INTENT_TEMPLATES } from '../templates/index.js';
import { createSkillRegistry } from '../../skills/registry.js';
import { createSkillExecutor } from '../../skills/executor.js';
import type { NLProcessor } from './types.js';
import type { IntentName } from '../../types/index.js';

describe('useLLM option in parse', () => {
  describe('keyword-only path when useLLM is false', () => {
    it('should use keyword-only parsing when useLLM is false', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const patterns = adaptAllTemplates(INTENT_TEMPLATES);
      const keywordFallback = createKeywordFallback(patterns);
      const processor = createNLProcessor(registry, keywordFallback, { executor });

      const result = await processor.parse({
        input: 'generate a complex workflow that requires LLM',
        options: { useLLM: false },
      });

      // When useLLM is false, should always use keyword-only path
      expect(result.metadata.path).toBe('keyword-only');
      expect(result.metadata.fallbackReason).toBe('LLM disabled');
    });

    it('should fallback to keyword when useLLM is not specified', async () => {
      const registry = createSkillRegistry();
      const patterns = adaptAllTemplates(INTENT_TEMPLATES);
      const keywordFallback = createKeywordFallback(patterns);
      const processor = createNLProcessor(registry, keywordFallback);

      const result = await processor.parse({
        input: 'git commit with message',
      });

      // When useLLM is not specified (undefined), useLLM is falsy so it falls back
      expect(result.metadata.path).toBe('keyword-only');
    });
  });

  describe('run.ts bug: useLLM hardcoded to false', () => {
    it('should demonstrate the bug - useLLM: false bypasses LLM even when llmConfig exists', async () => {
      const registry = createSkillRegistry();
      const executor = createSkillExecutor();

      const patterns = adaptAllTemplates(INTENT_TEMPLATES);
      const keywordFallback = createKeywordFallback(patterns);
      const processor = createNLProcessor(registry, keywordFallback, { executor });

      // Simulate: llmConfig exists
      const llmConfig = { provider: 'openai', model: 'gpt-4' };
      const shouldUseLLM = !!llmConfig; // true

      // BUG in run.ts:109 - hardcoded to false instead of using llmConfig
      const buggyResult = await processor.parse({
        input: 'generate a complex workflow that requires LLM',
        options: { useLLM: false }, // BUG: should be useLLM (which is true)
      });

      // With the bug, NL processor returns keyword-only path
      expect(buggyResult.metadata.path).toBe('keyword-only');
      expect(buggyResult.metadata.fallbackReason).toBe('LLM disabled');

      // The fix: useLLM should be based on llmConfig availability
      const correctResult = await processor.parse({
        input: 'generate a complex workflow that requires LLM',
        options: { useLLM: shouldUseLLM },
      });

      // When useLLM is true and executor exists, it should try skill pipeline first
      // (may still fall back to keyword-fallback if no skills match, but that's expected)
      expect(correctResult.metadata.path).toBeTruthy();
      // The key difference: when useLLM is true, it doesn't have "LLM disabled" fallbackReason
      expect(correctResult.metadata.fallbackReason).not.toBe('LLM disabled');
    });
  });
});