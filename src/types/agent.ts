export type AgentPromptTransport = 'arg' | 'stdin' | 'file' | 'positional';

export type AgentApprovalPolicySupport = 'none' | 'top-level' | 'subcommand' | 'unknown';

export interface AgentPreflightSpec {
  versionArgs: string[];
  invocableArgs?: string[];
  readyArgs?: string[];
}

export interface AgentRuntimeBootstrapFile {
  relativePath: string;
  required: boolean;
}

export interface AgentWritableRuntimeHomePolicy {
  envVar: string;
  defaultHomeSubdir: string;
  bootstrapFiles: AgentRuntimeBootstrapFile[];
  requireAnyBootstrapFile: boolean;
  fallbackToUserHomeWhenBootstrapMissing?: boolean;
}

export interface AgentRuntimePolicy {
  configSemantics: 'inherit-user-default';
  writableRuntimeHome?: AgentWritableRuntimeHomePolicy;
}

export interface AgentDescriptor {
  id: string;
  displayName: string;
  entryCommand: string;
  subcommand?: string;
  promptTransport: AgentPromptTransport;
  promptArgName?: string;
  workingDirectoryArg?: string;
  workingDirectoryArgAliases?: string[];
  nonInteractiveFlags: string[];
  approvalPolicySupport: AgentApprovalPolicySupport;
  structuredOutputSupport: boolean;
  preflightSpec: AgentPreflightSpec;
  dryRunRenderMode: 'prompt-only' | 'argv';
  runtimePolicy?: AgentRuntimePolicy;
  description?: string;
  usageHabits?: string;
  bestFor?: string[];
}

export interface AgentAdapterInput {
  descriptor: AgentDescriptor;
  workspaceRoot: string;
  taskPrompt: string;
  mode: 'run' | 'dry-run';
  outputMode: 'text' | 'json';
  outputLastMessagePath?: string;
}

export interface AgentAdapterOutput {
  command: string;
  args: string[];
  stdinInput?: string;
  envPatch?: Record<string, string>;
  preview: string;
  redactionHints?: string[];
}

export interface AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean;
  render(input: AgentAdapterInput): AgentAdapterOutput;
}

export interface AgentRegistry {
  register(descriptor: AgentDescriptor, adapter: AgentAdapter): void;
  getAgentDescriptor(id: string): AgentDescriptor | null;
  getAgentAdapter(id: string): AgentAdapter | null;
  getAllDescriptors(): AgentDescriptor[];
  isKnownAgent(id: string): boolean;
}
