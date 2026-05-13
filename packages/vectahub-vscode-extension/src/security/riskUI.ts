import * as vscode from 'vscode';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface CommandRiskAssessment {
  level: RiskLevel;
  ruleName?: string;
  reason?: string;
  suggestion?: string;
  needsConfirmation: boolean;
}

/**
 * Show a VS Code warning dialog for high-risk commands.
 * Returns true if the user confirms, false if they cancel.
 */
export async function confirmHighRiskCommand(
  assessment: CommandRiskAssessment,
  taskLabel?: string,
): Promise<boolean> {
  const riskEmoji = assessment.level === 'critical' ? '🔴' : '🟠';
  const title = `${riskEmoji} 高风险命令确认`;
  const detail = [
    taskLabel ? `任务: ${taskLabel}` : '',
    assessment.ruleName ? `触发规则: ${assessment.ruleName}` : '',
    assessment.reason ? `原因: ${assessment.reason}` : '',
    assessment.suggestion || '',
  ].filter(Boolean).join('\n');

  const confirm = await vscode.window.showWarningMessage(
    title,
    { modal: true, detail },
    '确认执行',
    '取消',
  );

  return confirm === '确认执行';
}