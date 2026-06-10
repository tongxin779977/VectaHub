/**
 * TaskContract 运行时决策 helper。
 * 负责按 TaskContract.kind 分流、生成统一的执行决策。
 * 不直接执行命令、不写 stdout、不操作 readline。
 * @module nl/task-contract-runtime
 */
import type { NLResult } from './core/types.js';
import type { TaskContractEnvelope } from '../types/task-contract.js';
import { presentTaskContract } from './task-contract-presentation.js';
import { resolveTaskContractCommand } from './task-contract-strategy.js';
import { createRunDispatch, type RunDispatchResult } from '../commands/run-dispatch.js';

/**
 * TaskContract 运行时决策结果。
 * 调用方根据 kind 决定后续行为。
 */
export type TaskContractAction =
  /** 回复类：调用方展示 reply 内容 */
  | { kind: 'reply'; summaryLines: string[]; reply?: string }
  /** 澄清类：调用方展示待确认问题 */
  | { kind: 'clarify'; summaryLines: string[]; question: string }
  /** 阻断类：调用方展示阻断原因 */
  | { kind: 'blocked'; summaryLines: string[]; reason: string }
  /** 可执行桥命令：调用方执行 bridgeCommand 后展示结果 */
  | { kind: 'execute-bridge'; summaryLines: string[]; bridgeCommand: string }
  /** dispatch 反馈：调用方展示预格式化的反馈文本 */
  | { kind: 'execute-dispatch-feedback'; summaryLines: string[]; feedback: string; dispatch: RunDispatchResult }
  /** 继续处理：调用方按自身逻辑继续（如工作流生成、legacy fallback） */
  | { kind: 'execute-continue'; summaryLines: string[] };

/**
 * 格式化 vectahub 命令桥执行文本。
 * 只允许 vectahub 子命令，返回 null 表示无效或非 vectahub 命令。
 *
 * @param cli - 命令 CLI 名称
 * @param args - 命令参数
 * @returns 格式化后的子命令文本，或 null
 */
export function formatBridgeCommandText(cli: string, args: string[]): string | null {
  const normalizedCli = cli.trim();
  if (normalizedCli !== 'vectahub') {
    return null;
  }
  const [subcommand, ...restArgs] = args;
  if (!subcommand?.trim()) {
    return null;
  }
  return [subcommand, ...restArgs].join(' ');
}

/**
 * 生成 dispatch feedback 文本。
 * 根据 dispatch.kind 生成人类可读的反馈信息。
 *
 * @param summaryLines - 已有的摘要行
 * @param dispatch - dispatch 决策结果
 * @param contextLabel - 上下文标签（如 'REPL'、'vectahub chat'）
 * @returns 格式化后的反馈文本
 */
export function buildDispatchFeedbackText(
  summaryLines: string[],
  dispatch: RunDispatchResult,
  contextLabel: string,
): string {
  const lines = [...summaryLines];

  switch (dispatch.kind) {
    case 'blocked':
      lines.push('任务执行已阻断：当前请求无法通过受支持的内部命令执行。');
      break;
    case 'direct-command':
      lines.push(`当前任务已识别为本地直接命令。${contextLabel} 不会通过内部命令桥自动执行这类命令。`);
      break;
    case 'agent-task':
      lines.push('当前任务需要 Agent runtime 才能继续执行。');
      break;
    case 'clarify':
      lines.push('当前任务还需要补充信息。');
      break;
    case 'dialog':
      lines.push('当前请求更适合作为直接回复处理。');
      break;
    case 'workflow':
      break;
  }

  if (dispatch.suggestedAction) {
    lines.push(`建议：${dispatch.suggestedAction}`);
  }

  return lines.join('\n');
}

/**
 * 解析 TaskContract envelope，生成统一的执行决策。
 * 不执行任何命令，不写 stdout。
 *
 * @param envelope - TaskContract 信封
 * @param rawInput - 原始用户输入
 * @param contextLabel - 上下文标签（如 'REPL'、'vectahub chat'）
 * @returns 执行决策
 */
export function resolveTaskContractAction(
  envelope: TaskContractEnvelope<NLResult>,
  rawInput: string,
  contextLabel: string,
): TaskContractAction {
  const nlResult = envelope.legacy;
  if (!nlResult) {
    throw new Error('Task contract envelope did not include legacy NL result');
  }

  const taskContract = envelope.taskContract;
  const presentation = presentTaskContract(taskContract);

  switch (taskContract.kind) {
    case 'reply':
      return { kind: 'reply', summaryLines: presentation.summaryLines, reply: nlResult.reply };
    case 'clarify':
      return { kind: 'clarify', summaryLines: presentation.summaryLines, question: taskContract.question };
    case 'blocked':
      return { kind: 'blocked', summaryLines: presentation.summaryLines, reason: taskContract.reason };
    case 'execute': {
      const dispatch = createRunDispatch({
        text: rawInput,
        steps: [],
        reply: nlResult.reply,
        taskContract,
      });

      if (!dispatch.executable) {
        return {
          kind: 'execute-dispatch-feedback',
          summaryLines: presentation.summaryLines,
          feedback: buildDispatchFeedbackText(presentation.summaryLines, dispatch, contextLabel),
          dispatch,
        };
      }

      const resolvedCommand = resolveTaskContractCommand(taskContract);
      if (resolvedCommand?.cli === 'vectahub') {
        const bridgeCommand = formatBridgeCommandText(resolvedCommand.cli, resolvedCommand.args);
        if (!bridgeCommand) {
          const fallbackDispatch = {
            kind: 'blocked' as const,
            executable: false,
            reason: 'missing executable vectahub subcommand',
          };
          return {
            kind: 'execute-dispatch-feedback',
            summaryLines: presentation.summaryLines,
            feedback: buildDispatchFeedbackText(presentation.summaryLines, fallbackDispatch, contextLabel),
            dispatch: fallbackDispatch,
          };
        }
        return { kind: 'execute-bridge', summaryLines: presentation.summaryLines, bridgeCommand };
      }

      return { kind: 'execute-continue', summaryLines: presentation.summaryLines };
    }
  }
}
