import * as fs from "fs";
import { execSync } from "child_process";
import { VerificationEvidence, DirtyFileCheckResult } from "../types/index.js";

export function runVerificationCommands(commands: string[]): VerificationEvidence["commands"] {
  const results: VerificationEvidence["commands"] = [];
  for (const cmd of commands) {
    try {
      const output = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      results.push({
        command: cmd,
        passed: true,
        output: output.substring(0, 2000),
      });
    } catch (e: any) {
      results.push({
        command: cmd,
        passed: false,
        output: e.stdout?.substring(0, 2000) || e.stderr?.substring(0, 2000) || e.message,
      });
    }
  }
  return results;
}

export function generateVerificationEvidence(
  taskId: string,
  runId: string,
  commands: string[],
  changedFiles: string[]
): VerificationEvidence {
  const gitStatus = execSync("git status --short", { encoding: "utf8" });
  return {
    task_id: taskId,
    run_id: runId,
    timestamp: new Date().toISOString(),
    commands: runVerificationCommands(commands),
    changed_files: changedFiles,
    git_status: gitStatus,
  };
}

export function checkDirtyFiles(
  allowedPatterns: string[],
  cwd: string = process.cwd()
): DirtyFileCheckResult {
  const gitStatus = execSync("git status --short", { encoding: "utf8", cwd });
  const dirtyFiles = gitStatus
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.trim().split(" ").slice(1).join(" "));

  const allowedFiles: string[] = [];
  const disallowedFiles: string[] = [];

  for (const file of dirtyFiles) {
    let allowed = false;
    for (const pattern of allowedPatterns) {
      if (file.includes(pattern) || file.match(new RegExp(pattern))) {
        allowed = true;
        break;
      }
    }
    if (allowed) {
      allowedFiles.push(file);
    } else {
      disallowedFiles.push(file);
    }
  }

  return {
    clean: disallowedFiles.length === 0,
    dirty_files: dirtyFiles,
    allowed_files: allowedFiles,
    disallowed_files: disallowedFiles,
  };
}

export function formatVerificationReport(evidence: VerificationEvidence): string {
  const lines: string[] = [];
  lines.push(`# Verification Report - ${evidence.task_id}`);
  lines.push(`Run ID: ${evidence.run_id}`);
  lines.push(`Timestamp: ${evidence.timestamp}`);
  lines.push("");
  lines.push("## Commands:");
  for (const cmd of evidence.commands) {
    const status = cmd.passed ? "✅ PASS" : "❌ FAIL";
    lines.push(`- ${status}: ${cmd.command}`);
    if (cmd.output && !cmd.passed) {
      lines.push("  Output:");
      lines.push("  ```");
      lines.push(cmd.output);
      lines.push("  ```");
    }
  }
  lines.push("");
  lines.push("## Changed Files:");
  for (const file of evidence.changed_files) {
    lines.push(`- ${file}`);
  }
  lines.push("");
  lines.push("## Git Status:");
  lines.push("```");
  lines.push(evidence.git_status);
  lines.push("```");
  return lines.join("\n");
}

export function saveVerificationReport(evidence: VerificationEvidence, outputPath: string) {
  fs.writeFileSync(outputPath, formatVerificationReport(evidence), "utf8");
  fs.writeFileSync(outputPath.replace(".md", ".json"), JSON.stringify(evidence, null, 2), "utf8");
}
