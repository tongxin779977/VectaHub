
import { Skill, SkillContext, SkillMetadata } from './types.js';

/**
 * Result of a skill match operation
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
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private metadata: Map<string, SkillMetadata> = new Map();

  /**
   * Registers a new skill in the registry
   * @param skill - The skill to register
   */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Gets a skill by ID
   * @param id - The skill ID
   * @returns The skill or undefined if not found
   */
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Checks if a skill exists in the registry
   * @param id - The skill ID
   * @returns True if the skill exists
   */
  has(id: string): boolean {
    return this.skills.has(id);
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
  }

  /**
   * Clears all skills and metadata from the registry
   */
  clear(): void {
    this.skills.clear();
    this.metadata.clear();
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
        // Individual skill failed to check applicability, skip it
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
}

/**
 * Creates a new SkillRegistry instance
 * @returns A new SkillRegistry
 */
export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
