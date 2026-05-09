import type { Capability, CapabilityMatch, ExecutionPlan, ExecutionPlanStep } from './types.js';
import type { ParsedGoal, ProjectContext } from '../core/goal-types.js';

const CAPABILITY_ID = 'package-script';

export function createPackageScriptCapability(): Capability {
  return {
    id: CAPABILITY_ID,

    canHandle(goal: ParsedGoal, _context?: ProjectContext): CapabilityMatch {
      const hasNpmDomain = goal.domains.includes('npm') || goal.domains.includes('test');

      if (!hasNpmDomain) {
        return { capabilityId: CAPABILITY_ID, score: 0, reason: 'domain not npm or test' };
      }

      const isRunAction = goal.action === 'run';

      if (!isRunAction) {
        return { capabilityId: CAPABILITY_ID, score: 0.15, reason: 'action not run' };
      }

      let score = 0.7;
      if (goal.target === 'test') {
        score += 0.15;
      }
      if (goal.domains.includes('test')) {
        score += 0.1;
      }

      return {
        capabilityId: CAPABILITY_ID,
        score: Math.min(score, 1.0),
        reason: 'run action + npm/test domain',
      };
    },

    plan(goal: ParsedGoal, context?: ProjectContext): ExecutionPlan {
      const pkgManager = context?.packageManager || 'npm';
      const scriptName = goal.target === 'test' ? 'test' : goal.target || 'test';

      const steps: ExecutionPlanStep[] = [
        {
          id: 'run-script',
          label: `执行 ${scriptName} 脚本`,
          type: 'command',
          command: { cli: pkgManager, args: ['run', scriptName] },
          internalOutput: false,
        },
      ];

      return {
        id: `pkg-script-${Date.now()}`,
        label: `运行 ${scriptName}`,
        capabilityId: CAPABILITY_ID,
        goal,
        steps,
        userReport: {
          hideInternalStdout: false,
          summaryTemplate: `${scriptName} 已执行完成。`,
        },
      };
    },
  };
}
