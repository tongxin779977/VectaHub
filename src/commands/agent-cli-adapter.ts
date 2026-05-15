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
}

export interface AgentAdapterInput {
  descriptor: AgentDescriptor;
  workspaceRoot: string;
  taskPrompt: string;
  mode: 'run' | 'dry-run';
  outputMode: 'text' | 'json';
}

export interface AgentAdapterOutput {
  command: string;
  args: string[];
  envPatch?: Record<string, string>;
  preview: string;
  redactionHints?: string[];
}

export interface AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean;
  render(input: AgentAdapterInput): AgentAdapterOutput;
}

class CodexAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'codex';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    if (input.descriptor.subcommand) {
      args.push(input.descriptor.subcommand);
    }
    if (input.descriptor.workingDirectoryArg) {
      args.push(input.descriptor.workingDirectoryArg, input.workspaceRoot);
    }
    for (const flag of input.descriptor.nonInteractiveFlags) {
      args.push(flag);
    }
    args.push(input.taskPrompt);
    return {
      command: input.descriptor.entryCommand,
      args,
      preview: [input.descriptor.entryCommand, ...args].join(' '),
    };
  }
}

class AiderAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'aider';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    if (input.descriptor.promptArgName) {
      args.push(input.descriptor.promptArgName, input.taskPrompt);
    } else {
      args.push(input.taskPrompt);
    }
    return {
      command: input.descriptor.entryCommand,
      args,
      preview: [input.descriptor.entryCommand, ...args].join(' '),
    };
  }
}

class GeminiAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'gemini';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    if (input.descriptor.promptArgName) {
      args.push(input.descriptor.promptArgName, input.taskPrompt);
    } else {
      args.push(input.taskPrompt);
    }
    for (const flag of input.descriptor.nonInteractiveFlags) {
      args.push(flag);
    }
    return {
      command: input.descriptor.entryCommand,
      args,
      preview: [input.descriptor.entryCommand, ...args].join(' '),
    };
  }
}

class ClaudeAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'claude';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    if (input.descriptor.subcommand) {
      args.push(input.descriptor.subcommand);
    }
    if (input.descriptor.workingDirectoryArg) {
      args.push(input.descriptor.workingDirectoryArg, input.workspaceRoot);
    }
    if (input.descriptor.promptArgName) {
      args.push(input.descriptor.promptArgName, input.taskPrompt);
    } else {
      args.push(input.taskPrompt);
    }
    for (const flag of input.descriptor.nonInteractiveFlags) {
      args.push(flag);
    }
    return {
      command: input.descriptor.entryCommand,
      args,
      preview: [input.descriptor.entryCommand, ...args].join(' '),
    };
  }
}

const BUILT_IN_AGENT_DESCRIPTORS: Record<string, AgentDescriptor> = {
  codex: {
    id: 'codex',
    displayName: 'OpenAI Codex CLI',
    entryCommand: 'codex',
    subcommand: 'exec',
    promptTransport: 'positional',
    workingDirectoryArg: '--cd',
    workingDirectoryArgAliases: ['-C', '--cd'],
    nonInteractiveFlags: ['--sandbox', 'workspace-write'],
    approvalPolicySupport: 'unknown',
    structuredOutputSupport: false,
    preflightSpec: {
      versionArgs: ['--version'],
      invocableArgs: ['exec', '--help'],
      readyArgs: ['exec', '--sandbox', 'workspace-write', '--help'],
    },
    dryRunRenderMode: 'argv',
    runtimePolicy: {
      configSemantics: 'inherit-user-default',
      writableRuntimeHome: {
        envVar: 'CODEX_HOME',
        defaultHomeSubdir: '.codex',
        bootstrapFiles: [
          { relativePath: 'config.toml', required: false },
          { relativePath: 'auth.json', required: false },
        ],
        requireAnyBootstrapFile: true,
      },
    },
  },
  gemini: {
    id: 'gemini',
    displayName: 'Google Gemini CLI',
    entryCommand: 'gemini',
    promptTransport: 'arg',
    promptArgName: '-p',
    nonInteractiveFlags: ['-y'],
    approvalPolicySupport: 'unknown',
    structuredOutputSupport: false,
    preflightSpec: {
      versionArgs: ['--version'],
      invocableArgs: ['--help'],
      readyArgs: ['-p', 'vectahub-ready-probe', '--help'],
    },
    dryRunRenderMode: 'prompt-only',
    runtimePolicy: {
      configSemantics: 'inherit-user-default',
    },
  },
  aider: {
    id: 'aider',
    displayName: 'Aider CLI',
    entryCommand: 'aider',
    promptTransport: 'arg',
    promptArgName: '--message',
    nonInteractiveFlags: [],
    approvalPolicySupport: 'none',
    structuredOutputSupport: false,
    preflightSpec: {
      versionArgs: ['--version'],
      invocableArgs: ['--help'],
      readyArgs: ['--help'],
    },
    dryRunRenderMode: 'prompt-only',
    runtimePolicy: {
      configSemantics: 'inherit-user-default',
    },
  },
  claude: {
    id: 'claude',
    displayName: 'Claude CLI',
    entryCommand: 'claude',
    subcommand: 'code',
    promptTransport: 'arg',
    promptArgName: '--message',
    workingDirectoryArg: '--cwd',
    nonInteractiveFlags: [],
    approvalPolicySupport: 'unknown',
    structuredOutputSupport: false,
    preflightSpec: {
      versionArgs: ['--version'],
      invocableArgs: ['code', '--help'],
      readyArgs: ['code', '--help'],
    },
    dryRunRenderMode: 'prompt-only',
    runtimePolicy: {
      configSemantics: 'inherit-user-default',
    },
  },
};

export function getBuiltInAgentDescriptors(): AgentDescriptor[] {
  return Object.values(BUILT_IN_AGENT_DESCRIPTORS);
}

export function getAgentDescriptorById(agentId: string): AgentDescriptor | null {
  const normalized = agentId.trim().toLowerCase();
  return BUILT_IN_AGENT_DESCRIPTORS[normalized] ?? null;
}

export function isKnownAgentCli(agentId: string): boolean {
  return getAgentDescriptorById(agentId) !== null;
}

const BUILT_IN_ADAPTERS: AgentAdapter[] = [
  new CodexAdapter(),
  new AiderAdapter(),
  new GeminiAdapter(),
  new ClaudeAdapter(),
];

export function getAgentAdapterById(agentId: string): AgentAdapter | null {
  const descriptor = getAgentDescriptorById(agentId);
  if (!descriptor) return null;
  return BUILT_IN_ADAPTERS.find(adapter => adapter.supports(descriptor)) || null;
}
