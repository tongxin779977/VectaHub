import type { IntentMatch } from '../types.js';

/**
 * LLM-based intent recognition fallback.
 * Used when rule-based matching confidence is below the threshold.
 *
 * This interface allows plugging in any LLM provider
 * (OpenAI, Claude, local models, etc.).
 */
export interface LLMBasedIntentRecognizer {
  /**
   * Recognize intent using LLM for inputs that rule-based matching
   * couldn't confidently identify.
   *
   * @param input - The user input text
   * @param availableIntents - List of known intent names for the LLM to choose from
   * @returns An IntentMatch result, or null if LLM couldn't determine intent
   */
  recognize(input: string, availableIntents: string[]): Promise<IntentMatch | null>;
}

/**
 * Create a no-op LLM recognizer (used when no LLM is configured).
 */
export function createNoopLLMRecognizer(): LLMBasedIntentRecognizer {
  return {
    async recognize(_input: string, _availableIntents: string[]): Promise<IntentMatch | null> {
      return null;
    },
  };
}

/**
 * Negation detector for Chinese and English.
 * Detects if the input contains a negation pattern that should
 * invert or cancel the matched intent.
 *
 * Examples:
 *   "不要创建文件" → negation detected, CREATE_FILE should be suppressed
 *   "别提交代码" → negation detected, GIT_WORKFLOW should be suppressed
 *   "don't delete the file" → negation detected
 */
const NEGATION_PATTERNS = [
  // Chinese negations
  '不要', '别', '不', '没有', '无需', '无需', '不用', '不必',
  '不要给我', '别给我',
  // English negations
  'don\'t', 'do not', 'never', 'no need', 'not',
  'without', 'avoid', 'skip',
];

/**
 * Detect if the input contains a negation.
 * Returns the matched negation pattern or null.
 */
export function detectNegation(input: string): string | null {
  const lowerInput = input.toLowerCase();

  for (const pattern of NEGATION_PATTERNS) {
    if (lowerInput.includes(pattern)) {
      // Check it's not part of a compound word (e.g. "不一定" ≠ negation)
      if (isRealNegation(lowerInput, pattern)) {
        return pattern;
      }
    }
  }

  return null;
}

/**
 * Filter out false positive negations.
 * Some words contain negation characters but aren't actual negations.
 */
function isRealNegation(input: string, pattern: string): boolean {
  // False positive filters for Chinese
  const falsePositives = ['不一定', '不是不', '不得不', '不能不', '不会不', '不可能不'];

  for (const fp of falsePositives) {
    if (input.includes(fp) && fp.includes(pattern)) {
      return false;
    }
  }

  // For single character negations like "不", check context
  if (pattern === '不' || pattern === '没有') {
    // "不" at the beginning of a verb phrase is likely a real negation
    // "不" in the middle of a word is likely not
    const index = input.indexOf(pattern);
    if (index === -1) return false;

    // Check if it's preceded by another negation (double negative = positive)
    const before = input.slice(0, index);
    if (/[不没无未]/.test(before.slice(-1))) return false;
  }

  return true;
}

/**
 * Check if an intent match should be suppressed due to negation.
 * If the input contains a negation and the matched intent is an action
 * (create, delete, modify, etc.), the match should be suppressed.
 */
export function shouldSuppressDueToNegation(input: string, matchedIntent: string): boolean {
  const negation = detectNegation(input);
  if (!negation) return false;

  // Action intents that should be suppressed when negated
  const actionIntents = [
    'CREATE_FILE', 'DELETE_FILE', 'FILE_PERMISSION',
    'GIT_WORKFLOW', 'INSTALL_PACKAGE', 'RUN_SCRIPT',
    'FILE_ARCHIVE',
  ];

  return actionIntents.includes(matchedIntent);
}
