import type { TaskContract } from '../types/task-contract.js';

export interface ResolvedTaskContractCommand {
  cli: string;
  args: string[];
  commandText: string;
}

function parseCommandText(commandSurfaceId: string | undefined): ResolvedTaskContractCommand | null {
  const normalized = commandSurfaceId?.trim();
  if (!normalized) {
    return null;
  }

  const [cli, ...args] = normalized.split(/\s+/);
  if (!cli) {
    return null;
  }

  return {
    cli,
    args,
    commandText: normalized,
  };
}

export function resolveTaskContractCommand(contract: TaskContract): ResolvedTaskContractCommand | null {
  if (contract.kind !== 'execute') {
    return null;
  }

  const resolved = parseCommandText(contract.executionStrategy.commandSurfaceId);
  if (!resolved) {
    return null;
  }

  return resolved;
}

export function canAutoExecuteTaskContract(contract: TaskContract): boolean {
  if (contract.kind !== 'execute') {
    return false;
  }

  if (contract.constraints.requiresConfirmation) {
    return false;
  }

  return contract.executionStrategy.mode === 'capability'
    || contract.executionStrategy.mode === 'direct-command';
}
