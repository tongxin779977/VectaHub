import type { IntentTemplate } from './templates/index.js';
import { INTENT_TEMPLATES } from './templates/index.js';

const DEFAULT_MIN_SCORE = 0.3;
const DEFAULT_TOP_K = 3;

interface CompiledPattern {
  intent: string;
  category: string;
  priority: number;
  regex: RegExp;
  weight: number;
}

interface MatchCandidate {
  intent: string;
  category: string;
  score: number;
  matchedPattern: boolean;
  matchedExample: boolean;
}

/**
 * 工作流匹配器，提供高性能的意图匹配算法
 *
 * 优化策略：
 * - 预编译所有正则表达式，避免重复编译开销
 * - 按优先级排序模板，高优先级模板提前终止
 * - 多级评分：模式匹配 → 示例相似度 → 优先级加权
 * - 支持 Top-K 结果返回，减少下游处理量
 */
export class WorkflowMatcher {
  private readonly compiledPatterns: CompiledPattern[];
  private readonly exampleIndex: Map<string, Array<{ intent: string; example: string }>>;

  /**
   * 创建工作流匹配器实例
   * @param templates - 可选的自定义模板列表，默认使用 INTENT_TEMPLATES
   */
  constructor(templates?: IntentTemplate[]) {
    const source = templates ?? INTENT_TEMPLATES;
    this.compiledPatterns = this.compilePatterns(source);
    this.exampleIndex = this.buildExampleIndex(source);
  }

  /**
   * 匹配用户输入，返回最佳匹配结果
   *
   * @param input - 用户输入文本
   * @param options.minScore - 最低分数阈值，默认 0.3
   * @returns 最佳匹配的意图名称和分数，无匹配时返回 null
   */
  match(
    input: string,
    options?: { minScore?: number },
  ): { intent: string; category: string; score: number } | null {
    const results = this.matchTopK(input, { k: 1, minScore: options?.minScore });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 匹配用户输入，返回 Top-K 结果
   *
   * @param input - 用户输入文本
   * @param options.k - 返回结果数量，默认 3
   * @param options.minScore - 最低分数阈值，默认 0.3
   * @returns 按分数降序排列的匹配结果列表
   */
  matchTopK(
    input: string,
    options?: { k?: number; minScore?: number },
  ): Array<{ intent: string; category: string; score: number }> {
    const k = options?.k ?? DEFAULT_TOP_K;
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
    const normalizedInput = input.toLowerCase().trim();

    if (!normalizedInput) return [];

    const candidates = this.scoreAllCandidates(normalizedInput);

    return candidates
      .filter(c => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(c => ({ intent: c.intent, category: c.category, score: c.score }));
  }

  /**
   * 检查输入是否匹配指定意图
   *
   * @param input - 用户输入文本
   * @param intent - 要检查的意图名称
   * @param threshold - 匹配阈值，默认 0.5
   * @returns 是否匹配
   */
  matchesIntent(input: string, intent: string, threshold: number = 0.5): boolean {
    const normalizedInput = input.toLowerCase().trim();
    const candidates = this.scoreAllCandidates(normalizedInput);
    const target = candidates.find(c => c.intent === intent);
    return target !== undefined && target.score >= threshold;
  }

  /**
   * 获取已编译的模式数量（用于调试和监控）
   */
  get patternCount(): number {
    return this.compiledPatterns.length;
  }

  private compilePatterns(templates: IntentTemplate[]): CompiledPattern[] {
    const compiled: CompiledPattern[] = [];

    for (const template of templates) {
      const weight = template.weight ?? (1 / (template.priority || 1));
      for (const regex of template.patterns) {
        compiled.push({
          intent: template.intent,
          category: template.category,
          priority: template.priority,
          regex: new RegExp(regex.source, regex.flags),
          weight,
        });
      }
    }

    compiled.sort((a, b) => a.priority - b.priority);
    return compiled;
  }

  private buildExampleIndex(
    templates: IntentTemplate[],
  ): Map<string, Array<{ intent: string; example: string }>> {
    const index = new Map<string, Array<{ intent: string; example: string }>>();

    for (const template of templates) {
      for (const example of template.examples) {
        const words = example.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length < 2) continue;
          const existing = index.get(word) ?? [];
          existing.push({ intent: template.intent, example: example.toLowerCase() });
          index.set(word, existing);
        }
      }
    }

    return index;
  }

  private scoreAllCandidates(normalizedInput: string): MatchCandidate[] {
    const scoreMap = new Map<string, MatchCandidate>();

    for (const pattern of this.compiledPatterns) {
      if (pattern.regex.test(normalizedInput)) {
        const existing = scoreMap.get(pattern.intent);
        const patternScore = pattern.weight * 0.7;
        if (existing) {
          existing.score += patternScore;
          existing.matchedPattern = true;
        } else {
          scoreMap.set(pattern.intent, {
            intent: pattern.intent,
            category: pattern.category,
            score: patternScore,
            matchedPattern: true,
            matchedExample: false,
          });
        }
      }
    }

    const inputWords = normalizedInput.split(/\s+/);
    const exampleHits = new Map<string, number>();

    for (const word of inputWords) {
      const entries = this.exampleIndex.get(word);
      if (!entries) continue;
      for (const entry of entries) {
        exampleHits.set(entry.intent, (exampleHits.get(entry.intent) ?? 0) + 1);
      }
    }

    for (const [intent, hitCount] of exampleHits) {
      const existing = scoreMap.get(intent);
      const exampleScore = Math.min(hitCount * 0.15, 0.4);
      if (existing) {
        existing.score += exampleScore;
        existing.matchedExample = true;
      } else {
        const template = INTENT_TEMPLATES.find(t => t.intent === intent);
        if (template) {
          scoreMap.set(intent, {
            intent,
            category: template.category,
            score: exampleScore,
            matchedPattern: false,
            matchedExample: true,
          });
        }
      }
    }

    return Array.from(scoreMap.values());
  }
}
