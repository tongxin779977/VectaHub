import { describe, it, expect, beforeEach } from 'vitest';
import { createAIModuleRegistry } from './registry.js';
import type { AIModule, AIModuleContext, AIModuleMetadata, AIModuleResult } from './types.js';

function createMockModule<TInput = unknown, TOutput = unknown>(
  id: string,
  overrides?: Partial<AIModule<TInput, TOutput>>
): AIModule<TInput, TOutput> {
  return {
    id,
    name: `Module ${id}`,
    version: '1.0.0',
    type: 'ai-enhancement',
    canHandle: async () => true,
    execute: async () => ({ success: true, confidence: 1 } as AIModuleResult<TOutput>),
    ...overrides,
  };
}

const mockContext: AIModuleContext = { userInput: 'test' };

describe('AIModuleRegistry', () => {
  let registry: ReturnType<typeof createAIModuleRegistry>;

  beforeEach(() => {
    registry = createAIModuleRegistry();
  });

  describe('register and get', () => {
    it('should register and retrieve a module', () => {
      const mod = createMockModule('test-1');
      registry.register(mod);
      expect(registry.get('test-1')).toBe(mod);
    });

    it('should return undefined for unknown module', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing module with same id', () => {
      registry.register(createMockModule('same-id', { version: '1.0.0' }));
      registry.register(createMockModule('same-id', { version: '2.0.0' }));
      expect(registry.get('same-id')?.version).toBe('2.0.0');
    });

    it('should register with custom metadata', () => {
      registry.register(createMockModule('m1'), { enabled: false, dependencies: ['other'] });
      expect(registry.getMetadata('m1')).toEqual({ enabled: false, dependencies: ['other'] });
    });

    it('should default metadata to enabled true when not provided', () => {
      registry.register(createMockModule('m1'));
      expect(registry.getMetadata('m1')).toEqual({ enabled: true });
    });
  });

  describe('unregister', () => {
    it('should remove a registered module and return true', () => {
      registry.register(createMockModule('to-remove'));
      const result = registry.unregister('to-remove');
      expect(result).toBe(true);
      expect(registry.get('to-remove')).toBeUndefined();
    });

    it('should return false for nonexistent module', () => {
      expect(registry.unregister('nope')).toBe(false);
    });

    it('should also remove associated metadata', () => {
      registry.register(createMockModule('s'), { enabled: true });
      registry.unregister('s');
      expect(registry.getMetadata('s')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return empty array when no modules registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered modules', () => {
      registry.register(createMockModule('a'));
      registry.register(createMockModule('b'));
      registry.register(createMockModule('c'));
      expect(registry.list()).toHaveLength(3);
    });
  });

  describe('listByType', () => {
    it('should return modules matching the given type', () => {
      registry.register(createMockModule('ai1', { type: 'ai-enhancement' }));
      registry.register(createMockModule('ai2', { type: 'ai-enhancement' }));
      registry.register(createMockModule('cli1', { type: 'cli-plugin' }));

      const aiModules = registry.listByType('ai-enhancement');
      expect(aiModules).toHaveLength(2);
      expect(aiModules.map(m => m.id)).toContain('ai1');
      expect(aiModules.map(m => m.id)).toContain('ai2');
    });

    it('should return empty array when no modules match type', () => {
      registry.register(createMockModule('cli1', { type: 'cli-plugin' }));
      expect(registry.listByType('ai-enhancement')).toEqual([]);
    });
  });

  describe('findApplicable', () => {
    it('should return modules where canHandle returns true', async () => {
      registry.register(createMockModule('yes', { canHandle: async () => true }));
      registry.register(createMockModule('no', { canHandle: async () => false }));
      registry.register(createMockModule('also-yes', { canHandle: async () => true }));

      const result = await registry.findApplicable(mockContext);
      const ids = result.map(m => m.id);
      expect(ids).toContain('yes');
      expect(ids).toContain('also-yes');
      expect(ids).not.toContain('no');
    });

    it('should skip disabled modules', async () => {
      registry.register(createMockModule('enabled'), { enabled: true });
      registry.register(createMockModule('disabled'), { enabled: false });

      const result = await registry.findApplicable(mockContext);
      expect(result.map(m => m.id)).toEqual(['enabled']);
    });

    it('should skip modules that throw in canHandle', async () => {
      registry.register(createMockModule('ok', { canHandle: async () => true }));
      registry.register(createMockModule('throws', {
        canHandle: async () => { throw new Error('boom'); }
      }));

      const result = await registry.findApplicable(mockContext);
      expect(result.map(m => m.id)).toEqual(['ok']);
    });

    it('should return empty array when no modules are applicable', async () => {
      registry.register(createMockModule('no1', { canHandle: async () => false }));
      const result = await registry.findApplicable(mockContext);
      expect(result).toEqual([]);
    });
  });

  describe('isEnabled', () => {
    it('should return true when metadata enabled is true', () => {
      registry.register(createMockModule('m1'), { enabled: true });
      expect(registry.isEnabled('m1')).toBe(true);
    });

    it('should return false when metadata enabled is false', () => {
      registry.register(createMockModule('m2'), { enabled: false });
      expect(registry.isEnabled('m2')).toBe(false);
    });

    it('should return false when no metadata exists', () => {
      expect(registry.isEnabled('nonexistent')).toBe(false);
    });
  });

  describe('getMetadata and setMetadata', () => {
    it('should set and get metadata', () => {
      registry.register(createMockModule('m1'));
      registry.setMetadata('m1', { enabled: false, dependencies: ['dep1'] });
      expect(registry.getMetadata('m1')).toEqual({ enabled: false, dependencies: ['dep1'] });
    });

    it('should merge partial metadata with existing', () => {
      registry.register(createMockModule('m1'), { enabled: true, dependencies: ['a'] });
      registry.setMetadata('m1', { enabled: false });
      expect(registry.getMetadata('m1')).toEqual({ enabled: false, dependencies: ['a'] });
    });

    it('should set metadata for module without prior metadata', () => {
      registry.setMetadata('new-mod', { enabled: true });
      expect(registry.getMetadata('new-mod')).toEqual({ enabled: true });
    });

    it('should return undefined for unknown metadata', () => {
      expect(registry.getMetadata('nonexistent')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size()).toBe(0);
    });

    it('should return the number of registered modules', () => {
      registry.register(createMockModule('a'));
      registry.register(createMockModule('b'));
      expect(registry.size()).toBe(2);
    });

    it('should decrease after unregister', () => {
      registry.register(createMockModule('a'));
      registry.register(createMockModule('b'));
      registry.unregister('a');
      expect(registry.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all modules and metadata', () => {
      registry.register(createMockModule('a'), { enabled: true });
      registry.register(createMockModule('b'), { enabled: false });
      registry.clear();
      expect(registry.list()).toEqual([]);
      expect(registry.size()).toBe(0);
      expect(registry.getMetadata('a')).toBeUndefined();
      expect(registry.getMetadata('b')).toBeUndefined();
    });
  });
});
