import { describe, it, expect } from 'vitest';
import { GenericAdapter } from './generic-adapter';
import type { AgentDescriptor, AgentAdapterInput } from '../types/agent';

describe('GenericAdapter', () => {
  const testDescriptor: AgentDescriptor = {
    id: 'test-cli',
    displayName: 'Test CLI',
    entryCommand: 'test-cli',
    promptTransport: 'arg',
    promptArgName: '--prompt',
    nonInteractiveFlags: ['--no-interactive'],
    approvalPolicySupport: 'unknown',
    structuredOutputSupport: false,
    preflightSpec: { versionArgs: ['--version'] },
    dryRunRenderMode: 'prompt-only',
    runtimePolicy: { configSemantics: 'inherit-user-default' },
  };
  
  it('should support descriptors with matching id', () => {
    const adapter = new GenericAdapter(testDescriptor);
    
    expect(adapter.supports(testDescriptor)).toBe(true);
    expect(adapter.supports({ ...testDescriptor, id: 'different' })).toBe(false);
  });
  
  it('should render command with arg prompt transport', () => {
    const adapter = new GenericAdapter(testDescriptor);
    const input: AgentAdapterInput = {
      descriptor: testDescriptor,
      workspaceRoot: '/test',
      taskPrompt: 'Hello world',
      mode: 'run',
      outputMode: 'text',
    };
    
    const result = adapter.render(input);
    
    expect(result.command).toBe('test-cli');
    expect(result.args).toEqual(['--prompt', 'Hello world', '--no-interactive']);
    expect(result.preview).toBe('test-cli --prompt Hello world --no-interactive');
  });
  
  it('should render command with stdin prompt transport', () => {
    const stdinDescriptor = { ...testDescriptor, promptTransport: 'stdin' as const };
    const adapter = new GenericAdapter(stdinDescriptor);
    const input: AgentAdapterInput = {
      descriptor: stdinDescriptor,
      workspaceRoot: '/test',
      taskPrompt: 'Hello world',
      mode: 'run',
      outputMode: 'text',
    };
    
    const result = adapter.render(input);
    
    expect(result.args).toEqual(['--no-interactive', '-']);
    expect(result.stdinInput).toBe('Hello world');
  });
  
  it('should render command with positional prompt transport', () => {
    const positionalDescriptor = { ...testDescriptor, promptTransport: 'positional' as const, promptArgName: undefined };
    const adapter = new GenericAdapter(positionalDescriptor);
    const input: AgentAdapterInput = {
      descriptor: positionalDescriptor,
      workspaceRoot: '/test',
      taskPrompt: 'Hello world',
      mode: 'run',
      outputMode: 'text',
    };
    
    const result = adapter.render(input);
    
    expect(result.args).toEqual(['Hello world', '--no-interactive']);
  });
  
  it('should include subcommand if present', () => {
    const subcommandDescriptor = { ...testDescriptor, subcommand: 'run' };
    const adapter = new GenericAdapter(subcommandDescriptor);
    const input: AgentAdapterInput = {
      descriptor: subcommandDescriptor,
      workspaceRoot: '/test',
      taskPrompt: 'Hello world',
      mode: 'run',
      outputMode: 'text',
    };
    
    const result = adapter.render(input);
    
    expect(result.args).toEqual(['run', '--prompt', 'Hello world', '--no-interactive']);
  });
  
  it('should include working directory arg if present', () => {
    const wdDescriptor = { ...testDescriptor, workingDirectoryArg: '--cwd' };
    const adapter = new GenericAdapter(wdDescriptor);
    const input: AgentAdapterInput = {
      descriptor: wdDescriptor,
      workspaceRoot: '/test/dir',
      taskPrompt: 'Hello world',
      mode: 'run',
      outputMode: 'text',
    };
    
    const result = adapter.render(input);
    
    expect(result.args).toEqual(['--cwd', '/test/dir', '--prompt', 'Hello world', '--no-interactive']);
  });
  
  it('should add codex specific --output-last-message flag', () => {
    const codexDescriptor = { ...testDescriptor, id: 'codex' };
    const adapter = new GenericAdapter(codexDescriptor);
    const input: AgentAdapterInput = {
      descriptor: codexDescriptor,
      workspaceRoot: '/test',
      taskPrompt: 'Hello world',
      mode: 'run',
      outputMode: 'text',
      outputLastMessagePath: '/tmp/output.txt',
    };
    
    const result = adapter.render(input);
    
    expect(result.args).toContain('--output-last-message');
    expect(result.args).toContain('/tmp/output.txt');
  });
});
