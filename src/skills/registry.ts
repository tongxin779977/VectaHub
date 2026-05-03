
import { Skill, SkillContext, SkillMetadata } from './types.js';

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
}

export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
