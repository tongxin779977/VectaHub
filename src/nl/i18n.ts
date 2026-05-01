export type Language = 'zh-CN' | 'en-US' | 'auto';

export interface LocalizedString {
  'zh-CN': string;
  'en-US': string;
}

export interface LanguageDetector {
  detect(input: string): Language;
  normalize(input: string, targetLang: Language): string;
}

const ZH_PATTERNS = [
  /[\u4e00-\u9fff]/,
  /[\u3400-\u4dbf]/,
  /[啊-座]/,
];

const EN_PATTERNS = [
  /\b(the|a|an|is|are|was|were|have|has|do|does|did|will|would|could|should)\b/i,
  /\b(in|on|at|to|from|by|for|with|without)\b/i,
];

const TRANSLATION_MAP: Record<string, LocalizedString> = {
  compress: { 'zh-CN': '压缩', 'en-US': 'compress' },
  resize: { 'zh-CN': '调整大小', 'en-US': 'resize' },
  image: { 'zh-CN': '图片', 'en-US': 'image' },
  file: { 'zh-CN': '文件', 'en-US': 'file' },
  find: { 'zh-CN': '查找', 'en-US': 'find' },
  search: { 'zh-CN': '搜索', 'en-US': 'search' },
  backup: { 'zh-CN': '备份', 'en-US': 'backup' },
  copy: { 'zh-CN': '复制', 'en-US': 'copy' },
  move: { 'zh-CN': '移动', 'en-US': 'move' },
  delete: { 'zh-CN': '删除', 'en-US': 'delete' },
  create: { 'zh-CN': '创建', 'en-US': 'create' },
  modify: { 'zh-CN': '修改', 'en-US': 'modify' },
  run: { 'zh-CN': '运行', 'en-US': 'run' },
  execute: { 'zh-CN': '执行', 'en-US': 'execute' },
  build: { 'zh-CN': '构建', 'en-US': 'build' },
  test: { 'zh-CN': '测试', 'en-US': 'test' },
  install: { 'zh-CN': '安装', 'en-US': 'install' },
  deploy: { 'zh-CN': '部署', 'en-US': 'deploy' },
  commit: { 'zh-CN': '提交', 'en-US': 'commit' },
  push: { 'zh-CN': '推送', 'en-US': 'push' },
  pull: { 'zh-CN': '拉取', 'en-US': 'pull' },
  checkout: { 'zh-CN': '检出', 'en-US': 'checkout' },
  branch: { 'zh-CN': '分支', 'en-US': 'branch' },
  stash: { 'zh-CN': '暂存', 'en-US': 'stash' },
  rename: { 'zh-CN': '重命名', 'en-US': 'rename' },
  view: { 'zh-CN': '查看', 'en-US': 'view' },
  stop: { 'zh-CN': '停止', 'en-US': 'stop' },
  start: { 'zh-CN': '开始', 'en-US': 'start' },
  check: { 'zh-CN': '检查', 'en-US': 'check' },
  debug: { 'zh-CN': '调试', 'en-US': 'debug' },
  refactor: { 'zh-CN': '重构', 'en-US': 'refactor' },
  package: { 'zh-CN': '包', 'en-US': 'package' },
  directory: { 'zh-CN': '目录', 'en-US': 'directory' },
  path: { 'zh-CN': '路径', 'en-US': 'path' },
  current: { 'zh-CN': '当前', 'en-US': 'current' },
  all: { 'zh-CN': '所有', 'en-US': 'all' },
};

