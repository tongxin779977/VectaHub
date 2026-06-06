import type { AgentDescriptor } from './agent.js';

export interface ProviderRegistrationRequest {
  cliCommand: string;
  displayName?: string;
  description?: string;
}

export interface ProviderRegistrationResult {
  success: boolean;
  providerId?: string;
  descriptor?: AgentDescriptor;
  error?: string;
}

export interface ProviderTestResult {
  available: boolean;
  version?: string;
  error?: string;
}

export interface CliDetectionResult {
  found: boolean;
  path?: string;
  version?: string;
  helpOutput?: string;
  versionOutput?: string;
  error?: string;
}

export interface LlmInferenceResult {
  descriptor: AgentDescriptor;
  adapterLogic: string;
  usageNotes: string;
}

export interface IProviderRegistrar {
  register(request: ProviderRegistrationRequest): Promise<ProviderRegistrationResult>;
  unregister(providerId: string): Promise<boolean>;
  list(): AgentDescriptor[];
  test(providerId: string): Promise<ProviderTestResult>;
  refresh(providerId: string): Promise<ProviderRegistrationResult>;
}

export interface ICliDetector {
  detect(cliCommand: string): Promise<CliDetectionResult>;
}

export interface ILlmInferencer {
  infer(cliCommand: string, detectionResult: CliDetectionResult): Promise<LlmInferenceResult>;
}
