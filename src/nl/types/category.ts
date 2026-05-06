export enum IntentCategory {
  QUERY = 'query',
  EXECUTE = 'execute',
  DIALOG = 'dialog',
  GENERATE = 'generate',
}

export interface IntentMetadata {
  category: IntentCategory;
  requiresWorkflow: boolean;
  requiresLLM: boolean;
}