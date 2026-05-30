
import {
  Skill,
  SkillContext,
  SkillMetadata,
  SkillDiscoveryConfig,
  SkillCacheEntry,
  SkillCacheConfig
} from './types.js';
import { getLogger } from '../infrastructure/logger/index.js';

const logger = getLogger('skill-registry');

/**
 * Result of a skill match operation
 * @property skill - The matched skill
 * @property score - Match score between 0 and 1
 * @property reason - Explanation of why the skill matched
 */
export interface SkillMatchResult {
  skill: Skill;
  score: number;
  reason: string;
}

/**
 * Stems a word for matching purposes
 * @param word - The word to stem
 * @returns The stemmed word
 */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ing') && word.length > 4) return word.slice(0, -3);
  if (word.endsWith('tion')) return word.slice(0, -4);
  if (word.endsWith('ment')) return word.slice(0, -4);
  if (word.endsWith('ness')) return word.slice(0, -4);
  if (word.endsWith('able')) return word.slice(0, -4);
  if (word.endsWith('ible')) return word.slice(0, -4);
  if (word.endsWith('ful')) return word.slice(0, -3);
  if (word.endsWith('less')) return word.slice(0, -4);
  if (word.endsWith('ous')) return word.slice(0, -3);
  if (word.endsWith('ive')) return word.slice(0, -3);
  if (word.endsWith('al')) return word.slice(0, -2);
  if (word.endsWith('ial')) return word.slice(0, -3);
  if (word.endsWith('ly')) return word.slice(0, -2);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('est') && word.length > 4) return word.slice(0, -3);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Checks if two words stem-match
 * @param a - First word
 * @param b - Second word
 * @returns True if the words stem-match
 */
function stemMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return stem(a) === stem(b);
}

