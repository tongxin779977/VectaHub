export interface ExtractedParams {
  [key: string]: string;
}

export interface ParamExtractor {
  extract(input: string): ExtractedParams;
  calculateBoost(params: ExtractedParams): number;
}

const PATH_PATTERNS: { pattern: RegExp; key: string }[] = [
  { pattern: /(?:^|[\s])(\.\/[^\s]+)/, key: 'path' },
  { pattern: /(?:^|[\s])(~\/[^\s]+)/, key: 'path' },
  { pattern: /\b([a-zA-Z][a-zA-Z0-9_/]*\/[a-zA-Z][a-zA-Z0-9_/]*)/, key: 'path' },
  { pattern: /\b([a-zA-Z][a-zA-Z0-9_]*)\//, key: 'path' },
];

const COMMON_DIR_NAMES = new Set([
  'src', 'lib', 'dist', 'build', 'test', 'tests', 'docs', 'config',
  'utils', 'util', 'helpers', 'core', 'modules', 'packages', 'apps',
]);

const COMMON_DIR_PATTERN = /\b([a-zA-Z][a-zA-Z0-9_]*)\b/;

const MODE_PATTERNS: { keywords: string[]; value: string }[] = [
  { keywords: ['详细', 'detail', 'detailed', '完整', 'full'], value: 'detailed' },
  { keywords: ['简单', 'simple', 'brief', '简要'], value: 'simple' },
  { keywords: ['状态', 'stat', 'status'], value: 'stat' },
];

const TYPE_MAP: Record<string, string> = {
  ts: 'ts',
  tsx: 'ts',
  js: 'js',
  jsx: 'js',
  py: 'py',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  目录: 'directory',
  文件夹: 'directory',
  folder: 'directory',
};

const ACTION_KEYWORDS: Record<string, string[]> = {
  commit: ['commit', '提交'],
  push: ['push', '推送', '发布'],
  pull: ['pull', '拉取', '同步'],
  diff: ['diff', '对比', '差异'],
  merge: ['merge', '合并'],
  branch: ['branch', '分支'],
  checkout: ['checkout', '切换'],
};

const BOOST_PER_PARAM = 0.15;

export function createParamExtractor(): ParamExtractor {
  return {
    extract(input: string): ExtractedParams {
      if (!input.trim()) return {};

      const params: ExtractedParams = {};
      const lower = input.toLowerCase();

      extractPath(lower, params);
      extractMode(lower, params);
      extractType(lower, params);
      extractAction(lower, params);

      return params;
    },

    calculateBoost(params: ExtractedParams): number {
      const count = Object.keys(params).length;
      return count * BOOST_PER_PARAM;
    },
  };
}

function extractPath(input: string, params: ExtractedParams): void {
  for (const { pattern, key } of PATH_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      params[key] = match[1];
      return;
    }
  }

  if (input.includes('当前') || input.includes('current')) {
    params.path = '.';
    return;
  }

  const allWords = input.match(/(?:^|[\s])([a-zA-Z][a-zA-Z0-9_]*)(?:[\s]|$)/g);
  if (allWords) {
    for (const token of allWords) {
      const word = token.trim().toLowerCase();
      if (COMMON_DIR_NAMES.has(word)) {
        params.path = word;
        return;
      }
    }
  }
}

function extractMode(input: string, params: ExtractedParams): void {
  for (const { keywords, value } of MODE_PATTERNS) {
    if (keywords.some(kw => input.includes(kw))) {
      params.mode = value;
      return;
    }
  }
}

function extractType(input: string, params: ExtractedParams): void {
  for (const [keyword, value] of Object.entries(TYPE_MAP)) {
    if (input.includes(keyword)) {
      params.type = value;
      return;
    }
  }
}

function extractAction(input: string, params: ExtractedParams): void {
  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords.some(kw => input.includes(kw))) {
      params.action = action;
      return;
    }
  }
}
