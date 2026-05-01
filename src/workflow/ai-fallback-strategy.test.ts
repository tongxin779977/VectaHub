import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackStrategy } from './ai-fallback-strategy.js';
import { ProviderRegistry } from './ai-provider-registry.js';
import type { EnvironmentReport } from '../cli-tools/discovery/types.js';

function createMockReport(availableProviders: string[]): EnvironmentReport {
  const allProviders = ['gemini', 'claude', 'codex', 'aider', 'opencli'];
  const priorities: Record<string, number> = { gemini: 90, claude: 85, codex: 80, aider: 75, opencli: 70 };
  const fallbackTargets: Record<string, string[]> = {
    gemini: ['claude', 'codex', 'built-in'],
    claude: ['gemini', 'codex', 'built-in'],
    codex: ['gemini', 'claude', 'built-in'],
    aider: ['gemini', 'claude', 'built-in'],
    opencli: ['gemini', 'claude', 'built-in'],
  };

  return {
    scannedAt: new Date(),
    providers: allProviders.map(name => ({
      name,
      cliCommand: name,
      versionCommand: '--version',
      requiredEnvVars: name === 'aider' || name === 'opencli' ? [] : [`${name.toUpperCase()}_API_KEY`],
      minVersion: '1.0.0',
      status: availableProviders.includes(name) ? 'available' as const : 'not_found' as const,
      version: availableProviders.includes(name) ? '1.0.0' : undefined,
      missingRequirements: availableProviders.includes(name) ? undefined : ['Not installed'],
      priority: priorities[name],
      fallbackTargets: fallbackTargets[name],
    })),
    totalAvailable: availableProviders.length,
    recommendedProvider: availableProviders.length > 0 ? availableProviders[0] : 'built-in',
    warnings: [],
  };
}

describe('FallbackStrategy', () => {
  it('should use available provider when requested', async () => {
    const report = createMockReport(['gemini', 'codex']);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry);

    const target = await strategy.resolveProvider('gemini');
    expect(target).toBe('gemini');
  });

  it('should fallback to next available when primary not available', async () => {
    const report = createMockReport(['codex']);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry);

    const target = await strategy.resolveProvider('gemini');
    expect(target).toBe('codex');
  });

  it('should fallback to built-in when nothing available', async () => {
    const report = createMockReport([]);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry);

    const target = await strategy.resolveProvider('gemini');
    expect(target).toBe('built-in');
  });

  it('should throw when auto_fallback is disabled', async () => {
    const report = createMockReport(['codex']);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry, { autoFallback: false });

    await expect(strategy.resolveProvider('gemini')).rejects.toThrow();
  });

  it('should return recommended provider when null requested', async () => {
    const report = createMockReport(['gemini', 'codex']);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry);

    const target = await strategy.resolveProvider(null);
    expect(target).toBe('gemini');
  });

  it('should respect priority order', async () => {
    const report = createMockReport(['opencli', 'aider']);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry);

    const recommended = registry.getRecommendedProvider();
    expect(recommended).toBe('aider');
  });

  it('should get and update config', () => {
    const report = createMockReport(['gemini']);
    const registry = new ProviderRegistry(report);
    const strategy = new FallbackStrategy(registry, { maxFallbackAttempts: 5 });

    const config = strategy.getConfig();
    expect(config.maxFallbackAttempts).toBe(5);

    strategy.updateConfig({ maxFallbackAttempts: 2 });
    expect(strategy.getConfig().maxFallbackAttempts).toBe(2);
  });
});
