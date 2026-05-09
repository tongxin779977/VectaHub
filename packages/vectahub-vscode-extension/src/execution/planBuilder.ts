import { 
  ExecutionPlan, 
  getWorkspaceCwd 
} from './plan';
import { getExecutionMode } from '../config/settings';

export interface ProjectTaskStub {
  label: string;
  kind: string;
  source: 'package-json' | 'git' | 'vectahub' | 'manual';
  /** @deprecated 向后兼容 - 使用新的 command 对象格式 */
  command?: string | {
    cli: string;
    args: string[];
  };
}

export class PlanBuilder {
  static buildIntentPlan(intent: string, label?: string): ExecutionPlan {
    return {
      id: `intent-${Date.now()}`,
      type: 'intent',
      label: label || `Intent: ${intent}`,
      intent,
      source: 'manual',
      mode: getExecutionMode(),
      cwd: getWorkspaceCwd()
    };
  }

  static buildCommandPlan(cli: string, args: string[], label: string, source: 'package-json' | 'git'): ExecutionPlan {
    return {
      id: `cmd-${Date.now()}`,
      type: 'command',
      label,
      command: { cli, args },
      source,
      mode: getExecutionMode(),
      cwd: getWorkspaceCwd()
    };
  }

  static buildWorkflowFilePlan(filePath: string, label?: string): ExecutionPlan {
    return {
      id: `wf-${Date.now()}`,
      type: 'workflowFile',
      label: label || `Workflow: ${filePath}`,
      file: filePath,
      source: 'workflow-file',
      mode: getExecutionMode(),
      cwd: getWorkspaceCwd()
    };
  }

  static createProjectTaskPlan(task: ProjectTaskStub): ExecutionPlan | undefined {
    if (!task.command) return undefined;

    let cli: string;
    let args: string[];

    if (typeof task.command === 'string') {
      // 向后兼容：处理字符串格式的命令
      const parts = task.command.split(' ');
      cli = parts[0];
      args = parts.slice(1);
    } else {
      // 新格式：对象格式的命令
      cli = task.command.cli;
      args = task.command.args;
    }

    return this.buildCommandPlan(
      cli,
      args,
      task.label,
      task.source === 'package-json' ? 'package-json' : 'git'
    );
  }
}
