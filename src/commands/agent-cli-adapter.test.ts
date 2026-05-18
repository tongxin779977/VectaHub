import { describe, it, expect } from 'vitest';
import {
  getAgentAdapterById,
  getAgentDescriptorById,
  getBuiltInAgentDescriptors,
  isKnownAgentCli,
} from './agent-cli-adapter.js';

describe('agent-cli-adapter registry', () => {
  it('should register built-in known agent descriptors', () => {
    const descriptors = getBuiltInAgentDescriptors();
    const ids = descriptors.map(item => item.id).sort();
    expect(ids).toEqual(['aider', 'claude', 'codex', 'gemini']);
  });

  it('should resolve descriptor by id with case-insensitive lookup', () => {
    const codex = getAgentDescriptorById('CoDeX');
    expect(codex).not.toBeNull();
    expect(codex?.entryCommand).toBe('codex');
    expect(codex?.preflightSpec.versionArgs).toEqual(['--version']);
    expect(codex?.subcommand).toBe('exec');
    expect(codex?.promptTransport).toBe('positional');
    expect(codex?.promptArgName).toBeUndefined();
    expect(codex?.workingDirectoryArg).toBe('--cd');
    expect(codex?.workingDirectoryArgAliases).toEqual(['-C', '--cd']);
    expect(codex?.preflightSpec.invocableArgs).toEqual(['exec', '--help']);
    expect(codex?.preflightSpec.readyArgs).toEqual(['exec', '--sandbox', 'workspace-write', '--help']);
    expect(codex?.nonInteractiveFlags).toEqual(['--sandbox', 'workspace-write']);
    expect(codex?.runtimePolicy?.configSemantics).toBe('inherit-user-default');
    expect(codex?.runtimePolicy?.writableRuntimeHome).toEqual({
      envVar: 'CODEX_HOME',
      defaultHomeSubdir: '.codex',
      bootstrapFiles: [
        { relativePath: 'config.toml', required: false },
        { relativePath: 'auth.json', required: false },
      ],
      requireAnyBootstrapFile: true,
    });
  });

  it('should return null for unknown agent id', () => {
    expect(getAgentDescriptorById('unknown-agent')).toBeNull();
    expect(isKnownAgentCli('unknown-agent')).toBe(false);
  });

  it('should include protocol baseline fields for each built-in descriptor', () => {
    for (const descriptor of getBuiltInAgentDescriptors()) {
      expect(descriptor.id.length).toBeGreaterThan(0);
      expect(descriptor.entryCommand.length).toBeGreaterThan(0);
      expect(descriptor.promptTransport).toMatch(/^(arg|stdin|file|positional)$/);
      expect(descriptor.preflightSpec.versionArgs.length).toBeGreaterThan(0);
      expect(descriptor.preflightSpec.readyArgs?.length).toBeGreaterThan(0);
      expect(Array.isArray(descriptor.nonInteractiveFlags)).toBe(true);
    }
  });

  it('should render codex invocation via adapter', () => {
    const descriptor = getAgentDescriptorById('codex');
    const adapter = getAgentAdapterById('codex');
    expect(descriptor).not.toBeNull();
    expect(adapter).not.toBeNull();

    const rendered = adapter!.render({
      descriptor: descriptor!,
      workspaceRoot: '/workspace/project',
      taskPrompt: '实现任务',
      mode: 'run',
      outputMode: 'text',
    });

    expect(rendered.command).toBe('codex');
    expect(rendered.args.slice(0, 3)).toEqual(['exec', '--cd', '/workspace/project']);
    expect(rendered.args.slice(3, 5)).toEqual(['--sandbox', 'workspace-write']);
    expect(rendered.args[5]).toBe('实现任务');
    expect(rendered.envPatch).toBeUndefined();
  });

  it('should render aider invocation via adapter', () => {
    const descriptor = getAgentDescriptorById('aider');
    const adapter = getAgentAdapterById('aider');
    expect(descriptor).not.toBeNull();
    expect(adapter).not.toBeNull();

    const rendered = adapter!.render({
      descriptor: descriptor!,
      workspaceRoot: '/workspace/project',
      taskPrompt: '实现任务',
      mode: 'run',
      outputMode: 'text',
    });

    expect(rendered.command).toBe('aider');
    expect(rendered.args).toEqual(['--message', '实现任务']);
  });

  it('should render gemini invocation via adapter without CLI cwd flag and with headless prompt flag', () => {
    const descriptor = getAgentDescriptorById('gemini');
    const adapter = getAgentAdapterById('gemini');
    expect(descriptor).not.toBeNull();
    expect(adapter).not.toBeNull();

    const rendered = adapter!.render({
      descriptor: descriptor!,
      workspaceRoot: '/workspace/project',
      taskPrompt: '实现任务',
      mode: 'run',
      outputMode: 'text',
    });

    expect(rendered.command).toBe('gemini');
    expect(descriptor?.workingDirectoryArg).toBeUndefined();
    expect(descriptor?.preflightSpec.readyArgs).toEqual(['-p', 'vectahub-ready-probe', '--help']);
    expect(rendered.args).toEqual(['-p', '实现任务', '-y']);
  });

  it('should render claude invocation via adapter with deterministic subcommand/cwd/message args', () => {
    const descriptor = getAgentDescriptorById('claude');
    const adapter = getAgentAdapterById('claude');
    expect(descriptor).not.toBeNull();
    expect(adapter).not.toBeNull();

    const rendered = adapter!.render({
      descriptor: descriptor!,
      workspaceRoot: '/workspace/project',
      taskPrompt: '实现任务',
      mode: 'run',
      outputMode: 'text',
    });

    expect(rendered.command).toBe('claude');
    expect(rendered.args).toEqual(['code', '--cwd', '/workspace/project', '--message', '实现任务']);
  });

  it('should keep dry-run render deterministic for known adapters', () => {
    const codexDescriptor = getAgentDescriptorById('codex');
    const codexAdapter = getAgentAdapterById('codex');
    const rendered = codexAdapter!.render({
      descriptor: codexDescriptor!,
      workspaceRoot: '/workspace/project',
      taskPrompt: 'dry run prompt',
      mode: 'dry-run',
      outputMode: 'text',
    });
    expect(rendered.preview).toContain('codex exec --cd /workspace/project --sandbox workspace-write');
  });

  it('should keep aider and gemini on inherited user-default config semantics only', () => {
    for (const agentId of ['aider', 'gemini'] as const) {
      const descriptor = getAgentDescriptorById(agentId);
      expect(descriptor?.runtimePolicy?.configSemantics).toBe('inherit-user-default');
      expect(descriptor?.runtimePolicy?.writableRuntimeHome).toBeUndefined();
    }
  });

  it('should configure claude with writable runtime home bootstrap semantics', () => {
    const descriptor = getAgentDescriptorById('claude');
    expect(descriptor?.runtimePolicy?.configSemantics).toBe('inherit-user-default');
    expect(descriptor?.runtimePolicy?.writableRuntimeHome).toEqual({
      envVar: 'CLAUDE_HOME',
      defaultHomeSubdir: '.claude',
      bootstrapFiles: [
        { relativePath: 'settings.json', required: false },
      ],
      requireAnyBootstrapFile: false,
      fallbackToUserHomeWhenBootstrapMissing: true,
    });
  });
});
