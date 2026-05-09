import type { Capability, CapabilityMatch, ExecutionPlan, ExecutionPlanStep } from './types.js';
import type { ParsedGoal, ProjectContext } from '../core/goal-types.js';

const CAPABILITY_ID = 'git-workflow';

const GIT_ACTIONS = ['commit', 'push', 'pull', 'merge', 'branch'];

export function createGitWorkflowCapability(): Capability {
  return {
    id: CAPABILITY_ID,

    canHandle(goal: ParsedGoal, _context?: ProjectContext): CapabilityMatch {
      if (goal.domains.includes('github-actions') || goal.domains.includes('ci')) {
        return { capabilityId: CAPABILITY_ID, score: 0, reason: 'ci/github-actions domain takes priority' };
      }

      if (!goal.domains.includes('git')) {
        return { capabilityId: CAPABILITY_ID, score: 0, reason: 'domain not git' };
      }

      const isGitAction = GIT_ACTIONS.some(a => goal.domains.includes(a)) ||
        goal.domains.includes('git');

      if (!isGitAction) {
        return { capabilityId: CAPABILITY_ID, score: 0, reason: 'not a git action' };
      }

      let score = 0.7;
      if (goal.action !== 'unknown') {
        score += 0.1;
      }
      if (goal.target) {
        score += 0.05;
      }

      return {
        capabilityId: CAPABILITY_ID,
        score: Math.min(score, 1.0),
        reason: 'git domain with standard git operation',
      };
    },

    plan(goal: ParsedGoal, _context?: ProjectContext): ExecutionPlan {
      const steps: ExecutionPlanStep[] = [
        {
          id: 'status',
          label: '检查 Git 状态',
          type: 'command',
          command: { cli: 'git', args: ['status'] },
          internalOutput: true,
        },
      ];

      return {
        id: `git-wf-${Date.now()}`,
        label: 'Git 工作流',
        capabilityId: CAPABILITY_ID,
        goal,
        steps,
        userReport: {
          summaryTemplate: '当前已生成 Git 操作建议。',
          nextActions: ['确认变更内容', '执行 git commit/push'],
          verificationSteps: ['检查 git log 确认提交'],
        },
      };
    },
  };
}
