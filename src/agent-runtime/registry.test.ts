import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAgentRegistry, resetAgentRegistry } from './registry';
import type { AgentDescriptor, AgentAdapter } from '../types/agent';

describe('AgentRegistry', () => {
  beforeEach(() => {
    resetAgentRegistry();
  });
  
  const testDescriptor: AgentDescriptor = {
    id: 'test-agent',
    displayName: 'Test Agent',
    entryCommand: 'test',
    promptTransport: 'arg',
    nonInteractiveFlags: [],
    approvalPolicySupport: 'unknown',
    structuredOutputSupport: false,
    preflightSpec: { versionArgs: ['--version'] },
    dryRunRenderMode: 'prompt-only',
    runtimePolicy: { configSemantics: 'inherit-user-default' },
  };
  
  const testAdapter: AgentAdapter = {
    supports: () => true,
    render: () => ({ command: 'test', args: [], preview: 'test' }),
  };
  
  it('should register an agent', () => {
    const registry = getAgentRegistry();
    registry.register(testDescriptor, testAdapter);
    
    expect(registry.has('test-agent')).toBe(true);
    expect(registry.getAgentDescriptor('test-agent')).toEqual(testDescriptor);
    expect(registry.getAgentAdapter('test-agent')).toEqual(testAdapter);
  });
  
  it('should unregister an agent', () => {
    const registry = getAgentRegistry();
    registry.register(testDescriptor, testAdapter);
    const result = registry.unregister('test-agent');
    
    expect(result).toBe(true);
    expect(registry.has('test-agent')).toBe(false);
  });
  
  it('should return false when unregistering non-existent agent', () => {
    const registry = getAgentRegistry();
    const result = registry.unregister('non-existent');
    
    expect(result).toBe(false);
  });
  
  it('should list all registered agents', () => {
    const registry = getAgentRegistry();
    const descriptor2 = { ...testDescriptor, id: 'test-agent-2', displayName: 'Test Agent 2' };
    
    registry.register(testDescriptor, testAdapter);
    registry.register(descriptor2, testAdapter);
    
    const descriptors = registry.getAllDescriptors();
    expect(descriptors).toHaveLength(2);
    expect(descriptors).toContainEqual(testDescriptor);
    expect(descriptors).toContainEqual(descriptor2);
  });
  
  it('should clear all registered agents', () => {
    const registry = getAgentRegistry();
    registry.register(testDescriptor, testAdapter);
    registry.clear();
    
    expect(registry.getAllDescriptors()).toHaveLength(0);
    expect(registry.has('test-agent')).toBe(false);
  });
  
  it('should handle case-insensitive IDs', () => {
    const registry = getAgentRegistry();
    registry.register(testDescriptor, testAdapter);
    
    expect(registry.has('TEST-AGENT')).toBe(true);
    expect(registry.getAgentDescriptor('TEST-AGENT')).toEqual(testDescriptor);
    expect(registry.unregister('TEST-AGENT')).toBe(true);
  });
  
  it('should use provided logger', () => {
    const warnSpy = vi.fn();
    const registry = getAgentRegistry({ logger: { warn: warnSpy } });
    
    registry.register(testDescriptor, testAdapter);
    registry.register(testDescriptor, testAdapter); // Register again
    
    expect(warnSpy).toHaveBeenCalled();
  });
});
