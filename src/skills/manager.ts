import {
  Skill,
  SkillMetadata,
  SkillLifecycleState,
  SkillLifecycleEvent,
  SkillHealthCheckResult
} from './types.js';
import { SkillRegistry } from './registry.js';
import { SkillExecutor } from './executor.js';

type LoggerType = {
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/**
 * Options for creating a SkillManager
 * @property registry - The skill registry instance
 * @property executor - The skill executor instance
 * @property logger - Logger instance for lifecycle events
 * @property maxHistorySize - Maximum number of lifecycle events to keep (default: 1000)
 */
export interface SkillManagerOptions {
  registry: SkillRegistry;
  executor: SkillExecutor;
  logger: LoggerType;
  maxHistorySize?: number;
}

/**
 * SkillManager handles the complete lifecycle of skills
 * Provides enable/disable, unload, health check, and event tracking capabilities
 */
export class SkillManager {
  private registry: SkillRegistry;
  private executor: SkillExecutor;
  private logger: LoggerType;
  private lifecycleStates: Map<string, SkillLifecycleState> = new Map();
  private lifecycleEvents: SkillLifecycleEvent[] = [];
  private maxHistorySize: number;

  /**
   * Creates a new SkillManager instance
   * @param options - Configuration options for the manager
   */
  constructor(options: SkillManagerOptions) {
    this.registry = options.registry;
    this.executor = options.executor;
    this.logger = options.logger;
    this.maxHistorySize = options.maxHistorySize ?? 1000;
  }

  /**
   * Registers a skill and initializes its lifecycle state
   * @param skill - The skill to register
   * @param metadata - Optional metadata for the skill
   */
  registerSkill(skill: Skill, metadata?: SkillMetadata): void {
    this.registry.register(skill);

    if (metadata) {
      this.registry.setMetadata(skill.id, metadata);
    }

    this.updateLifecycleState(skill.id, 'registered');
    this.addLifecycleEvent({
      type: 'register',
      skillId: skill.id,
      timestamp: new Date(),
      data: { version: skill.version }
    });

    this.logger.info(`Skill registered: ${skill.id} (v${skill.version})`);
  }

  /**
   * Enables a skill
   * @param skillId - The skill ID to enable
   * @throws Error if skill not found
   */
  enableSkill(skillId: string): void {
    this.registry.enable(skillId);
    this.updateLifecycleState(skillId, 'enabled');
    this.addLifecycleEvent({
      type: 'enable',
      skillId,
      timestamp: new Date()
    });

    this.logger.info(`Skill enabled: ${skillId}`);
  }

  /**
   * Disables a skill
   * @param skillId - The skill ID to disable
   * @throws Error if skill not found
   */
  disableSkill(skillId: string): void {
    this.registry.disable(skillId);
    this.updateLifecycleState(skillId, 'disabled');
    this.addLifecycleEvent({
      type: 'disable',
      skillId,
      timestamp: new Date()
    });

    this.logger.info(`Skill disabled: ${skillId}`);
  }

  /**
   * Unloads a skill from the registry
   * @param skillId - The skill ID to unload
   */
  unloadSkill(skillId: string): void {
    this.updateLifecycleState(skillId, 'unloaded');
    this.registry.remove(skillId);
    this.addLifecycleEvent({
      type: 'unload',
      skillId,
      timestamp: new Date()
    });

    this.logger.info(`Skill unloaded: ${skillId}`);
  }

  /**
   * Gets the lifecycle state of a skill
   * @param skillId - The skill ID
   * @returns The lifecycle state or undefined if not found
   */
  getLifecycleState(skillId: string): SkillLifecycleState | undefined {
    return this.lifecycleStates.get(skillId);
  }

  /**
   * Gets the lifecycle event history
   * @param skillId - Optional skill ID to filter events
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Array of lifecycle events
   */
  getLifecycleEvents(skillId?: string, limit: number = 100): SkillLifecycleEvent[] {
    let events = this.lifecycleEvents;
    if (skillId) {
      events = events.filter(e => e.skillId === skillId);
    }
    return events.slice(-limit);
  }

  /**
   * Performs a health check on a skill
   * @param skillId - The skill ID to check
   * @returns Promise resolving to health check result
   */
  async healthCheck(skillId: string): Promise<SkillHealthCheckResult> {
    const skill = this.registry.get(skillId);
    const checks: Array<{ name: string; passed: boolean; message?: string }> = [];

    if (!skill) {
      checks.push({ name: 'existence', passed: false, message: 'Skill not found' });
      return {
        healthy: false,
        checks,
        lastChecked: new Date()
      };
    }

    checks.push({ name: 'existence', passed: true });

    const state = this.lifecycleStates.get(skillId);
    if (state?.state === 'disabled') {
      checks.push({ name: 'enabled', passed: false, message: 'Skill is disabled' });
    } else {
      checks.push({ name: 'enabled', passed: true });
    }

    if (state?.state === 'error') {
      checks.push({ name: 'state', passed: false, message: 'Skill is in error state' });
    } else {
      checks.push({ name: 'state', passed: true });
    }

    try {
      const canHandle = await skill.canHandle({
        userInput: 'health check',
        sessionId: 'health-check'
      });
      checks.push({ name: 'canHandle', passed: true });
    } catch (error) {
      checks.push({
        name: 'canHandle',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const healthy = checks.every(c => c.passed);

    return {
      healthy,
      checks,
      lastChecked: new Date()
    };
  }

  /**
   * Performs a health check on all registered skills
   * @returns Promise resolving to map of skill IDs to health check results
   */
  async healthCheckAll(): Promise<Map<string, SkillHealthCheckResult>> {
    const results = new Map<string, SkillHealthCheckResult>();
    const skills = this.registry.list();

    for (const skill of skills) {
      const result = await this.healthCheck(skill.id);
      results.set(skill.id, result);
    }

    return results;
  }

  /**
   * Gets all registered skills with their lifecycle states
   * @returns Array of skills with their states
   */
  getSkillsWithState(): Array<{ skill: Skill; state: SkillLifecycleState | undefined }> {
    const skills = this.registry.list();
    return skills.map(skill => ({
      skill,
      state: this.lifecycleStates.get(skill.id)
    }));
  }

  /**
   * Gets skills in error state
   * @returns Array of skill IDs in error state
   */
  getErrorSkills(): string[] {
    const errorSkills: string[] = [];
    for (const [skillId, state] of this.lifecycleStates.entries()) {
      if (state.state === 'error') {
        errorSkills.push(skillId);
      }
    }
    return errorSkills;
  }

  /**
   * Resets a skill from error state to registered
   * @param skillId - The skill ID to reset
   */
  resetSkill(skillId: string): void {
    const state = this.lifecycleStates.get(skillId);
    if (state?.state === 'error') {
      this.updateLifecycleState(skillId, 'registered');
      this.logger.info(`Skill reset from error state: ${skillId}`);
    }
  }

  /**
   * Updates the lifecycle state of a skill
   * @param skillId - The skill ID
   * @param newState - The new state
   * @private
   */
  private updateLifecycleState(skillId: string, newState: SkillLifecycleState['state']): void {
    const currentState = this.lifecycleStates.get(skillId);
    this.lifecycleStates.set(skillId, {
      state: newState,
      stateChangedAt: new Date(),
      previousState: currentState?.state
    });
  }

  /**
   * Adds a lifecycle event to the history
   * @param event - The lifecycle event
   * @private
   */
  private addLifecycleEvent(event: SkillLifecycleEvent): void {
    this.lifecycleEvents.push(event);

    if (this.lifecycleEvents.length > this.maxHistorySize) {
      this.lifecycleEvents = this.lifecycleEvents.slice(-this.maxHistorySize);
    }
  }
}

/**
 * Creates a new SkillManager instance
 * @param options - Configuration options for the manager
 * @returns A new SkillManager
 */
export function createSkillManager(options: SkillManagerOptions): SkillManager {
  return new SkillManager(options);
}
