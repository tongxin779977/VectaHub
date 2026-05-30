import { createServer as createNetServer, Server as NetServer, Socket } from 'net';
import { existsSync, unlinkSync } from 'fs';
import { DaemonMessage, DaemonResponse, DaemonState, DaemonStatus, DaemonConfig, DEFAULT_DAEMON_CONFIG } from './types.js';

export interface DaemonOptions {
  config?: Partial<DaemonConfig>;
  output?: DaemonOutput;
}

export interface DaemonOutput {
  error(message: string): void;
}

const defaultDaemonOutput: DaemonOutput = {
  error: (message: string) => {
    process.stderr.write(`${message}\n`);
  },
};

export interface Daemon {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): DaemonStatus;
  isRunning(): boolean;
}

export function createDaemon(options: DaemonOptions = {}): Daemon {
  const config = { ...DEFAULT_DAEMON_CONFIG, ...options.config };
  const output = options.output ?? defaultDaemonOutput;
  
  let state: DaemonState = DaemonState.STOPPED;
  let server: NetServer | null = null;
  let startTime: number | null = null;
  let processedTasks = 0;
  const activeSessionsCount = 0;
  const taskQueue: Array<{ message: DaemonMessage; socket: Socket }> = [];
  let isProcessing = false;

  function setState(newState: DaemonState): void {
    state = newState;
    if (newState === DaemonState.RUNNING && !startTime) {
      startTime = Date.now();
    }
  }

  async function processQueue() {
    if (isProcessing || taskQueue.length === 0) return;
    isProcessing = true;

    while (taskQueue.length > 0) {
      const { message, socket } = taskQueue.shift()!;
      await handleMessageInternal(socket, message);
    }

    isProcessing = false;
  }

  async function handleMessageInternal(socket: Socket, message: DaemonMessage): Promise<void> {
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

        case 'execute': {
          // Simple execution logic without complex session management for now
          // In the future, this could be where AI tools are actually held open
          const payload = message.payload as { input?: string } | undefined;
          response.success = true;
          response.data = { message: 'Task executed', input: payload?.input };
          processedTasks++;
          break;
        }

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
    if (socket.writable) {
      const data = JSON.stringify(response) + '\n';
      socket.write(data);
    }
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
            taskQueue.push({ message, socket });
            processQueue().catch((error) => {
              output.error(error instanceof Error ? error.message : String(error));
            });
          } catch {
            continue;
          }
        }
      }
    });
  }

  function getStatus(): DaemonStatus {
    return {
      state,
      uptime: startTime ? Date.now() - startTime : 0,
      activeSessions: activeSessionsCount,
      queuedTasks: taskQueue.length,
      processedTasks,
    };
  }

  async function stopDaemon(): Promise<void> {
    if (state !== DaemonState.RUNNING && state !== DaemonState.STARTING) {
      return;
    }

    setState(DaemonState.STOPPING);

    if (server) {
      return new Promise((resolve) => {
        server!.close(() => {
          if (existsSync(config.socketPath)) {
            try {
              unlinkSync(config.socketPath);
            } catch {
              // 忽略删除旧 socket 的失败，继续停止流程
            }
          }
          setState(DaemonState.STOPPED);
          startTime = null;
          resolve();
        });
        server = null;
      });
    } else {
      setState(DaemonState.STOPPED);
      startTime = null;
    }
  }

  return {
    async start(): Promise<void> {
      if (state === DaemonState.RUNNING) {
        return;
      }

      setState(DaemonState.STARTING);

      if (existsSync(config.socketPath)) {
        try {
          unlinkSync(config.socketPath);
        } catch {
          // 忽略启动前清理旧 socket 的失败，后续 listen 会给出真实错误
        }
      }

      server = createNetServer(handleConnection);

      return new Promise((resolve, reject) => {
        server!.on('error', (err) => {
          setState(DaemonState.ERROR);
          reject(err);
        });

        server!.listen(config.socketPath, () => {
          setState(DaemonState.RUNNING);
          resolve();
        });
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
