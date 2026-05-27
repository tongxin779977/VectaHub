import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadProvidersFromConfig } from './config-loader';
import { getAgentRegistry, resetAgentRegistry } from './registry';
import type { VectaHubConfig, AgentProviderConfig } from '../setup/first-run-wizard';

describe('config-loader', () => {
  beforeEach(() => {
    resetAgentRegistry();
  });
  
  const testProviderConfig: AgentProviderConfig = {
    provider: 'test-cli',
    displayName: 'Test CLI',
    entryCommand: 'test-cli',
    promptTransport: 'arg',
    promptArgName: '--prompt',
    nonInteractiveFlags: [],
    enabled: true,
    priority: 50,
    registeredAt: new Date().toISOString(),
    lastChecked: new Date().toISOString(),
  };
  
  const testConfig: VectaHubConfig = {
    version: 1,
    first_run_completed: true,
    ai_providers: {
      vectahub_llm: { provider: 'openai', enabled: true },
      'test-cli': testProviderConfig,
    },
    external_cli: {},
    priority: [],
  };
  
  it('should load providers from config', async () => {
    const configLoader = vi.fn().mockReturnValue(testConfig);
    
    await loadProvidersFromConfig({ configLoader });
    
    const registry = getAgentRegistry();
    expect(registry.has('test-cli')).toBe(true);
    const descriptor = registry.getAgentDescriptor('test-cli');
    expect(descriptor?.displayName).toBe('Test CLI');
  });
  
  it('should skip vectahub_llm provider', async () => {
    const configLoader = vi.fn().mockReturnValue(testConfig);
    
    await loadProvidersFromConfig({ configLoader });
    
    const registry = getAgentRegistry();
    expect(registry.has('vectahub_llm')).toBe(false);
  });
  
  it('should skip disabled providers', async () => {
    const disabledConfig = {
      ...testConfig,
      ai_providers: {
        ...testConfig.ai_providers,
        'test-cli': { ...testProviderConfig, enabled: false },
      },
    };
    const configLoader = vi.fn().mockReturnValue(disabledConfig);
    
    await loadProvidersFromConfig({ configLoader });
    
    const registry = getAgentRegistry();
    expect(registry.has('test-cli')).toBe(false);
  });
  
  it('should log errors when loading fails', async () => {
    const configLoader = vi.fn().mockImplementation(() => {
      throw new Error('Config load failed');
    });
    const logger = { error: vi.fn(), info: vi.fn() };
    
    await loadProvidersFromConfig({ configLoader, logger });
    
    expect(logger.error).toHaveBeenCalled();
  });
});
