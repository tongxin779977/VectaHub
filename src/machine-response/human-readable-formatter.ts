import type {
  MachineResponseEnvelope,
  MachineResponseResult,
} from '../types/machine-response.js';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';

/**
 * Formats a MachineResponseEnvelope into human-readable CLI text
 */
export function formatHumanReadable(response: MachineResponseEnvelope): string {
  const lines: string[] = [];
  const result = response.result;

  lines.push(formatResultHeader(result));

  switch (result.kind) {
    case 'reply':
      lines.push(formatReply(result));
      break;
    case 'clarify':
      lines.push(formatClarify(result));
      break;
    case 'blocked':
      lines.push(formatBlocked(result));
      break;
    case 'plan':
      lines.push(formatPlan(result.plan));
      break;
    case 'workflow_draft':
      lines.push(formatWorkflowDraft(result.workflowDraft));
      break;
    case 'validation_error':
      lines.push(formatValidationError(result));
      break;
    case 'safety_error':
      lines.push(formatSafetyError(result));
      break;
    case 'internal_error':
      lines.push(formatInternalError(result));
      break;
    case 'success':
      lines.push(formatSuccess(result));
      break;
  }

  lines.push(formatResultFooter(result));

  return lines.join('\n');
}

function formatResultHeader(result: MachineResponseResult): string {
  const iconMap: Record<MachineResponseResult['kind'], string> = {
    reply: '🤖',
    clarify: '❓',
    blocked: '🚫',
    validation_error: '⚠️',
    safety_error: '🔒',
    internal_error: '💥',
    plan: '📋',
    workflow_draft: '📝',
    success: '✅',
  };

  const labelMap: Record<MachineResponseResult['kind'], string> = {
    reply: '回复',
    clarify: '需要澄清',
    blocked: '已阻止',
    validation_error: '验证错误',
    safety_error: '安全错误',
    internal_error: '内部错误',
    plan: '计划',
    workflow_draft: '工作流草案',
    success: '成功',
  };

  return `${iconMap[result.kind]} ${labelMap[result.kind]}`;
}

function formatReply(result: { kind: 'reply'; reply: string }): string {
  return `\n${result.reply}\n`;
}

function formatClarify(result: { kind: 'clarify'; reason: string; suggestedAction?: string }): string {
  let output = `\n${result.reason}\n`;
  if (result.suggestedAction) {
    output += `\n💡 建议下一步: ${result.suggestedAction}`;
  }
  return output;
}

function formatBlocked(result: { kind: 'blocked'; reason: string; blockedBy?: string; suggestedAction?: string }): string {
  let output = `\n${result.reason}\n`;
  if (result.blockedBy) {
    const blockLabelMap: Record<string, string> = {
      safety: '安全检查',
      validation: '验证检查',
      contract: '合同约束',
      unknown: '未知原因',
    };
    output += `\n🔍 阻止原因: ${blockLabelMap[result.blockedBy] || result.blockedBy}`;
  }
  if (result.suggestedAction) {
    output += `\n💡 建议下一步: ${result.suggestedAction}`;
  }
  return output;
}

function formatPlan(plan: OrchestrationPlan): string {
  const lines: string[] = [];

  lines.push(`\n📌 目标: ${plan.goal}`);
  lines.push(`📊 状态: ${plan.status}`);

  if (plan.tasks.length > 0) {
    lines.push(`\n📝 任务 (${plan.tasks.length} 个):`);
    for (const task of plan.tasks) {
      const statusIcon =
        task.kind === 'reply' ? '💬' :
        task.kind === 'inspect' ? '🔍' :
        task.kind === 'transform' ? '🔄' :
        task.kind === 'apply' ? '✏️' :
        task.kind === 'verify' ? '✅' :
        task.kind === 'recover' ? '🔧' : '❓';

      const sideEffectIcon =
        task.sideEffect === 'none' ? '' :
        task.sideEffect === 'read' ? '📖' :
        task.sideEffect === 'write' ? '📝' :
        task.sideEffect === 'command' ? '⚡' :
        task.sideEffect === 'network' ? '🌐' : '';

      let taskLine = `  ${statusIcon} ${task.title}`;
      if (sideEffectIcon) {
        taskLine += ` ${sideEffectIcon}`;
      }
      if (task.needsConfirmation) {
        taskLine += ' (需确认)';
      }

      lines.push(taskLine);

      if (task.command) {
        lines.push(`      命令: ${task.command.cli} ${task.command.args.join(' ')}`);
      }

      if (task.executor === 'agent' && task.delegateTo) {
        lines.push(`      执行: ${task.delegateTo}`);
      }
    }
  }

  if (plan.safetyReview.findings.length > 0) {
    lines.push(`\n🔒 安全审查:`);
    for (const finding of plan.safetyReview.findings) {
      const riskIcon =
        finding.level === 'critical' ? '🔴' :
        finding.level === 'high' ? '🟠' :
        finding.level === 'medium' ? '🟡' :
        finding.level === 'low' ? '🟢' : '⚪';
      lines.push(`  ${riskIcon} ${finding.reason}`);
    }
  }

  if (plan.requiredConfirmations.length > 0) {
    lines.push(`\n⚠️ 需要确认:`);
    for (const confirm of plan.requiredConfirmations) {
      lines.push(`  - ${confirm.reason}`);
    }
  }

  if (plan.verification.required) {
    lines.push(`\n✅ 验证: 已包含`);
  }

  lines.push(`\n💡 下一步: 使用 --confirm 确认后执行，或 --dry-run 查看更多细节`);

  return lines.join('\n');
}

