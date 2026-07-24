/**
 * AcpTransport: production-grade ACP transport implementation.
 * See docs/01-acp-transport.md § ACP 传输实现.
 *
 * Wraps the PoC acp-client.prompt() with:
 * - Trace bridge (6 spans)
 * - Audit bridge (5 record types)
 * - Error mapping (8 error codes)
 * - Dry-run support
 * - Descriptor → AcpClientOptions mapping
 */

import { prompt } from '../acp/acp-client.js';
import {
  mapStopReason,
  mapUsage,
  mapChangedFiles,
} from '../acp/acp-result-mapper.js';
import type { AcpEvent, AcpPromptResult } from '../acp/acp-types.js';
import type { AgentDescriptor } from '../../types/agent.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';
import type { IEventBus } from '../../infrastructure/interfaces/event-bus.js';
import type { SecurityGuard } from '../../types/security.js';
import { createNoopAuditHelper } from '../../infrastructure/audit/index.js';
import { createSecurityGuard } from '../../security-protocol/factory.js';
import {
  createTraceBridge,
  type TraceBridge,
} from './trace-bridge.js';
import {
  createAuditBridge,
  type AuditBridge,
} from './audit-bridge.js';
import {
  handleAcpPermission,
} from './security-bridge.js';
import {
  descriptorToAcpOptions,
} from './descriptor-mapper.js';
import {
  mapErrorToTransportError,
  stopToErrorCode,
} from './error-mapper.js';
import { createRedactor, type Redactor } from '../../security-protocol/redactor.js';
import type { AcpConfig } from './factory.js';
import type {
  AgentTransport,
  TransportRequest,
  TransportResult,
} from './types.js';

export class AcpTransport implements AgentTransport {
  readonly kind = 'acp';

  // Redactor 实例无状态且轻量,复用同一个实例避免每次 execute 重复构建正则
  private readonly redactor: Redactor = createRedactor();

  constructor(
    private config: AcpConfig,
    private deps?: {
      traceBridge?: TraceBridge;
      auditBridge?: AuditBridge;
      guard?: SecurityGuard;
      audit?: AuditHelper;
      eventBus?: IEventBus;
    },
  ) {}

  async execute(request: TransportRequest): Promise<TransportResult> {
    const traceBridge = this.deps?.traceBridge ?? createTraceBridge(request.traceContext, request.parentSpanId);
    const audit = this.deps?.audit ?? createNoopAuditHelper();
    const auditBridge = this.deps?.auditBridge ?? createAuditBridge(audit);
    const guard = this.deps?.guard ?? createSecurityGuard();
    const eventBus = this.deps?.eventBus;

    const executeSpan = traceBridge.onTransportExecute(request);
    const taskId = request.securityContext.taskId ?? 'unknown';
    auditBridge.onTransportStart(taskId, request.descriptor.id);

    try {
      if (request.mode === 'dry-run') {
        const dryResult = await this.executeDryRun(request);
        traceBridge.onTransportExecuteEnd(executeSpan, dryResult.success, dryResult.stopReason, dryResult.error);
        auditBridge.onTransportEnd(taskId, dryResult.success, 0);
        return dryResult;
      }

      const acpOptions = descriptorToAcpOptions(request.descriptor, request);
      acpOptions.onEvent = (event: AcpEvent) => {
        traceBridge.onAcpEvent(event);
        auditBridge.onAcpEvent(event);
        publishAcpEventToBus(eventBus, event);
      };
      acpOptions.onPermission = async (toolTitle, options) => {
        const acpPermissionRequest = {
          toolCall: { title: toolTitle, kind: inferKindFromTitle(toolTitle) },
          options,
        };
        const result = await handleAcpPermission(acpPermissionRequest, guard, request.securityContext, audit);
        if ('cancelled' in result) {
          eventBus?.emit('acp:permission', { toolTitle, decision: 'cancelled' });
          return { cancelled: true as const };
        }
        eventBus?.emit('acp:permission', { toolTitle, decision: result.optionId });
        return { optionId: result.optionId };
      };

      const acpResult = await prompt(request.taskPrompt, acpOptions);
      const stopResult = mapStopReason(acpResult.stopReason);
      eventBus?.emit('acp:stop', { stopReason: acpResult.stopReason });

      const result: TransportResult = {
        success: stopResult.success,
        output: acpResult.message,
        toolCalls: acpResult.toolCalls,
        stopReason: acpResult.stopReason,
        usage: mapUsage(acpResult),
        changedFiles: mapChangedFiles(acpResult.toolCalls),
        events: acpResult.events,
        error: stopResult.success ? undefined : {
          code: stopToErrorCode(acpResult.stopReason),
          message: stopResult.errorMessage ?? 'Unknown error',
        },
      };

      // 脱敏:output 和 tool_call.rawOutput 是 agent 产出,可能包含敏感信息;
      // rawInput 是 VectaHub 发出的输入,不脱敏。详见 docs/06-security-protocol.md § Redactor 适配到 ACP 事件层
      result.output = this.redactor.redact(result.output);
      result.toolCalls = result.toolCalls.map(tc => ({
        ...tc,
        rawOutput: tc.rawOutput != null ? this.redactor.redact(String(tc.rawOutput)) : tc.rawOutput,
      }));

      traceBridge.onTransportExecuteEnd(executeSpan, result.success, result.stopReason, result.error);
      auditBridge.onTransportEnd(taskId, result.success, 0);
      return result;
    } catch (err) {
      const transportError = mapErrorToTransportError(err, request);
      traceBridge.onTransportExecuteEnd(executeSpan, false, undefined, transportError);
      auditBridge.onTransportEnd(taskId, false, 0);
      auditBridge.onTransportFailed(transportError);

      return {
        success: false,
        output: '',
        toolCalls: [],
        stopReason: 'cancelled',
        changedFiles: [],
        events: [],
        error: transportError,
      };
    }
  }

