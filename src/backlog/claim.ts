import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Claim } from "../types/index.js";

export function getClaimDir(): string {
  const gitPath = execSync("git rev-parse --git-path vectahub-backlog-claims", {
    encoding: "utf8",
  }).trim();
  return gitPath;
}

export function getClaimPath(taskId: string): string {
  return path.join(getClaimDir(), taskId);
}

export function ensureClaimDirExists(): void {
  const claimDir = getClaimDir();
  if (!fs.existsSync(claimDir)) {
    fs.mkdirSync(claimDir, { recursive: true });
  }
}

export function createAtomicClaim(
  taskId: string,
  runId: string,
  owner: string
): Claim | null {
  ensureClaimDirExists();
  const claimPath = getClaimPath(taskId);
  
  try {
    fs.mkdirSync(claimPath);
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    
    const claim: Claim = {
      task_id: taskId,
      run_id: runId,
      owner: owner,
      claimed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    
    fs.writeFileSync(path.join(claimPath, "claim.json"), JSON.stringify(claim, null, 2), "utf8");
    
    return claim;
  } catch (e: any) {
    if (e.code === "EEXIST") {
      console.warn(`Claim already exists for task ${taskId}`);
      return null;
    }
    throw e;
  }
}

export function getClaim(taskId: string): Claim | null {
  const claimPath = getClaimPath(taskId);
  const claimFile = path.join(claimPath, "claim.json");
  
  if (!fs.existsSync(claimFile)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(claimFile, "utf8");
    return JSON.parse(content) as Claim;
  } catch {
    return null;
  }
}

export function isClaimExpired(claim: Claim): boolean {
  const now = new Date();
  const expires = new Date(claim.expires_at);
  return now > expires;
}

export function deleteClaim(taskId: string, expectedRunId: string): boolean {
  const claim = getClaim(taskId);
  if (!claim) {
    return false;
  }
  
  if (claim.run_id !== expectedRunId) {
    console.warn(`Cannot delete claim: run_id mismatch. Expected ${expectedRunId}, got ${claim.run_id}`);
    return false;
  }
  
  const claimPath = getClaimPath(taskId);
  try {
    fs.rmSync(claimPath, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.warn(`Failed to delete claim for ${taskId}:`, e);
    return false;
  }
}

export function cleanupStaleClaims(): string[] {
  const claimDir = getClaimDir();
  if (!fs.existsSync(claimDir)) {
    return [];
  }
  
  const cleaned: string[] = [];
  const taskIds = fs.readdirSync(claimDir);
  
  for (const taskId of taskIds) {
    const claim = getClaim(taskId);
    if (claim && isClaimExpired(claim)) {
      try {
        const claimPath = getClaimPath(taskId);
        fs.rmSync(claimPath, { recursive: true, force: true });
        cleaned.push(taskId);
        console.log(`Cleaned up stale claim for ${taskId}`);
      } catch (e) {
        console.warn(`Failed to clean up claim for ${taskId}:`, e);
      }
    }
  }
  
  return cleaned;
}

export function hasActiveClaim(taskId: string): boolean {
  const claim = getClaim(taskId);
  if (!claim) {
    return false;
  }
  return !isClaimExpired(claim);
}
