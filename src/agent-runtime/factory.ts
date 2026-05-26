import { getAgentRegistry } from './registry.js';
import type { AgentDescriptor } from '../types/agent.js';
import { CodexAdapter } from './adapters/codex.js';
import { AiderAdapter } from './adapters/aider.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { ClaudeAdapter } from './adapters/claude.js';

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
    description: "OpenAI Codex 智能体，适合于运行并执行具体的命令行逻辑、代码测试以及直接对终端环境进行检测诊断。",
    usageHabits: "能够执行任意 shell 命令，推荐在需要直接执行构建、诊断、或者复杂底层命令行操作时使用。",
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
    description: "Google Gemini 助手，适合快速自然语言咨询、生成代码片段、撰写单元测试、解释代码逻辑、回答通用疑问。",
    usageHabits: "擅长单文件内分析或直接进行文本解答。对于不需要在工作区修改多个文件、或仅仅需要理解概念的任务，此工具是最佳选择。",
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
    description: "Aider 自动开发体，适用于在当前工作区中多文件的交互式编写、代码重构与日常修改。",
    usageHabits: "必须传入清晰具体的开发指示，并建议明确传入涉及到的文件路径数组以便 Aider 精准读取。",
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
    description: "Claude 代码助手，擅长全文件的大块逻辑重构、代码缺陷深度分析与高复杂度的逻辑变更。",
    usageHabits: "适合需要大范围阅读和逻辑理解的代码开发任务。",
  },
};

export function initializeBuiltInAgents(): void {
  const registry = getAgentRegistry();
  
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.codex, new CodexAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.aider, new AiderAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.gemini, new GeminiAdapter());
  registry.register(BUILT_IN_AGENT_DESCRIPTORS.claude, new ClaudeAdapter());
}
