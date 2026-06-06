import type { IntentPattern } from '../types.js';
import { INTENT_TEMPLATES, type IntentTemplate } from '../templates/index.js';

export function adaptTemplateToPattern(template: IntentTemplate): IntentPattern {
  return {
    intent: template.intent,
    keywords: [],
    weight: template.priority,
    negativeKeywords: [],
  };
}

export function adaptAllTemplates(): IntentPattern[] {
  return INTENT_TEMPLATES.map(adaptTemplateToPattern);
}
