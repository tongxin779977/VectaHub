/**
 * Maps ACP prompt results into VectaHub's existing result types.
 *
 * This is the bridge between the structured ACP event stream and the
 * RunTaskResult / WorkerResult types that VectaHub's execution pipeline
 * already understands. It replaces the fragile heuristic functions
 * (detectAgentExecutionOutcome, classifyAgentFailureCode, etc.) with
 * deterministic mapping from ACP's StopReason and tool call events.
 */

import type { AcpPromptResult, AcpStopReason, AcpToolCallEvent } from './acp-types.js';
import type { TokenUsage } from '../../commands/run-task-shared.js';

/** Map ACP StopReason to VectaHub failure kind. */
export function mapStopReason(stopReason: AcpStopReason): {
  success: boolean;
  failureKind?: string;
  errorMessage?: string;
} {
  switch (stopReason) {
    case 'end_turn':
      return { success: true };
    case 'max_tokens':
      return {
        success: false,
        failureKind: 'max_tokens',
        errorMessage: 'Agent hit token limit (max_tokens)',
      };
    case 'max_turn_requests':
      return {
        success: false,
        failureKind: 'max_turn_requests',
        errorMessage: 'Agent exceeded maximum turn requests',
      };
    case 'refusal':
      return {
        success: false,
        failureKind: 'refusal',
        errorMessage: 'Agent refused to execute the task',
      };
    case 'cancelled':
      return {
        success: false,
        failureKind: 'cancelled',
        errorMessage: 'Agent execution was cancelled',
      };
    default:
      return { success: false, failureKind: 'unknown', errorMessage: `Unknown stop reason: ${stopReason}` };
  }
}

/** Extract token usage from ACP usage event. */
export function mapUsage(result: AcpPromptResult): TokenUsage | undefined {
  if (!result.usage) return undefined;
  return {
    promptTokens: 0,
    completionTokens: result.usage.usedTokens,
    totalTokens: result.usage.usedTokens,
  };
}

/** Extract changed files from ACP tool calls (edit/delete/move kinds). */
export function mapChangedFiles(toolCalls: AcpToolCallEvent[]): string[] {
  return toolCalls
    .filter((tc) => tc.kind === 'edit' || tc.kind === 'delete' || tc.kind === 'move')
    .filter((tc) => tc.status === 'completed')
    .flatMap((tc) => {
      const diffPaths = tc.content
        .filter((c): c is { type: 'diff'; diff: { path: string; oldText?: string | null; newText: string } } => c.type === 'diff')
        .map((c) => c.diff.path);
      const locationPaths = tc.locations.map((l) => l.path);
      return [...diffPaths, ...locationPaths];
    })
    .filter((path, index, arr) => arr.indexOf(path) === index); // unique
}

/** Determine if the agent actually made code changes (vs planned only). */
export function hasImplementedChanges(result: AcpPromptResult): boolean {
  const editTools = result.toolCalls.filter(
    (tc) => (tc.kind === 'edit' || tc.kind === 'delete' || tc.kind === 'move') && tc.status === 'completed',
  );
  return editTools.length > 0;
}

/** Build a human-readable summary from ACP prompt result. */
export function buildSummary(result: AcpPromptResult): string {
  const parts: string[] = [];

  if (result.message) {
    parts.push(result.message);
  }

  if (result.toolCalls.length > 0) {
    const toolSummary = result.toolCalls
      .map((tc) => `[${tc.kind}] ${tc.title} (${tc.status})`)
      .join('\n');
    parts.push(`Tool calls:\n${toolSummary}`);
  }

  if (result.planEntries.length > 0) {
    const planSummary = result.planEntries
      .map((e) => `- [${e.status}] ${e.content}`)
      .join('\n');
    parts.push(`Plan:\n${planSummary}`);
  }

  if (result.usage) {
    parts.push(`Tokens: ${result.usage.usedTokens}/${result.usage.maxContextTokens}`);
  }

  return parts.join('\n\n') || 'No output';
}

/** Full mapping from AcpPromptResult to a VectaHub-compatible result shape. */
export function mapToRunTaskResult(result: AcpPromptResult): {
  success: boolean;
  output: string;
  stopReason: AcpStopReason;
  agentName: string;
  agentVersion: string;
  toolCallCount: number;
  changedFiles: string[];
  implemented: boolean;
  usage?: TokenUsage;
  failureKind?: string;
  errorMessage?: string;
} {
  const stopResult = mapStopReason(result.stopReason);
  return {
    success: stopResult.success,
    output: buildSummary(result),
    stopReason: result.stopReason,
    agentName: result.agentName,
    agentVersion: result.agentVersion,
    toolCallCount: result.toolCalls.length,
    changedFiles: mapChangedFiles(result.toolCalls),
    implemented: hasImplementedChanges(result),
    usage: mapUsage(result),
    failureKind: stopResult.failureKind,
    errorMessage: stopResult.errorMessage,
  };
}
