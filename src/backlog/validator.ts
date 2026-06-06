import { TaskStatus, StatusTransitionResult, BacklogItem } from "../types/index.js";

function isTaskStatusInProgress(status: TaskStatus): boolean {
  return status.startsWith("in-progress:");
}

export function validateStatusTransition(
  previous_status: TaskStatus,
  new_status: TaskStatus,
  hasLock?: boolean
): StatusTransitionResult {
  const validTransitions: Record<string, string[]> = {
    todo: ["in-progress:", "blocked"],
    "needs-fix": ["in-progress:", "blocked"],
    blocked: ["todo", "needs-fix"],
    done: ["needs-fix"],
  };

  if (isTaskStatusInProgress(previous_status)) {
    if (!hasLock) {
      return { valid: false, reason: "in-progress tasks must have an active lock", previous_status, new_status };
    }
    const validTarget: string[] = ["done", "needs-fix", "blocked"];
    const newStatusBase = new_status.startsWith("in-progress:") ? "in-progress:" : new_status;
    if (validTarget.includes(newStatusBase)) {
      return { valid: true, reason: "Valid transition from in-progress", previous_status, new_status };
    }
    return { valid: false, reason: `Invalid transition from ${previous_status} to ${new_status}`, previous_status, new_status };
  }

  const previousBase = previous_status.startsWith("in-progress:") ? "in-progress:" : previous_status;

  const allowed = validTransitions[previousBase] || [];
  for (const allowedPrefix of allowed) {
    if (new_status.startsWith(allowedPrefix)) {
      if (new_status.startsWith("in-progress:") && !hasLock) {
        return { valid: false, reason: "in-progress status requires a lock", previous_status, new_status };
      }
      return { valid: true, reason: `Valid transition from ${previous_status} to ${new_status}`, previous_status, new_status };
    }
  }

  return { valid: false, reason: `Invalid transition from ${previous_status} to ${new_status}`, previous_status, new_status };
}

export function validateTaskConsistency(item: BacklogItem): StatusTransitionResult {
  if (isTaskStatusInProgress(item.status) && !item.lock) {
    return { valid: false, reason: "in-progress task missing lock", previous_status: item.status };
  }

  if (item.lock && !isTaskStatusInProgress(item.status)) {
    return { valid: false, reason: "lock present on non-in-progress task", previous_status: item.status };
  }

  if (item.status === "done" && !item.completion) {
    return { valid: false, reason: "done task missing completion evidence", previous_status: item.status };
  }

  return { valid: true, reason: "Task consistency validated", previous_status: item.status };
}
