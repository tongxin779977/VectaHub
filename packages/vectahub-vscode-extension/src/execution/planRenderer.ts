import { getCliPath } from '../config/settings.js';
import { ExecutionPlan } from './plan.js';

export function renderPlanCommand(plan: ExecutionPlan): string {
  if (plan.type === 'intent') {
    return `${getCliPath()} run --mode ${plan.mode} "${escapeDoubleQuotes(plan.intent)}"`;
  }

  if (plan.type === 'workflowFile') {
    return `${getCliPath()} run -f "${escapeDoubleQuotes(plan.file)}" --mode ${plan.mode}`;
  }

  return [plan.command.cli, ...plan.command.args].map(shellQuote).join(' ');
}

export function renderPlanPreview(plan: ExecutionPlan): string {
  if (plan.type === 'intent') {
    return `Intent: ${plan.intent}`;
  }

  if (plan.type === 'workflowFile') {
    return `Workflow file: ${plan.file}`;
  }

  return `Command: ${plan.command.cli} ${plan.command.args.join(' ')}`;
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) return value;
  return `"${escapeDoubleQuotes(value)}"`;
}
