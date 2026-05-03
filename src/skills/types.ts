
import {
  ProjectContext,
  UserPreferences,
  ExecutionRecord
} from '../types/index.js';

export interface SkillContext {
  userInput: string;
  sessionId?: string;
  projectContext?: ProjectContext;
  userPreferences?: UserPreferences;
  executionHistory?: ExecutionRecord[];
}

export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Skill<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  version: string;
  description: string;
  category?: string;
  tags: string[];

  canHandle(context: SkillContext): Promise<boolean>;
  execute(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;
}

export interface CompositeSkill extends Skill {
  skills: Skill[];
  strategy: 'parallel' | 'sequential' | 'conditional';
}

export interface SkillMetadata {
  author?: string;
  category?: string;
  dependencies?: string[];
  createdAt?: Date;
  lastUpdated?: Date;
  documentation?: string;
  enabled?: boolean;
}
