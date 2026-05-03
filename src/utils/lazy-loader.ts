export class LazyModuleLoader {
  private moduleCache: Map<string, any> = new Map();
  private moduleFactories: Map<string, () => Promise<any>> = new Map();

  register<T>(id: string, factory: () => Promise<T>): void {
    this.moduleFactories.set(id, factory);
  }

  async get<T>(id: string): Promise<T> {
    if (this.moduleCache.has(id)) {
      return this.moduleCache.get(id);
    }

    const factory = this.moduleFactories.get(id);
    if (!factory) {
      throw new Error(`Module ${id} not registered`);
    }

    const module = await factory();
    this.moduleCache.set(id, module);
    return module;
  }
}
