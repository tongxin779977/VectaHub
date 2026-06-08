import type { TaskContract } from '../types/task-contract.js';

export interface TaskContractPresentation {
  summaryLines: string[];
}

function describeExecuteTask(contract: Extract<TaskContract, { kind: 'execute' }>): string {
  switch (contract.taskKind) {
    case 'diagnose':
      return '诊断当前项目';
    case 'inspect':
      return '检查当前目标';
    case 'modify':
      return '执行修改类任务';
    case 'generate':
      return '生成目标内容';
    case 'delegate':
      return '委托外部执行器处理任务';
    case 'workflow':
      return '生成或执行工作流任务';
    default:
      return '执行任务';
  }
}

function describeExecuteMode(contract: Extract<TaskContract, { kind: 'execute' }>): string {
  switch (contract.executionStrategy.mode) {
    case 'capability':
      return '执行方式：能力路由';
    case 'direct-command':
      return '执行方式：直接命令';
    case 'workflow-draft':
      return '执行方式：工作流草稿';
    case 'agent-runtime':
      return '执行方式：Agent Runtime';
    default:
      return '执行方式：未知';
  }
}

export function presentTaskContract(contract: TaskContract): TaskContractPresentation {
  switch (contract.kind) {
    case 'reply':
      return {
        summaryLines: [],
      };
    case 'clarify':
      return {
        summaryLines: [
          '任务摘要：需要补充信息',
          `待确认：${contract.question}`,
        ],
      };
    case 'blocked':
      return {
        summaryLines: [
          '任务摘要：当前请求无法直接处理',
          `原因：${contract.reason}`,
        ],
      };
    case 'execute':
      return {
        summaryLines: [
          `任务摘要：${describeExecuteTask(contract)}`,
          describeExecuteMode(contract),
        ],
      };
    default:
      return {
        summaryLines: [],
      };
  }
}
