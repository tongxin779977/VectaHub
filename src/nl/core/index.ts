export { DEFAULT_CONFIDENCE_THRESHOLDS, classifyConfidence } from './matching-pipeline.js';
export { createIntentSplitter, type IntentSplitter, validateInput } from './intent-splitter.js';
export { createNLProcessor, type NLProcessorOptions } from './pipeline.js';
export { adaptAllTemplates, adaptTemplateToPattern } from './adapter.js';
export {
  detectNegation,
  shouldSuppressDueToNegation,
  createNoopLLMRecognizer,
  type LLMBasedIntentRecognizer,
} from './llm-fallback.js';
export { createCategoryRouter, type CategoryRouter, type CategoryMetadata } from './category-router.js';
export { normalizeInput } from './input-normalizer.js';
export { parseGoal } from './goal-parser.js';
export type { GoalAction, GoalScope, NormalizedInput, ParsedGoal, ProjectContext } from './goal-types.js';
export type { IntentPattern, IntentMatch, MultiIntentResult } from '../types.js';
export type { NLProcessor } from './types.js';
