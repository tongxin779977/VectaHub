export type Priority = "P0" | "P1" | "P2" | "P3" | "P4";

export type TaskStatus =
  | "todo"
  | `in-progress:${string}`
  | "needs-fix"
  | "blocked"
  | "done";

export interface Evidence {
  level: "confirmed_source" | "contract_target" | "product_decision" | "standard_gate" | "automation_need";
  source: string;
  fact: string;
}

export interface Lock {
  owner: string;
  run_id: string;
  acquired_at: string;
  expires_at: string;
  previous_status: "todo" | "needs-fix";
}

export interface Completion {
  verified_at: string;
  commit: string;
  verification_results: string[];
  changed_files?: string[];
  notes?: string;
}

export interface ReviewFinding {
  severity: Priority;
  location: string;
  reason: string;
  required_fix?: string;
  resolved_at?: string;
  resolved_by?: string;
  resolved_by_commit?: string;
}

export interface ReviewFindings {
  reviewed_at: string;
  status: "needs-fix" | "resolved" | "resolved_by_reverification";
  findings: ReviewFinding[];
}

export interface BacklogItem {
  id: string;
  priority: Priority;
  status: TaskStatus;
  depends_on: string[];
  evidence: Evidence[];
  source_docs?: string[];
  goal: string;
  scope: string[];
  out_of_scope?: string[];
  required_contracts?: string[];
  verification: string[];
  done_criteria: string[];
  lock?: Lock;
  completion?: Completion;
  review_findings?: ReviewFindings;
  notes?: string;
  implementation_summary?: string;
  contract_review_findings?: any;
}

export interface Claim {
  task_id: string;
  run_id: string;
  owner: string;
  claimed_at: string;
  expires_at: string;
}

export interface TaskSelectionResult {
  selected?: string;
  reason: string;
  eligible: string[];
  locked: string[];
  dependencies_unmet: string[];
}

export interface StatusTransitionResult {
  valid: boolean;
  reason: string;
  previous_status?: TaskStatus;
  new_status?: TaskStatus;
}

export interface VerificationEvidence {
  task_id: string;
  run_id: string;
  timestamp: string;
  commands: {
    command: string;
    passed: boolean;
    output?: string;
  }[];
  changed_files: string[];
  git_status: string;
  commit?: string;
}

export interface DirtyFileCheckResult {
  clean: boolean;
  dirty_files: string[];
  allowed_files: string[];
  disallowed_files: string[];
}
