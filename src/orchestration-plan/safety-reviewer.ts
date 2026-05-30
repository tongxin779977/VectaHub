
import type {
  OrchestrationPlan,
  OrchestrationTask,
  PlanSafetyReview,
  SafetyFinding,
  CommandInvocation,
  ConfirmationRequest,
} from '../types/orchestration-plan.js';

export interface SafetyReviewOptions {
  cwd?: string;
  isDryRun?: boolean;
  sessionId?: string;
}

function mapSideEffectToCategory(sideEffect: OrchestrationTask['sideEffect']): SafetyFinding['category'] {
  const mapping: Record<OrchestrationTask['sideEffect'], SafetyFinding['category']> = {
    none: 'unknown',
    read: 'filesystem',
    write: 'filesystem',
    command: 'command',
    network: 'network',
  };
  return mapping[sideEffect];
}

function assessTaskRisk(task: OrchestrationTask): {
  level: SafetyFinding['level'];
  requiredAction: SafetyFinding['requiredAction'];
  reason: string;
} {
  if (task.sideEffect === 'none') {
    return {
      level: 'safe',
      requiredAction: 'allow',
      reason: 'Task has no side effects',
    };
  }

  if (task.kind === 'apply' || task.sideEffect === 'write') {
    return {
      level: 'high',
      requiredAction: 'confirm',
      reason: 'Task modifies state (write or apply)',
    };
  }

  if (task.sideEffect === 'network') {
    return {
      level: 'medium',
      requiredAction: 'confirm',
      reason: 'Task accesses network resources',
    };
  }

  if (task.sideEffect === 'command') {
    if (task.executor === 'agent') {
      return {
        level: 'medium',
        requiredAction: 'confirm',
        reason: 'Agent-executed command',
      };
    }
    return {
      level: 'low',
      requiredAction: 'allow',
      reason: 'Local command execution',
    };
  }

  return {
    level: 'safe',
    requiredAction: 'allow',
    reason: 'Read-only operation',
  };
}

function assessCommandRisk(command: CommandInvocation): {
  level: SafetyFinding['level'];
  requiredAction: SafetyFinding['requiredAction'];
  reason: string;
} | null {
  const dangerousCommands = [
    'rm', 'rmdir', 'chmod', 'chown', 'mkfs', 'dd',
    'curl', 'wget', 'nc', 'netcat',
  ];

  const cli = command.cli.split('/').pop() || command.cli;
  if (dangerousCommands.includes(cli)) {
    return {
      level: 'critical',
      requiredAction: 'block',
      reason: `Potentially dangerous command: ${cli}`,
    };
  }

  return null;
}

function findMaxRiskLevel(findings: SafetyFinding[]): SafetyFinding['level'] {
  const levelOrder: Record<SafetyFinding['level'], number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    safe: 1,
  };

  let maxLevel: SafetyFinding['level'] = 'safe';
  for (const finding of findings) {
    if (levelOrder[finding.level] > levelOrder[maxLevel]) {
      maxLevel = finding.level;
    }
  }
  return maxLevel;
}

function determineReviewStatus(findings: SafetyFinding[]): PlanSafetyReview['status'] {
  const hasBlocked = findings.some(f => f.requiredAction === 'block');
  if (hasBlocked) {
    return 'blocked';
  }

  const hasNeedsConfirm = findings.some(f => f.requiredAction === 'confirm');
  if (hasNeedsConfirm) {
    return 'needs_confirmation';
  }

  return 'safe';
}

export function generateConfirmationRequests(
  plan: OrchestrationPlan,
  safetyReview: PlanSafetyReview
): ConfirmationRequest[] {
  const requests: ConfirmationRequest[] = [];
  
  // Group confirm needs by task
  const taskConfirmFindings: Map<string, SafetyFinding[]> = new Map();
  
  for (const finding of safetyReview.findings) {
    if (finding.requiredAction === 'confirm' && finding.taskId) {
      const existing = taskConfirmFindings.get(finding.taskId) || [];
      existing.push(finding);
      taskConfirmFindings.set(finding.taskId, existing);
    }
  }
  
  // If we have any confirm findings, create requests
  if (taskConfirmFindings.size > 0) {
    const taskIds = Array.from(taskConfirmFindings.keys());
    const reasons = Array.from(taskConfirmFindings.values())
      .flat()
      .map(f => f.reason)
      .join('; ');
    
    requests.push({
      id: `confirm-${Date.now()}`,
      taskIds,
      reason: reasons,
      prompt: `The plan includes tasks that need your confirmation: ${taskIds.join(', ')}. Reasons: ${reasons}`,
      defaultAction: 'deny',
    });
  }
  
  return requests;
}

export function reviewPlanSafety(
  plan: OrchestrationPlan,
  _options: SafetyReviewOptions = {}
): PlanSafetyReview {
  const findings: SafetyFinding[] = [];

  for (const task of plan.tasks) {
    const taskRisk = assessTaskRisk(task);
    findings.push({
      taskId: task.id,
      level: taskRisk.level,
      category: mapSideEffectToCategory(task.sideEffect),
      reason: taskRisk.reason,
      requiredAction: taskRisk.requiredAction,
    });

    if (task.command) {
      const commandRisk = assessCommandRisk(task.command);
      if (commandRisk) {
        findings.push({
          taskId: task.id,
          level: commandRisk.level,
          category: 'command',
          reason: commandRisk.reason,
          requiredAction: commandRisk.requiredAction,
        });
      }
    }
  }

  const maxRiskLevel = findMaxRiskLevel(findings);
  const status = determineReviewStatus(findings);

  return {
    status,
    maxRiskLevel,
    findings,
    reviewedAt: new Date().toISOString(),
  };
}

export function applySafetyReviewToPlan(
  plan: OrchestrationPlan,
  options: SafetyReviewOptions = {}
): OrchestrationPlan {
  const safetyReview = reviewPlanSafety(plan, options);
  const requiredConfirmations = generateConfirmationRequests(plan, safetyReview);

  const updatedPlan = {
    ...plan,
    safetyReview,
    requiredConfirmations,
  };

  if (safetyReview.status === 'blocked') {
    updatedPlan.status = 'blocked';
  } else if (safetyReview.status === 'needs_confirmation') {
    updatedPlan.status = 'needs_confirmation';
  } else if (safetyReview.status === 'safe') {
    updatedPlan.status = 'ready';
  }

  return updatedPlan;
}

