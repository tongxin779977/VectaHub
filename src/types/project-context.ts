export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';

export type SecurityMode = 'strict' | 'relaxed' | 'consensus';

export interface GitInfo {
  branch?: string;
  hasUncommittedChanges?: boolean;
  summary?: string;
}

export interface WorkflowInfo {
  id: string;
  name: string;
  source: 'file' | 'system';
}

export interface AgentRuntimeSummary {
  id: string;
  displayName: string;
  currentStatus: 'installed' | 'configured' | 'ready' | 'unavailable';
}

export interface CapabilitySummary {
  id: string;
  title: string;
  inputKinds: string[];
  outputKinds: string[];
  sideEffects: Array<'none' | 'read' | 'write' | 'command' | 'network'>;
  requiresConfirmation: boolean;
  verificationRequired: boolean;
  currentStatus: 'current' | 'partial' | 'target' | 'unsupported';
}

export interface RecentFailure {
  kind: string;
  summary: string;
  traceId?: string;
}

export interface ProjectContextPack {
  schemaVersion: '1.0';
  cwd: string;
  packageManager?: PackageManager;
  packageScripts: Array<{ name: string; command: string }>;
  git?: GitInfo;
  workflows: WorkflowInfo[];
  agents: AgentRuntimeSummary[];
  capabilities: CapabilitySummary[];
  securityMode: SecurityMode;
  recentFailures: RecentFailure[];
}
