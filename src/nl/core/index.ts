export { createMatchingPipeline, type MatchingPipeline, type MatchingPipelineOptions, DEFAULT_CONFIDENCE_THRESHOLDS } from './matching-pipeline.js';
export { createIntentSplitter, type IntentSplitter } from './intent-splitter.js';
export { createCoordinator, type Coordinator } from './coordinator.js';
export { createPrecedenceResolver, type PrecedenceResolver } from './precedence-rules.js';
export { createNLProcessor, type NLProcessorOptions } from './pipeline.js';
export { adaptAllTemplates, adaptTemplateToPattern } from './adapter.js';
export { CHINESE_ACTION_VERBS, containsActionVerb, isShortNounPhrase } from './verb-list.js';
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
