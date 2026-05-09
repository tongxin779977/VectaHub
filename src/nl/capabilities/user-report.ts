import type { ExecutionPlan } from './types.js';

export interface UserReport {
  title: string;
  phases: string[];
  summary: string;
  details?: string;
}

export function generateUserReport(plan: ExecutionPlan): UserReport {
  const phases = plan.steps
    .filter(s => !s.internalOutput || plan.steps.indexOf(s) === plan.steps.length - 1)
    .map((s, i) => `${i + 1}. ${s.label}`);

  return {
    title: plan.label,
    phases,
    summary: plan.userReport.summaryTemplate,
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
  return lines.join('\n');
}

export function formatDryRunText(plan: ExecutionPlan): string {
  const report = generateUserReport(plan);
  return formatUserReportText(report) + '\n\nDry-run: 未执行任何命令。';
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
