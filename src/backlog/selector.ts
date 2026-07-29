import { BacklogItem, TaskSelectionResult } from "../types/index.js";
import {
  getAllBacklogItems,
  isTaskInProgress,
  hasUnresolvedReviewFindings,
  areDependenciesMet,
  getPriorityOrder,
  isLockExpired,
} from "./parser.js";
import { hasActiveClaim, cleanupStaleClaims } from "./claim.js";

export interface TaskSelectorOptions {
  itemsDir: string;
  checkClaims?: boolean;
  claimDir?: string;
  logger?: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

export function selectNextTask(options: TaskSelectorOptions): TaskSelectionResult {
  const log = options.logger ?? console;
  const allItems = getAllBacklogItems(options.itemsDir, options.logger);
  const result: TaskSelectionResult = {
    reason: "",
    eligible: [],
    locked: [],
    dependencies_unmet: [],
  };

  cleanupStaleClaims(options.logger);

  const reviewFixTasks: BacklogItem[] = [];
  const needsFixTasks: BacklogItem[] = [];
  const todoTasks: BacklogItem[] = [];

  for (const [id, item] of allItems) {
    let taskLocked = false;

    if (isTaskInProgress(item) && item.lock) {
      if (isLockExpired(item.lock)) {
        log.warn(`Task ${id} has an expired lock, will be considered stale`);
      } else {
        taskLocked = true;
      }
    }
    
    if (hasActiveClaim(id)) {
      taskLocked = true;
    }
    
    if (taskLocked) {
      result.locked.push(id);
      continue;
    }

    if (!areDependenciesMet(item, allItems)) {
      result.dependencies_unmet.push(id);
      continue;
    }

    if (hasUnresolvedReviewFindings(item)) {
      reviewFixTasks.push(item);
      result.eligible.push(id);
    } else if (item.status === "needs-fix") {
      needsFixTasks.push(item);
      result.eligible.push(id);
    } else if (item.status === "todo") {
      todoTasks.push(item);
      result.eligible.push(id);
    }
  }

  const sortByPriority = (a: BacklogItem, b: BacklogItem) => {
    const orderA = getPriorityOrder(a.priority);
    const orderB = getPriorityOrder(b.priority);
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  };

  reviewFixTasks.sort(sortByPriority);
  needsFixTasks.sort(sortByPriority);
  todoTasks.sort(sortByPriority);

  if (reviewFixTasks.length > 0) {
    result.selected = reviewFixTasks[0].id;
    result.reason = "Selected review-fix task with unresolved findings";
  } else if (needsFixTasks.length > 0) {
    result.selected = needsFixTasks[0].id;
    result.reason = "Selected needs-fix task";
  } else if (todoTasks.length > 0) {
    result.selected = todoTasks[0].id;
    result.reason = "Selected todo task";
  } else {
    result.reason = "No eligible tasks found";
  }

  return result;
}

export function dryRunSelection(itemsDir: string): TaskSelectionResult {
  return selectNextTask({ itemsDir, checkClaims: false });
}
