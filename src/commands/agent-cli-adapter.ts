import { getAgentRegistry } from '../agent-runtime/registry.js';
import type { 
  AgentDescriptor, 
  AgentAdapter, 
  AgentAdapterInput, 
  AgentAdapterOutput 
} from '../types/agent.js';

// Re-export types for backward compatibility
export type { 
  AgentDescriptor, 
  AgentAdapter, 
  AgentAdapterInput, 
  AgentAdapterOutput,
  AgentPromptTransport,
  AgentApprovalPolicySupport,
  AgentPreflightSpec,
  AgentRuntimeBootstrapFile,
  AgentWritableRuntimeHomePolicy,
  AgentRuntimePolicy
} from '../types/agent.js';

export function getBuiltInAgentDescriptors(): AgentDescriptor[] {
  return getAgentRegistry().getAllDescriptors();
}

export function getAgentDescriptorById(agentId: string): AgentDescriptor | null {
  return getAgentRegistry().getAgentDescriptor(agentId);
}

export function isKnownAgentCli(agentId: string): boolean {
  return getAgentRegistry().isKnownAgent(agentId);
}

export function getAgentAdapterById(agentId: string): AgentAdapter | null {
  return getAgentRegistry().getAgentAdapter(agentId);
}
