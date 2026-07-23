/**
 * VectaHub-side ACP event mapping types.
 *
 * These types represent the normalized, VectaHub-internal view of ACP protocol
 * events. They are intentionally narrower than the full ACP SDK types to
 * capture only what VectaHub's execution pipeline needs:
 *
 * - Tool call visibility (kind, status, locations, raw I/O)
 * - Agent message chunks (streamed text)
 * - Plan entries (task list with priorities/status)
 * - Usage updates (token counts + cost)
 * - Stop reason (end_turn / max_tokens / refusal / cancelled)
 *
 * The raw ACP SDK types are kept at the boundary; these types are what
 * downstream VectaHub modules (trace, audit, result mapping) consume.
 */

/** Why an agent stopped processing a prompt turn. */
export type AcpStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

/** Kind of tool the agent invoked. */
export type AcpToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other';

/** Lifecycle status of a tool call. */
export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** Priority of a plan entry. */
export type AcpPlanPriority = 'high' | 'medium' | 'low';

/** Status of a plan entry. */
export type AcpPlanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/** A file location associated with a tool call. */
export interface AcpToolLocation {
  path: string;
  line?: number | null;
}

/** A diff produced by a tool call. */
export interface AcpToolDiff {
  path: string;
  oldText?: string | null;
  newText: string;
}

/** Content associated with a tool call. */
export type AcpToolContent =
  | { type: 'content'; text: string }
  | { type: 'diff'; diff: AcpToolDiff }
  | { type: 'terminal'; terminalId: string };

/** Normalized tool call event. */
export interface AcpToolCallEvent {
  toolCallId: string;
  title: string;
  kind: AcpToolKind;
  status: AcpToolStatus;
  content: AcpToolContent[];
  locations: AcpToolLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

/** Normalized agent message chunk. */
export interface AcpMessageEvent {
  messageId?: string;
  text: string;
}

/** A single entry in the agent's execution plan. */
export interface AcpPlanEntry {
  content: string;
  priority: AcpPlanPriority;
  status: AcpPlanStatus;
}

/** Normalized plan update event. */
export interface AcpPlanEvent {
  entries: AcpPlanEntry[];
}

/** Normalized usage update event. */
export interface AcpUsageEvent {
  usedTokens: number;
  maxContextTokens: number;
  cost?: { amount: number; currency: string };
}

/** Discriminated union of all ACP events VectaHub consumes. */
export type AcpEvent =
  | { type: 'message'; event: AcpMessageEvent }
  | { type: 'tool_call'; event: AcpToolCallEvent }
  | { type: 'tool_call_update'; event: AcpToolCallEvent }
  | { type: 'plan'; event: AcpPlanEvent }
  | { type: 'usage'; event: AcpUsageEvent };

/** Aggregated result of an ACP prompt turn. */
export interface AcpPromptResult {
  stopReason: AcpStopReason;
  agentName: string;
  agentVersion: string;
  message: string;
  toolCalls: AcpToolCallEvent[];
  planEntries: AcpPlanEntry[];
  usage?: AcpUsageEvent;
  events: AcpEvent[];
}

/** Options for creating an ACP client connection. */
export interface AcpClientOptions {
  /** Agent binary name or absolute path (e.g. "opencode"). */
  command: string;
  /** Arguments to start the agent in ACP mode (e.g. ["acp"]). */
  args?: string[];
  /** Working directory for the agent session. */
  cwd: string;
  /** Client name reported during initialize. */
  clientName: string;
  /** Client version reported during initialize. */
  clientVersion: string;
  /** Environment variables to inject into the agent process. */
  envPatch?: Record<string, string>;
  /** Timeout for the entire prompt turn in ms (default 600_000). */
  timeoutMs?: number;
  /** Called for every ACP event as it arrives. */
  onEvent?: (event: AcpEvent) => void;
  /** Called when the agent requests permission for a tool call. */
  onPermission?: (toolTitle: string, options: { optionId: string; name: string; kind: string }[]) => Promise<{ optionId: string } | { cancelled: true }>;
}
