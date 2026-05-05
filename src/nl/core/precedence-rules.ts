import type { IntentPrecedenceRule, IntentMatch } from '../types.js';

export const BUILTIN_PRECEDENCE_RULES: IntentPrecedenceRule[] = [
  {
    when: ['FILE_PERMISSION', 'CREATE_FILE'],
    prefer: 'FILE_PERMISSION',
    reason: 'permission operation takes priority over creation',
  },
  {
    when: ['FILE_ARCHIVE', 'CREATE_FILE'],
    prefer: 'FILE_ARCHIVE',
    reason: 'archive/decompress takes priority over creation',
  },
  {
    when: ['FILE_FIND', 'QUERY_INFO'],
    prefer: 'FILE_FIND',
    reason: 'find/search takes priority over listing',
  },
  {
    when: ['SYSTEM_INFO', 'SYSTEM_MONITOR'],
    prefer: 'SYSTEM_INFO',
    reason: 'query takes priority over monitoring',
  },
  {
    when: ['RUN_SCRIPT', 'GIT_WORKFLOW'],
    prefer: 'RUN_SCRIPT',
    reason: 'script takes priority over git',
  },
  {
    when: ['FILE_DIFF', 'GIT_WORKFLOW'],
    prefer: 'FILE_DIFF',
    reason: 'diff takes priority over git',
  },
];

export interface PrecedenceResolver {
  resolve(matches: IntentMatch[]): IntentMatch;
}

export function createPrecedenceResolver(
  customRules: IntentPrecedenceRule[] = []
): PrecedenceResolver {
  const allRules = [...BUILTIN_PRECEDENCE_RULES, ...customRules];

  return {
    resolve(matches: IntentMatch[]): IntentMatch {
      if (matches.length === 0) {
        return { intent: 'UNKNOWN', confidence: 0, params: {}, matchedKeywords: [] };
      }

      if (matches.length === 1) {
        return matches[0];
      }

      const intentNames = new Set(matches.map(m => m.intent));

      for (const rule of allRules) {
        const allPresent = rule.when.every(name => intentNames.has(name));
        if (allPresent) {
          const preferred = matches.find(m => m.intent === rule.prefer);
          if (preferred) {
            return preferred;
          }
        }
      }

      matches.sort((a, b) => b.confidence - a.confidence);
      return matches[0];
    },
  };
}
