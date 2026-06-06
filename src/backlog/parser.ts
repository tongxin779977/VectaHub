import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { BacklogItem, Lock } from "../types/index.js";

export function parseBacklogItem(filePath: string): BacklogItem {
  const content = fs.readFileSync(filePath, "utf8");
  const yamlMatch = content.match(/```yaml([\s\S]*?)```/);
  if (!yamlMatch) {
    throw new Error(`No YAML block found in ${filePath}`);
  }
  const yamlContent = yamlMatch[1];
  return yaml.parse(yamlContent) as BacklogItem;
}

export function writeBacklogItem(filePath: string, item: BacklogItem) {
  let content = fs.readFileSync(filePath, "utf8");
  const yamlMatch = content.match(/```yaml([\s\S]*?)```/);
  if (!yamlMatch) {
    throw new Error(`No YAML block found in ${filePath}`);
  }
  const yamlContent = yaml.stringify(item);
  content = content.replace(/```yaml[\s\S]*?```/, `\`\`\`yaml\n${yamlContent.trim()}\n\`\`\``);
  fs.writeFileSync(filePath, content, "utf8");
}

export function getAllBacklogItems(itemsDir: string): Map<string, BacklogItem> {
  const items = new Map<string, BacklogItem>();
  const files = fs.readdirSync(itemsDir);
  for (const file of files) {
    if (file.endsWith(".md")) {
      const filePath = path.join(itemsDir, file);
      try {
        const item = parseBacklogItem(filePath);
        items.set(item.id, item);
      } catch (e) {
        console.warn(`Failed to parse ${file}:`, e);
      }
    }
  }
  return items;
}

export function isTaskDone(item: BacklogItem): boolean {
  return item.status === "done";
}

export function isTaskInProgress(item: BacklogItem): boolean;
export function isTaskInProgress(status: string): boolean;
export function isTaskInProgress(arg: BacklogItem | string): boolean {
  if (typeof arg === "string") {
    return arg.startsWith("in-progress:");
  }
  return arg.status.startsWith("in-progress:");
}

export function isTaskLocked(item: BacklogItem): boolean {
  return isTaskInProgress(item) && !!item.lock;
}

export function hasUnresolvedReviewFindings(item: BacklogItem): boolean {
  return !!item.review_findings && item.review_findings.status === "needs-fix";
}

export function areDependenciesMet(item: BacklogItem, allItems: Map<string, BacklogItem>): boolean {
  for (const depId of item.depends_on) {
    const dep = allItems.get(depId);
    if (!dep || !isTaskDone(dep)) {
      return false;
    }
  }
  return true;
}

export function getPriorityOrder(priority: string): number {
  const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  return order[priority] ?? 999;
}

export function getTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function getISO8601Timestamp(): string {
  return new Date().toISOString();
}

export function isLockExpired(lock: Lock): boolean {
  const now = new Date();
  const expires = new Date(lock.expires_at);
  return now > expires;
}

export function getItemFilePath(itemsDir: string, taskId: string): string {
  return path.join(itemsDir, `${taskId}.md`);
}
