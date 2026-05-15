export interface AgentCliInfo {
  name: string;
  installed: boolean;
  version?: string;
  configured_enabled: boolean;
  has_permission: boolean;
  invocable: boolean;
  ready: boolean;
}

export function normalizeAgentCliInfo(raw: Partial<AgentCliInfo>): AgentCliInfo {
  return {
    name: raw.name ?? '',
    installed: raw.installed === true,
    version: raw.version,
    configured_enabled: raw.configured_enabled === true,
    has_permission: raw.has_permission === true,
    invocable: raw.invocable === true,
    // Fail-closed for old CLI payloads missing ready.
    ready: raw.ready === true,
  };
}

export function getSelectableAgents(agents: AgentCliInfo[]): AgentCliInfo[] {
  return agents.filter(a => a.installed && a.invocable && a.ready);
}

export function formatAgentAvailabilityMessage(agents: AgentCliInfo[]): string {
  const selectable = getSelectableAgents(agents).map(a => a.name);
  const installedButNotInvocable = agents
    .filter(a => a.installed && !a.invocable)
    .map(a => a.name);
  const installedButNotReady = agents
    .filter(a => a.installed && a.invocable && !a.ready)
    .map(a => a.name);
  const notInstalled = agents.filter(a => !a.installed).map(a => a.name);

  const parts: string[] = [];
  if (selectable.length > 0) parts.push(`可执行: ${selectable.join(', ')}`);
  if (installedButNotInvocable.length > 0) parts.push(`已安装但入口不可调用: ${installedButNotInvocable.join(', ')}`);
  if (installedButNotReady.length > 0) parts.push(`已安装但未就绪: ${installedButNotReady.join(', ')}`);
  if (notInstalled.length > 0) parts.push(`未安装: ${notInstalled.join(', ')}`);

  if (parts.length === 0) {
    return '未检测到可执行的 AI Agent CLI，请先安装或修复 gemini/claude/codex/aider 等工具';
  }
  return `未检测到可执行的 AI Agent CLI。${parts.join('；')}`;
}
