import { createConnection, Socket } from 'net';
import { DaemonMessage, DaemonResponse, DaemonStatus, DEFAULT_DAEMON_CONFIG } from './types.js';

export interface DaemonClientOptions {
  socketPath?: string;
  timeout?: number;
}

export interface DaemonClient {
  connect(): Promise<void>;
  disconnect(): void;
  sendHealthCheck(): Promise<DaemonResponse>;
  sendStatus(): Promise<DaemonStatus>;
  sendExecute(input: string): Promise<DaemonResponse>;
  isConnected(): boolean;
}

export function createDaemonClient(options: DaemonClientOptions = {}): DaemonClient {
  const socketPath = options.socketPath || DEFAULT_DAEMON_CONFIG.socketPath;
  const timeout = options.timeout || 30000;
  let socket: Socket | null = null;
  let messageCounter = 0;
  const pendingMessages = new Map<string, {
    resolve: (value: DaemonResponse) => void;
    reject: (reason: Error) => void;
  }>();

  function generateId(): string {
    return `msg_${++messageCounter}`;
  }

  function setupSocketHandlers(): void {
    if (!socket) return;

    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line) as DaemonResponse;
            const pending = pendingMessages.get(response.id);
            if (pending) {
              pending.resolve(response);
              pendingMessages.delete(response.id);
            }
          } catch {
          }
        }
      }
    });

    socket.on('close', () => {
      for (const [id, pending] of pendingMessages) {
        pending.reject(new Error('Connection closed'));
      }
      pendingMessages.clear();
      socket = null;
    });

    socket.on('error', (err) => {
      for (const [id, pending] of pendingMessages) {
        pending.reject(err);
      }
      pendingMessages.clear();
      socket = null;
    });
  }

  function sendMessage<T>(message: DaemonMessage): Promise<T> {
    if (!socket || !socket.writable) {
      return Promise.reject(new Error('Not connected'));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingMessages.delete(message.id);
        reject(new Error('Request timeout'));
      }, timeout);

      pendingMessages.set(message.id, {
        resolve: (response) => {
          clearTimeout(timeoutId);
          resolve(response as T);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });

      const data = JSON.stringify(message) + '\n';
      socket!.write(data, (err) => {
        if (err) {
          pendingMessages.delete(message.id);
          reject(err);
        }
      });
    });
  }

  return {
    async connect(): Promise<void> {
      return new Promise((resolve, reject) => {
        socket = createConnection({ path: socketPath });

        setupSocketHandlers();

        socket.on('connect', () => {
          resolve();
        });

        socket.on('error', (err) => {
          reject(err);
        });
      });
    },

    disconnect(): void {
      if (socket) {
        socket.end();
        socket = null;
      }
      pendingMessages.clear();
    },

    async sendHealthCheck(): Promise<DaemonResponse> {
      return sendMessage<DaemonResponse>({
        id: generateId(),
        type: 'health',
        payload: {},
        timestamp: new Date().toISOString(),
      });
    },

    async sendStatus(): Promise<DaemonStatus> {
      return sendMessage<DaemonStatus>({
        id: generateId(),
        type: 'status',
        payload: {},
        timestamp: new Date().toISOString(),
      });
    },

    async sendExecute(input: string): Promise<DaemonResponse> {
      return sendMessage<DaemonResponse>({
        id: generateId(),
        type: 'execute',
        payload: { input },
        timestamp: new Date().toISOString(),
      });
    },

    isConnected(): boolean {
      return socket !== null && socket.writable;
    },
  };
}
