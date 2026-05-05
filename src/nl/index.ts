export { createIntentMatcher } from './intent-matcher.js';
export * from './command-synthesizer.js';
export * from './llm.js';

export {
  PromptManager,
  createPromptManager,
  DEFAULT_INTENT_PARSER_ID,
  DEFAULT_WORKFLOW_YAML_ID,
} from './prompt-manager.js';

export {
  createPromptRegistry,
  PromptRegistryImpl,
  PromptRegistryV3,
  createPromptRegistryV3,
} from './prompt/v3.js';

export type {
  PromptVariable,
  PromptExample,
  PromptConstraint,
  PromptMetadata,
  Prompt,
  PromptBuildResult,
  EvaluationResult,
  PromptRegistry,
  PromptRepository,
  PromptCategory,
} from './prompt/types.js';

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
