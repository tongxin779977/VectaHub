
import { Skill, SkillContext, SkillMetadata } from './types.js';

export interface SkillMatchResult {
  skill: Skill;
  score: number;
  reason: string;
}

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

function stemMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return stem(a) === stem(b);
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private metadata: Map<string, SkillMetadata> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  listByCategory(category?: string): Skill[] {
    if (!category) return this.list();
    return this.list().filter(skill => {
      if (skill.tags.includes(category)) return true;
      const meta = this.metadata.get(skill.id);
      return meta?.category === category;
    });
  }

  remove(id: string): void {
    this.skills.delete(id);
    this.metadata.delete(id);
  }

  clear(): void {
    this.skills.clear();
    this.metadata.clear();
  }

  setMetadata(id: string, meta: SkillMetadata): void {
    this.metadata.set(id, meta);
  }

  getMetadata(id: string): SkillMetadata | undefined {
    return this.metadata.get(id);
  }

  isEnabled(id: string): boolean {
    const meta = this.metadata.get(id);
    return meta?.enabled !== false;
  }

  async findApplicableSkills(context: SkillContext): Promise<Skill[]> {
    const applicable: Skill[] = [];
    for (const skill of this.skills.values()) {
      const meta = this.metadata.get(skill.id);
      if (meta?.enabled === false) continue;
      if (await skill.canHandle(context)) {
        applicable.push(skill);
      }
    }
    return applicable.sort((a, b) => b.tags.length - a.tags.length);
  }

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

export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
