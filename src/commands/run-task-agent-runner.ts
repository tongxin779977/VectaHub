export interface AgentProcessRunRequest {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  stdinInput?: string;
}

export interface AgentProcessRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  completionSignal: string;
}

export interface AgentProcessFailure {
  code: string;
  message: string;
  stdout: string;
  stderr: string;
  completionSignal: string;
}

export interface AgentProcessRunnerSpawnResult {
  stdout?: {
    on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
  };
  stderr?: {
    on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
  };
  stdin?: {
    end(input?: string): void;
  };
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface AgentProcessRunnerLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AgentProcessRunnerDeps {
  spawn(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: ['pipe' | 'ignore', 'pipe', 'pipe'];
    }
  ): AgentProcessRunnerSpawnResult;
  logger: AgentProcessRunnerLogger;
}
