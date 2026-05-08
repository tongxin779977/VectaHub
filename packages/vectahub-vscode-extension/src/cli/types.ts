export interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CliOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  token?: import('vscode').CancellationToken;
}
