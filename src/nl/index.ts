export { createIntentMatcher } from './intent-matcher.js';
export * from './command-synthesizer.js';
export * from './llm.js';
export * from './prompt-manager.js';
export { PromptRegistry, createPromptRegistry } from './prompt/registry.js';
export type {
  PromptVariable,
  PromptExample,
  PromptConstraint,
  Prompt,
  EvaluationResult,
} from './prompt/types.js';
export { PromptRegistryV3, createPromptRegistryV3 } from './prompt/v3.js';
export type { PromptV3, EvaluationResultV3 } from './prompt/v3.js';
export {
  createNLProcessor,
  createMatchingPipeline,
  createCoordinator,
  createIntentSplitter,
  createPrecedenceResolver,
  adaptTemplateToPattern,
  adaptAllTemplates,
} from './core/index.js';
export type {
  NLProcessorOptions,
  NLProcessor,
  MatchingPipeline,
  Coordinator,
  IntentSplitter,
  PrecedenceResolver,
  IntentPattern,
  IntentMatch,
  MultiIntentResult,
} from './core/index.js';
