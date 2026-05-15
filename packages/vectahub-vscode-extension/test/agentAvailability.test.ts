import { describe, expect, it } from 'vitest';
import {
  formatAgentAvailabilityMessage,
  getSelectableAgents,
  normalizeAgentCliInfo,
  type AgentCliInfo,
} from '../src/commands/agentAvailability.js';

function makeAgent(overrides: Partial<AgentCliInfo>): AgentCliInfo {
  return {
    name: 'agent',
    installed: true,
    version: '1.0.0',
    configured_enabled: true,
    has_permission: true,
    invocable: true,
    ready: true,
    ...overrides,
  };
}

describe('agentAvailability', () => {
  it('normalizeAgentCliInfo 对缺失 ready 的旧 payload 保持 fail-closed', () => {
    const normalized = normalizeAgentCliInfo({
      name: 'codex',
      installed: true,
      invocable: true,
    });

    expect(normalized.ready).toBe(false);
    expect(normalized.installed).toBe(true);
    expect(normalized.invocable).toBe(true);
  });

  it('getSelectableAgents 允许显示内部配置态未同步但已可运行的 agent', () => {
    const agents = [
      makeAgent({
        name: 'codex',
        configured_enabled: false,
        has_permission: false,
      }),
      makeAgent({
        name: 'aider',
        configured_enabled: false,
        has_permission: false,
      }),
      makeAgent({
        name: 'claude',
        installed: false,
        invocable: false,
        ready: false,
      }),
    ];

    expect(getSelectableAgents(agents).map(agent => agent.name)).toEqual(['codex', 'aider']);
  });

  it('getSelectableAgents 不显示入口不可调用或未就绪的 agent', () => {
    const agents = [
      makeAgent({ name: 'gemini', invocable: false, ready: false }),
      makeAgent({ name: 'codex', invocable: true, ready: false }),
      makeAgent({ name: 'aider' }),
    ];

    expect(getSelectableAgents(agents).map(agent => agent.name)).toEqual(['aider']);
  });

  it('formatAgentAvailabilityMessage 只暴露用户需要的运行事实', () => {
    const message = formatAgentAvailabilityMessage([
      makeAgent({ name: 'codex', configured_enabled: false, has_permission: false, invocable: false, ready: false }),
      makeAgent({ name: 'aider', configured_enabled: false, has_permission: false, invocable: true, ready: false }),
      makeAgent({ name: 'claude', installed: false, invocable: false, ready: false }),
    ]);

    expect(message).toContain('入口不可调用');
    expect(message).toContain('未就绪');
    expect(message).toContain('未安装');
    expect(message).not.toContain('configured_enabled');
    expect(message).not.toContain('has_permission');
    expect(message).not.toContain('未启用');
    expect(message).not.toContain('未授权');
  });
});
