import { createServer as createNetServer, Server as NetServer, Socket } from 'net';
import { existsSync, unlinkSync } from 'fs';
import { DaemonMessage, DaemonResponse, DaemonState, DaemonStatus, DaemonConfig, DEFAULT_DAEMON_CONFIG } from './types.js';
import { createSessionManager, type SessionManager } from './session-manager.js';
import { createTaskQueue, type TaskQueue } from './task-queue.js';

export interface DaemonOptions {
  config?: Partial<DaemonConfig>;
}

export interface Daemon {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): DaemonStatus;
  isRunning(): boolean;
}

let daemonCounter = 0;

export function createDaemon(options: DaemonOptions = {}): Daemon {
  const config = { ...DEFAULT_DAEMON_CONFIG, ...options.config };
  const sessionManager = createSessionManager({
    sessionTimeout: config.sessionTimeout,
    idleTimeout: config.idleTimeout,
  });
  const taskQueue = createTaskQueue({ maxConcurrent: config.maxConcurrentTasks });
  
  let state: DaemonState = DaemonState.STOPPED;
  let server: NetServer | null = null;
  let startTime: number | null = null;
  let processedTasks = 0;

  function setState(newState: DaemonState): void {
    state = newState;
    if (newState === DaemonState.RUNNING && !startTime) {
      startTime = Date.now();
    }
  }

  async function handleMessage(socket: Socket, message: DaemonMessage): Promise<void> {
    const response: DaemonResponse = {
      id: message.id,
      success: false,
      timestamp: new Date().toISOString(),
    };

    try {
      switch (message.type) {
        case 'health':
          response.success = true;
          response.data = { state, uptime: startTime ? Date.now() - startTime : 0 };
          break;

        case 'status':
          response.success = true;
          response.data = getStatus();
          break;

        case 'execute':
          const input = (message.payload as { input?: string })?.input || '';
          const result = await taskQueue.enqueue({
            id: message.id,
            input,
            priority: 0,
            createdAt: new Date(),
            resolve: (res) => {
              response.success = res.success;
              response.data = res.data;
              response.error = res.error;
            },
            reject: (err) => {
              response.success = false;
              response.error = err.message;
            },
          });

          if (result) {
            response.success = result.success;
            response.data = result.data;
            response.error = result.error;
          }
          processedTasks++;
          break;

        case 'shutdown':
          response.success = true;
          response.data = { message: 'Shutting down' };
          sendResponse(socket, response);
          await stopDaemon();
          return;

        default:
          response.error = `Unknown message type: ${message.type}`;
          break;
      }
    } catch (err) {
      response.success = false;
      response.error = err instanceof Error ? err.message : String(err);
    }

    sendResponse(socket, response);
  }

  function sendResponse(socket: Socket, response: DaemonResponse): void {
    const data = JSON.stringify(response) + '\n';
    socket.write(data);
  }

  function handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as DaemonMessage;
            handleMessage(socket, message).catch((err) => {
              sendResponse(socket, {
                id: message.id || 'unknown',
                success: false,
                error: err.message,
                timestamp: new Date().toISOString(),
              });
            });
          } catch {
          }
        }
      }
    });
  }

  function getStatus(): DaemonStatus {
    return {
      state,
      uptime: startTime ? Date.now() - startTime : 0,
      activeSessions: sessionManager.getActiveSessionCount(),
      queuedTasks: taskQueue.getPendingCount(),
      processedTasks,
    };
  }

  async function stopDaemon(): Promise<void> {
    if (state !== DaemonState.RUNNING) {
      return;
    }

    setState(DaemonState.STOPPING);

    if (server) {
      server.close(() => {
        if (existsSync(config.socketPath)) {
          try {
            unlinkSync(config.socketPath);
          } catch {
          }
        }
      });
      server = null;
    }

    sessionManager.cleanupAllSessions();
    setState(DaemonState.STOPPED);
    startTime = null;
  }

  return {
    async start(): Promise<void> {
      if (state === DaemonState.RUNNING) {
        return;
      }

      setState(DaemonState.STARTING);

      if (existsSync(config.socketPath)) {
        unlinkSync(config.socketPath);
      }

      server = createNetServer(handleConnection);

      server.on('error', (err) => {
        setState(DaemonState.ERROR);
      });

      server.listen(config.socketPath, () => {
        setState(DaemonState.RUNNING);
      });
    },

    async stop(): Promise<void> {
      await stopDaemon();
    },

    getStatus(): DaemonStatus {
      return getStatus();
    },

    isRunning(): boolean {
      return state === DaemonState.RUNNING;
    },
  };
}
