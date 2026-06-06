import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderRegistrar, getProviderRegistrar, resetProviderRegistrar } from './provider-registrar';
import type { AgentDescriptor } from '../types/agent';
import type { VectaHubConfig, AgentProviderConfig } from '../setup/first-run-wizard';
import { resetAgentRegistry, getAgentRegistry } from './registry';

describe('ProviderRegistrar', () => {
  beforeEach(() => {
    resetProviderRegistrar();
    resetAgentRegistry();
  });
  
  const mockDescriptor: AgentDescriptor = {
    id: 'test-cli',
    displayName: 'Test CLI',
    entryCommand: 'test-cli',
    promptTransport: 'arg',
    promptArgName: '--prompt',
    nonInteractiveFlags: [],
    approvalPolicySupport: 'unknown',
    structuredOutputSupport: false,
    preflightSpec: { versionArgs: ['--version'] },
    dryRunRenderMode: 'prompt-only',
    runtimePolicy: { configSemantics: 'inherit-user-default' },
  };
  
  const createMockDeps = () => ({
    cliDetector: {
      detect: vi.fn().mockResolvedValue({
        found: true,
        path: '/usr/bin/test-cli',
        version: '1.0.0',
        helpOutput: 'help',
      }),
    },
    llmInferencer: {
      infer: vi.fn().mockResolvedValue({
        descriptor: mockDescriptor,
        adapterLogic: 'test',
        usageNotes: 'test',
      }),
    },
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    configLoader: vi.fn(),
    configSaver: vi.fn(),
  });
  
  it('should register a provider', async () => {
    const deps = createMockDeps();
    deps.configLoader.mockReturnValue({
      version: 1,
      first_run_completed: true,
      ai_providers: { vectahub_llm: { provider: 'openai', enabled: true } },
      external_cli: {},
      priority: [],
    });
    
    const registrar = new ProviderRegistrar(deps);
    const result = await registrar.register({ cliCommand: 'test-cli' });
    
    expect(result.success).toBe(true);
    expect(result.providerId).toBe('test-cli');
    
    const registry = getAgentRegistry();
    expect(registry.has('test-cli')).toBe(true);
  });
  
  it('should handle CLI not found during registration', async () => {
    const deps = createMockDeps();
    deps.cliDetector.detect.mockResolvedValue({ found: false, error: 'Not found' });
    
    const registrar = new ProviderRegistrar(deps);
    const result = await registrar.register({ cliCommand: 'non-existent' });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
  
  it('should unregister a provider', async () => {
    const deps = createMockDeps();
    deps.configLoader.mockReturnValue({
      version: 1,
      first_run_completed: true,
      ai_providers: { vectahub_llm: { provider: 'openai', enabled: true }, 'test-cli': {} as AgentProviderConfig },
      external_cli: {},
      priority: [],
    });
    
    const registrar = new ProviderRegistrar(deps);
    
    // First register
    await registrar.register({ cliCommand: 'test-cli' });
    
    // Then unregister
    const result = await registrar.unregister('test-cli');
    
    expect(result).toBe(true);
    expect(deps.configSaver).toHaveBeenCalled();
  });
  
  it('should list registered providers', async () => {
    const deps = createMockDeps();
    deps.configLoader.mockReturnValue({
      version: 1,
      first_run_completed: true,
      ai_providers: { vectahub_llm: { provider: 'openai', enabled: true } },
      external_cli: {},
      priority: [],
    });
    
    const registrar = new ProviderRegistrar(deps);
    await registrar.register({ cliCommand: 'test-cli' });
    
    const providers = registrar.list();
    
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('test-cli');
  });
  
  it('should test a provider', async () => {
    const deps = createMockDeps();
    deps.configLoader.mockReturnValue({
      version: 1,
      first_run_completed: true,
      ai_providers: { vectahub_llm: { provider: 'openai', enabled: true } },
      external_cli: {},
      priority: [],
    });
    
    const registrar = new ProviderRegistrar(deps);
    await registrar.register({ cliCommand: 'test-cli' });
    
    const result = await registrar.test('test-cli');
    
    expect(result.available).toBe(true);
  });
  
  it('should refresh a provider', async () => {
    const deps = createMockDeps();
    deps.configLoader.mockReturnValue({
      version: 1,
      first_run_completed: true,
      ai_providers: { vectahub_llm: { provider: 'openai', enabled: true } },
      external_cli: {},
      priority: [],
    });
    
    const registrar = new ProviderRegistrar(deps);
    await registrar.register({ cliCommand: 'test-cli' });
    
    const result = await registrar.refresh('test-cli');
    
    expect(result.success).toBe(true);
    expect(deps.llmInferencer.infer).toHaveBeenCalledTimes(2);
  });
  
  it('should use singleton', async () => {
    const registrar1 = getProviderRegistrar();
    const registrar2 = getProviderRegistrar();
    expect(registrar1).toBe(registrar2);
  });

  it('should respect concurrency limit', async () => {
    const deps = createMockDeps();
    deps.configLoader.mockReturnValue({
      version: 1,
      first_run_completed: true,
      ai_providers: { vectahub_llm: { provider: 'openai', enabled: true } },
      external_cli: {},
      priority: [],
    });

    const registrar = new ProviderRegistrar({ ...deps, maxConcurrentRegistrations: 1 });
    expect(registrar.getActiveRegistrationCount()).toBe(0);

    const promise1 = registrar.register({ cliCommand: 'cli-1' });
    expect(registrar.getActiveRegistrationCount()).toBe(1);

    const promise2 = registrar.register({ cliCommand: 'cli-2' });
    expect(registrar.getPendingQueueLength()).toBe(1);

    await promise1;
    await promise2;
  });
});
