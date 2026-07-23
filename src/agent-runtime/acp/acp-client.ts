/**
 * ACP client — manages the lifecycle of an ACP (Agent Client Protocol)
 * connection to an external AI agent over stdio.
 *
 * Flow: spawn agent → ndJsonStream → initialize → session/new → session/prompt
 * → drain session/update events → session/prompt resolves with StopReason.
 *
 * This module is the structured replacement for the current "spawn + parse
 * stdout" black-box pattern. Every agent action (tool call, plan, message
 * chunk, usage) arrives as a typed event instead of raw text.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type {
  AcpClientOptions,
  AcpEvent,
  AcpPlanPriority,
  AcpPlanStatus,
  AcpPromptResult,
  AcpStopReason,
  AcpToolCallEvent,
} from './acp-types.js';

const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Create and manage an ACP connection to an external agent.
 *
 * The connection is scoped to a single `prompt()` call. Each call:
 * 1. Spawns the agent process
 * 2. Establishes the ACP connection (initialize + capability exchange)
 * 3. Creates a new session
 * 4. Sends the prompt and drains update events
 * 5. Returns the aggregated result with structured tool calls, messages, plan, usage
 * 6. Tears down the process
 */
export async function prompt(
  promptText: string,
  options: AcpClientOptions,
): Promise<AcpPromptResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const child = spawn(options.command, options.args ?? [], {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, ...options.envPatch },
  });

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, timeoutMs);

  try {
    return await runSession(child, promptText, options);
  } finally {
    clearTimeout(timer);
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

async function runSession(
  child: ChildProcess,
  promptText: string,
  options: AcpClientOptions,
): Promise<AcpPromptResult> {
  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin!),
    Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
  );

  const result = await acp
    .client({ name: options.clientName })
    .onRequest(acp.methods.client.session.requestPermission, (ctx) => {
      return handlePermission(ctx, options);
    })
    .connectWith(stream, async (ctx) => {
      const init = await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
        clientInfo: {
          name: options.clientName,
          version: options.clientVersion,
        },
      });

      const agentName = init.agentInfo?.name ?? 'unknown';
      const agentVersion = init.agentInfo?.version ?? 'unknown';

      return ctx.buildSession(options.cwd).withSession(async (session) => {
        const events: AcpEvent[] = [];
        const toolCallMap = new Map<string, AcpToolCallEvent>();
        const planEntries: AcpPromptResult['planEntries'] = [];
        let messageText = '';
        let usage: AcpPromptResult['usage'];

        session.prompt(promptText);

        for (;;) {
          const msg = await session.nextUpdate();

          if (msg.kind === 'stop') {
            return {
              stopReason: msg.stopReason as AcpStopReason,
              agentName,
              agentVersion,
              message: messageText,
              toolCalls: Array.from(toolCallMap.values()),
              planEntries,
              usage,
              events,
            };
          }

          const event = mapUpdate(msg.update);
          if (event) {
            events.push(event);
            options.onEvent?.(event);

            switch (event.type) {
              case 'message':
                messageText += event.event.text;
                break;
              case 'tool_call':
                toolCallMap.set(event.event.toolCallId, event.event);
                break;
              case 'tool_call_update': {
                const existing = toolCallMap.get(event.event.toolCallId);
                if (existing) {
                  toolCallMap.set(event.event.toolCallId, { ...existing, ...event.event });
                }
                break;
              }
              case 'plan':
                planEntries.length = 0;
                planEntries.push(...event.event.entries);
                break;
              case 'usage':
                usage = event.event;
                break;
            }
          }
        }
      });
    });

  return result;
}

/**
 * Map a raw ACP SDK SessionUpdate into a VectaHub AcpEvent.
 * Returns null for update types VectaHub doesn't need (e.g. session_info, mode).
 */
function mapUpdate(update: acp.SessionUpdate): AcpEvent | null {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const text = extractText(update.content);
      if (text === null) return null;
      return {
        type: 'message',
        event: {
          messageId: update.messageId ?? undefined,
          text,
        },
      };
    }

    case 'tool_call':
      return {
        type: 'tool_call',
        event: mapToolCall(update),
      };

    case 'tool_call_update':
      return {
        type: 'tool_call_update',
        event: mapToolCall(update),
      };

    case 'plan':
      return {
        type: 'plan',
        event: {
          entries: update.entries.map((e) => ({
            content: e.content,
            priority: (e.priority ?? 'medium') as AcpPlanPriority,
            status: (e.status ?? 'pending') as AcpPlanStatus,
          })),
        },
      };

    case 'usage_update':
      return {
        type: 'usage',
        event: {
          usedTokens: update.used,
          maxContextTokens: update.size,
          cost: update.cost ? { amount: update.cost.amount, currency: update.cost.currency } : undefined,
        },
      };

    default:
      return null;
  }
}

/** Extract text from a content block, handling both text and resource types. */
function extractText(content: acp.ContentBlock): string | null {
  if (content.type === 'text') {
    return content.text;
  }
  if (content.type === 'resource' && 'text' in content.resource) {
    return content.resource.text ?? '';
  }
  return null;
}

/** Map a raw ACP tool_call/tool_call_update to a VectaHub AcpToolCallEvent. */
function mapToolCall(update: acp.SessionUpdate): AcpToolCallEvent {
  const u = update as Record<string, unknown>;
  const content = Array.isArray(u.content) ? (u.content as acp.ToolCallContent[]) : [];
  const locations = Array.isArray(u.locations) ? (u.locations as acp.ToolCallLocation[]) : [];

  return {
    toolCallId: String(u.toolCallId ?? ''),
    title: String(u.title ?? ''),
    kind: (String(u.kind ?? 'other')) as AcpToolCallEvent['kind'],
    status: (String(u.status ?? 'pending')) as AcpToolCallEvent['status'],
    content: content.map(mapToolContent),
    locations: locations.map((l) => ({ path: l.path, line: l.line ?? null })),
    rawInput: u.rawInput,
    rawOutput: u.rawOutput,
  };
}

/** Map ACP ToolCallContent to VectaHub's AcpToolContent. */
function mapToolContent(c: acp.ToolCallContent): AcpToolCallEvent['content'][number] {
  if (c.type === 'diff') {
    return {
      type: 'diff',
      diff: {
        path: c.path,
        oldText: c.oldText ?? null,
        newText: c.newText,
      },
    };
  }
  if (c.type === 'terminal') {
    return { type: 'terminal', terminalId: c.terminalId };
  }
  // content type
  const text = extractText(c.content);
  return { type: 'content', text: text ?? '' };
}

/** Handle a permission request from the agent. */
async function handlePermission(
  ctx: { params: { options: { optionId: string; name: string; kind: string }[]; toolCall?: { title?: string | null } } },
  options: AcpClientOptions,
): Promise<{ outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string } }> {
  if (!options.onPermission) {
    // Auto-approve the first "allow_once" option by default
    const allowOption = ctx.params.options.find((o) => o.kind === 'allow_once');
    if (allowOption) {
      return { outcome: { outcome: 'selected', optionId: allowOption.optionId } };
    }
    return { outcome: { outcome: 'cancelled' } };
  }

  const toolTitle = ctx.params.toolCall?.title ?? 'unknown';
  const result = await options.onPermission(toolTitle, ctx.params.options);

  if ('cancelled' in result) {
    return { outcome: { outcome: 'cancelled' } };
  }
  return { outcome: { outcome: 'selected', optionId: result.optionId } };
}
