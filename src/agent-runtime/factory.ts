import { getAgentRegistry } from './registry.js';
import type { AgentDescriptor } from '../types/agent.js';
import { CodexAdapter } from './adapters/codex.js';
import { AiderAdapter } from './adapters/aider.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { AgyAdapter } from './adapters/agy.js';

const BUILT_IN_AGENT_DESCRIPTORS: Record<string, AgentDescriptor> = {
  codex: {
    id: 'codex',
    displayName: 'OpenAI Codex CLI',
    entryCommand: 'codex',
    subcommand: 'exec',
    promptTransport: 'positional',
    workingDirectoryArg: '--cd',
    workingDirectoryArgAliases: ['-C', '--cd'],
    nonInteractiveFlags: ['--sandbox', 'workspace-write', '--color', 'never', '--ephemeral'],
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
    description: '调用 Aider CLI 来执行对应的任务。',
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
    usageHabits: '接收任务提示时使用 --message 参数，通过 files 数组传递工程文件路径，建议以当前工作目录为根指定相对路径。',
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
      writableRuntimeHome: {
        envVar: 'CLAUDE_HOME',
        defaultHomeSubdir: '.claude',
        bootstrapFiles: [
          { relativePath: 'settings.json', required: false },
        ],
        requireAnyBootstrapFile: false,
        fallbackToUserHomeWhenBootstrapMissing: true,
      },
    },
  },
  agy: {
    id: 'agy',
    displayName: 'AGY CLI',
    entryCommand: 'agy',
    promptTransport: 'arg',
    promptArgName: '--prompt',
    nonInteractiveFlags: ['--dangerously-skip-permissions'],
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
};

export function initializeBuiltInAgents(): void {
  const registry = getAgentRegistry();
  
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.codex, new CodexAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.aider, new AiderAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.gemini, new GeminiAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.claude, new ClaudeAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.agy, new AgyAdapter());
}
