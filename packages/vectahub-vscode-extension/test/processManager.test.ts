import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../src/ui/output.js', () => ({
  logToOutput: vi.fn(),
}));

import { ProcessManager } from '../src/cli/process-manager.js';

function createFakeChild(opts?: { killed?: boolean; killThrows?: boolean }) {
  const child = new EventEmitter() as any;
  child.pid = Math.floor(Math.random() * 10000) + 1;
  child.killed = opts?.killed ?? false;
  child.kill = vi.fn((signal?: string) => {
    if (opts?.killThrows) throw new Error('kill failed');
    child.killed = true;
    return true;
  });
  child.connected = true;
  child.stdin = null;
  child.stdout = null;
  child.stderr = null;
  return child;
}

describe('ProcessManager', () => {
  beforeEach(() => {
    (ProcessManager as any).instance = undefined;
  });

  describe('getInstance()', () => {
    it('连续调用返回同一引用', () => {
      const a = ProcessManager.getInstance();
      const b = ProcessManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('register() + exit 事件', () => {
    it('exit 事件触发后进程从 Set 中消失', () => {
      const pm = ProcessManager.getInstance();
      const child = createFakeChild();
      pm.register(child);

      const activeBefore = (pm as any).activeProcesses as Set<any>;
      expect(activeBefore.size).toBe(1);

      child.emit('exit', 0, null);

      const activeAfter = (pm as any).activeProcesses as Set<any>;
      expect(activeAfter.size).toBe(0);
    });
  });

  describe('register() + error 事件', () => {
    it('error 事件触发后进程从 Set 中消失', () => {
      const pm = ProcessManager.getInstance();
      const child = createFakeChild();
      pm.register(child);

      expect(((pm as any).activeProcesses as Set<any>).size).toBe(1);

      child.emit('error', new Error('spawn failed'));

      expect(((pm as any).activeProcesses as Set<any>).size).toBe(0);
    });
  });

  describe('killAll()', () => {
    it('对未终止进程发 SIGTERM', () => {
      const pm = ProcessManager.getInstance();
      const c1 = createFakeChild();
      const c2 = createFakeChild();
      pm.register(c1);
      pm.register(c2);

      pm.killAll();

      expect(c1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(c2.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('跳过已 killed 的进程', () => {
      const pm = ProcessManager.getInstance();
      const alive = createFakeChild({ killed: false });
      const dead = createFakeChild({ killed: true });
      pm.register(alive);
      pm.register(dead);

      pm.killAll();

      expect(alive.kill).toHaveBeenCalledWith('SIGTERM');
      expect(dead.kill).not.toHaveBeenCalled();
    });

    it('异常不中断后续进程处理', () => {
      const pm = ProcessManager.getInstance();
      const throws = createFakeChild({ killThrows: true });
      const normal = createFakeChild();
      pm.register(throws);
      pm.register(normal);

      expect(() => pm.killAll()).not.toThrow();
      expect(normal.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('空集合不报错', () => {
      const pm = ProcessManager.getInstance();
      expect(() => pm.killAll()).not.toThrow();
    });

    it('killAll 后清空 activeProcesses', () => {
      const pm = ProcessManager.getInstance();
      pm.register(createFakeChild());
      pm.register(createFakeChild());

      pm.killAll();

      expect(((pm as any).activeProcesses as Set<any>).size).toBe(0);
    });
  });
});
