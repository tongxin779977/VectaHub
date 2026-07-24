/**
 * @deprecated This module has been replaced by AcpTransport.
 *   - spawn + RedactionTransform → AcpTransport.execute()
 *   - heuristic functions → deterministic stopReason + toolCall mapping
 *   - RedactionTransform → Redactor.redact() in AcpTransport
 *   See docs/01-acp-transport.md for the replacement.
 *   Kept temporarily for exec-handler.ts RedactionTransform usage.
 */
import { Transform, type TransformOptions } from 'node:stream';
import { createRedactor } from '../security-protocol/redactor.js';
import {
  TokenUsage,
  CommandExecutionError,
  SpawnCompletionSignal,
  extractOutermostJson,
  waitForWriterSettled,
  getContext,
  stripIDEEnv,
  readRunTaskOutputFile
} from './run-task-shared.js';
import { createChildEnv } from '../infrastructure/trace/context.js';
import { collectGitChanges, type GitDiffSnapshot } from './run-task-git.js';

const redactor = createRedactor();

/**
 * @deprecated Use AcpTransport.execute() with Redactor.redact() instead.
 */
export class RedactionTransform extends Transform {
  private carry = '';
  private onTokenUsage?: (usage: TokenUsage) => void;

  constructor(options?: TransformOptions, onTokenUsage?: (usage: TokenUsage) => void) {
    super(options);
    this.onTokenUsage = onTokenUsage;
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer | string) => void): void {
    try {
      const text = this.carry + chunk.toString();
      const splitAt = text.lastIndexOf('\n');
      if (splitAt < 0) {
        this.carry = text;
        callback();
        return;
      }
      const complete = text.slice(0, splitAt + 1);
      this.carry = text.slice(splitAt + 1);
      
      const redacted = redactor.redact(complete);
      
      if (this.onTokenUsage) {
        const usage = parseTokenUsage(redacted);
        if (usage) {
          this.onTokenUsage(usage);
        }
      }

      callback(null, redacted);
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: (error?: Error | null, data?: Buffer | string) => void): void {
    try {
      if (this.carry) {
        const redacted = redactor.redact(this.carry);
        if (this.onTokenUsage) {
          const usage = parseTokenUsage(redacted);
          if (usage) {
            this.onTokenUsage(usage);
          }
        }
        callback(null, redacted);
      } else {
        callback(null, '');
      }
    } catch (error) {
      callback(error as Error);
    }
  }
}

/**
 * @deprecated Use AcpTransport's built-in token usage reporting instead.
 */
export function parseTokenUsage(output: string): TokenUsage | undefined {
  try {
    const jsonMatch = extractOutermostJson(output);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch);
      if (parsed.usage) {
        const u = parsed.usage;
        const prompt = u.prompt_tokens ?? u.promptTokens ?? u.input_tokens ?? 0;
        const completion = u.completion_tokens ?? u.completionTokens ?? u.output_tokens ?? 0;
        if (prompt > 0 || completion > 0) {
          return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
        }
      }
      if (parsed.prompt_tokens || parsed.promptTokens) {
        const prompt = parsed.prompt_tokens ?? parsed.promptTokens ?? 0;
        const completion = parsed.completion_tokens ?? parsed.completionTokens ?? 0;
        return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
      }
    }

    const tokenLine = output.match(/token[s]?\s*(?:usage|count)?:?\s*(\d+)\s*(?:prompt|input)[,\s]+(\d+)\s*(?:completion|output)/i);
    if (tokenLine) {
      const prompt = parseInt(tokenLine[1], 10);
      const completion = parseInt(tokenLine[2], 10);
      return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
    }
  } catch {
    // Token usage parsing failed, return undefined
  }
  return undefined;
}

export interface RuntimeResolvedConfig {
  cliTimeoutMs: number;
  exitFlushGraceMs: number;
  idleTimeoutMs: number;
  progressIntervalMs: number;
  noCloseTimeoutMs: number;
  extensionMs: number;
  maxExtensions: number;
  maxWallClockMs: number;
}

