export interface SemanticMatchingConfig {
  alpha: number;
  embeddingModel: string;
  cacheSize: number;
}

export interface SemanticMatchInput {
  userInput: string;
  templateDescriptions: Array<{ name: string; description: string; keywords: string[] }>;
}

export interface SemanticMatchOutput {
  intentName: string;
  similarityScore: number;
  keywordScore: number;
  combinedScore: number;
}
