import { describe, it, expect } from 'vitest';
import { CapabilityCatalogBuilder, createCapabilityCatalogBuilder } from './builder.js';

describe('CapabilityCatalogBuilder', () => {
  describe('constructor', () => {
    it('should create an instance with createCapabilityCatalogBuilder', () => {
      const builder = createCapabilityCatalogBuilder({});
      expect(builder).toBeInstanceOf(CapabilityCatalogBuilder);
    });
  });

  describe('build', () => {
    it('should return all known capabilities', () => {
      const builder = createCapabilityCatalogBuilder({});
      const catalog = builder.build();
      
      expect(Array.isArray(catalog)).toBe(true);
      expect(catalog.length).toBeGreaterThan(0);
      
      const ids = catalog.map(c => c.id);
      expect(ids).toContain('git-workflow');
      expect(ids).toContain('package-script');
      expect(ids).toContain('github-actions-repair');
    });

    it('should return capabilities with correct structure', () => {
      const builder = createCapabilityCatalogBuilder({});
      const catalog = builder.build();
      
      for (const capability of catalog) {
        expect(capability).toHaveProperty('id');
        expect(capability).toHaveProperty('title');
        expect(capability).toHaveProperty('inputKinds');
        expect(capability).toHaveProperty('outputKinds');
        expect(capability).toHaveProperty('sideEffects');
        expect(capability).toHaveProperty('requiresConfirmation');
        expect(capability).toHaveProperty('verificationRequired');
        expect(capability).toHaveProperty('currentStatus');
        
        expect(typeof capability.id).toBe('string');
        expect(typeof capability.title).toBe('string');
        expect(Array.isArray(capability.inputKinds)).toBe(true);
        expect(Array.isArray(capability.outputKinds)).toBe(true);
        expect(Array.isArray(capability.sideEffects)).toBe(true);
        expect(typeof capability.requiresConfirmation).toBe('boolean');
        expect(typeof capability.verificationRequired).toBe('boolean');
        expect(['current', 'partial', 'target', 'unsupported']).toContain(capability.currentStatus);
      }
    });
  });

  describe('getCurrentCapabilities', () => {
    it('should return instantiated capabilities', () => {
      const builder = createCapabilityCatalogBuilder({});
      const capabilities = builder.getCurrentCapabilities();
      
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);
      
      for (const cap of capabilities) {
        expect(cap).toHaveProperty('id');
        expect(cap).toHaveProperty('canHandle');
        expect(cap).toHaveProperty('plan');
        expect(typeof cap.canHandle).toBe('function');
        expect(typeof cap.plan).toBe('function');
      }
    });
  });

  describe('getCapabilityById', () => {
    it('should return capability by id', () => {
      const builder = createCapabilityCatalogBuilder({});
      const capability = builder.getCapabilityById('git-workflow');
      
      expect(capability).not.toBeUndefined();
      expect(capability?.id).toBe('git-workflow');
    });

    it('should return undefined for unknown id', () => {
      const builder = createCapabilityCatalogBuilder({});
      const capability = builder.getCapabilityById('unknown-capability');
      
      expect(capability).toBeUndefined();
    });
  });
});
