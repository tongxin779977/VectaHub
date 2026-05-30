
import type { AIModule, AIModuleContext, AIModuleMetadata, AIModuleRegistry as IAIModuleRegistry, AIModuleType } from './types.js';

const debug = { debug: (_opts?: object, _msg?: string) => {} };

export function createAIModuleRegistry(): IAIModuleRegistry {
  const modules = new Map<string, AIModule>();
  const metadata = new Map<string, AIModuleMetadata>();

  return {
    register(module: AIModule, meta?: AIModuleMetadata): void {
      modules.set(module.id, module);
      metadata.set(module.id, meta ?? { enabled: true });
    },

    unregister(moduleId: string): boolean {
      const deleted = modules.delete(moduleId);
      metadata.delete(moduleId);
      return deleted;
    },

    get(moduleId: string): AIModule | undefined {
      return modules.get(moduleId);
    },

    getMetadata(moduleId: string): AIModuleMetadata | undefined {
      return metadata.get(moduleId);
    },

    setMetadata(moduleId: string, meta: Partial<AIModuleMetadata>): void {
      const existing = metadata.get(moduleId) ?? { enabled: true };
      metadata.set(moduleId, { ...existing, ...meta });
    },

    list(): AIModule[] {
      return Array.from(modules.values());
    },

    listByType(type: AIModuleType): AIModule[] {
      return Array.from(modules.values()).filter(m => m.type === type);
    },

    async findApplicable(context: AIModuleContext): Promise<AIModule[]> {
      const applicable: AIModule[] = [];
      for (const module of modules.values()) {
        const meta = metadata.get(module.id);
        if (meta && !meta.enabled) continue;
        try {
          if (await module.canHandle(context)) {
            applicable.push(module);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          debug.debug({ error: message }, 'Skip module that throws in canHandle');
        }
      }
      return applicable;
    },

    isEnabled(moduleId: string): boolean {
      const meta = metadata.get(moduleId);
      return meta?.enabled ?? false;
    },

    size(): number {
      return modules.size;
    },

    clear(): void {
      modules.clear();
      metadata.clear();
    }
  };
}
