import type { AIModule, AIModuleContext, AIModuleResult, FixSuggestion } from '../types.js';
import type { DiagnosisInput, DiagnosisOutput } from './types.js';
import type { Detector } from '../../../sandbox/detector.js';

export interface DiagnosisLLMClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

interface DiagnosisDeps {
  llmClient?: DiagnosisLLMClient | null;
  detector?: Detector | null;
}

const SYSTEM_PROMPT = '你是一个CLI工作流引擎的错误诊断专家。请用中文分析以下错误并提供：1) 根本原因, 2) 类别 (dependency|configuration|permission|network|logic|environment), 3) 修复建议及风险级别, 4) 置信度 (0-1), 5) 是否需要人工审查。请用JSON格式回复: {rootCause, category, fixSuggestions: [{description, command?, risk}], confidence, needsHumanReview}';

function buildUserPrompt(input: DiagnosisInput): string {
  const parts: string[] = [];
  if (input.stepId) parts.push(`Step ID: ${input.stepId}`);
  if (input.stepConfig) parts.push(`Step Config: ${JSON.stringify(input.stepConfig)}`);
  parts.push(`Error: ${input.error}`);
  if (input.stderr) parts.push(`Stderr: ${input.stderr}`);
  if (input.context) parts.push(`Context: ${JSON.stringify(input.context)}`);
  return parts.join('\n');
}

export function createIntelligentDiagnosisModule(deps?: DiagnosisDeps) {
  const llmClient = deps?.llmClient ?? null;
  const detector = deps?.detector ?? null;

  const module: AIModule<DiagnosisInput, DiagnosisOutput> = {
    id: 'vectahub.intelligent-diagnosis',
    name: 'Intelligent Diagnosis',
    version: '1.0.0',
    type: 'ai-enhancement',

    async canHandle(_context: AIModuleContext): Promise<boolean> {
      return llmClient !== null;
    },

    async execute(input: DiagnosisInput, _context: AIModuleContext): Promise<AIModuleResult<DiagnosisOutput>> {
      if (!llmClient) {
        return { success: false, error: 'LLM unavailable' };
      }

      try {
        const userPrompt = buildUserPrompt(input);
        const responseText = await llmClient.complete(SYSTEM_PROMPT, userPrompt);

        let parsed: DiagnosisOutput;
        try {
          parsed = JSON.parse(responseText) as DiagnosisOutput;
        } catch {
          return { success: false, error: 'Invalid diagnosis response' };
        }

        if (detector) {
          parsed.fixSuggestions = parsed.fixSuggestions.map((suggestion: FixSuggestion) => {
            if (suggestion.command) {
              const detection = detector.detect(suggestion.command);
              if (detection.isDangerous) {
                return {
                  ...suggestion,
                  risk: 'high' as const,
                  description: `${suggestion.description} [DANGEROUS: ${detection.reason ?? 'dangerous command detected'}]`,
                };
              }
            }
            return suggestion;
          });
        }

        return { success: true, data: parsed, confidence: parsed.confidence };
      } catch {
        return { success: false, error: 'LLM unavailable' };
      }
    },

    async shutdown(): Promise<void> {},
  };

  return module;
}
