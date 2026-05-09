import type { ParsedGoal, ProjectContext } from '../core/goal-types.js';
import {
  CAPABILITY_AUTO_ROUTE_THRESHOLD,
  CAPABILITY_CLARIFICATION_DELTA,
  CAPABILITY_PREVIEW_LOW,
} from '../core/goal-types.js';
import type { Capability, CapabilityMatch, CapabilityRouter, RouterResult } from './types.js';
import { createGitHubActionsRepairCapability } from './github-actions-repair.js';
import { createGitWorkflowCapability } from './git-workflow.js';
import { createPackageScriptCapability } from './package-script.js';

function rankMatches(matches: CapabilityMatch[]): CapabilityMatch[] {
  return [...matches].sort((a, b) => b.score - a.score);
}

export function createCapabilityRouter(customCapabilities?: Capability[]): CapabilityRouter {
  const capabilities: Capability[] = customCapabilities || [
    createGitHubActionsRepairCapability(),
    createGitWorkflowCapability(),
    createPackageScriptCapability(),
  ];

  return {
    route(goal: ParsedGoal, context?: ProjectContext): RouterResult {
      if (goal.needsClarification) {
        return {
          plan: null,
          route: 'fallback',
          reason: 'goal needs clarification',
        };
      }

      const matches: CapabilityMatch[] = [];
      for (const cap of capabilities) {
        const match = cap.canHandle(goal, context);
        if (match.score > 0) {
          matches.push(match);
        }
      }

      if (matches.length === 0) {
        return {
          plan: null,
          route: 'fallback',
          reason: 'no capability matched',
        };
      }

      const ranked = rankMatches(matches);
      const top = ranked[0];
      const second = ranked[1];
      const delta = second ? top.score - second.score : 1.0;

      if (delta < CAPABILITY_CLARIFICATION_DELTA) {
        return {
          plan: null,
          route: 'clarify',
          matchedCapability: top.capabilityId,
          score: top.score,
          reason: `top two capabilities too close: ${top.capabilityId}(${top.score.toFixed(2)}) vs ${second!.capabilityId}(${second!.score.toFixed(2)})`,
        };
      }

      if (top.score >= CAPABILITY_AUTO_ROUTE_THRESHOLD) {
        const cap = capabilities.find(c => c.id === top.capabilityId)!;
        const plan = cap.plan(goal, context);
        return {
          plan,
          route: 'auto',
          matchedCapability: top.capabilityId,
          score: top.score,
          reason: top.reason,
        };
      }

      if (top.score >= CAPABILITY_PREVIEW_LOW) {
        const cap = capabilities.find(c => c.id === top.capabilityId)!;
        const plan = cap.plan(goal, context);
        return {
          plan,
          route: 'preview',
          matchedCapability: top.capabilityId,
          score: top.score,
          reason: `${top.reason} (preview only, score below auto threshold)`,
        };
      }

      return {
        plan: null,
        route: 'fallback',
        matchedCapability: top.capabilityId,
        score: top.score,
        reason: `${top.reason} (score below preview threshold)`,
      };
    },
  };
}
