import * as vscode from 'vscode';
import { showCliMissingWarning } from '../ui/notifications.js';
import { logToOutput } from '../ui/output.js';

export type CliReadinessState = 'detecting' | 'ready' | 'missing';

export interface CliDetectionResult {
  exists: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export type CliDetector = () => Promise<CliDetectionResult>;

let cliState: CliReadinessState = 'detecting';
let detectionPromise: Promise<CliReadinessState> | null = null;
let cliPath: string | undefined;
let storedDetector: CliDetector | null = null;

export function getCliReadinessState(): CliReadinessState {
  return cliState;
}

export function getResolvedCliPath(): string | undefined {
  return cliPath;
}

export function registerCliDetector(detector: CliDetector): void {
  storedDetector = detector;
}

export function startCliDetection(detector: CliDetector): Promise<CliReadinessState> {
  if (detectionPromise) return detectionPromise;

  storedDetector = detector;
  cliState = 'detecting';
  detectionPromise = detector().then(result => {
    if (result.exists) {
      cliState = 'ready';
      cliPath = result.path;
      logToOutput(`CLI ready: ${result.version} at ${result.path}`);
      return 'ready' as CliReadinessState;
    } else {
      cliState = 'missing';
      logToOutput(`CLI not found: ${result.error}`, 'error');
      return 'missing' as CliReadinessState;
    }
  }).catch(err => {
    cliState = 'missing';
    logToOutput(`CLI detection error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return 'missing' as CliReadinessState;
  });

  return detectionPromise;
}

export async function waitForCliReady(token?: vscode.CancellationToken): Promise<boolean> {
  if (cliState === 'ready') {
    return true;
  }

  if (cliState === 'missing') {
    await showCliMissingWarning();
    return false;
  }

  if (!detectionPromise) {
    if (storedDetector) {
      startCliDetection(storedDetector);
    } else {
      await showCliMissingWarning();
      return false;
    }
  }

  const result = await waitForWithTimeout(detectionPromise!, 10000, token);

  if (token?.isCancellationRequested) {
    return false;
  }

  if (result === 'ready') {
    return true;
  }

  await showCliMissingWarning();
  return false;
}

export function resetCliReadiness(): void {
  cliState = 'detecting';
  detectionPromise = null;
  cliPath = undefined;
  storedDetector = null;
}

async function waitForWithTimeout(
  promise: Promise<CliReadinessState>,
  timeoutMs: number,
  token?: vscode.CancellationToken
): Promise<CliReadinessState | 'timeout' | 'cancelled'> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let cancelListener: vscode.Disposable | undefined;

  const timeoutPromise = new Promise<CliReadinessState | 'timeout'>(resolve => {
    timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const cancelPromise = new Promise<'cancelled'>(resolve => {
    if (token) {
      cancelListener = token.onCancellationRequested(() => resolve('cancelled'));
    }
  });

  try {
    return await Promise.race([promise, timeoutPromise, cancelPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (cancelListener) cancelListener.dispose();
  }
}
