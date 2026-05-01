export interface SynonymEntry {
  canonical: string;
  synonyms: string[];
  weight: number;
}

export interface FuzzyMatcher {
  addSynonym(canonical: string, synonyms: string[]): void;
  findCanonical(input: string): string | undefined;
  getSimilar(input: string, threshold?: number): string[];
  calculateSimilarity(a: string, b: string): number;
}

const DEFAULT_SYNONYMS: Record<string, SynonymEntry> = {
  file: {
    canonical: 'file',
    synonyms: ['文件', '文档', '资料', '档案', 'document', 'doc'],
    weight: 1.0,
  },
  directory: {
    canonical: 'directory',
    synonyms: ['目录', '文件夹', '目录夹', 'folder', 'dir', '路径', 'path'],
    weight: 1.0,
  },
  create: {
    canonical: 'create',
    synonyms: ['创建', '新建', '新增', '添加', '建立', '生成', 'make', 'add', 'new'],
    weight: 1.0,
  },
  delete: {
    canonical: 'delete',
    synonyms: ['删除', '删掉', '移除', '去掉', '销毁', 'remove', 'rm', 'destroy'],
    weight: 1.0,
  },
  modify: {
    canonical: 'modify',
    synonyms: ['修改', '改动', '更新', '改变', '调整', '编辑', 'edit', 'update', 'change'],
    weight: 1.0,
  },
  find: {
    canonical: 'find',
    synonyms: ['查找', '找出', '搜索', '寻找', '查询', '探索', 'search', 'look', 'locate'],
    weight: 1.0,
  },
  run: {
    canonical: 'run',
    synonyms: ['运行', '执行', '跑', '启动', '开始', 'execute', 'start', 'launch', 'exec'],
    weight: 1.0,
  },
  build: {
    canonical: 'build',
    synonyms: ['构建', '编译', '打包', 'build', 'compile', 'package'],
    weight: 1.0,
  },
  test: {
    canonical: 'test',
    synonyms: ['测试', '测验', '检验', '测试', 'test', 'testing'],
    weight: 1.0,
  },
  install: {
    canonical: 'install',
    synonyms: ['安装', '部署', '装', 'install', 'setup', 'deploy'],
    weight: 1.0,
  },
  commit: {
    canonical: 'commit',
    synonyms: ['提交', 'commit', 'commit'],
    weight: 1.0,
  },
  push: {
    canonical: 'push',
    synonyms: ['推送', 'push', '上传'],
    weight: 1.0,
  },
  pull: {
    canonical: 'pull',
    synonyms: ['拉取', 'pull', '拉下', '下载'],
    weight: 1.0,
  },
  backup: {
    canonical: 'backup',
    synonyms: ['备份', '复制', '拷贝', 'back', 'copy'],
    weight: 1.0,
  },
  compress: {
    canonical: 'compress',
    synonyms: ['压缩', '缩小', '收紧', 'compress', 'zip', 'squeeze'],
    weight: 1.0,
  },
  decompress: {
    canonical: 'decompress',
    synonyms: ['解压', '解压缩', '展开', 'decompress', 'unzip', 'extract'],
    weight: 1.0,
  },
  rename: {
    canonical: 'rename',
    synonyms: ['重命名', '改名', '改名', 'rename', 'ren'],
    weight: 1.0,
  },
  copy: {
    canonical: 'copy',
    synonyms: ['复制', '拷贝', 'copy', 'cp', 'duplicate'],
    weight: 1.0,
  },
  move: {
    canonical: 'move',
    synonyms: ['移动', '迁移', '转移', 'move', 'mv', 'relocate'],
    weight: 1.0,
  },
  view: {
    canonical: 'view',
    synonyms: ['查看', '看', '浏览', '显示', 'view', 'show', 'display', 'watch'],
    weight: 1.0,
  },
  stop: {
    canonical: 'stop',
    synonyms: ['停止', '停下', '终止', '暂停', 'stop', 'halt', 'pause'],
    weight: 1.0,
  },
  start: {
    canonical: 'start',
    synonyms: ['开始', '启动', '开启', '出发', 'start', 'begin', 'launch'],
    weight: 1.0,
  },
  check: {
    canonical: 'check',
    synonyms: ['检查', '校验', '核对', '验证', 'check', 'verify', 'validate'],
    weight: 1.0,
  },
  debug: {
    canonical: 'debug',
    synonyms: ['调试', '排查', '排错', 'debug', 'fix', 'repair'],
    weight: 1.0,
  },
  refactor: {
    canonical: 'refactor',
    synonyms: ['重构', '优化', '改进', 'refactor', 'optimize', 'improve'],
    weight: 1.0,
  },
};

function createFuzzyMatcher(): FuzzyMatcher {
  const synonymMap = new Map<string, SynonymEntry>();
  const canonicalToSynonyms = new Map<string, Set<string>>();

  for (const [key, entry] of Object.entries(DEFAULT_SYNONYMS)) {
    synonymMap.set(key, entry);
    canonicalToSynonyms.set(entry.canonical, new Set(entry.synonyms));

    for (const synonym of entry.synonyms) {
      synonymMap.set(synonym, entry);
    }
  }

  function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  function calculateSimilarity(a: string, b: string): number {
    const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    const maxLen = Math.max(a.length, b.length);
    return 1 - distance / maxLen;
  }

  function addSynonym(canonical: string, synonyms: string[]): void {
    const entry: SynonymEntry = {
      canonical,
      synonyms,
      weight: 1.0,
    };

    synonymMap.set(canonical, entry);
    canonicalToSynonyms.set(canonical, new Set(synonyms));

    for (const synonym of synonyms) {
      synonymMap.set(synonym, entry);
    }
  }

  function findCanonical(input: string): string | undefined {
    const lowerInput = input.toLowerCase().trim();
    const entry = synonymMap.get(lowerInput);
    return entry?.canonical;
  }

  function getSimilar(input: string, threshold = 0.6): string[] {
    const results: { canonical: string; similarity: number }[] = [];
    const lowerInput = input.toLowerCase().trim();

    for (const [canonical, synonyms] of canonicalToSynonyms.entries()) {
      const directSimilarity = calculateSimilarity(lowerInput, canonical);
      if (directSimilarity >= threshold) {
        results.push({ canonical, similarity: directSimilarity });
        continue;
      }

      for (const synonym of synonyms) {
        const similarity = calculateSimilarity(lowerInput, synonym);
        if (similarity >= threshold) {
          results.push({ canonical, similarity });
          break;
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.map(r => r.canonical);
  }

  return {
    addSynonym,
    findCanonical,
    getSimilar,
    calculateSimilarity,
  };
}

export const fuzzyMatcher = createFuzzyMatcher();

export function createSynonymAwareMatcher() {
  return {
    match(input: string, patterns: string[]): { matched: string | undefined; similarity: number } {
      const inputCanonical = fuzzyMatcher.findCanonical(input);
      const normalizedInput = inputCanonical || input.toLowerCase();

      let bestMatch: string | undefined;
      let bestSimilarity = 0;

      for (const pattern of patterns) {
        const patternCanonical = fuzzyMatcher.findCanonical(pattern);
        const normalizedPattern = patternCanonical || pattern.toLowerCase();

        if (normalizedInput === normalizedPattern) {
          return { matched: pattern, similarity: 1.0 };
        }

        const similarity = fuzzyMatcher.calculateSimilarity(normalizedInput, normalizedPattern);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = pattern;
        }
      }

      if (bestSimilarity >= 0.6) {
        return { matched: bestMatch, similarity: bestSimilarity };
      }

      return { matched: undefined, similarity: 0 };
    },
  };
}
