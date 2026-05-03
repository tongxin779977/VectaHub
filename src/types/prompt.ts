export interface Prompt {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'parsing' | 'workflow' | 'assistant' | 'refinement';
  tags: string[];
  system: string;
  userTemplate: string;
  examples: PromptExample[];
  constraints: PromptConstraint[];
  metadata: PromptMetadata;
}

export interface PromptExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface PromptConstraint {
  type: 'format' | 'content' | 'length' | 'tone';
  rule: string;
}

export interface PromptMetadata {
  author: string;
  createdAt: Date;
  lastUpdated: Date;
  effectiveness: number;
  uses: number;
}

export interface PromptRepository {
  get(id: string): Prompt | undefined;
  list(category?: Prompt['category']): Prompt[];
  add(prompt: Prompt): void;
  update(prompt: Prompt): void;
}
