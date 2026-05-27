import { deriveAgentTaskBoundary, deriveDocExcerpt, computeInstructionHash } from './agent-task-contract.js';
import { buildGlobalConfigDigest } from '@vectahub/doc-task-contract-core';
import type { AgentTaskContract } from '../types/doc-task.js';
import {
  AgentTaskContractSummary,
  getContext,
  getAgentCliTimeout,
  PROMPT_CONTRACT_MAX_LENGTH,
  escapeRegExp
} from './run-task-shared.js';

export interface BuildAgentTaskContractInput {
  taskId: string;
  label: string;
  docPath?: string;
  projectRoot: string;
  tool?: string;
  globalConfigDigest?: string;
}

function readPackageScripts(projectRoot: string): string[] {
  try {
    const packageJsonPath = getContext().environment.resolvePath(projectRoot, 'package.json');
    const packageJson = JSON.parse(getContext().environment.readFile(packageJsonPath)) as {
      scripts?: Record<string, unknown>;
    };
    return Object.keys(packageJson.scripts ?? {});
  } catch {
    return [];
  }
}

function docExcerptContainsTaskId(docExcerpt: string, taskId: string): boolean {
  const escapedTaskId = escapeRegExp(taskId);
  return new RegExp(`(^|[^\\w.-])${escapedTaskId}([^\\w.-]|$)`).test(docExcerpt);
}

export async function buildAgentTaskContract(input: BuildAgentTaskContractInput): Promise<AgentTaskContract & { summary: AgentTaskContractSummary }> {
  let docExcerpt = '';
  let docExcerptTruncated = false;
  let excerptStrategy: AgentTaskContractSummary['excerptStrategy'] = 'none';
  const notes: string[] = [];

  if (input.docPath && getContext().environment.exists(input.docPath)) {
    const excerpt = await deriveDocExcerpt(getContext(), {
      docPath: input.docPath,
      taskId: input.taskId,
      label: input.label,
    });
    docExcerpt = excerpt.excerpt;
    docExcerptTruncated = excerpt.truncated;
    excerptStrategy = excerpt.strategy;
    if (excerptStrategy === 'head-fallback' || !docExcerptContainsTaskId(docExcerpt, input.taskId)) {
      throw new Error(`Task contract not found in doc: taskId=${input.taskId}, docPath=${input.docPath}`);
    }
  } else if (input.docPath) {
    notes.push('doc-not-found');
  } else {
    notes.push('doc-not-provided');
  }

  const boundary = deriveAgentTaskBoundary({
    docExcerpt,
    label: input.label,
    projectRoot: input.projectRoot,
    packageScripts: readPackageScripts(input.projectRoot),
  });
  const executionMode: AgentTaskContract['executionMode'] = boundary.parallelEligible
    ? 'parallel-eligible'
    : 'serial';
  const instructionHash = computeInstructionHash(
    input.taskId,
    input.label,
    docExcerpt,
    input.tool,
    boundary.allowedFiles,
    boundary.forbiddenFiles,
    input.globalConfigDigest,
  );
  const contract: AgentTaskContract = {
    taskId: input.taskId,
    label: input.label,
    instructionHash,
    docPath: input.docPath,
    docExcerpt,
    allowedFiles: boundary.allowedFiles,
    forbiddenFiles: boundary.forbiddenFiles,
    validationCommands: boundary.validationCommands,
    timeoutMs: getAgentCliTimeout(),
    executionMode,
    boundaryConfidence: boundary.boundaryConfidence,
    notes: boundary.reason ? [...notes, boundary.reason] : notes,
  };
  const summary: AgentTaskContractSummary = {
    boundaryConfidence: contract.boundaryConfidence,
    allowedFiles: contract.allowedFiles,
    forbiddenFiles: contract.forbiddenFiles,
    relatedFiles: boundary.relatedFiles ?? [],
    validationCommands: contract.validationCommands,
    executionMode: contract.executionMode,
    docExcerptTruncated,
    excerptStrategy,
    instructionHash: contract.instructionHash,
    globalConfigDigest: input.globalConfigDigest,
  };

  return { ...contract, summary };
}

export function buildDefaultPrompt(taskId: string, taskLabel: string, docPath: string, contract: AgentTaskContract): string {
  const shouldEnforceMinimalChange = !contract.docExcerpt || contract.boundaryConfidence === 'none' || contract.boundaryConfidence === 'low';
  const docExcerptText = contract.docExcerpt || '(未提供文档片段)';
  const additionalGuidance = shouldEnforceMinimalChange
    ? [
      '- 当前文档片段缺失或边界可信度较低；仅允许最小改动。',
      '- 若无法在允许修改范围内完成，输出阻塞说明并停止，不要扩大改动范围。',
    ]
    : [
      '- 优先基于文档片段执行；仅在片段不足且不越过允许修改范围时，再补充引用参考文档路径。',
    ];
  const prompt = [
    '请基于任务边界合同执行任务；合同是主输入。',
    '',
    `任务编号：${taskId}`,
    `任务描述：${taskLabel}`,
    '',
    '任务边界合同：',
    `文档片段：\n${docExcerptText}`,
    '',
    `允许修改范围：${formatListForPrompt(contract.allowedFiles, '未推导出明确文件，请保持最小改动并在输出中说明实际修改文件')}`,
    `禁止修改范围：${formatListForPrompt(contract.forbiddenFiles, '未配置')}`,
    `建议验证命令：${formatListForPrompt(contract.validationCommands, 'npm run typecheck')}`,
    `边界可信度：${contract.boundaryConfidence}`,
    `参考文档路径（补充引用）：${docPath}`,
    '',
    '执行要求：',
    '- 只围绕当前任务改动。',
    '- 优先修改允许修改范围内的文件。',
    '- 不要修改禁止修改范围内的文件。',
    ...additionalGuidance,
    '- 完成后运行或说明建议验证命令。',
    '',
    '执行步骤：',
    `1. 先按任务边界合同中的字段完成任务 ${taskId}`,
    `2. 仅在片段不足且边界允许时，补充引用 ${docPath} 的必要上下文`,
    '3. 保持与现有代码风格一致，并运行建议验证命令',
  ].join('\n');

  if (prompt.length <= PROMPT_CONTRACT_MAX_LENGTH) {
    return prompt;
  }
  return `${prompt.slice(0, PROMPT_CONTRACT_MAX_LENGTH).trimEnd()}\n... (prompt contract truncated)`;
}

function formatListForPrompt(values: string[], emptyText: string): string {
  if (!values.length) return emptyText;
  return values.map(value => `\n- ${value}`).join('');
}

export function buildDryRunPrompt(taskId: string, label: string, contractSummary: AgentTaskContractSummary): string {
  return [
    `任务编号：${taskId}`,
    `任务描述：${label}`,
    'dry-run 预览：',
    `允许修改范围：${formatListForPrompt(contractSummary.allowedFiles, '未推导出明确文件')}`,
    `禁止修改范围：${formatListForPrompt(contractSummary.forbiddenFiles, '未配置')}`,
    `建议验证命令：${formatListForPrompt(contractSummary.validationCommands, 'npm run typecheck')}`,
  ].join('\n');
}
