/**
 * 懒加载模块加载器
 *
 * 用于延迟加载模块，只在第一次使用时才实例化
 */
export class LazyModuleLoader {
  private moduleCache: Map<string, any> = new Map();
  private moduleFactories: Map<string, () => Promise<any>> = new Map();

  /**
   * 注册模块工厂
   */
  register<T>(id: string, factory: () => Promise<T>): void {
    this.moduleFactories.set(id, factory);
  }

  /**
   * 获取模块（懒加载）
   */
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
