import { createNLProcessor, type NLProcessorOptions } from './pipeline.js';
import type { NLProcessor } from './types.js';
import { createMatchingPipeline, type MatchingPipeline } from './matching-pipeline.js';
import { createCoordinator, type Coordinator } from './coordinator.js';
import { createIntentSplitter, type IntentSplitter } from './intent-splitter.js';
import { createPrecedenceResolver, type PrecedenceResolver } from './precedence-rules.js';
import { adaptTemplateToPattern, adaptAllTemplates } from './adapter.js';
import type { IntentPattern, IntentMatch, MultiIntentResult } from '../types.js';

export {
  createNLProcessor,
  createMatchingPipeline,
  createCoordinator,
  createIntentSplitter,
  createPrecedenceResolver,
  adaptTemplateToPattern,
  adaptAllTemplates,
};

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
};
