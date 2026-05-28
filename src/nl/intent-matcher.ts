import type { IntentMatch, IntentName } from '../types/index.js';
import type { MultiIntentResult } from './types.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';

/**
 * @deprecated Use IntentPattern (src/nl/types.ts) with WeightedKeywords
 * and CompositePhrases for richer matching. Will be removed in v2.0.
 */
export interface LegacyIntentPattern {
  intent: string;
  keywords: string[];
  weight: number;
  cli?: string[];
}

/**
 * 旧版意图匹配器接口
 * @deprecated 使用新的 MatchingPipeline 替代，将在 v2.0 移除
 */
export interface LegacyIntentMatcher {
  /**
   * 匹配单个意图
   * @param input - 用户输入文本
   * @param sessionId - 可选的会话 ID
   * @returns 匹配结果
   */
  match(input: string, sessionId?: string): IntentMatch;
  /**
   * 匹配多个意图
   * @param input - 用户输入文本
   * @param sessionId - 可选的会话 ID
   * @returns 多意图匹配结果
   */
  matchMultiIntent(input: string, sessionId?: string): MultiIntentResult;
  /**
   * 注册新的意图模式
   * @param pattern - 意图模式定义
   */
  registerPattern(pattern: LegacyIntentPattern): void;
  /**
   * 获取所有已注册的意图模式
   * @returns 意图模式列表的副本
   */
  getPatterns(): LegacyIntentPattern[];
}

/**
 * 创建旧版意图匹配器实例
 *
 * @deprecated 使用 MatchingPipeline 替代
 * @param patterns - 初始意图模式列表
 * @param auditHelper - 审计日志助手
 * @param coordinator - 可选的多意图协调器
 * @returns 意图匹配器实例
 */
export function createIntentMatcher(patterns: LegacyIntentPattern[], auditHelper: AuditHelper, coordinator?: {
  match(input: string): MultiIntentResult;
}): LegacyIntentMatcher {
  return {
    match(input: string, sessionId?: string): IntentMatch {
      const lowerInput = input.toLowerCase();
      let bestMatch: IntentMatch = {
        intent: 'UNKNOWN',
        confidence: 0,
        params: {},
      };

      for (const pattern of patterns) {
        const matches = pattern.keywords.filter((kw) =>
          lowerInput.includes(kw.toLowerCase())
        ).length;

        if (matches > 0) {
          const confidence = matches * pattern.weight;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              intent: pattern.intent as IntentName,
              confidence,
              params: {},
            };
          }
        }
      }

      if (sessionId) {
        auditHelper.intentMatch(bestMatch.intent, bestMatch.confidence, { input }, sessionId, {
          matchedKeywords: patterns
            .filter(p => p.intent === bestMatch.intent)
            .flatMap(p => p.keywords.filter(kw => lowerInput.includes(kw.toLowerCase()))),
        });
      }

      return bestMatch;
    },

    matchMultiIntent(input: string, sessionId?: string): MultiIntentResult {
      if (coordinator) {
        return coordinator.match(input);
      }

      const single = this.match(input, sessionId);
      return {
        isMultiIntent: false,
        intents: [{
          intent: single.intent,
          confidence: single.confidence,
          params: single.params,
          matchedKeywords: [],
        }],
        rawInput: input,
      };
    },

    registerPattern(pattern: LegacyIntentPattern): void {
      patterns.push(pattern);
    },

    getPatterns(): LegacyIntentPattern[] {
      return [...patterns];
    },
  };
}
