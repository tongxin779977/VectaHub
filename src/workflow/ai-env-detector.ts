import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { join } from 'path';
import type { AIProviderConfig, EnvironmentReport, AIProviderStatus } from '../cli-tools/discovery/types.js';
import { getAllAIProviderConfigs, getAIProviderNames } from '../cli-tools/discovery/ai-tools.js';
import { audit } from '../utils/audit.js';

const CACHE_TTL_MS = 86400000;

interface CacheEntry {
  report: EnvironmentReport;
  expiresAt: Date;
}

export class EnvironmentDetector {
  private providers: Map<string, AIProviderConfig>;
  private cache: CacheEntry | null = null;

  constructor() {
    this.providers = new Map();
    for (const config of getAllAIProviderConfigs()) {
      this.providers.set(config.name, { ...config, status: 'not_found' });
    }
  }

  async scan(force = false): Promise<EnvironmentReport> {
    if (!force && this.cache && new Date() < this.cache.expiresAt) {
      return this.cache.report;
    }

    const warnings: string[] = [];
    const sessionId = this.getSessionId();

    audit.cliCommand('ai-scan', getAIProviderNames(), sessionId);

    const providerChecks = Array.from(this.providers.values()).map(
      config => this.detectProvider(config)
    );

    const providers = await Promise.all(providerChecks);

    for (const provider of providers) {
      if (provider.status !== 'available' && provider.missingRequirements) {
        warnings.push(`${provider.name}: ${provider.missingRequirements.join(', ')}`);
      }
    }

    const availableProviders = providers.filter(p => p.status === 'available');
    const recommended = availableProviders.length > 0
      ? availableProviders.reduce((a, b) => a.priority > b.priority ? a : b).name
      : 'built-in';

    const report: EnvironmentReport = {
      scannedAt: new Date(),
      providers,
      totalAvailable: availableProviders.length,
      recommendedProvider: recommended,
      warnings,
    };

    this.cache = {
      report,
      expiresAt: new Date(Date.now() + CACHE_TTL_MS),
    };

    audit.cliOutput('ai-scan', JSON.stringify({ totalAvailable: report.totalAvailable, recommended }), sessionId);

    return report;
  }

  private async detectProvider(config: AIProviderConfig): Promise<AIProviderConfig> {
    const result: AIProviderConfig = {
      ...config,
      fallbackTargets: config.fallbackTargets,
      status: 'not_found',
    };

    try {
      await this.findInPath(config.cliCommand);
    } catch {
      result.status = 'not_found';
      result.missingRequirements = [`${config.cliCommand} not found in PATH`];
      return result;
    }

    try {
      const version = await this.getVersion(config.cliCommand, config.versionCommand);
      result.version = version;

      if (config.minVersion && this.isVersionOlder(version, config.minVersion)) {
        result.status = 'version_mismatch';
        result.missingRequirements = [`version ${version} < ${config.minVersion}`];
        return result;
      }
    } catch {
      result.status = 'not_found';
      result.missingRequirements = ['Failed to get version'];
      return result;
    }

    const missingEnvVars: string[] = [];
    for (const envVar of config.requiredEnvVars || []) {
      if (!process.env[envVar]) {
        missingEnvVars.push(`Missing ${envVar}`);
      }
    }

    if (missingEnvVars.length > 0) {
      result.status = 'installed';
      result.missingRequirements = missingEnvVars;
      return result;
    }

    result.status = 'available';
    return result;
  }

  private async findInPath(name: string): Promise<string> {
    const paths = (process.env.PATH || '').split(':');

    for (const dir of paths) {
      const fullPath = join(dir, name);
      try {
        await access(fullPath);
        return fullPath;
      } catch {
        continue;
      }
    }

    throw new Error(`${name} not found in PATH`);
  }

  private getVersion(cli: string, versionFlag: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cli, [versionFlag], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim().split('\n')[0]);
        } else {
          reject(new Error(`Exit code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  private isVersionOlder(current: string, required: string): boolean {
    const parse = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(Number);
    const cur = parse(current);
    const req = parse(required);

    for (let i = 0; i < 3; i++) {
      if ((cur[i] || 0) < (req[i] || 0)) return true;
      if ((cur[i] || 0) > (req[i] || 0)) return false;
    }
    return false;
  }

  private getSessionId(): string {
    try {
      const { getCurrentSessionId } = require('../utils/audit.js');
      return getCurrentSessionId();
    } catch {
      return 'unknown';
    }
  }

  clearCache(): void {
    this.cache = null;
  }
}
