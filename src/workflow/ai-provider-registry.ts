import type { AIProviderConfig, EnvironmentReport } from '../cli-tools/discovery/types.js';

export class ProviderRegistry {
  private providers: AIProviderConfig[] = [];
  private fallbackGraph: Map<string, string[]> = new Map();

  constructor(environmentReport: EnvironmentReport) {
    this.providers = environmentReport.providers;
    this.buildFallbackGraph();
  }

  getAvailableProviders(): AIProviderConfig[] {
    return this.providers
      .filter(p => p.status === 'available')
      .sort((a, b) => b.priority - a.priority);
  }

  getProvider(name: string): AIProviderConfig | undefined {
    return this.providers.find(p => p.name === name);
  }

  getFallbackTargets(provider: string): string[] {
    return this.fallbackGraph.get(provider) || ['built-in'];
  }

  getRecommendedProvider(): string {
    const available = this.getAvailableProviders();
    return available.length > 0 ? available[0].name : 'built-in';
  }

  canUseProvider(name: string): boolean {
    const provider = this.getProvider(name);
    return provider?.status === 'available';
  }

  getAllProviders(): AIProviderConfig[] {
    return [...this.providers];
  }

  getTotalAvailable(): number {
    return this.providers.filter(p => p.status === 'available').length;
  }

  getWarnings(): string[] {
    const warnings: string[] = [];
    for (const provider of this.providers) {
      if (provider.status !== 'available' && provider.missingRequirements) {
        warnings.push(`${provider.name}: ${provider.missingRequirements.join(', ')}`);
      }
    }
    return warnings;
  }

  private buildFallbackGraph(): void {
    for (const provider of this.providers) {
      const fallbacks = provider.fallbackTargets?.filter(target =>
        this.providers.some(p => p.name === target && p.status === 'available')
      ) || [];

      this.fallbackGraph.set(provider.name, [...fallbacks, 'built-in']);
    }
  }

  formatStatus(): string {
    const lines = [
      '\n🤖 AI CLI Environment Status:',
      '─'.repeat(50),
    ];

    for (const provider of this.providers.sort((a, b) => b.priority - a.priority)) {
      const icon = provider.status === 'available' ? '✅' :
                   provider.status === 'installed' ? '⚠️' : '❌';
      const version = provider.version ? ` v${provider.version}` : '';
      const missing = provider.missingRequirements?.join(', ') || '';

      lines.push(`${icon} ${provider.name}${version} [${provider.status}]`);
      if (missing) {
        lines.push(`   → Missing: ${missing}`);
      }
    }

    lines.push('─'.repeat(50));
    lines.push(`Recommended: ${this.getRecommendedProvider()}\n`);

    return lines.join('\n');
  }

  printStatus(): void {
    console.log(this.formatStatus());
  }
}
