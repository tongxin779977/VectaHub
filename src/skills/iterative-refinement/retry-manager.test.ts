import { describe, it, expect, vi } from 'vitest';
import { createRetryManager } from './retry-manager.js';

describe('RetryManager', () => {
  describe('基本功能', () => {
    it('应该能成功执行任务', async () => {
      const manager = createRetryManager({ maxAttempts: 3 });
      const taskFn = vi.fn().mockResolvedValue('success');

      const result = await manager.executeWithRetry(taskFn);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.result).toBe('success');
      expect(taskFn).toHaveBeenCalledTimes(1);
    });

    it('失败后应该重试', async () => {
      const manager = createRetryManager({
        maxAttempts: 3,
        initialBackoff: 10,
      });
      let callCount = 0;
      const taskFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('test error');
        }
        return 'success';
      });

      const result = await manager.executeWithRetry(taskFn);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(3);
      expect(taskFn).toHaveBeenCalledTimes(3);
    });

    it('超过最大尝试次数后应该返回失败', async () => {
      const manager = createRetryManager({
        maxAttempts: 2,
        initialBackoff: 10,
      });
      const taskFn = vi.fn().mockRejectedValue(new Error('persistent error'));

      const result = await manager.executeWithRetry(taskFn);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(2);
      expect(result.finalError).toBe('persistent error');
      expect(taskFn).toHaveBeenCalledTimes(2);
    });

    it('应该能获取配置', () => {
      const manager = createRetryManager({
        maxAttempts: 10,
        initialBackoff: 500,
      });

      const config = manager.getConfig();

      expect(config.maxAttempts).toBe(10);
      expect(config.initialBackoff).toBe(500);
    });
  });

  describe('回调功能', () => {
    it('应该调用 onAttempt 回调', async () => {
      const manager = createRetryManager({
        maxAttempts: 2,
        initialBackoff: 10,
      });
      const onAttempt = vi.fn();
      const taskFn = vi.fn().mockRejectedValue(new Error('test'));

      await manager.executeWithRetry(taskFn, {
        callbacks: { onAttempt },
      });

      expect(onAttempt).toHaveBeenCalledTimes(2);
      expect(onAttempt).toHaveBeenNthCalledWith(1, 1, expect.any(Object));
      expect(onAttempt).toHaveBeenNthCalledWith(2, 2, expect.any(Object));
    });

    it('应该调用 onSuccess 回调', async () => {
      const manager = createRetryManager({ maxAttempts: 2 });
      const onSuccess = vi.fn();
      const taskFn = vi.fn().mockResolvedValue('ok');

      await manager.executeWithRetry(taskFn, {
        callbacks: { onSuccess },
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('应该调用 onFailure 回调', async () => {
      const manager = createRetryManager({
        maxAttempts: 2,
        initialBackoff: 10,
      });
      const onFailure = vi.fn();
      const taskFn = vi.fn().mockRejectedValue(new Error('fail'));

      await manager.executeWithRetry(taskFn, {
        callbacks: { onFailure },
      });

      expect(onFailure).toHaveBeenCalledTimes(1);
    });
  });

  describe('5Whys 集成', () => {
    it('失败次数达到阈值后应该触发分析', async () => {
      const manager = createRetryManager({
        maxAttempts: 3,
        initialBackoff: 10,
        triggerAnalysisAfter: 2,
      });
      const onAnalysisStart = vi.fn();
      const onAnalysisComplete = vi.fn();
      const taskFn = vi.fn().mockRejectedValue(new Error('ENOENT: test error'));

      const result = await manager.executeWithRetry(taskFn, {
        callbacks: {
          onAnalysisStart,
          onAnalysisComplete,
        },
      });

      expect(onAnalysisStart).toHaveBeenCalledTimes(1);
      expect(onAnalysisComplete).toHaveBeenCalledTimes(1);
      expect(result.analysis).toBeDefined();
      expect(result.analysis?.rootCauses.length).toBeGreaterThan(0);
    });
  });

  describe('上下文信息', () => {
    it('应该提供正确的重试上下文', async () => {
      const manager = createRetryManager({
        maxAttempts: 2,
        initialBackoff: 10,
      });
      const contexts: any[] = [];
      const taskFn = vi.fn().mockRejectedValue(new Error('test'));

      await manager.executeWithRetry(taskFn, {
        callbacks: {
          onAttempt: (attempt, context) => {
            contexts.push({ attempt, context });
          },
        },
      });

      expect(contexts.length).toBe(2);
      expect(contexts[0].context.attemptCount).toBe(1);
      expect(contexts[0].context.maxAttempts).toBe(2);
      expect(contexts[1].context.attemptCount).toBe(2);
      expect(contexts[1].context.previousAttempts.length).toBe(1);
    });
  });
});
