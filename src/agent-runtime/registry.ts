import type { 
  AgentDescriptor, 
  AgentAdapter, 
  AgentRegistry 
} from '../types/agent.js';

export interface AgentRegistryDeps {
  logger: Pick<Console, 'warn'>;
}

const silentAgentRegistryLogger: AgentRegistryDeps['logger'] = {
  warn(): void {},
};

class AgentRegistryImpl implements AgentRegistry {
  private descriptors: Map<string, AgentDescriptor> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();

  constructor(private readonly deps: AgentRegistryDeps) {}

  register(descriptor: AgentDescriptor, adapter: AgentAdapter): void {
    const id = descriptor.id.toLowerCase();
    if (this.descriptors.has(id)) {
      this.deps.logger.warn(`Agent with ID "${descriptor.id}" is already registered. Overwriting.`);
    }
    this.descriptors.set(id, descriptor);
    this.adapters.set(id, adapter);
  }

  unregister(id: string): boolean {
    const normalizedId = id.toLowerCase();
    const existed = this.descriptors.has(normalizedId);
    this.descriptors.delete(normalizedId);
    this.adapters.delete(normalizedId);
    return existed;
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

  has(id: string): boolean {
    return this.descriptors.has(id.toLowerCase());
  }

  clear(): void {
    this.descriptors.clear();
    this.adapters.clear();
  }
}

let instance: AgentRegistry | null = null;

/**
 * Returns the singleton instance of the AgentRegistry.
 * In a more complex DI environment, this would be injected.
 */
export function getAgentRegistry(deps: AgentRegistryDeps = { logger: silentAgentRegistryLogger }): AgentRegistry {
  if (!instance) {
    instance = new AgentRegistryImpl(deps);
  }
  return instance;
}

/**
 * For testing purposes only.
 */
export function resetAgentRegistry(): void {
  instance = null;
}
