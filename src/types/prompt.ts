export type PromptCategory = 'parsing' | 'workflow' | 'assistant' | 'refinement' | 'generation';

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface PromptExample {
  input: Record<string, unknown>;
  output: unknown;
  explanation?: string;
}

export interface PromptConstraint {
  type: 'format' | 'content' | 'length' | 'schema';
  rule: string | Record<string, unknown>;
  validator?: (value: unknown) => boolean | Promise<boolean>;
}

export interface PromptMetadata {
  author: string;
  createdAt: Date;
  lastUpdated: Date;
  effectiveness: number;
  uses: number;
  successRate?: number;
}

export interface Prompt {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PromptCategory | string;
  tags: string[];
  systemTemplate: string;
  userTemplate: string;
  variables: PromptVariable[];
  examples?: PromptExample[];
  constraints?: PromptConstraint[];
  metadata: PromptMetadata;
}

export interface PromptBuildResult {
  system: string;
  user: string;
}

export interface EvaluationResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  details: {
    example: PromptExample;
    success: boolean;
    output?: unknown;
    error?: string;
  }[];
}

export interface PromptRegistry {
  register(prompt: Prompt): void;
  get(id: string): Prompt | undefined;
  list(category?: string): Prompt[];
  build(promptId: string, variables: Record<string, unknown>): Promise<PromptBuildResult>;
  evaluate?(promptId: string, testCases: PromptExample[]): Promise<EvaluationResult>;
}

export interface PromptRepository {
  get(id: string): Prompt | undefined;
  list(category?: string): Prompt[];
  add(prompt: Prompt): void;
  update(prompt: Prompt): void;
}

export function renderPromptTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  });
}

export function validatePromptVariables(prompt: Prompt, variables: Record<string, unknown>): void {
  for (const variable of prompt.variables) {
    if (variable.required && !(variable.name in variables)) {
      throw new Error(`Required variable ${variable.name} not provided`);
    }
  }
}
