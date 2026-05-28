import { randomUUID } from 'node:crypto';
import type {
  ResourceType,
  ResourceRecord,
  LeakReport,
  ResourceTracker,
  ResourceTrackerStats,
} from './types.js';

const DEFAULT_LEAK_THRESHOLD_MS = 300_000;

/**
 * 创建资源追踪器实例
 *
 * 追踪沙箱运行期间分配的文件句柄、子进程、临时文件等资源，
 * 在资源未被正常释放时检测泄漏并生成报告。
 *
 * @returns 资源追踪器实例
 */
export function createResourceTracker(): ResourceTracker {
  const resources = new Map<string, ResourceRecord>();

  function generateId(): string {
    return `res_${randomUUID().slice(0, 8)}`;
  }

  return {
    /**
     * 追踪一个新资源
     *
     * @param type - 资源类型
     * @param description - 资源描述
     * @param metadata - 附加元数据
     * @returns 资源唯一标识符
     */
    track(type: ResourceType, description: string, metadata?: Record<string, unknown>): string {
      const id = generateId();
      const record: ResourceRecord = {
        id,
        type,
        description,
        createdAt: Date.now(),
        status: 'active',
        metadata,
      };
      resources.set(id, record);
      return id;
    },

    /**
     * 释放一个已追踪的资源
     *
     * @param id - 资源标识符
     * @returns 是否成功释放（资源不存在或已释放时返回 false）
     */
    release(id: string): boolean {
      const record = resources.get(id);
      if (!record || record.status !== 'active') {
        return false;
      }
      record.status = 'released';
      record.releasedAt = Date.now();
      return true;
    },

    /**
     * 获取所有处于活跃状态的资源
     *
     * @returns 活跃资源记录列表
     */
    getActiveResources(): ResourceRecord[] {
      return Array.from(resources.values()).filter((r) => r.status === 'active');
    },

    /**
     * 检测潜在的资源泄漏
     *
     * 将超过指定时间仍未释放的活跃资源标记为 leaked。
     *
     * @param maxAgeMs - 资源最大存活时间（毫秒），超过则视为泄漏
     * @returns 泄漏检测报告
     */
    detectLeaks(maxAgeMs: number = DEFAULT_LEAK_THRESHOLD_MS): LeakReport {
      const now = Date.now();
      const leakedResources: ResourceRecord[] = [];

      for (const record of resources.values()) {
        if (record.status === 'active' && now - record.createdAt > maxAgeMs) {
          record.status = 'leaked';
          leakedResources.push(record);
        }
      }

      const allRecords = Array.from(resources.values());
      return {
        leakedResources,
        totalTracked: allRecords.length,
        totalReleased: allRecords.filter((r) => r.status === 'released').length,
        totalLeaked: allRecords.filter((r) => r.status === 'leaked').length,
        generatedAt: now,
      };
    },

    /**
     * 清理所有已释放和已泄漏的资源记录
     *
     * @returns 被清理的记录数量
     */
    cleanup(): number {
      let cleaned = 0;
      for (const [id, record] of resources.entries()) {
        if (record.status !== 'active') {
          resources.delete(id);
          cleaned++;
        }
      }
      return cleaned;
    },

    /**
     * 获取资源追踪统计信息
     *
     * @returns 包含各维度统计数据的统计对象
     */
    getStats(): ResourceTrackerStats {
      const all = Array.from(resources.values());
      const byType: Record<ResourceType, number> = {
        file_handle: 0,
        child_process: 0,
        temp_file: 0,
        temp_dir: 0,
        stream: 0,
        timer: 0,
      };

      for (const record of all) {
        byType[record.type]++;
      }

      return {
        totalTracked: all.length,
        active: all.filter((r) => r.status === 'active').length,
        released: all.filter((r) => r.status === 'released').length,
        leaked: all.filter((r) => r.status === 'leaked').length,
        byType,
      };
    },
  };
}
