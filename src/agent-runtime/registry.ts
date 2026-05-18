import type { 
  AgentDescriptor, 
  AgentAdapter, 
  AgentRegistry 
} from '../types/agent.js';

class AgentRegistryImpl implements AgentRegistry {
  private descriptors: Map<string, AgentDescriptor> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();

  register(descriptor: AgentDescriptor, adapter: AgentAdapter): void {
    const id = descriptor.id.toLowerCase();
    if (this.descriptors.has(id)) {
      console.warn(`Agent with ID "${descriptor.id}" is already registered. Overwriting.`);
    }
    this.descriptors.set(id, descriptor);
    this.adapters.set(id, adapter);
  }

  getAgentDescriptor(id: string): AgentDescriptor | null {
    return this.descriptors.get(id.toLowerCase()) ?? null;
  }

  getAgentAdapter(id: string): AgentAdapter | null {
    return this.adapters.get(id.toLowerCase()) ?? null;
  }

  getAllDescriptors(): AgentDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  isKnownAgent(id: string): boolean {
    return this.descriptors.has(id.toLowerCase());
  }
}

let instance: AgentRegistry | null = null;

/**
 * Returns the singleton instance of the AgentRegistry.
 * In a more complex DI environment, this would be injected.
 */
export function getAgentRegistry(): AgentRegistry {
  if (!instance) {
    instance = new AgentRegistryImpl();
  }
  return instance;
}

/**
 * For testing purposes only.
 */
export function resetAgentRegistry(): void {
  instance = null;
}
