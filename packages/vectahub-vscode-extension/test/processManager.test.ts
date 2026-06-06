import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../src/ui/output.js', () => ({
  logToOutput: vi.fn(),
}));

import { ProcessManager } from '../src/cli/process-manager.js';

let nextPid = 1001;

function createFakeChild(opts?: { killed?: boolean; killThrows?: boolean; pid?: number }) {
  const child = new EventEmitter() as any;
  child.pid = opts?.pid ?? nextPid++;
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
    nextPid = 1001;
    vi.restoreAllMocks();
  });

  describe('getInstance()', () => {
    it('连续调用返回同一引用', () => {
      const a = ProcessManager.getInstance();
      const b = ProcessManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('register() + close 事件', () => {
    it('close 事件触发后进程从 Set 中消失', () => {
      const pm = ProcessManager.getInstance();
      const child = createFakeChild();
      pm.register(child);

      const activeBefore = (pm as any).activeProcesses as Set<any>;
      expect(activeBefore.size).toBe(1);

      child.emit('close', 0);

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
    it('对未终止进程优先走进程组 SIGTERM', () => {
      const pm = ProcessManager.getInstance();
      const c1 = createFakeChild();
      const c2 = createFakeChild();
      pm.register(c1);
      pm.register(c2);
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);

      pm.killAll();

      expect(processKillSpy).toHaveBeenCalledWith(-c1.pid, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-c2.pid, 'SIGTERM');
      expect(c1.kill).not.toHaveBeenCalled();
      expect(c2.kill).not.toHaveBeenCalled();
    });

    it('跳过已 killed 的进程', () => {
      const pm = ProcessManager.getInstance();
      const alive = createFakeChild({ killed: false, pid: 2001 });
      const dead = createFakeChild({ killed: true, pid: 2002 });
      pm.register(alive);
      pm.register(dead);
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);

      pm.killAll();

      expect(processKillSpy).toHaveBeenCalledWith(-alive.pid, 'SIGTERM');
      expect(processKillSpy).not.toHaveBeenCalledWith(-dead.pid, 'SIGTERM');
      expect(alive.kill).not.toHaveBeenCalled();
      expect(dead.kill).not.toHaveBeenCalled();
    });

    it('进程组 kill 失败时 fallback 到 child.kill，且不中断后续处理', () => {
      const pm = ProcessManager.getInstance();
      const fallbackTarget = createFakeChild({ killed: false, pid: 3001 });
      const normal = createFakeChild({ killed: false, pid: 3002 });
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === -3001) {
          throw new Error('group kill failed');
        }
        return true as any;
      });
      const fallbackSpy = fallbackTarget.kill as ReturnType<typeof vi.fn>;
      pm.register(fallbackTarget);
      pm.register(normal);

      expect(() => pm.killAll()).not.toThrow();
      expect(processKillSpy).toHaveBeenCalledWith(-3001, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-3002, 'SIGTERM');
      expect(fallbackSpy).toHaveBeenCalledWith('SIGTERM');
      expect(normal.kill).not.toHaveBeenCalled();
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