const INTENT_TRANSLATIONS: Record<string, { 'zh-CN': string[]; 'en-US': string[] }> = {
  IMAGE_COMPRESS: {
    'zh-CN': ['压缩图片', '缩小图片', '图片压缩'],
    'en-US': ['compress image', 'resize image', 'image compress'],
  },
  FILE_FIND: {
    'zh-CN': ['查找文件', '找出文件', '搜索文件'],
    'en-US': ['find file', 'search file', 'locate file'],
  },
  BACKUP: {
    'zh-CN': ['备份文件', '备份', '复制文件'],
    'en-US': ['backup file', 'backup', 'copy file'],
  },
  GIT_WORKFLOW: {
    'zh-CN': ['提交代码', '推送代码', 'git提交', 'git推送'],
    'en-US': ['commit code', 'push code', 'git commit', 'git push'],
  },
  INSTALL_PACKAGE: {
    'zh-CN': ['安装依赖', '安装包', '添加包'],
    'en-US': ['install package', 'install dependency', 'add package'],
  },
  RUN_SCRIPT: {
    'zh-CN': ['运行脚本', '执行脚本', '跑脚本'],
    'en-US': ['run script', 'execute script', 'start script'],
  },
  CREATE_FILE: {
    'zh-CN': ['创建文件', '新建文件', '添加文件'],
    'en-US': ['create file', 'new file', 'add file'],
  },
  DOCKER_MANAGE: {
    'zh-CN': ['docker管理', 'docker容器', 'docker操作'],
    'en-US': ['docker manage', 'docker container', 'docker operation'],
  },
};

function createLanguageDetector(): LanguageDetector {
  function detect(input: string): Language {
    const zhMatches = ZH_PATTERNS.filter(p => p.test(input)).length;
    const enMatches = EN_PATTERNS.filter(p => p.test(input)).length;

    const chineseChars = (input.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = input.replace(/\s/g, '').length;

    if (chineseChars / totalChars > 0.3) {
      return 'zh-CN';
    }

    if (zhMatches > enMatches * 2 && chineseChars > 5) {
      return 'zh-CN';
    }

    if (enMatches > zhMatches * 2) {
      return 'en-US';
    }

    if (zhMatches > 0 && enMatches === 0 && chineseChars > 5) {
      return 'zh-CN';
    }

    return 'en-US';
  }

  function normalize(input: string, targetLang: Language): string {
    if (targetLang === 'auto') {
      return input;
    }

    let normalized = input;

    const sourceLang = detect(input);
    if (sourceLang === targetLang) {
      return input;
    }

    for (const [en, translations] of Object.entries(TRANSLATION_MAP)) {
      const targetWord = translations[targetLang];
      const sourceWord = translations[sourceLang === 'auto' ? 'en-US' : sourceLang];

      const regex = new RegExp(sourceWord, 'gi');
      normalized = normalized.replace(regex, targetWord);
    }

    return normalized;
  }

  return {
    detect,
    normalize,
  };
}

export const languageDetector = createLanguageDetector();

export interface MultiLanguageParser {
  parse(input: string, language?: Language): {
    intent: string;
    confidence: number;
    params: Record<string, unknown>;
    detectedLanguage: Language;
    normalizedInput: string;
  };
}

export function createMultiLanguageParser(
  baseParser: {
    parse(input: string): { intent: string; confidence: number; params: Record<string, unknown> };
  }
): MultiLanguageParser {
  return {
    parse(input: string, language: Language = 'auto'): {
      intent: string;
      confidence: number;
      params: Record<string, unknown>;
      detectedLanguage: Language;
      normalizedInput: string;
    } {
      const detectedLanguage = language === 'auto'
        ? languageDetector.detect(input)
        : language;

      const normalizedInput = languageDetector.normalize(input, detectedLanguage);

      const result = baseParser.parse(normalizedInput);

      return {
        ...result,
        detectedLanguage,
        normalizedInput,
      };
    },
  };
}

export function createLocalizedParser() {
  return {
    translateIntent(intent: string, targetLang: Language): string[] {
      if (targetLang === 'auto') {
        return [];
      }
      return INTENT_TRANSLATIONS[intent]?.[targetLang] || [];
    },

    detectAndAdapt(input: string): { language: Language; adaptedInput: string } {
      const language = languageDetector.detect(input);
      const adaptedInput = languageDetector.normalize(input, language);

      return {
        language,
        adaptedInput,
      };
    },

    createBilingualPattern(zh: string, en: string): RegExp {
      return new RegExp(`(?:${zh}|${en})`, 'i');
    },
  };
}

export const i18n = createLocalizedParser();
