export interface ExtractedParams {
  [key: string]: string;
}

/**
 * ParamExtractor 已经过现代化改造。
 * 现在的策略是：
 * 1. 优先使用 LLM 从语义中提取参数（在 pipeline 中完成）。
 * 2. 此模块仅作为低成本的正则补全方案，处理一些非常明显的路径和模式。
 */
export interface ParamExtractor {
  extract(input: string): ExtractedParams;
}

const PATH_PATTERNS: { pattern: RegExp; key: string }[] = [
  { pattern: /(?:^|[\s])(\.\/[^\s]+)/, key: 'path' },
  { pattern: /(?:^|[\s])(~\/[^\s]+)/, key: 'path' },
];

export function createParamExtractor(): ParamExtractor {
  return {
    extract(input: string): ExtractedParams {
      if (!input.trim()) return {};

      const params: ExtractedParams = {};
      const lower = input.toLowerCase();

      // 仅保留最基础且高频的正则匹配作为兜底
      for (const { pattern, key } of PATH_PATTERNS) {
        const match = lower.match(pattern);
        if (match) {
          params[key] = match[1];
          break;
        }
      }

      if (lower.includes('当前目录') || lower.includes('current dir')) {
        params.path = '.';
      }

      return params;
    }
  };
}
