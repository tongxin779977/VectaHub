import type {
  Prompt,
  PromptRepository,
} from './prompt/types.js';
import { BUILTIN_PROMPTS } from './prompt/v3.js';
import { SessionManager } from './session-manager.js';

export class PromptManager implements PromptRepository {
  private prompts: Map<string, Prompt>;
  public sessionManager: SessionManager;

  constructor() {
    this.prompts = new Map();
    this.sessionManager = new SessionManager();
    for (const prompt of BUILTIN_PROMPTS) {
      this.prompts.set(prompt.id, {
        ...prompt,
        metadata: { ...prompt.metadata },
        variables: prompt.variables.map(v => ({ ...v })),
      });
    }
  }

  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  list(category?: Prompt['category']): Prompt[] {
    const all = Array.from(this.prompts.values());
    if (!category) {
      return all;
    }
    return all.filter(p => p.category === category);
  }

  add(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  update(prompt: Prompt): void {
    const existing = this.prompts.get(prompt.id);
    if (existing) {
      this.prompts.set(prompt.id, {
        ...existing,
        ...prompt,
        metadata: {
          ...existing.metadata,
          ...prompt.metadata,
          lastUpdated: new Date(),
        },
      });
    }
  }

  selectPrompt(context: {
    action?: string;
    domains?: string[];
    category?: string;
    tags?: string[];
  }): Prompt | undefined {
    const candidates = Array.from(this.prompts.values());
    if (candidates.length === 0) return undefined;

    let best: Prompt | undefined;
    let bestScore = -1;

    for (const prompt of candidates) {
      let score = 0;

      if (context.category && prompt.category === context.category) {
        score += 3;
      }

      if (context.action) {
        const actionLower = context.action.toLowerCase();
        if (prompt.tags.some(t => t.toLowerCase() === actionLower)) {
          score += 2;
        }
      }

      if (context.domains && context.domains.length > 0) {
        for (const domain of context.domains) {
          if (prompt.tags.some(t => t.toLowerCase() === domain.toLowerCase())) {
            score += 2;
          }
        }
      }

      if (context.tags && context.tags.length > 0) {
        for (const tag of context.tags) {
          if (prompt.tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            score += 1;
          }
        }
      }

      score += (prompt.metadata.effectiveness ?? 0.5) * 2;

      if (score > bestScore) {
        bestScore = score;
        best = prompt;
      }
    }

    if (bestScore <= 0) {
      return undefined;
    }

    return best;
  }

  recordOutcome(promptId: string, success: boolean): void {
    const prompt = this.prompts.get(promptId);
    if (!prompt) return;

    const currentRate = prompt.metadata.successRate ?? prompt.metadata.effectiveness ?? 0.5;
    const alpha = 0.3;
    const newRate = alpha * (success ? 1 : 0) + (1 - alpha) * currentRate;

    this.update({
      ...prompt,
      metadata: {
        ...prompt.metadata,
        successRate: newRate,
        effectiveness: newRate * 0.7 + (prompt.metadata.effectiveness ?? 0.5) * 0.3,
      },
    });
  }

  buildSystemPrompt(
    promptId: string,
    context?: Record<string, string>,
    sessionId?: string
  ): string {
    const prompt = this.get(promptId);
    let fullPrompt: string;
    
    if (prompt) {
      fullPrompt = prompt.systemTemplate;
    } else {
      fullPrompt = promptId;
    }

    if (context) {
      for (const [key, value] of Object.entries(context)) {
        fullPrompt = fullPrompt.replace(`{{${key}}}`, value);
      }
    }

    if (sessionId) {
      fullPrompt = this.sessionManager.buildContextAwarePrompt(fullPrompt, sessionId);
    }

    if (prompt && prompt.examples && prompt.examples.length > 0) {
      fullPrompt += `\n\n## 示例：\n`;
      for (let i = 0; i < prompt.examples.length; i++) {
        const ex = prompt.examples[i];
        fullPrompt += `\n### 示例 ${i + 1}\n`;
        fullPrompt += `输入: ${JSON.stringify(ex.input)}\n`;
        fullPrompt += `输出: ${JSON.stringify(ex.output)}\n`;
        if (ex.explanation) {
          fullPrompt += `说明: ${ex.explanation}\n`;
        }
      }
    }

    if (prompt && prompt.constraints && prompt.constraints.length > 0) {
      fullPrompt += `\n\n## 约束：\n`;
      for (const constraint of prompt.constraints) {
        fullPrompt += `- [${constraint.type}] ${typeof constraint.rule === 'string' ? constraint.rule : JSON.stringify(constraint.rule)}\n`;
      }
    }

    if (prompt) {
      prompt.metadata.uses++;
      this.update(prompt);
    }

    return fullPrompt;
  }
}

export function createPromptManager(): PromptManager {
  return new PromptManager();
}

export const DEFAULT_INTENT_PARSER_ID = 'intent-parser-v1';
export const DEFAULT_WORKFLOW_YAML_ID = 'workflow-yaml-v1';
export const DOC_TASK_PARSER_ID = 'doc-task-parser-v1';
export const AGENT_CMD_GENERATOR_ID = 'agent-cmd-generator-v1';
export const TOOL_CAPABILITY_PARSER_ID = 'tool-capability-parser-v1';
export const POST_EXECUTION_REVIEW_ID = 'post-execution-review-v1';
export const NL_PROCESSOR_TOOL_CALLING_ID = 'nl-processor-tool-calling';
