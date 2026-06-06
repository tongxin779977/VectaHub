export type GoalAction =
  | 'repair' | 'analyze' | 'run' | 'create' | 'delete'
  | 'search' | 'explain' | 'unknown'
  | 'modify' | 'debug' | 'test' | 'deploy' | 'document'
  | 'failure' | 'build' | 'git';

export type GoalScope =
  | 'all' | 'selected' | 'current' | 'latest' | 'unknown'
  | 'project' | 'service' | 'module' | 'function' | 'test'
  | 'deployment' | 'dependency' | 'config'
  | 'ui' | 'database' | 'security';

export interface NormalizedInput {
  rawText: string;
  cleanText: string;
  tokens: string[];
  normalizedTerms: string[];
  entities: {
    githubActionRunIds?: string[];
    githubActionUrls?: string[];
    filePaths?: string[];
    commitShas?: string[];
    packageScripts?: string[];
  };
}

export interface ParsedGoal {
  action: GoalAction;
  domains: string[];
  target?: string;
  scope: GoalScope;
  successCriteria: string[];
  constraints: string[];
  evidence: NormalizedInput['entities'];
  confidence: number;
  needsClarification: boolean;
  negationDetected?: boolean;
}

export interface ProjectContext {
  cwd?: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  packageScripts?: string[];
  gitRemote?: string;
  ciProvider?: 'github-actions' | 'unknown';
  rawInput?: string;
}

export const CAPABILITY_AUTO_ROUTE_THRESHOLD = 0.7;
export const CAPABILITY_CLARIFICATION_DELTA = 0.08;
export const CAPABILITY_PREVIEW_LOW = 0.5;