/**
 * Registry for managing and discovering skills
 * Provides skill registration, discovery, caching, and semantic matching capabilities
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private metadata: Map<string, SkillMetadata> = new Map();
  private discoveryConfig: SkillDiscoveryConfig | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private discoveredSkills: Map<string, Skill> = new Map();
  private cache: Map<string, SkillCacheEntry> = new Map();
  private cacheConfig: SkillCacheConfig = {
    maxSize: 100,
    ttl: 3600000,
    enabled: true
  };

  /**
   * Registers a new skill in the registry
   * If a skill with the same ID exists, it will be overwritten
   * @param skill - The skill to register
   */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
    this.updateCache(skill);
  }

  /**
   * Gets a skill by ID
   * @param id - The skill ID
   * @returns The skill or undefined if not found
   */
  get(id: string): Skill | undefined {
    const cached = this.getFromCache(id);
    if (cached) return cached;
    return this.skills.get(id);
  }

  /**
   * Checks if a skill exists in the registry
   * @param id - The skill ID
   * @returns True if the skill exists
   */
  has(id: string): boolean {
    return this.skills.has(id) || this.discoveredSkills.has(id);
  }

  /**
   * Lists all registered skills
   * @returns Array of all skills
   */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Lists skills by category
   * @param category - The category to filter by
   * @returns Array of skills in the category
   */
  listByCategory(category?: string): Skill[] {
    if (!category) return this.list();
    return this.list().filter(skill => {
      if (skill.tags.includes(category)) return true;
      const meta = this.metadata.get(skill.id);
      return meta?.category === category;
    });
  }

  /**
   * Removes a skill from the registry
   * @param id - The skill ID to remove
   */
  remove(id: string): void {
    this.skills.delete(id);
    this.metadata.delete(id);
    this.removeFromCache(id);
  }

  /**
   * Clears all skills and metadata from the registry
   */
  clear(): void {
    this.skills.clear();
    this.metadata.clear();
    this.cache.clear();
  }

  /**
   * Sets metadata for a skill
   * @param id - The skill ID
   * @param meta - The metadata to set
   */
  setMetadata(id: string, meta: SkillMetadata): void {
    this.metadata.set(id, meta);
  }

  /**
   * Gets metadata for a skill
   * @param id - The skill ID
   * @returns The metadata or undefined if not found
   */
  getMetadata(id: string): SkillMetadata | undefined {
    return this.metadata.get(id);
  }

  /**
   * Checks if a skill is enabled
   * @param id - The skill ID
   * @returns True if the skill is enabled
   */
  isEnabled(id: string): boolean {
    const meta = this.metadata.get(id);
    return meta?.enabled !== false;
  }

  /**
   * Enables a skill
   * @param id - The skill ID to enable
   * @throws Error if skill not found
   */
  enable(id: string): void {
    if (!this.skills.has(id)) {
      throw new Error(`Skill '${id}' not found`);
    }
    const meta = this.metadata.get(id) || {};
    this.metadata.set(id, { ...meta, enabled: true });
  }

  /**
   * Disables a skill
   * @param id - The skill ID to disable
   * @throws Error if skill not found
   */
  disable(id: string): void {
    if (!this.skills.has(id)) {
      throw new Error(`Skill '${id}' not found`);
    }
    const meta = this.metadata.get(id) || {};
    this.metadata.set(id, { ...meta, enabled: false });
  }

  /**
   * Enables automatic skill discovery
   * @param config - Discovery configuration
   */
  enableDiscovery(config: SkillDiscoveryConfig): void {
    this.discoveryConfig = config;
    if (config.autoDiscover) {
      this.startDiscovery();
    }
  }

  /**
   * Disables automatic skill discovery
   */
  disableDiscovery(): void {
    this.stopDiscovery();
    this.discoveryConfig = null;
  }

  /**
   * Manually triggers skill discovery
   * @returns Promise resolving to array of newly discovered skills
   */
  async discoverSkills(): Promise<Skill[]> {
    if (!this.discoveryConfig) {
      return [];
    }

    const discovered: Skill[] = [];
    for (const discoveryPath of this.discoveryConfig.discoveryPaths) {
      try {
        const skills = await this.scanForSkills(discoveryPath);
        for (const skill of skills) {
          if (!this.skills.has(skill.id) && !this.discoveredSkills.has(skill.id)) {
            this.discoveredSkills.set(skill.id, skill);
            discovered.push(skill);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ path: discoveryPath, error: message }, 'Skill discovery path scan failed');
      }
    }

    return discovered;
  }

  /**
   * Gets all discovered skills
   * @returns Array of discovered skills
   */
  getDiscoveredSkills(): Skill[] {
    return Array.from(this.discoveredSkills.values());
  }

  /**
   * Registers a discovered skill into the main registry
   * @param skillId - The discovered skill ID to register
   * @throws Error if skill not found in discovered skills
   */
  registerDiscoveredSkill(skillId: string): void {
    const skill = this.discoveredSkills.get(skillId);
    if (!skill) {
      throw new Error(`Discovered skill '${skillId}' not found`);
    }
    this.register(skill);
    this.discoveredSkills.delete(skillId);
  }

  /**
   * Configures the skill cache
   * @param config - Cache configuration
   */
  configureCache(config: Partial<SkillCacheConfig>): void {
    this.cacheConfig = { ...this.cacheConfig, ...config };
  }

  /**
   * Clears the skill cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics object
   */
  getCacheStats(): { size: number; hitRate: number } {
    const totalAccesses = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.accessCount, 0
    );
    return {
      size: this.cache.size,
      hitRate: totalAccesses > 0 ? this.cache.size / totalAccesses : 0
    };
  }

  /**
   * Finds applicable skills for a given context
   * @param context - The skill context
   * @returns Promise resolving to array of applicable skills
   */
  async findApplicableSkills(context: SkillContext): Promise<Skill[]> {
    const applicable: Skill[] = [];
    for (const skill of this.skills.values()) {
      const meta = this.metadata.get(skill.id);
      if (meta?.enabled === false) continue;
      try {
        if (await skill.canHandle(context)) {
          applicable.push(skill);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ skillId: skill.id, error: message }, 'Skill applicability check failed');
      }
    }
    return applicable.sort((a, b) => b.tags.length - a.tags.length);
  }

  /**
   * Finds skills by semantic matching
   * @param input - The input text to match against
   * @param options - Optional matching options
   * @returns Promise resolving to array of SkillMatchResult
   */
  async findSkillsBySemantic(
    input: string,
    options?: {
      scorer?: (input: string, skill: Skill) => Promise<number>;
      threshold?: number;
      limit?: number;
    }
  ): Promise<SkillMatchResult[]> {
    const threshold = options?.threshold ?? 0.3;
    const limit = options?.limit ?? 5;
    const inputLower = input.toLowerCase();
    const inputTokens = inputLower.split(/\s+/);
    const results: SkillMatchResult[] = [];

    for (const skill of this.skills.values()) {
      const meta = this.metadata.get(skill.id);
      if (meta?.enabled === false) continue;

      let score = 0;
      let reason = '';

      const skillText = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase();
      const skillTokens = skillText.split(/\s+/);

      for (const tag of skill.tags) {
        const tagLower = tag.toLowerCase();
        if (inputTokens.some(t => stemMatch(t, tagLower))) {
          score += 0.3;
          reason += `tag:${tag} `;
        }
      }

      for (const token of inputTokens) {
        if (token.length > 2 && skillTokens.some(st => stemMatch(token, st))) {
          score += 0.1;
          reason += `kw:${token} `;
        }
      }

      if (options?.scorer) {
        const llmScore = await options.scorer(input, skill);
        score = score * 0.4 + llmScore * 0.6;
        reason += `llm:${llmScore.toFixed(2)} `;
      }

      if (score >= threshold) {
        results.push({ skill, score, reason: reason.trim() });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Starts automatic skill discovery
   * @private
   */
  private startDiscovery(): void {
    if (this.discoveryTimer) {
      return;
    }

    const interval = this.discoveryConfig?.discoveryInterval ?? 60000;
    this.discoveryTimer = setInterval(async () => {
      await this.discoverSkills();
    }, interval);
  }

  /**
   * Stops automatic skill discovery
   * @private
   */
  private stopDiscovery(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  /**
   * Scans a directory for skill modules
   * @param path - The directory path to scan
   * @returns Promise resolving to array of discovered skills
   * @private
   */
  private async scanForSkills(_path: string): Promise<Skill[]> {
    // This is a placeholder implementation
    // In a real implementation, this would scan the filesystem for skill modules
    return [];
  }

  /**
   * Updates the cache with a skill
   * @param skill - The skill to cache
   * @private
   */
  private updateCache(skill: Skill): void {
    if (!this.cacheConfig.enabled) return;

    if (this.cache.size >= this.cacheConfig.maxSize) {
      this.evictLeastUsed();
    }

    const meta = this.metadata.get(skill.id) || {};
    this.cache.set(skill.id, {
      skill,
      metadata: meta,
      loadedAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0
    });
  }

  /**
   * Gets a skill from cache
   * @param id - The skill ID
   * @returns The cached skill or undefined
   * @private
   */
  private getFromCache(id: string): Skill | undefined {
    if (!this.cacheConfig.enabled) return undefined;

    const entry = this.cache.get(id);
    if (!entry) return undefined;

    const now = new Date();
    const age = now.getTime() - entry.loadedAt.getTime();
    if (age > this.cacheConfig.ttl) {
      this.cache.delete(id);
      return undefined;
    }

    entry.lastAccessed = now;
    entry.accessCount++;
    return entry.skill;
  }

  /**
   * Removes a skill from cache
   * @param id - The skill ID
   * @private
   */
  private removeFromCache(id: string): void {
    this.cache.delete(id);
  }

  /**
   * Evicts the least recently used skill from cache
   * @private
   */
  private evictLeastUsed(): void {
    let leastUsedId: string | null = null;
    let leastAccessed = Infinity;

    for (const [id, entry] of this.cache.entries()) {
      if (entry.accessCount < leastAccessed) {
        leastAccessed = entry.accessCount;
        leastUsedId = id;
      }
    }

    if (leastUsedId) {
      this.cache.delete(leastUsedId);
    }
  }
}

/**
 * Creates a new SkillRegistry instance
 * @returns A new SkillRegistry
 */
export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
