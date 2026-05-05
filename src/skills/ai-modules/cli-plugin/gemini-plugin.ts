import { execSync, spawn } from 'child_process';
import type { AIModuleContext, AIModuleResult, CliPluginResult } from '../types.js';
import type { CliPlugin, CliPluginCapabilities } from './types.js';

export function createGeminiCliPlugin(): CliPlugin {
  return {
    id: 'vectahub.cli.gemini',
    name: 'Gemini CLI',
    version: '1.0.0',
    type: 'cli-plugin',
    cliCommand: 'gemini',
    versionCommand: 'gemini --version',

    async canHandle(context: AIModuleContext): Promise<boolean> {
      if (context.delegateTo !== 'gemini') return false;
      return this.isAvailable();
    },

    async isAvailable(): Promise<boolean> {
      try {
        execSync('which gemini', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },

    getCapabilities(): CliPluginCapabilities {
      return {
        supportedActions: ['chat', 'code-review', 'generate'],
        outputFormats: ['text', 'json'],
        requiresAuth: false,
      };
    },

    async execute(input: string, context: AIModuleContext): Promise<AIModuleResult<CliPluginResult>> {
      const startTime = Date.now();
      const args = input.split(/\s+/).filter(Boolean);

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';

        const proc = spawn('gemini', args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
    },

    async initialize(): Promise<void> {},

    async shutdown(): Promise<void> {},
  };
}
