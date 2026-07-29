/**
 * Lazy module loader with async optimization support.
 * Provides deferred loading, caching, preloading, and parallel loading capabilities.
 */
export class LazyModuleLoader {
  private moduleCache: Map<string, unknown> = new Map();
  private moduleFactories: Map<string, () => Promise<unknown>> = new Map();
  private loadingPromises: Map<string, Promise<unknown>> = new Map();
  private preloadQueue: Set<string> = new Set();
  private loadPriorities: Map<string, number> = new Map();

  /**
   * Register a module factory for lazy loading.
   * @param id - Unique identifier for the module.
   * @param factory - Async factory function that creates the module.
   * @param priority - Loading priority (higher = loaded first during preload).
   */
  register<T>(id: string, factory: () => Promise<T>, priority: number = 0): void {
    this.moduleFactories.set(id, factory);
    this.loadPriorities.set(id, priority);
  }

  /**
   * Get a module, loading it lazily if not cached.
   * Uses deduplication to prevent concurrent loads of the same module.
   * @param id - Module identifier.
   * @returns The loaded module.
   * @throws {Error} When module is not registered.
   */
  async get<T>(id: string): Promise<T> {
    const cached = this.moduleCache.get(id);
    if (cached !== undefined) {
      return cached as T;
    }

    const pending = this.loadingPromises.get(id);
    if (pending) {
      return pending as Promise<T>;
    }

    const factory = this.moduleFactories.get(id);
    if (!factory) {
      throw new Error(`Module ${id} not registered`);
    }

    const loadPromise = factory().then(module => {
      this.moduleCache.set(id, module);
      this.loadingPromises.delete(id);
      return module;
    }).catch(error => {
      this.loadingPromises.delete(id);
      throw error;
    });

    this.loadingPromises.set(id, loadPromise);
    return loadPromise as Promise<T>;
  }

  /**
   * Check if a module is registered.
   * @param id - Module identifier.
   * @returns True if the module is registered.
   */
  has(id: string): boolean {
    return this.moduleFactories.has(id);
  }

  /**
   * Check if a module is already loaded (cached).
   * @param id - Module identifier.
   * @returns True if the module is cached.
   */
  isLoaded(id: string): boolean {
    return this.moduleCache.has(id);
  }

  /**
   * Add modules to the preload queue.
   * @param ids - Array of module identifiers to preload.
   */
  enqueuePreload(ids: string[]): void {
    for (const id of ids) {
      if (this.moduleFactories.has(id) && !this.moduleCache.has(id)) {
        this.preloadQueue.add(id);
      }
    }
  }

  /**
   * Execute preloading for all queued modules in parallel.
   * Modules are loaded in priority order (higher priority first).
   * @returns Promise that resolves when all queued modules are loaded.
   */
  async flushPreload(): Promise<void> {
    const sortedIds = Array.from(this.preloadQueue).sort((a, b) => {
      const priorityA = this.loadPriorities.get(a) ?? 0;
      const priorityB = this.loadPriorities.get(b) ?? 0;
      return priorityB - priorityA;
    });

    this.preloadQueue.clear();

    const loadPromises = sortedIds.map(id => this.get(id).catch(e => {
      console.warn({ moduleId: id, error: e instanceof Error ? e.message : String(e) }, 'Lazy module preload failed');
    }));
    await Promise.allSettled(loadPromises);
  }

  /**
   * Load multiple modules in parallel.
   * @param ids - Array of module identifiers to load.
   * @returns Promise that resolves to a Map of loaded modules.
   */
  async loadAll<T>(ids: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const loadPromises = ids.map(async id => {
      const module = await this.get<T>(id);
      results.set(id, module);
    });

    await Promise.allSettled(loadPromises);
    return results;
  }

  /**
   * Clear the module cache, forcing reload on next access.
   * @param ids - Optional array of specific module IDs to clear. Clears all if not specified.
   */
  clearCache(ids?: string[]): void {
    if (ids) {
      for (const id of ids) {
        this.moduleCache.delete(id);
      }
    } else {
      this.moduleCache.clear();
    }
  }

  /**
   * Get cache statistics.
   * @returns Object with cache size, registered count, and loading count.
   */
  getStats(): { cached: number; registered: number; loading: number } {
    return {
      cached: this.moduleCache.size,
      registered: this.moduleFactories.size,
      loading: this.loadingPromises.size,
    };
  }
}
