import type { AIModule, AIModuleContext, AIModuleResult } from '../types.js';
import type { SemanticMatchingConfig, SemanticMatchInput, SemanticMatchOutput } from './types.js';

interface SemanticLLMClient {
  embed(text: string): Promise<number[]>;
  provider?: string;
}

const DEFAULT_CONFIG: SemanticMatchingConfig = {
  alpha: 0.5,
  embeddingModel: 'text-embedding-3-small',
  cacheSize: 100,
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

function computeKeywordScore(userInput: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lowerInput = userInput.toLowerCase();
  let matchCount = 0;
  for (const keyword of keywords) {
    if (lowerInput.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }
  return matchCount / keywords.length;
}

export function createSemanticMatchingModule(
  llmClient?: SemanticLLMClient | null,
  configOverrides?: Partial<SemanticMatchingConfig>
): AIModule<SemanticMatchInput, SemanticMatchOutput> {
  const config: SemanticMatchingConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  const embeddingCache = new Map<string, number[]>();

  async function getEmbedding(text: string): Promise<number[] | null> {
    if (!llmClient) return null;
    try {
      const cached = embeddingCache.get(text);
      if (cached) return cached;
      const embedding = await llmClient.embed(text);
      if (embeddingCache.size < config.cacheSize) {
        embeddingCache.set(text, embedding);
      }
      return embedding;
    } catch {
      return null;
    }
  }

  return {
    id: 'vectahub.semantic-matching',
    name: 'Semantic Matching',
    version: '1.0.0',
    type: 'ai-enhancement',

    async canHandle(_context: AIModuleContext): Promise<boolean> {
      if (!llmClient) return false;
      if (llmClient.provider === 'anthropic') return false;
      return true;
    },

    async initialize(): Promise<void> {
      if (!llmClient) return;
    },

    async execute(
      input: SemanticMatchInput,
      _context: AIModuleContext
    ): Promise<AIModuleResult<SemanticMatchOutput>> {
      if (input.templateDescriptions.length === 0) {
        return { success: false, error: 'No template descriptions provided' };
      }

      const userEmbedding = await getEmbedding(input.userInput);

      let bestResult: SemanticMatchOutput | null = null;
      let bestCombinedScore = -1;

      for (const template of input.templateDescriptions) {
        const keywordScore = computeKeywordScore(input.userInput, template.keywords);

        let similarityScore = 0;
        if (userEmbedding) {
          const templateText = `${template.description} ${template.keywords.join(' ')}`;
          const templateEmbedding = await getEmbedding(templateText);
          if (templateEmbedding) {
            similarityScore = cosineSimilarity(userEmbedding, templateEmbedding);
          }
        }

        const combinedScore = config.alpha * keywordScore + (1 - config.alpha) * similarityScore;

        if (combinedScore > bestCombinedScore) {
          bestCombinedScore = combinedScore;
          bestResult = {
            intentName: template.name,
            similarityScore,
            keywordScore,
            combinedScore,
          };
        }
      }

      if (!bestResult) {
        return { success: false, error: 'No matching template found' };
      }

      return { success: true, data: bestResult, confidence: bestResult.combinedScore };
    },
  };
}
