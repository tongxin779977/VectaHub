import type { Capability, CapabilityMatch, ExecutionPlan, ExecutionPlanStep } from './types.js';
import type { ParsedGoal, ProjectContext } from '../core/goal-types.js';

const CAPABILITY_ID = 'github-actions-repair';

function hasCiDomain(goal: ParsedGoal): boolean {
  return goal.domains.includes('github-actions') || goal.domains.includes('ci');
}

export function createGitHubActionsRepairCapability(): Capability {
  return {
    id: CAPABILITY_ID,

    canHandle(goal: ParsedGoal, _context?: ProjectContext): CapabilityMatch {
      if (goal.action !== 'repair' && goal.action !== 'analyze') {
        return { capabilityId: CAPABILITY_ID, score: 0, reason: 'action not repair/analyze' };
      }

      if (!hasCiDomain(goal)) {
        return { capabilityId: CAPABILITY_ID, score: 0, reason: 'domain not github-actions or ci' };
      }

      const isFailure = goal.target === 'failure';
      const hasFailureEvidence = !!(goal.evidence.githubActionRunIds?.length || goal.evidence.githubActionUrls?.length);
      const hasCiGreenIntent = goal.successCriteria?.includes('ci-green');

      if (!isFailure && !hasFailureEvidence && !hasCiGreenIntent) {
        return { capabilityId: CAPABILITY_ID, score: 0.2, reason: 'no failure target or evidence' };
      }

      let score = 0.75;
      if (goal.domains.includes('github-actions')) {
        score += 0.15;
      }
      if (goal.scope === 'all') {
        score += 0.05;
      }
      if (hasFailureEvidence) {
        score += 0.05;
      }
      if (hasCiGreenIntent) {
        score += 0.05;
      }

      return {
        capabilityId: CAPABILITY_ID,
        score: Math.min(score, 1.0),
        reason: 'repair action + ci/github-actions domain + failure target',
      };
    },

    plan(goal: ParsedGoal, _context?: ProjectContext): ExecutionPlan {
      const steps: ExecutionPlanStep[] = [
        {
          id: 'discover-run-id',
          label: '发现最新失败的 GitHub Actions Run ID',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'list', '--status', 'failure', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId'] },
          outputVar: 'runId',
          internalOutput: true,
        },
        {
          id: 'fetch-logs',
          label: '获取失败日志',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'view', '${runId}', '--log-failed'] },
          outputVar: 'failedLogs',
          internalOutput: true,
        },
        {
          id: 'diagnose',
          label: '收集失败 Run 诊断信息',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'view', '${runId}', '--json', 'name,headBranch,headSha,event,status,conclusion,createdAt,updatedAt,url'] },
          outputVar: 'diagnosis',
          internalOutput: true,
        },
        {
          id: 'repair',
          label: '重试失败作业',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'rerun', '${runId}', '--failed'] },
          outputVar: 'repairResult',
          internalOutput: true,
        },
        {
          id: 'verify',
          label: '验证重试结果',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'watch', '${runId}', '--exit-status'] },
          outputVar: 'verifyResult',
          internalOutput: true,
        },
        {
          id: 'report',
          label: '输出修复报告',
          type: 'command',
          command: { cli: 'gh', args: ['run', 'view', '${runId}', '--json', 'databaseId,name,status,conclusion,url,updatedAt'] },
          outputVar: 'repairReport',
          internalOutput: false,
        },
      ];

      return {
        id: `gh-repair-${Date.now()}`,
        label: '修复 GitHub Actions 失败项',
        capabilityId: CAPABILITY_ID,
        goal,
        steps,
        userReport: {
          summaryTemplate: '已完成 GitHub Actions 失败项的发现和诊断。',
          nextActions: ['如有必要，请根据日志进行手动修复', '重新运行失败的 Job'],
          verificationSteps: ['确认 GitHub Actions 状态变绿'],
        },
      };
    },
  };
}
