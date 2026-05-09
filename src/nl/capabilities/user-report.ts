import type { ExecutionPlan, ExecutionPlanStep } from './types.js';

export interface UserReport {
  title: string;
  phases: string[];
  summary: string;
  nextActions?: string[];
  verification?: string[];
}

interface StepResult {
  stepId: string;
  status: string;
  output?: string[];
  error?: string;
}

export function generateUserReport(plan: ExecutionPlan): UserReport {
  const phases = plan.steps.map((s, i) => `${i + 1}. ${s.label}`);

  return {
    title: plan.label,
    phases,
    summary: plan.userReport.summaryTemplate,
    nextActions: plan.userReport.nextActions,
    verification: plan.userReport.verificationSteps,
  };
}

export function formatUserReportText(report: UserReport): string {
  const lines: string[] = [];
  lines.push(`执行计划: ${report.title}`);
  lines.push('');
  lines.push('阶段:');
  for (const phase of report.phases) {
    lines.push(phase);
  }
  lines.push('');
  lines.push(report.summary);

  if (report.nextActions && report.nextActions.length > 0) {
    lines.push('');
    lines.push('后续操作:');
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }

  if (report.verification && report.verification.length > 0) {
    lines.push('');
    lines.push('验证步骤:');
    for (const step of report.verification) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join('\n');
}

function isInternalStep(plan: ExecutionPlan, stepId: string): boolean {
  const planStep = plan.steps.find(s => s.id === stepId);
  return planStep?.internalOutput === true;
}

export function formatDryRunText(plan: ExecutionPlan): string {
  const report = generateUserReport(plan);
  const lines: string[] = [];
  lines.push(formatUserReportText(report));
  lines.push('');
  lines.push('Dry-run: 未执行任何命令。');
  return lines.join('\n');
}

export function formatExecutionResultText(
  plan: ExecutionPlan,
  stepResults: StepResult[],
): string {
  const report = generateUserReport(plan);
  const lines: string[] = [];
  lines.push(`执行结果: ${report.title}`);
  lines.push('');

  for (const result of stepResults) {
    if (isInternalStep(plan, result.stepId)) {
      continue;
    }
    const icon = result.status === 'COMPLETED' ? '✓' : result.status === 'FAILED' ? '✗' : '○';
    lines.push(`${icon} ${result.stepId}: ${result.status}`);
    if (result.output && result.output.length > 0) {
      for (const line of result.output) {
        lines.push(`  ${line}`);
      }
    }
    if (result.error) {
      lines.push(`  错误: ${result.error}`);
    }
  }

  lines.push('');
  lines.push(report.summary);

  if (report.nextActions && report.nextActions.length > 0) {
    lines.push('');
    lines.push('后续操作:');
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }

  if (report.verification && report.verification.length > 0) {
    lines.push('');
    lines.push('验证步骤:');
    for (const step of report.verification) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join('\n');
}

export function formatJsonReport(plan: ExecutionPlan): Record<string, unknown> {
  const report = generateUserReport(plan);
  return {
    plan: {
      id: plan.id,
      label: plan.label,
      capabilityId: plan.capabilityId,
      goal: plan.goal,
      steps: plan.steps.map(s => ({
        id: s.id,
        label: s.label,
        type: s.type,
        command: s.command,
        internalOutput: s.internalOutput,
      })),
    },
    userReport: report,
  };
}