function formatWorkflowDraft(draft: WorkflowDraft): string {
  const lines: string[] = [];

  lines.push(`\n📌 工作流: ${draft.name || '未命名'}`);
  lines.push(`📊 状态: ${draft.status}`);
  lines.push(`📝 步骤: ${draft.steps.length} 个`);

  if (draft.steps.length > 0) {
    lines.push(`\n📋 步骤列表:`);
    for (let i = 0; i < draft.steps.length; i++) {
      const step = draft.steps[i];
      const icon =
        step.type === 'exec' ? '⚡' :
        step.type === 'delegate' ? '🤝' :
        step.type === 'if' || step.type === 'for_each' || step.type === 'parallel' ? '🔀' : '❓';

      let stepLine = `  ${i + 1}. ${icon} ${step.label || '步骤'}`;

      if (step.type === 'exec' && step.command) {
        stepLine += `\n      命令: ${step.command.cli} ${(step.command.args || []).join(' ')}`;
      }

      if (step.type === 'delegate' && step.delegate) {
        stepLine += `\n      委派给: ${step.delegate.to}`;
      }

      if (step.sideEffect !== 'none') {
        const sideEffectIcon =
          step.sideEffect === 'read' ? '📖' :
          step.sideEffect === 'write' ? '📝' :
          step.sideEffect === 'command' ? '⚡' :
          step.sideEffect === 'network' ? '🌐' : '';
        if (sideEffectIcon) {
          stepLine += ` ${sideEffectIcon}`;
        }
      }

      lines.push(stepLine);
    }
  }

  if (draft.safetyReview.status !== 'safe') {
    const safetyIcon =
      draft.safetyReview.status === 'blocked' ? '🚫' :
      draft.safetyReview.status === 'needs_confirmation' ? '⚠️' : 'ℹ️';
    lines.push(`\n${safetyIcon} 安全审查: ${draft.safetyReview.status}`);
  }

  if (draft.safetyReview.findings.length > 0) {
    lines.push(`\n🔍 安全发现:`);
    for (const finding of draft.safetyReview.findings) {
      const riskIcon =
        finding.level === 'critical' ? '🔴' :
        finding.level === 'high' ? '🟠' :
        finding.level === 'medium' ? '🟡' :
        finding.level === 'low' ? '🟢' : '⚪';
      lines.push(`  ${riskIcon} ${finding.reason}`);
    }
  }

  if (draft.status === 'confirmed' || draft.status === 'persisted') {
    lines.push(`\n💡 下一步: 可以执行此工作流`);
  } else if (draft.status === 'needs_confirmation') {
    lines.push(`\n💡 下一步: 需要先确认才能执行`);
  } else if (draft.status === 'reviewed') {
    lines.push(`\n💡 下一步: 已审核，等待确认`);
  }

  return lines.join('\n');
}

function formatValidationError(result: { kind: 'validation_error'; reason: string; validationErrors: string[]; suggestedAction?: string }): string {
  let output = `\n${result.reason}\n`;

  if (result.validationErrors.length > 0) {
    output += '\n📋 错误详情:\n';
    for (const err of result.validationErrors) {
      output += `  - ${err}\n`;
    }
  }

  if (result.suggestedAction) {
    output += `\n💡 建议下一步: ${result.suggestedAction}`;
  }

  return output;
}

function formatSafetyError(result: { kind: 'safety_error'; reason: string; riskLevel?: string; suggestedAction?: string }): string {
  let output = `\n${result.reason}\n`;

  if (result.riskLevel) {
    const riskLabelMap: Record<string, string> = {
      safe: '安全',
      low: '低风险',
      medium: '中等风险',
      high: '高风险',
      critical: '严重风险',
    };
    const riskIcon =
      result.riskLevel === 'critical' ? '🔴' :
      result.riskLevel === 'high' ? '🟠' :
      result.riskLevel === 'medium' ? '🟡' :
      result.riskLevel === 'low' ? '🟢' : '⚪';
    output += `\n${riskIcon} 风险等级: ${riskLabelMap[result.riskLevel] || result.riskLevel}`;
  }

  if (result.suggestedAction) {
    output += `\n💡 建议下一步: ${result.suggestedAction}`;
  }

  return output;
}

function formatInternalError(result: { kind: 'internal_error'; reason: string; errorId?: string; suggestedAction?: string }): string {
  let output = `\n${result.reason}\n`;

  if (result.errorId) {
    output += `\n🆔 错误 ID: ${result.errorId}`;
  }

  if (result.suggestedAction) {
    output += `\n💡 建议下一步: ${result.suggestedAction}`;
  } else {
    output += '\n💡 建议: 请检查日志或重试';
  }

  return output;
}

function formatSuccess(result: { kind: 'success'; message: string }): string {
  return `\n${result.message}\n`;
}

function formatResultFooter(result: MachineResponseResult): string {
  if (
    result.kind === 'plan' ||
    result.kind === 'workflow_draft' ||
    result.kind === 'clarify' ||
    result.kind === 'blocked'
  ) {
    return '\n---';
  }
  return '';
}
