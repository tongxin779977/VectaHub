import type { NormalizedInput } from './goal-types.js';

const PHRASE_MAP: Record<string, string> = {
  'git 上': 'github',
  'git上': 'github',
  '测试用例': 'test',
  '修复': 'repair',
  '处理': 'repair',
  '解决': 'repair',
  '搞定': 'repair',
  '弄好': 'repair',
  '失败': 'failure',
  '错误': 'failure',
  '不通过': 'failure',
  '全部': 'all',
  '所有': 'all',
  '提交': 'git',
  '运行': 'run',
  '执行': 'run',
  '分析': 'analyze',
  '解释': 'explain',
  '查找': 'search',
  '搜索': 'search',
  '创建': 'create',
  '新建': 'create',
  '删除': 'delete',
  '构建': 'build',
  '测试': 'test',
  '最新': 'latest',
  '修': 'repair',
  '复': 'repair',
  '绿': 'green',
};

const SYNONYM_MAP: Record<string, string> = {
  '修复': 'repair',
  '处理': 'repair',
  '解决': 'repair',
  '搞定': 'repair',
  '弄好': 'repair',
  'fix': 'repair',
  'resolve': 'repair',
  '修': 'repair',
  '修好': 'repair',
  '错误': 'failure',
  '失败': 'failure',
  '挂了': 'failure',
  '红了': 'failure',
  '不通过': 'failure',
  'failed': 'failure',
  'error': 'failure',
  'actions': 'ci',
  'workflow': 'ci',
  'checks': 'ci',
  'pipeline': 'ci',
  'ci': 'ci',
  'github': 'github',
  'gh': 'github',
  '所有': 'all',
  '全部': 'all',
  'all': 'all',
  '提交': 'git',
  'commit': 'git',
  'push': 'git',
  'pull': 'git',
  'branch': 'git',
  'merge': 'git',
  '测试': 'test',
  'test': 'test',
  '构建': 'build',
  'build': 'build',
  'lint': 'lint',
  '运行': 'run',
  '执行': 'run',
  'run': 'run',
  '分析': 'analyze',
  'analyze': 'analyze',
  'explain': 'explain',
  '解释': 'explain',
  '查看': 'search',
  '查找': 'search',
  '搜索': 'search',
  'search': 'search',
  '创建': 'create',
  '新建': 'create',
  'delete': 'delete',
  '删除': 'delete',
};

const CI_CONTEXT_KEYWORDS = [
  'actions', 'workflow', 'ci', 'github', 'gh',
  'checks', 'pipeline', 'action',
];

const GITHUB_URL_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/(\d+)/g;
const COMMIT_SHA_RE = /\b[0-9a-f]{40}\b/g;
const FILE_PATH_RE = /\b(?:src|lib|test|tests|packages|templates|config)\/[\w./-]+\.\w+\b/g;

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const CJK_PUNCT_RE = /[，。！？、；：""''（）【】《》]/;

function tokenize(text: string): string[] {
  let separated = '';
  for (const ch of text) {
    if (CJK_PUNCT_RE.test(ch)) {
      separated += ' ';
    } else if (CJK_RE.test(ch)) {
      separated += ` ${ch} `;
    } else if (ch === ',' || ch === '!' || ch === '.') {
      separated += ' ';
    } else {
      separated += ch;
    }
  }
  return separated
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

function hasCiContext(text: string): boolean {
  const lower = text.toLowerCase();
  return CI_CONTEXT_KEYWORDS.some(kw => lower.includes(kw));
}

function extractRunIds(text: string): string[] {
  const ids: string[] = [];
  const urlMatches = text.matchAll(GITHUB_URL_RE);
  for (const m of urlMatches) {
    ids.push(m[1]);
  }

  if (hasCiContext(text)) {
    const bareIds = text.match(/\b\d{7,}\b/g);
    if (bareIds) {
      for (const id of bareIds) {
        if (!ids.includes(id)) {
          ids.push(id);
        }
      }
    }
  }

  return ids.length > 0 ? ids : [];
}

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const matches = text.matchAll(GITHUB_URL_RE);
  for (const m of matches) {
    urls.push(m[0]);
  }
  return urls.length > 0 ? urls : [];
}

function extractCommitShas(text: string): string[] {
  const shas = text.match(COMMIT_SHA_RE);
  return shas ? [...new Set(shas)] : [];
}

function extractFilePaths(text: string): string[] {
  const paths = text.match(FILE_PATH_RE);
  return paths ? [...new Set(paths)] : [];
}

export function normalizeInput(input: string): NormalizedInput {
  const rawText = input;
  const cleanText = input.trim().replace(/\s+/g, ' ');

  let processedText = cleanText;
  const phraseMatches: string[] = [];
  for (const [phrase, normalized] of Object.entries(PHRASE_MAP)) {
    if (processedText.toLowerCase().includes(phrase)) {
      if (!phraseMatches.includes(normalized)) {
        phraseMatches.push(normalized);
      }
      processedText = processedText.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
  }

  const tokens = tokenize(processedText);
  const normalizedTerms: string[] = [...phraseMatches];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (SYNONYM_MAP[lower]) {
      const mapped = SYNONYM_MAP[lower];
      if (!normalizedTerms.includes(mapped)) {
        normalizedTerms.push(mapped);
      }
    } else if (lower.length > 0 && !normalizedTerms.includes(lower)) {
      normalizedTerms.push(lower);
    }
  }

  if (normalizedTerms.includes('github') && normalizedTerms.includes('ci')) {
    if (!normalizedTerms.includes('github-actions')) {
      normalizedTerms.push('github-actions');
    }
  }

  return {
    rawText,
    cleanText,
    tokens,
    normalizedTerms,
    entities: {
      ...(extractUrls(input).length > 0 ? { githubActionUrls: extractUrls(input) } : {}),
      ...(extractRunIds(input).length > 0 ? { githubActionRunIds: extractRunIds(input) } : {}),
      ...(extractFilePaths(input).length > 0 ? { filePaths: extractFilePaths(input) } : {}),
      ...(extractCommitShas(input).length > 0 ? { commitShas: extractCommitShas(input) } : {}),
    },
  };
}
