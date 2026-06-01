import { BacklogItem } from "../types/index.js";
import {
  parseBacklogItem,
  writeBacklogItem,
  getItemFilePath,
  getTimestamp,
} from "./parser.js";
import { createAtomicClaim, deleteClaim } from "./claim.js";

export interface RunnerOptions {
  itemsDir: string;
  runId: string;
  owner: string;
}

export function startTask(
  taskId: string,
  itemsDir: string,
  runId: string,
  owner: string
): BacklogItem | null {
  const filePath = getItemFilePath(itemsDir, taskId);
  const item = parseBacklogItem(filePath);
  
  const claim = createAtomicClaim(taskId, runId, owner);
  if (!claim) {
    console.error(`Failed to create atomic claim for task ${taskId}`);
    return null;
  }
  
  const previousStatus = item.status;
  const timestamp = getTimestamp();
  item.status = `in-progress:${timestamp}`;
  
  item.lock = {
    owner: owner,
    run_id: runId,
    acquired_at: getTimestamp(),
    expires_at: getTimestamp(),
    previous_status: previousStatus as "todo" | "needs-fix",
  };
  
  writeBacklogItem(filePath, item);
  console.log(`Started task ${taskId} (status: ${item.status})`);
  
  return item;
}

export function completeTask(
  taskId: string,
  itemsDir: string,
  runId: string,
  verificationResults: string[],
  changedFiles: string[],
  commit: string
): BacklogItem | null {
  const filePath = getItemFilePath(itemsDir, taskId);
  const item = parseBacklogItem(filePath);
  
  if (!item.lock || item.lock.run_id !== runId) {
    console.error(`Cannot complete task ${taskId}: invalid lock or run_id mismatch`);
    return null;
  }
  
  item.status = "done";
  item.completion = {
    verified_at: getTimestamp(),
    commit: commit,
    verification_results: verificationResults,
    changed_files: changedFiles,
  };
  
  delete item.lock;
  
  writeBacklogItem(filePath, item);
  deleteClaim(taskId, runId);
  
  console.log(`Completed task ${taskId} (status: done)`);
  return item;
}

export function failTask(
  taskId: string,
  itemsDir: string,
  runId: string,
  notes?: string,
  isBlocked: boolean = false
): BacklogItem | null {
  const filePath = getItemFilePath(itemsDir, taskId);
  const item = parseBacklogItem(filePath);
  
  if (!item.lock || item.lock.run_id !== runId) {
    console.error(`Cannot fail task ${taskId}: invalid lock or run_id mismatch`);
    return null;
  }
  
  if (isBlocked) {
    item.status = "blocked";
  } else {
    item.status = "needs-fix";
  }
  
  if (notes) {
    item.notes = notes;
  }
  
  delete item.lock;
  
  writeBacklogItem(filePath, item);
  deleteClaim(taskId, runId);
  
  console.log(`Failed task ${taskId} (status: ${item.status})`);
  return item;
}

export function releaseLock(
  taskId: string,
  itemsDir: string,
  runId: string
): BacklogItem | null {
  const filePath = getItemFilePath(itemsDir, taskId);
  const item = parseBacklogItem(filePath);
  
  if (!item.lock || item.lock.run_id !== runId) {
    console.error(`Cannot release lock for task ${taskId}: invalid lock or run_id mismatch`);
    return null;
  }
  
  const previousStatus = item.lock.previous_status;
  item.status = previousStatus;
  
  delete item.lock;
  
  writeBacklogItem(filePath, item);
  deleteClaim(taskId, runId);
  
  console.log(`Released lock for task ${taskId} (status: ${item.status})`);
  return item;
}
