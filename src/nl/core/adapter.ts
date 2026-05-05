import type { IntentPattern, WeightedKeyword, KeywordTier } from '../types.js';
import type { IntentTemplate } from '../templates/index.js';

export function adaptTemplateToPattern(template: IntentTemplate): IntentPattern {
  const keywords = template.weightedKeywords ?? template.keywords.map(kw => ({
    text: kw,
    tier: classifyKeyword(kw),
  }));

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
