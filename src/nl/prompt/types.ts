
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

export interface Prompt {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];

  systemTemplate: string;
  userTemplate: string;

  variables: PromptVariable[];

  examples: PromptExample[];

  constraints: PromptConstraint[];

  metadata: {
    author: string;
    createdAt: Date;
    lastUpdated: Date;
    effectiveness: number;
    uses: number;
    successRate: number;
  };
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
  build(promptId: string, variables: Record<string, unknown>): Promise<{ system: string; user: string }>;
  evaluate(promptId: string, testCases: PromptExample[]): Promise<EvaluationResult>;
}
