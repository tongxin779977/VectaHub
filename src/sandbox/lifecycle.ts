import { randomUUID } from 'node:crypto';
import type {
  LifecyclePhase,
  LifecycleContext,
  LifecycleHook,
  LifecycleHookRegistration,
  LifecycleManager,
} from './types.js';

/**
 * 创建生命周期管理器实例
 *
 * 支持在沙箱的不同生命周期阶段（init、beforeExec、afterExec、
 * onError、onCleanup、destroy）注册钩子，并按优先级顺序执行。
 *
 * @returns 生命周期管理器实例
 */
export function createLifecycleManager(): LifecycleManager {
  const hooks = new Map<string, LifecycleHookRegistration>();
  const phaseIndex = new Map<LifecyclePhase, string[]>();

  function generateId(): string {
    return `hook_${randomUUID().slice(0, 8)}`;
  }

  function addToPhaseIndex(id: string, phase: LifecyclePhase): void {
    const ids = phaseIndex.get(phase) ?? [];
    ids.push(id);
    phaseIndex.set(phase, ids);
  }

  function removeFromPhaseIndex(id: string, phase: LifecyclePhase): void {
    const ids = phaseIndex.get(phase);
    if (!ids) return;
    const idx = ids.indexOf(id);
    if (idx >= 0) ids.splice(idx, 1);
  }

  function getSortedHooks(phase: LifecyclePhase): LifecycleHookRegistration[] {
    const ids = phaseIndex.get(phase) ?? [];
    return ids
      .map((id) => hooks.get(id))
      .filter((h): h is LifecycleHookRegistration => h !== undefined)
      .sort((a, b) => a.priority - b.priority);
  }

  return {
    /**
     * 注册持久钩子
     *
     * @param phase - 生命周期阶段
     * @param hook - 钩子函数
     * @param priority - 优先级（数值越小越先执行，默认 100）
     * @returns 钩子唯一标识符，用于后续 off 移除
     */
    on(phase: LifecyclePhase, hook: LifecycleHook, priority: number = 100): string {
      const id = generateId();
      const registration: LifecycleHookRegistration = { id, phase, hook, priority, once: false };
      hooks.set(id, registration);
      addToPhaseIndex(id, phase);
      return id;
    },

    /**
     * 注册一次性钩子（触发后自动移除）
     *
     * @param phase - 生命周期阶段
     * @param hook - 钩子函数
     * @param priority - 优先级（数值越小越先执行，默认 100）
     * @returns 钩子唯一标识符
     */
    once(phase: LifecyclePhase, hook: LifecycleHook, priority: number = 100): string {
      const id = generateId();
      const registration: LifecycleHookRegistration = { id, phase, hook, priority, once: true };
      hooks.set(id, registration);
      addToPhaseIndex(id, phase);
      return id;
    },

    /**
     * 移除指定钩子
     *
     * @param id - 钩子标识符
     * @returns 是否成功移除
     */
    off(id: string): boolean {
      const registration = hooks.get(id);
      if (!registration) return false;
      removeFromPhaseIndex(id, registration.phase);
      hooks.delete(id);
      return true;
    },

    /**
     * 触发指定阶段的所有钩子
     *
     * 按优先级顺序依次执行，一次性钩子在执行后自动移除。
     * 单个钩子执行失败不会阻断后续钩子。
     *
     * @param phase - 要触发的生命周期阶段
     * @param context - 事件上下文（不含 phase 和 timestamp，由框架填充）
     */
    async emit(
      phase: LifecyclePhase,
      context: Omit<LifecycleContext, 'phase' | 'timestamp'>
    ): Promise<void> {
      const fullContext: LifecycleContext = {
        ...context,
        phase,
        timestamp: Date.now(),
      };

      const sortedHooks = getSortedHooks(phase);
      const toRemove: string[] = [];

      for (const registration of sortedHooks) {
        try {
          await registration.hook(fullContext);
        } catch {
          // 单个钩子失败不阻断后续执行
        }
        if (registration.once) {
          toRemove.push(registration.id);
        }
      }

      for (const id of toRemove) {
        const reg = hooks.get(id);
        if (reg) {
          removeFromPhaseIndex(id, reg.phase);
          hooks.delete(id);
        }
      }
    },

    /**
     * 清除所有已注册的钩子
     */
    clear(): void {
      hooks.clear();
      phaseIndex.clear();
    },

    /**
     * 获取指定阶段的所有钩子注册信息
     *
     * @param phase - 生命周期阶段
     * @returns 按优先级排序的钩子注册列表
     */
    getHooks(phase: LifecyclePhase): LifecycleHookRegistration[] {
      return getSortedHooks(phase);
    },
  };
}
