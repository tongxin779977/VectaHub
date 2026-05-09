export type ProjectTaskKind =
  | 'git-status'
  | 'install'
  | 'test'
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'dev'
  | 'start'
  | 'serve'
  | 'preview'
  | 'watch'
  | 'format'
  | 'coverage'
  | 'storybook'
  | 'check'
  | 'validate'
  | 'list-scripts'
  | 'doctor'
  | 'intent-preview'
  | 'intent-run'
  | 'other';

export const LONG_RUNNING_KINDS: readonly ProjectTaskKind[] = [
  'dev', 'start', 'serve', 'preview', 'watch'
] as const;

export function isLongRunning(kind: ProjectTaskKind): boolean {
  return (LONG_RUNNING_KINDS as readonly string[]).includes(kind);
}

export interface ProjectTask {
  id: string;
  kind: ProjectTaskKind;
  label: string;
  description?: string;
  source: 'git' | 'package-json' | 'vectahub' | 'manual';
  available: boolean;
  command?: {
    cli: string;
    args: string[];
  };
  reasonUnavailable?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}
