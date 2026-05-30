import { execSync, spawn } from 'child_process';
import type { AIModuleContext, AIModuleResult, CliPluginResult } from '../types.js';
import type { CliPlugin, CreateCliPluginOptions, CliPluginCapabilities } from './types.js';

export function createCliPlugin(options: CreateCliPluginOptions): CliPlugin {
  const {
    id,
    name,
    version = '1.0.0',
    cliCommand,
    versionCommand = `${cliCommand} --version`,
    delegateTo,
    capabilities
  } = options;

  async function isAvailable(): Promise<boolean> {
    try {
      execSync(`which ${cliCommand}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async function canHandle(context: AIModuleContext): Promise<boolean> {
    if (context.delegateTo !== delegateTo) return false;
    return isAvailable();
  }

  function getCapabilities(): CliPluginCapabilities {
    return capabilities;
  }

  async function execute(input: string, _context: AIModuleContext): Promise<AIModuleResult<CliPluginResult>> {
    const startTime = Date.now();
    const args = input.split(/\s+/).filter(Boolean);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn(cliCommand, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', (exitCode: number) => {
        const duration = Date.now() - startTime;
        resolve({
          success: exitCode === 0,
          data: {
            exitCode: exitCode ?? 1,
            stdout,
            stderr,
            duration,
          },
        });
      });

      proc.on('error', (err: Error) => {
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          error: err.message,
          data: {
            exitCode: 1,
            stdout,
            stderr: err.message,
            duration,
          },
        });
      });
    });
  }

  return {
    id,
    name,
    version,
    type: 'cli-plugin',
    cliCommand,
    versionCommand,
    canHandle,
    isAvailable,
    getCapabilities,
    execute,
    async initialize(): Promise<void> {},
    async shutdown(): Promise<void> {},
  };
}
