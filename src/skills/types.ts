
import {
  ProjectContext,
  UserPreferences,
  ExecutionRecord
} from '../types/index.js';

/**
 * Context provided to skills during execution
 * @property userInput - The raw user input string
 * @property sessionId - Optional session identifier for state tracking
 * @property projectContext - Optional project context information
 * @property userPreferences - Optional user preference settings
 * @property executionHistory - Optional array of previous execution records
 */
export interface SkillContext {
  userInput: string;
  sessionId?: string;
  projectContext?: ProjectContext;
  userPreferences?: UserPreferences;
  executionHistory?: ExecutionRecord[];
}

/**
 * Result of a skill execution
 * @template T - The type of the result data
 * @property success - Whether the execution succeeded
 * @property data - Optional result data
 * @property error - Optional error message if execution failed
 * @property confidence - Confidence score between 0 and 1
 * @property metadata - Optional additional metadata
 */
export interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Version information for a skill
 * @property major - Major version number (breaking changes)
 * @property minor - Minor version number (new features)
 * @property patch - Patch version number (bug fixes)
 * @property prerelease - Optional prerelease identifier
 * @property buildMetadata - Optional build metadata
 */
export interface SkillVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  buildMetadata?: string;
}

/**
 * Version history entry for tracking skill updates
 * @property version - The version string
 * @property timestamp - When this version was created
 * @property changes - Description of changes in this version
 * @property rollbackAvailable - Whether rollback to this version is possible
 */
export interface SkillVersionHistory {
  version: string;
  timestamp: Date;
  changes: string;
  rollbackAvailable: boolean;
}

/**
 * Core skill interface defining the contract for all skills
 * @template TInput - The input type for the skill
 * @template TOutput - The output type for the skill
 * @property id - Unique skill identifier
 * @property name - Human-readable skill name
 * @property version - Semantic version string
 * @property description - Skill description
 * @property category - Optional skill category
 * @property tags - Array of tags for skill discovery
 * @property canHandle - Async method to check if skill can handle context
 * @property execute - Async method to execute the skill
 */
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

/**
 * Composite skill that combines multiple skills
 * @property skills - Array of child skills
 * @property strategy - Execution strategy: parallel, sequential, or conditional
 */
export interface CompositeSkill extends Skill {
  skills: Skill[];
  strategy: 'parallel' | 'sequential' | 'conditional';
}

/**
 * Metadata associated with a skill
 * @property author - Optional skill author
 * @property category - Optional skill category
 * @property dependencies - Optional array of skill IDs this skill depends on
 * @property createdAt - Optional creation timestamp
 * @property lastUpdated - Optional last update timestamp
 * @property documentation - Optional documentation URL or text
 * @property enabled - Optional enabled status (defaults to true)
 * @property minVersion - Optional minimum compatible version
 * @property maxVersion - Optional maximum compatible version
 */
export interface SkillMetadata {
  author?: string;
  category?: string;
  dependencies?: string[];
  createdAt?: Date;
  lastUpdated?: Date;
  documentation?: string;
  enabled?: boolean;
  minVersion?: string;
  maxVersion?: string;
}

/**
 * Skill discovery configuration
 * @property autoDiscover - Whether to automatically discover new skills
 * @property discoveryPaths - Paths to search for skills
 * @property discoveryInterval - Interval in ms between discovery scans
 * @property excludePatterns - Patterns to exclude from discovery
 */
export interface SkillDiscoveryConfig {
  autoDiscover: boolean;
  discoveryPaths: string[];
  discoveryInterval: number;
  excludePatterns: string[];
}

/**
 * Skill cache entry for caching loaded skills
 * @property skill - The cached skill instance
 * @property metadata - The cached metadata
 * @property loadedAt - When the skill was loaded
 * @property lastAccessed - When the skill was last accessed
 * @property accessCount - Number of times the skill was accessed
 */
export interface SkillCacheEntry {
  skill: Skill;
  metadata: SkillMetadata;
  loadedAt: Date;
  lastAccessed: Date;
  accessCount: number;
}

/**
 * Skill cache configuration
 * @property maxSize - Maximum number of skills to cache
 * @property ttl - Time to live in milliseconds
 * @property enabled - Whether caching is enabled
 */
export interface SkillCacheConfig {
  maxSize: number;
  ttl: number;
  enabled: boolean;
}

/**
 * Validation rule for skill validation
 * @property type - The type of validation rule
 * @property field - The field to validate
 * @property condition - The condition to check
 * @property message - Error message if validation fails
 */
export interface SkillValidationRule {
  type: 'required' | 'type' | 'range' | 'pattern' | 'custom';
  field: string;
  condition: unknown;
  message: string;
}

/**
 * Validation result for skill validation
 * @property valid - Whether validation passed
 * @property errors - Array of validation error messages
 * @property warnings - Array of validation warning messages
 */
export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Sandbox configuration for skill execution
 * @property enabled - Whether sandboxing is enabled
 * @property timeout - Execution timeout in milliseconds
 * @property memoryLimit - Memory limit in bytes
 * @property allowedModules - Modules allowed in sandbox
 * @property blockedModules - Modules blocked in sandbox
 */
export interface SkillSandboxConfig {
  enabled: boolean;
  timeout: number;
  memoryLimit: number;
  allowedModules: string[];
  blockedModules: string[];
}

/**
 * Skill lifecycle state
 * @property state - Current lifecycle state
 * @property stateChangedAt - When the state last changed
 * @property previousState - The previous state
 */
export interface SkillLifecycleState {
  state: 'registered' | 'enabled' | 'disabled' | 'unloaded' | 'error';
  stateChangedAt: Date;
  previousState?: 'registered' | 'enabled' | 'disabled' | 'unloaded' | 'error';
}

/**
 * Skill lifecycle event
 * @property type - The event type
 * @property skillId - The skill ID
 * @property timestamp - When the event occurred
 * @property data - Optional event data
 */
export interface SkillLifecycleEvent {
  type: 'register' | 'enable' | 'disable' | 'unload' | 'error';
  skillId: string;
  timestamp: Date;
  data?: unknown;
}

/**
 * Skill health check result
 * @property healthy - Whether the skill is healthy
 * @property checks - Array of health check results
 * @property lastChecked - When the health check was performed
 */
export interface SkillHealthCheckResult {
  healthy: boolean;
  checks: Array<{ name: string; passed: boolean; message?: string }>;
  lastChecked: Date;
}
