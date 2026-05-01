export interface KnownTool {
  id: string;
  name: string;
  version: string;
  versionRequirement: string;
  description?: string;
  checkCommand?: string;
  checkOutputRegex?: string;
  packageManager?: 'brew' | 'apt' | 'dnf' | 'choco' | 'winget' | 'npm' | 'unknown';
  versionCommands: string[];
  categories?: string[];
  confidence: number;
}

export interface DiscoveredTool {
  knownTool: KnownTool;
  path: string;
  version: string;
  confidence: number;
  foundBy: 'path' | 'brew' | 'apt' | 'dnf' | 'npm';
}

export interface DiscoveryResult {
  discoveredTools: DiscoveredTool[];
  failedChecks: { name: string; reason: string }[];
  totalScanned: number;
}

export interface ToolInfo {
  name: string;
  path: string;
  version?: string;
  foundBy: 'path' | 'brew' | 'apt' | 'dnf' | 'npm';
}

export type AIProviderStatus =
  | 'available'
  | 'installed'
  | 'not_found'
  | 'version_mismatch'
  | 'permission_denied';

export interface AIProviderConfig {
  name: string;
  cliCommand: string;
  versionCommand: string;
  requiredEnvVars: string[];
  minVersion: string;
  status: AIProviderStatus;
  version?: string;
  missingRequirements?: string[];
  priority: number;
  fallbackTargets?: string[];
}

export interface EnvironmentReport {
  scannedAt: Date;
  providers: AIProviderConfig[];
  totalAvailable: number;
  recommendedProvider: string;
  warnings: string[];
}