  async probe(descriptor: AgentDescriptor): Promise<boolean> {
    try {
      const acpOptions = descriptorToAcpOptions(descriptor, {
        descriptor,
        workspaceRoot: process.cwd(),
        taskPrompt: '',
        mode: 'dry-run',
        traceContext: { traceId: 'probe', spanId: undefined },
        parentSpanId: '',
        securityContext: { cwd: process.cwd(), sessionId: 'probe' },
        timeoutMs: 10_000,
      });

      await prompt('', acpOptions);
      return true;
    } catch {
      return false;
    }
  }

  private async executeDryRun(request: TransportRequest): Promise<TransportResult> {
    const probeOk = await this.probe(request.descriptor);
    if (!probeOk) {
      return {
        success: false,
        output: '',
        toolCalls: [],
        stopReason: 'cancelled',
        changedFiles: [],
        events: [],
        error: { code: 'INITIALIZE_FAILED', message: 'Agent probe failed in dry-run' },
      };
    }
    return {
      success: true,
      output: `[dry-run] Would send prompt to ${request.descriptor.id}:\n${request.taskPrompt}`,
      toolCalls: [],
      stopReason: 'end_turn',
      changedFiles: [],
      events: [],
    };
  }
}

/**
 * 将 ACP 事件发布到 event bus,供 UI/日志订阅。
 * 按 docs/07-infrastructure.md § ACP 事件 → Event Bus 的 5 种事件映射。
 * eventBus 为可选依赖,未提供时跳过发布。
 * @param eventBus 事件总线(可选)
 * @param event ACP 事件
 */
function publishAcpEventToBus(eventBus: IEventBus | undefined, event: AcpEvent): void {
  if (eventBus === undefined) return;
  switch (event.type) {
    case 'message':
      eventBus.emit('acp:message', { messageId: event.event.messageId, text: event.event.text });
      break;
    case 'tool_call':
    case 'tool_call_update':
      eventBus.emit('acp:tool_call', {
        toolCallId: event.event.toolCallId,
        kind: event.event.kind,
        status: event.event.status,
      });
      break;
    case 'usage':
      eventBus.emit('acp:usage', {
        used: event.event.usedTokens,
        max: event.event.maxContextTokens,
      });
      break;
    case 'plan':
      // plan 事件不在 § ACP 事件 → Event Bus 的 5 种映射中,跳过
      break;
  }
}

/** Best-effort inference of AcpToolKind from a tool title (for permission requests). */
function inferKindFromTitle(title: string): AcpPromptResult['toolCalls'][number]['kind'] {
  const lower = title.toLowerCase();
  if (lower.startsWith('bash') || lower.startsWith('run') || lower.startsWith('execute')) return 'execute';
  if (lower.startsWith('edit') || lower.startsWith('write') || lower.startsWith('patch')) return 'edit';
  if (lower.startsWith('read') || lower.startsWith('cat') || lower.startsWith('view')) return 'read';
  if (lower.startsWith('delete') || lower.startsWith('rm')) return 'delete';
  if (lower.startsWith('move') || lower.startsWith('mv')) return 'move';
  if (lower.startsWith('search') || lower.startsWith('grep') || lower.startsWith('find')) return 'search';
  if (lower.startsWith('fetch') || lower.startsWith('curl') || lower.startsWith('wget')) return 'fetch';
  return 'other';
}