const HARDCODED_DEFAULTS = {
  AGENT_CLI_TIMEOUT: 600000,
  AGENT_EXIT_FLUSH_GRACE_MS: 1500,
  AGENT_IDLE_TIMEOUT_MS: 120000,
  AGENT_PROGRESS_INTERVAL_MS: 30000,
  AGENT_NO_CLOSE_TIMEOUT_MS: 180000,
  AGENT_NO_CLOSE_EXTENSION_MS: 120000,
  AGENT_NO_CLOSE_MAX_EXTENSIONS: 3,
  AGENT_MAX_WALL_CLOCK_MS: 900000,
} as const;

/**
 * @deprecated Use AcpTransport.execute() with its own timeout configuration instead.
 */
export function buildRuntimeResolvedConfig(
  estimate: { progressIntervalMs?: number; noCloseTimeoutMs?: number; heartbeatTimeoutMs?: number; idleTimeoutMs?: number; gracePeriodMs?: number; agentCliTimeoutMs?: number; extensionMs?: number; maxExtensions?: number; maxWallClockMs?: number } | undefined,
  getEnvNumber: (name: string, defaultValue?: number) => number | undefined,
): RuntimeResolvedConfig {
  const resolve = (envName: keyof typeof HARDCODED_DEFAULTS, estimateValue?: number): number => {
    const envValue = getEnvNumber(envName);
    if (envValue !== undefined) return envValue;
    if (estimateValue !== undefined) return estimateValue;
    return HARDCODED_DEFAULTS[envName];
  };

  return {
    cliTimeoutMs: resolve('AGENT_CLI_TIMEOUT'),
    exitFlushGraceMs: resolve('AGENT_EXIT_FLUSH_GRACE_MS'),
    idleTimeoutMs: resolve('AGENT_IDLE_TIMEOUT_MS'),
    progressIntervalMs: resolve('AGENT_PROGRESS_INTERVAL_MS', estimate?.progressIntervalMs),
    noCloseTimeoutMs: resolve('AGENT_NO_CLOSE_TIMEOUT_MS', estimate?.noCloseTimeoutMs),
    extensionMs: resolve('AGENT_NO_CLOSE_EXTENSION_MS', estimate?.extensionMs),
    maxExtensions: resolve('AGENT_NO_CLOSE_MAX_EXTENSIONS', estimate?.maxExtensions),
    maxWallClockMs: resolve('AGENT_MAX_WALL_CLOCK_MS', estimate?.maxWallClockMs),
  };
}

export interface SpawnAgentResult {
  redactedStdout: string;
  redactedStderr: string;
  completionSignal: SpawnCompletionSignal;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  usage?: TokenUsage;
}

export interface SpawnAgentOptions {
  command: string;
  args: string[];
  stdinInput?: string;
  runtimeConfig: RuntimeResolvedConfig;
  gitDiffBefore?: GitDiffSnapshot | null;
  outputLastMessagePath?: string;
}

/**
 * @deprecated Use AcpTransport.execute() instead.
 */
