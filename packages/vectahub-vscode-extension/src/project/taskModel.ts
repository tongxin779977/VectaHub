export type ProjectTaskKind =
  | 'git-status'
  | 'install'
  | 'test'
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'list-scripts'
  | 'doctor'
  | 'intent-preview'
  | 'intent-run';

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
