import type { InfrastructureContext } from '../infrastructure/context.js';
import type { ExecutionTaskContract } from '../types/task-contract.js';

export interface GeneratedAgentTaskContractFile {
  filePath: string;
  relativePath: string;
  suggestedAction: string;
}

function buildMarkdownFromTaskContract(taskContract: ExecutionTaskContract): string {
  const constraints = taskContract.constraints;
  const sideEffects = constraints.sideEffects.join(', ');

  return [
    '# Tasks',
    '',
    `## ${taskContract.requestId} ${taskContract.normalizedGoal}`,
    '',
    `taskId: ${taskContract.requestId}`,
    `schemaVersion: ${taskContract.schemaVersion}`,
    `normalizedGoal: ${taskContract.normalizedGoal}`,
    '',
    '### Constraints',
    `- requiresConfirmation: ${constraints.requiresConfirmation}`,
    `- requiresVerification: ${constraints.requiresVerification}`,
    `- sideEffects: ${sideEffects}`,
    '',
    '### Target',
    `- scope: ${taskContract.target.scope}`,
    `- identifier: ${taskContract.target.identifier ?? 'none'}`,
    '',
    '### Execution Strategy',
    `- mode: ${taskContract.executionStrategy.mode}`,
    `- capabilityId: ${taskContract.executionStrategy.capabilityId ?? 'none'}`,
    `- commandSurfaceId: ${taskContract.executionStrategy.commandSurfaceId ?? 'none'}`,
    '',
    '### Expected Output',
    `- format: ${taskContract.expectedOutput.format}`,
    `- audience: ${taskContract.expectedOutput.audience}`,
  ].join('\n');
}

export function writeAgentTaskContractFile(
  context: InfrastructureContext,
  taskContract: ExecutionTaskContract,
): GeneratedAgentTaskContractFile {
  const tasksDir = context.environment.getEnv('VECTAHUB_TASKS_DIR') || '.vectahub/tasks';
  const resolvedTasksDir = context.environment.resolvePath(tasksDir);
  context.environment.ensureDir(resolvedTasksDir);

  const taskFileName = `${taskContract.requestId}.md`;
  const filePath = context.environment.joinPath(resolvedTasksDir, taskFileName);
  context.environment.writeFile(filePath, buildMarkdownFromTaskContract(taskContract));

  const relativePath = context.environment.joinPath(tasksDir, taskFileName);
  const suggestedAction = `已在 ${relativePath} 自动为您生成任务合同。您可以使用 \`vectahub run-task --file ${relativePath}\` 直接执行此 Agent 任务。`;

  return { filePath, relativePath, suggestedAction };
}