export async function spawnAgent(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  const { command, args, stdinInput, runtimeConfig, gitDiffBefore, outputLastMessagePath } = options;

  return new Promise<SpawnAgentResult>((resolve, reject) => {
    let settled = false;
    let closeObserved = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let exitFlushTimer: NodeJS.Timeout | undefined;
    let idleTimer: NodeJS.Timeout | undefined;
    let outputLastMessageTimer: NodeJS.Timeout | undefined;
    let noCloseTimer: NodeJS.Timeout | undefined;
    let lastMessageLength = 0;
    let lastNoCloseProgressLength = 0;
    let noCloseExtensionCount = 0;
    const startedAt = Date.now();

    let redactedStdout = '';
    let redactedStderr = '';
    let capturedUsage: TokenUsage | undefined;

    const onToken = (u: TokenUsage) => {
      if (!capturedUsage) {
        capturedUsage = u;
      } else {
        capturedUsage.promptTokens = Math.max(capturedUsage.promptTokens, u.promptTokens);
        capturedUsage.completionTokens = Math.max(capturedUsage.completionTokens, u.completionTokens);
        capturedUsage.totalTokens = Math.max(capturedUsage.totalTokens, u.totalTokens);
      }
    };

    const child = getContext().environment.spawn(command, args, {
      cwd: getContext().environment.getCwd(),
      env: buildAgentChildEnvForSpawn(),
      stdio: [stdinInput ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    if (stdinInput && child.stdin) {
      child.stdin.end(stdinInput);
    }

    const stdoutRedactor = new RedactionTransform(undefined, onToken);
    const stderrRedactor = new RedactionTransform(undefined, onToken);

    child.stdout?.pipe(stdoutRedactor);
    child.stderr?.pipe(stderrRedactor);

    stdoutRedactor.on('data', (chunk: Buffer | string) => {
      redactedStdout += chunk.toString();
      refreshIdleTimer();
    });
    stderrRedactor.on('data', (chunk: Buffer | string) => {
      redactedStderr += chunk.toString();
      refreshIdleTimer();
    });

    const streamDrainPromise = Promise.all([
      waitForWriterSettled(stdoutRedactor),
      waitForWriterSettled(stderrRedactor),
    ]);

    const cleanup = () => {
      clearTimeout(timer);
      if (idleTimer) clearTimeout(idleTimer);
      if (exitFlushTimer) clearTimeout(exitFlushTimer);
      if (outputLastMessageTimer) clearInterval(outputLastMessageTimer);
      if (noCloseTimer) clearTimeout(noCloseTimer);
      clearInterval(progressTimer);
      child.off('error', onErr);
      child.off('exit', onExit);
      child.off('close', onClose);
      stdoutRedactor.off('data', onOutput);
      stderrRedactor.off('data', onOutput);
      stdoutRedactor.off('error', onErr);
      stderrRedactor.off('error', onErr);
    };

    const resolveOnce = (result: SpawnAgentResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const rejectOnce = (error: Error & CommandExecutionError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error.stdout === undefined) error.stdout = redactedStdout;
      if (error.stderr === undefined) error.stderr = redactedStderr;
      reject(error);
    };

    const rejectForIdleTimeout = () => {
      child.kill('SIGKILL');
      const idleError = new Error(`Agent CLI idle timeout after ${runtimeConfig.idleTimeoutMs}ms`) as Error & CommandExecutionError;
      idleError.code = 'TIMEOUT';
      idleError.completionSignal = 'timeout';
      rejectOnce(idleError);
    };

    const rejectForNoCloseTimeout = (message: string) => {
      child.kill('SIGKILL');
      const noCloseError = new Error(message) as Error & CommandExecutionError;
      noCloseError.code = 'TIMEOUT';
      noCloseError.completionSignal = 'timeout';
      rejectOnce(noCloseError);
    };

    const scheduleNoCloseCheckpoint = (delayMs: number) => {
      if (noCloseTimer) clearTimeout(noCloseTimer);
      noCloseTimer = setTimeout(async () => {
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= runtimeConfig.maxWallClockMs) {
          rejectForNoCloseTimeout(`Agent CLI reached max wall-clock timeout after ${runtimeConfig.maxWallClockMs}ms`);
          return;
        }

        try {
          const evidenceChanges = await collectGitChanges(gitDiffBefore);
          if (evidenceChanges && evidenceChanges.changedFiles.length > 0) {
            child.kill('SIGTERM');
            resolveOnce({
              redactedStdout,
              redactedStderr,
              completionSignal: 'evidence-closeout',
              exitCode: 0,
              signal: null,
              usage: capturedUsage
            });
            return;
          }
        } catch (error) {
          onErr(error);
          return;
        }

        const currentProgressLength = redactedStdout.length + redactedStderr.length;
        const hasProgressEvidence = currentProgressLength > lastNoCloseProgressLength;
        lastNoCloseProgressLength = currentProgressLength;
        if (!hasProgressEvidence) {
          rejectForNoCloseTimeout(`Agent CLI did not close after ${runtimeConfig.noCloseTimeoutMs}ms and produced no new progress evidence`);
          return;
        }

        if (noCloseExtensionCount >= runtimeConfig.maxExtensions) {
          rejectForNoCloseTimeout(`Agent CLI did not close after ${runtimeConfig.noCloseTimeoutMs}ms and exhausted ${runtimeConfig.maxExtensions} progress extensions`);
          return;
        }

        noCloseExtensionCount += 1;
        getContext().logger.getLogger('run-task').info(`Agent 仍有输出进展，延长等待 ${runtimeConfig.extensionMs}ms (${noCloseExtensionCount}/${runtimeConfig.maxExtensions})`);
        scheduleNoCloseCheckpoint(runtimeConfig.extensionMs);
      }, delayMs);
    };

    const refreshIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(rejectForIdleTimeout, runtimeConfig.idleTimeoutMs);
    };

    const settleWithOutputLastMessage = () => {
      const outputLastMessage = readRunTaskOutputFile(outputLastMessagePath);
      if (!outputLastMessage.trim()) {
        lastMessageLength = 0;
        return;
      }

      if (outputLastMessage.length !== lastMessageLength) {
        lastMessageLength = outputLastMessage.length;
        return;
      }

      child.kill('SIGTERM');
      resolveOnce({
        redactedStdout,
        redactedStderr,
        completionSignal: 'output-last-message',
        exitCode: 0,
        signal: null,
        usage: capturedUsage
      });
    };

    const settleWithExit = (code: number | null, signal: NodeJS.Signals | null, completionSignal: SpawnCompletionSignal) => {
      const normalizedCode = typeof code === 'number' ? code : 1;
      if (normalizedCode === 0) {
        resolveOnce({
          redactedStdout,
          redactedStderr,
          completionSignal,
          exitCode: 0,
          signal,
          usage: capturedUsage
        });
        return;
      }

      const message = signal
        ? `Agent process exited with signal ${signal}`
        : `Agent process exited with code ${code}`;
      const error = new Error(message) as Error & CommandExecutionError;
      error.code = normalizedCode;
      error.signal = signal;
      error.completionSignal = completionSignal;
      rejectOnce(error);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const timeoutError = new Error(`Agent CLI timeout after ${runtimeConfig.cliTimeoutMs}ms`) as Error & CommandExecutionError;
      timeoutError.code = 'TIMEOUT';
      timeoutError.completionSignal = 'timeout';
      rejectOnce(timeoutError);
    }, runtimeConfig.cliTimeoutMs);

    const onErr = (error: unknown) => {
      rejectOnce(error as Error & CommandExecutionError);
    };

    const onOutput = () => {
      refreshIdleTimer();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      exitCode = code;
      exitSignal = signal;

      streamDrainPromise
        .then(() => {
          if (settled || closeObserved) return;
          settleWithExit(exitCode, exitSignal, 'exit-stream-drain');
        })
        .catch(onErr);

      if (exitFlushTimer) clearTimeout(exitFlushTimer);
      exitFlushTimer = setTimeout(() => {
        if (settled || closeObserved) return;
        settleWithExit(exitCode, exitSignal, 'exit-flush-grace');
      }, runtimeConfig.exitFlushGraceMs);
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      closeObserved = true;
      streamDrainPromise
        .then(() => {
          if (settled) return;
          settleWithExit(code, signal, 'close');
        })
        .catch(onErr);
    };

    refreshIdleTimer();
    scheduleNoCloseCheckpoint(runtimeConfig.noCloseTimeoutMs);

    if (outputLastMessagePath) {
      outputLastMessageTimer = setInterval(settleWithOutputLastMessage, 100);
    }

    const progressTimer = setInterval(() => {}, runtimeConfig.progressIntervalMs);

    child.on('error', onErr);
    child.on('exit', onExit);
    child.on('close', onClose);
    stdoutRedactor.on('data', onOutput);
    stderrRedactor.on('data', onOutput);
    stdoutRedactor.on('error', onErr);
    stderrRedactor.on('error', onErr);
  });
}

function buildAgentChildEnvForSpawn(): NodeJS.ProcessEnv {
  const traceContext = { traceId: 'spawned-agent', source: 'cli' as const };
  return {
    ...stripIDEEnv(),
    ...createChildEnv(traceContext, 'parent-span'),
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
    VECTAHUB_NON_INTERACTIVE: '1',
  };
}
