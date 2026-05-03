export interface DaemonConfig {
  socketPath: string;
  sessionTimeout: number;
  idleTimeout: number;
  autoStart: boolean;
  autoStop: boolean;
  maxConcurrentTasks: number;
}

export enum DaemonState {
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
}

export interface DaemonMessage {
  id: string;
  type: 'execute' | 'health' | 'shutdown' | 'status';
  payload: unknown;
  timestamp?: string;
}

export interface DaemonResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp?: string;
}

export interface TaskQueueItem {
  id: string;
  input: string;
  priority: number;
  createdAt: Date;
  resolve: (value: DaemonResponse) => void;
  reject: (reason: Error) => void;
}

export interface AISession {
  id: string;
  tool: string;
  config: Record<string, unknown>;
  createdAt: Date;
  lastUsedAt: Date;
  requestCount: number;
}

export interface DaemonStatus {
  state: DaemonState;
  uptime: number;
  activeSessions: number;
  queuedTasks: number;
  processedTasks: number;
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  socketPath: '/tmp/vectahub-daemon.sock',
  sessionTimeout: 1800000,
  idleTimeout: 300000,
  autoStart: true,
  autoStop: true,
  maxConcurrentTasks: 5,
};
