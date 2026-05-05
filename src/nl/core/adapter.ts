import type { IntentPattern, WeightedKeyword, KeywordTier } from '../types.js';
import type { IntentTemplate } from '../templates/index.js';

export function adaptTemplateToPattern(template: IntentTemplate): IntentPattern {
  const keywords = mergeKeywords(template);

  return {
    intent: template.name,
    keywords,
    phrases: template.phrases,
    negativeKeywords: template.negativeKeywords,
    weight: template.weight,
    cli: template.cli,
    priority: template.priority,
    tags: template.tags,
  };
}

/**
 * Merge weightedKeywords with plain keywords.
 * weightedKeywords take precedence for the same text,
 * plain keywords fill in any gaps.
 */
function mergeKeywords(template: IntentTemplate): WeightedKeyword[] {
  const hasWeighted = template.weightedKeywords && template.weightedKeywords.length > 0;
  const hasPlain = template.keywords.length > 0;

  if (hasWeighted && !hasPlain) {
    return template.weightedKeywords!;
  }

  if (!hasWeighted && hasPlain) {
    return template.keywords.map(kw => ({
      text: kw,
      tier: classifyKeyword(kw),
    }));
  }

  // Merge: start with weightedKeywords, add plain keywords not already covered
  const weighted = template.weightedKeywords!;
  const weightedSet = new Set(weighted.map(kw => kw.text));
  const merged = [...weighted];

  for (const kw of template.keywords) {
    if (!weightedSet.has(kw)) {
      merged.push({
        text: kw,
        tier: classifyKeyword(kw),
      });
    }
  }

  return merged;
}

export function adaptAllTemplates(
  templates: Record<string, IntentTemplate>
): IntentPattern[] {
  return Object.values(templates).map(adaptTemplateToPattern);
}

function classifyKeyword(keyword: string): KeywordTier {
  const len = keyword.length;
  if (len <= 3) return 'core';
  if (len <= 6) return 'important';
  return 'generic';
}
