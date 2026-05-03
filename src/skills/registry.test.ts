import { describe, it, expect, beforeEach } from 'vitest';
import { createSkillRegistry } from './registry.js';
import type { Skill, SkillContext, SkillResult, SkillMetadata } from './types.js';

function createMockSkill<TInput = unknown, TOutput = unknown>(
  id: string,
  overrides?: Partial<Skill<TInput, TOutput>>
): Skill<TInput, TOutput> {
  return {
    id,
    name: `Skill ${id}`,
    version: '1.0.0',
    description: `Mock skill ${id}`,
    tags: ['mock'],
    canHandle: async () => true,
    execute: async () => ({ success: true, confidence: 1 } as SkillResult<TOutput>),
    ...overrides,
  };
}

const mockContext: SkillContext = { userInput: 'test' };

describe('SkillRegistry', () => {
  let registry: ReturnType<typeof createSkillRegistry>;

  beforeEach(() => {
    registry = createSkillRegistry();
  });

  describe('register and get', () => {
    it('should register and retrieve a skill', () => {
      const skill = createMockSkill('test-1');
      registry.register(skill);
      expect(registry.get('test-1')).toBe(skill);
    });

    it('should return undefined for unknown skill', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing skill with same id', () => {
      const skill1 = createMockSkill('same-id', { version: '1.0.0' });
      const skill2 = createMockSkill('same-id', { version: '2.0.0' });
      registry.register(skill1);
      registry.register(skill2);
      expect(registry.get('same-id')?.version).toBe('2.0.0');
    });
  });

  describe('list', () => {
    it('should return empty array when no skills registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered skills', () => {
      registry.register(createMockSkill('a'));
      registry.register(createMockSkill('b'));
      registry.register(createMockSkill('c'));
      expect(registry.list()).toHaveLength(3);
    });
  });

  describe('has', () => {
    it('should return true for registered skill', () => {
      registry.register(createMockSkill('exists'));
      expect(registry.has('exists')).toBe(true);
    });

    it('should return false for unregistered skill', () => {
      expect(registry.has('nope')).toBe(false);
    });
  });

  describe('listByCategory', () => {
    it('should return skills matching category tag', () => {
      registry.register(createMockSkill('intent', { tags: ['nlp', 'intent'] }));
      registry.register(createMockSkill('command', { tags: ['nlp', 'command'] }));
      registry.register(createMockSkill('git', { tags: ['tool', 'git'] }));

      const nlpSkills = registry.listByCategory('nlp');
      expect(nlpSkills).toHaveLength(2);
      expect(nlpSkills.map(s => s.id)).toContain('intent');
      expect(nlpSkills.map(s => s.id)).toContain('command');
    });

    it('should return empty array when no skills match category', () => {
      registry.register(createMockSkill('a', { tags: ['tool'] }));
      expect(registry.listByCategory('nlp')).toEqual([]);
    });

    it('should return all skills when category is undefined', () => {
      registry.register(createMockSkill('a'));
      registry.register(createMockSkill('b'));
      expect(registry.listByCategory()).toHaveLength(2);
    });

    it('should also filter by SkillMetadata.category', () => {
      registry.register(createMockSkill('a'));
      registry.register(createMockSkill('b'));
      registry.register(createMockSkill('c'));
      registry.setMetadata('a', { category: 'nl' });
      registry.setMetadata('b', { category: 'nl' });
      registry.setMetadata('c', { category: 'tool' });

      const nlSkills = registry.listByCategory('nl');
      expect(nlSkills).toHaveLength(2);
      expect(nlSkills.map(s => s.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('metadata management', () => {
    it('should set and get metadata', () => {
      const meta: SkillMetadata = { author: 'test', enabled: true };
      registry.setMetadata('skill-1', meta);
      expect(registry.getMetadata('skill-1')).toEqual(meta);
    });

    it('should return undefined for unknown metadata', () => {
      expect(registry.getMetadata('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing metadata', () => {
      registry.setMetadata('s', { author: 'v1' });
      registry.setMetadata('s', { author: 'v2' });
      expect(registry.getMetadata('s')?.author).toBe('v2');
    });

    it('should check metadata enabled flag', () => {
      registry.register(createMockSkill('enabled-skill'));
      registry.register(createMockSkill('disabled-skill'));
      registry.setMetadata('enabled-skill', { enabled: true });
      registry.setMetadata('disabled-skill', { enabled: false });

      expect(registry.isEnabled('enabled-skill')).toBe(true);
      expect(registry.isEnabled('disabled-skill')).toBe(false);
    });

    it('should default to enabled when no metadata exists', () => {
      registry.register(createMockSkill('no-meta'));
      expect(registry.isEnabled('no-meta')).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove a registered skill', () => {
      registry.register(createMockSkill('to-remove'));
      expect(registry.has('to-remove')).toBe(true);
      registry.remove('to-remove');
      expect(registry.has('to-remove')).toBe(false);
    });

    it('should also remove associated metadata', () => {
      registry.register(createMockSkill('s'));
      registry.setMetadata('s', { author: 'test' });
      registry.remove('s');
      expect(registry.getMetadata('s')).toBeUndefined();
    });

    it('should not throw when removing nonexistent skill', () => {
      expect(() => registry.remove('nope')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all skills and metadata', () => {
      registry.register(createMockSkill('a'));
      registry.register(createMockSkill('b'));
      registry.setMetadata('a', { author: 'test' });
      registry.clear();
      expect(registry.list()).toEqual([]);
      expect(registry.getMetadata('a')).toBeUndefined();
    });
  });

  describe('findApplicableSkills', () => {
    it('should return skills that canHandle returns true', async () => {
      registry.register(createMockSkill('yes', {
        canHandle: async () => true,
        tags: ['a'],
      }));
      registry.register(createMockSkill('no', {
        canHandle: async () => false,
        tags: ['a', 'b', 'c'],
      }));
      registry.register(createMockSkill('also-yes', {
        canHandle: async () => true,
        tags: ['a', 'b'],
      }));

      const result = await registry.findApplicableSkills(mockContext);
      const ids = result.map(s => s.id);
      expect(ids).toContain('yes');
      expect(ids).toContain('also-yes');
      expect(ids).not.toContain('no');
    });

    it('should sort by tags length descending', async () => {
      registry.register(createMockSkill('few-tags', { tags: ['a'] }));
      registry.register(createMockSkill('many-tags', { tags: ['a', 'b', 'c'] }));
      registry.register(createMockSkill('mid-tags', { tags: ['a', 'b'] }));

      const result = await registry.findApplicableSkills(mockContext);
      expect(result[0].id).toBe('many-tags');
      expect(result[1].id).toBe('mid-tags');
      expect(result[2].id).toBe('few-tags');
    });
  });
});
