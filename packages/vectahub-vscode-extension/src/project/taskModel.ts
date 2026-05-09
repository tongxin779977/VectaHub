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
