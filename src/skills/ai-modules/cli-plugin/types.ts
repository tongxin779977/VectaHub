import type { AIModule } from '../types.js';

export interface CliPlugin extends AIModule<string, CliPluginResult> {
  cliCommand: string;
  versionCommand: string;
  isAvailable(): Promise<boolean>;
  getCapabilities(): CliPluginCapabilities;
}

export interface CliPluginResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface CliPluginConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface CliPluginCapabilities {
  supportedActions: string[];
  outputFormats: string[];
  requiresAuth: boolean;
}

export interface CreateCliPluginOptions {
  id: string;
  name: string;
  version?: string;
  cliCommand: string;
  versionCommand?: string;
  delegateTo: string;
  capabilities: CliPluginCapabilities;
}
