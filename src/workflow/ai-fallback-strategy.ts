import { ProviderRegistry } from './ai-provider-registry.js';
import { audit } from '../utils/audit.js';

export interface FallbackConfig {
  autoFallback: boolean;
  promptBeforeSwitch: boolean;
  maxFallbackAttempts: number;
  timeoutMs: number;
}

export class FallbackStrategy {
  private registry: ProviderRegistry;
  private config: FallbackConfig;

  constructor(registry: ProviderRegistry, config?: Partial<FallbackConfig>) {
    this.registry = registry;
    this.config = {
      autoFallback: true,
      promptBeforeSwitch: false,
      maxFallbackAttempts: 3,
      timeoutMs: 30000,
      ...config,
    };
  }

  async resolveProvider(requested: string | null): Promise<string> {
    if (!requested) {
      return this.registry.getRecommendedProvider();
    }

    if (this.registry.canUseProvider(requested)) {
      return requested;
    }

    if (!this.config.autoFallback) {
      throw new Error(
        `Provider "${requested}" is not available. ` +
        `Set auto_fallback: true in config to enable automatic fallback.`
      );
    }

    return this.findFallbackTarget(requested, 0);
  }

  private async findFallbackTarget(primary: string, attempts: number): Promise<string> {
    if (attempts >= this.config.maxFallbackAttempts) {
      throw new Error(
        `All fallback attempts exhausted for "${primary}". ` +
        `Please install an AI CLI tool manually.`
      );
    }

    const fallbackTargets = this.registry.getFallbackTargets(primary);

    for (const target of fallbackTargets) {
      if (target === 'built-in') {
        return 'built-in';
      }

      if (this.registry.canUseProvider(target)) {
        if (this.config.promptBeforeSwitch) {
          const confirmed = await this.promptUser(
            `"${primary}" is not available. Switch to "${target}"?`
          );
          if (!confirmed) {
            continue;
          }
        }

        console.log(
          `⚠️  "${primary}" not available, falling back to "${target}"`
        );

        const sessionId = this.getSessionId();
        audit.cliCommand('ai-fallback', [primary, target], sessionId);

        return target;
      }
    }

    throw new Error(`No fallback target available for "${primary}"`);
  }

  private async promptUser(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('Timeout, auto-switching...');
        resolve(true);
      }, this.config.timeoutMs);

      process.stdout.write(`${message} [Y/n] `);
      process.stdin.once('data', (data) => {
        clearTimeout(timeout);
        const answer = data.toString().trim().toLowerCase();
        resolve(answer === '' || answer === 'y' || answer === 'yes');
      });
    });
  }

  getConfig(): FallbackConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  private getSessionId(): string {
    try {
      const { getCurrentSessionId } = require('../utils/audit.js');
      return getCurrentSessionId();
    } catch {
      return 'unknown';
    }
  }
}
