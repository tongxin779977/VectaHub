import { getSecurityGuard, assessCommandRisk } from '../security-protocol/index.js';
import type { SecurityContext, CommandIntention } from '../types/security.js';
import {
  RunTaskRiskAssessment,
  limitText,
  MAX_VERIFICATION_COMMANDS
} from './run-task-shared.js';

export async function detectValidationPreflightRisk(
  validationCommands: string[],
  context: SecurityContext
): Promise<RunTaskRiskAssessment | null> {
  const guard = getSecurityGuard();
  const commandsToCheck = validationCommands.slice(0, MAX_VERIFICATION_COMMANDS);
  for (const cmd of commandsToCheck) {
    const intention: CommandIntention = { rawCommand: cmd };
    const decision = await guard.assess(intention, context);

    if (decision.decision === 'BLOCKED' || decision.decision === 'REQUIRES_CONFIRMATION') {
      return {
        level: decision.riskLevel,
        ruleName: decision.ruleName,
        needsConfirmation: true,
        enforcement: 'confirm_required',
        phase: 'verification',
        confirmationSource: 'preflight',
        blockedCommand: limitText(cmd),
      };
    }
    const risk = await assessCommandRisk(cmd);
    if (risk.needsConfirmation || risk.level === 'critical' || risk.level === 'high') {
      return {
        level: risk.level,
        ruleName: risk.ruleName,
        needsConfirmation: true,
        enforcement: 'confirm_required',
        phase: 'verification',
        confirmationSource: 'preflight',
        blockedCommand: limitText(cmd),
      };
    }
  }
  return null;
}

export function normalizeContractPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export function detectPostExecutionConfirmation(input: {
  gitChanges?: { changedFiles?: string[] };
  allowedFiles: string[];
  forbiddenFiles: string[];
  relatedFiles: string[];
}): { level: 'forbidden' | 'related' | 'out_of_scope'; reason: string; matchedFiles: string[] } | null {
  const changedFiles = input.gitChanges?.changedFiles ?? [];
  if (!changedFiles.length) {
    return null;
  }

  const normalizedChanged = changedFiles.map(normalizeContractPath);
  const allowed = new Set(input.allowedFiles.map(normalizeContractPath).filter(Boolean));
  const forbidden = new Set(input.forbiddenFiles.map(normalizeContractPath).filter(Boolean));
  const related = new Set(input.relatedFiles.map(normalizeContractPath).filter(Boolean));
  const isForbiddenMatch = (file: string): boolean => {
    if (forbidden.has(file)) return true;
    for (const pattern of forbidden) {
      if (!pattern.includes('*')) continue;
      if (pattern.startsWith('**/')) {
        const suffix = pattern.slice(3);
        if (suffix.endsWith('/**')) {
          const dir = suffix.slice(0, -3);
          if (dir && file.includes(`/${dir}/`)) return true;
          if (dir && file.startsWith(`${dir}/`)) return true;
          continue;
        }
        if (suffix.startsWith('*.')) {
          const ext = suffix.slice(1);
          if (ext && file.endsWith(ext)) return true;
          continue;
        }
      }
      if (pattern === '.env.*' && file.startsWith('.env.')) {
        return true;
      }
    }
    return false;
  };

  const forbiddenMatches = normalizedChanged.filter((file: string) => isForbiddenMatch(file));
  if (forbiddenMatches.length > 0) {
    return {
      level: 'forbidden',
      reason: 'forbidden_files_modified',
      matchedFiles: forbiddenMatches,
    };
  }

  if (related.size > 0) {
    const relatedMatches = normalizedChanged.filter((file: string) => related.has(file));
    if (relatedMatches.length > 0) {
      return {
        level: 'related',
        reason: 'related_file_changes',
        matchedFiles: relatedMatches,
      };
    }
  }

  if (allowed.size > 0) {
    const outOfScope = normalizedChanged.filter((file: string) => !allowed.has(file));
    if (outOfScope.length > 0) {
      return {
        level: 'out_of_scope',
        reason: 'out_of_scope_changes',
        matchedFiles: outOfScope,
      };
    }
  }

  return null;
}
