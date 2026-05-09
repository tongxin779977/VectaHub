import type { IntentName } from '../../types/index.js';
import type { WeightedKeyword, CompositePhrase, NegativeKeyword } from '../types.js';
import { IntentCategory } from '../types/category.js';

export interface IntentTemplate {
  name: string;
  description: string;
  keywords: string[];
  weight: number;
  cli: string[];
  params: Record<string, {
    type: string;
    required: boolean;
    default?: unknown;
    description: string;
  }>;
  steps: StepTemplate[];
  weightedKeywords?: WeightedKeyword[];
  phrases?: CompositePhrase[];
  negativeKeywords?: NegativeKeyword[];
  priority?: number;
  tags?: string[];
  category?: IntentCategory;
}

export interface StepTemplate {
  type: string;
  cli?: string;
  args?: string[];
  body?: StepTemplate[];
  condition?: string;
}

export const INTENT_TEMPLATES: Record<string, IntentTemplate> = {
  FILE_FIND: {
    name: 'FILE_FIND',
    description: '查找文件',
    keywords: ['找出', 'find', 'search', '找出所有', '找出大于', '搜索最近', '在docs', '搜索twitter', '所有ts', '找出文件', '找出大于', '配置文件', '超过', '大文件', '找一下', '帮我找', '搜索文件', '查找最近'],
    weight: 0.85,
    cli: ['find', 'fd', 'locate', 'grep'],
    params: {
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '搜索路径'
      },
      name: {
        type: 'string',
        required: false,
        description: '文件名模式'
      },
      type: {
        type: 'string',
        required: false,
        default: 'f',
        description: '文件类型 (f|d|l)'
      },
      mtime: {
        type: 'string',
        required: false,
        description: '修改时间 (天数，如 -7 表示7天内)'
      },
      size: {
        type: 'string',
        required: false,
        description: '文件大小 (如 +1M, -100k)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-name', '${name:-*}']
      },
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-mtime', '${mtime}'],
        condition: '${mtime}'
      },
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-size', '${size}'],
        condition: '${size}'
      }
    ],
    weightedKeywords: [
      { text: '查找', tier: 'core' },
      { text: '找出', tier: 'core' },
      { text: '搜索', tier: 'core' },
      { text: 'find', tier: 'core' },
      { text: 'search', tier: 'core' },
      { text: '文件', tier: 'generic' },
    ],
    phrases: [
      { pattern: '查找.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '找出.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '搜索.*修改', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '搜索.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '目录下查找', isRegex: false, weight: 1.0, bonus: 1.2 },
      { pattern: '大于.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '超过.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '帮我找.*配置', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '找一下.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查找.*并统计', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '找出.*并统计', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '搜索所有', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '创建', strength: 'soft' },
      { text: '新建', strength: 'soft' },
      { text: '生成', strength: 'soft' },
      { text: '编写', strength: 'soft' },
    ],
    priority: 3,
    tags: ['file', 'search'],
    category: IntentCategory.QUERY,
  },

  DIALOG_GREETING: {
    name: 'DIALOG_GREETING',
    description: '问候语对话',
    keywords: ['你好', '您好', '嗨', 'Hello', 'Hi', '早上好', '下午好', '晚上好'],
    weight: 1.5,
    cli: [],
    params: {},
    steps: [],
    weightedKeywords: [
      { text: '你好', tier: 'core' },
      { text: '您好', tier: 'core' },
      { text: '嗨', tier: 'core' },
      { text: 'Hello', tier: 'core' },
      { text: 'Hi', tier: 'core' },
      { text: '早上好', tier: 'core' },
      { text: '下午好', tier: 'core' },
      { text: '晚上好', tier: 'core' },
    ],
    phrases: [
      { pattern: '^你好$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^您好$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^嗨$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^Hello$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^Hi$', isRegex: true, weight: 1.0, bonus: 4.0 },
      { pattern: '^早上好$', isRegex: true, weight: 1.0, bonus: 3.5 },
      { pattern: '^下午好$', isRegex: true, weight: 1.0, bonus: 3.5 },
      { pattern: '^晚上好$', isRegex: true, weight: 1.0, bonus: 3.5 },
    ],
    priority: 10,
    tags: ['dialog', 'greeting'],
    category: IntentCategory.DIALOG,
  },

  WORKFLOW_GENERATE: {
    name: 'WORKFLOW_GENERATE',
    description: '根据文档或需求生成工作流',
    keywords: ['生成workflow', '生成工作流', '创建workflow', '创建工作流', '生成几个workflow', '生成几个工作流', '帮我生成', '根据文档生成'],
    weight: 1.0,
    cli: [],
    params: {
      docPath: {
        type: 'string',
        required: false,
        description: '文档路径'
      },
      requirements: {
        type: 'string',
        required: false,
        description: '工作流需求描述'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'echo',
        args: ['Generating workflow from requirements']
      }
    ],
    weightedKeywords: [
      { text: '生成', tier: 'core' },
      { text: '工作流', tier: 'core' },
      { text: 'workflow', tier: 'core' },
      { text: '创建', tier: 'core' },
    ],
    phrases: [
      { pattern: '生成.*workflow', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '生成.*工作流', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '根据.*文档.*生成', isRegex: true, weight: 1.0, bonus: 2.5 },
    ],
    priority: 5,
    tags: ['workflow', 'generation'],
    category: IntentCategory.GENERATE,
  },

  GIT_WORKFLOW: {
    name: 'GIT_WORKFLOW',
    description: 'Git 工作流操作',
    keywords: ['提交', 'commit', 'push', 'pull', 'clone', 'git', 'add', '代码提交', '提交代码'],
    weight: 0.9,
    cli: ['git'],
    params: {
      message: {
        type: 'string',
        required: false,
        description: '提交信息'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'git',
        args: ['add', '.']
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['commit', '-m', '${message}']
      }
    ],
    weightedKeywords: [
      { text: '提交', tier: 'core' },
      { text: 'commit', tier: 'core' },
      { text: 'git', tier: 'core' },
      { text: 'push', tier: 'core' },
      { text: 'pull', tier: 'core' },
    ],
    phrases: [
      { pattern: '提交代码', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '提交.*git', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '搜索', strength: 'soft' },
    ],
    priority: 4,
    tags: ['git', 'version-control'],
    category: IntentCategory.EXECUTE,
  },

  INSTALL_PACKAGE: {
    name: 'INSTALL_PACKAGE',
    description: '安装依赖包',
    keywords: ['安装', 'install', 'npm install', '依赖', '添加依赖', '装包'],
    weight: 0.85,
    cli: ['npm', 'yarn', 'pnpm'],
    params: {
      package: {
        type: 'string',
        required: false,
        description: '包名'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'npm',
        args: ['install', '${package}']
      }
    ],
    weightedKeywords: [
      { text: '安装', tier: 'core' },
      { text: 'install', tier: 'core' },
      { text: '依赖', tier: 'important' },
    ],
    phrases: [
      { pattern: '安装依赖', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: 'npm install', isRegex: false, weight: 1.0, bonus: 2.5 },
    ],
    priority: 4,
    tags: ['package', 'install'],
    category: IntentCategory.EXECUTE,
  },

  RUN_SCRIPT: {
    name: 'RUN_SCRIPT',
    description: '运行脚本或构建',
    keywords: ['构建', 'build', '测试', 'test', '运行', 'run', '启动', 'start'],
    weight: 0.85,
    cli: ['npm', 'yarn', 'pnpm'],
    params: {
      script: {
        type: 'string',
        required: false,
        description: '脚本名称'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'npm',
        args: ['run', '${script}']
      }
    ],
    weightedKeywords: [
      { text: '构建', tier: 'core' },
      { text: 'build', tier: 'core' },
      { text: '测试', tier: 'core' },
      { text: 'test', tier: 'core' },
      { text: '运行', tier: 'important' },
    ],
    phrases: [
      { pattern: '运行.*测试', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '构建项目', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    priority: 4,
    tags: ['script', 'build'],
    category: IntentCategory.EXECUTE,
  },

  CREATE_FILE: {
    name: 'CREATE_FILE',
    description: '创建文件或目录',
    keywords: ['创建', '新建', 'create', 'mkdir', 'touch', '生成文件'],
    weight: 0.8,
    cli: ['touch', 'mkdir'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件路径'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'touch',
        args: ['${path}']
      }
    ],
    weightedKeywords: [
      { text: '创建', tier: 'core' },
      { text: '新建', tier: 'core' },
      { text: 'create', tier: 'core' },
    ],
    phrases: [
      { pattern: '创建.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '创建.*目录', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '创建.*文件夹', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '搜索', strength: 'soft' },
    ],
    priority: 5,
    tags: ['file', 'create'],
    category: IntentCategory.EXECUTE,
  },

  FILE_ARCHIVE: {
    name: 'FILE_ARCHIVE',
    description: '压缩或解压文件',
    keywords: ['压缩', '打包', 'archive', 'zip', 'tar', '解压', 'extract', 'unzip'],
    weight: 0.8,
    cli: ['tar', 'zip', 'unzip'],
    params: {
      filePath: {
        type: 'string',
        required: false,
        description: '文件路径'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'tar',
        args: ['-czf', 'archive.tar.gz', '${filePath}']
      }
    ],
    weightedKeywords: [
      { text: '压缩', tier: 'core' },
      { text: '打包', tier: 'core' },
      { text: '解压', tier: 'core' },
      { text: 'archive', tier: 'core' },
    ],
    phrases: [
      { pattern: '压缩.*目录', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '打包.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '解压.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    priority: 5,
    tags: ['file', 'archive'],
    category: IntentCategory.EXECUTE,
  },

  FILE_PERMISSION: {
    name: 'FILE_PERMISSION',
    description: '修改文件权限',
    keywords: ['权限', 'permission', 'chmod', 'chown', '修改权限', '文件权限'],
    weight: 0.8,
    cli: ['chmod', 'chown'],
    params: {
      filePath: {
        type: 'string',
        required: false,
        description: '文件路径'
      },
      mode: {
        type: 'string',
        required: false,
        description: '权限模式'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'chmod',
        args: ['${mode}', '${filePath}']
      }
    ],
    weightedKeywords: [
      { text: '权限', tier: 'core' },
      { text: 'chmod', tier: 'core' },
      { text: '修改权限', tier: 'core' },
    ],
    phrases: [
      { pattern: '修改.*权限', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '文件权限', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    priority: 5,
    tags: ['file', 'permission'],
    category: IntentCategory.EXECUTE,
  },

  FILE_DIFF: {
    name: 'FILE_DIFF',
    description: '查看文件差异',
    keywords: ['差异', 'diff', '比较', 'compare', '文件差异', '查看差异'],
    weight: 0.8,
    cli: ['diff'],
    params: {
      file1: {
        type: 'string',
        required: false,
        description: '第一个文件'
      },
      file2: {
        type: 'string',
        required: false,
        description: '第二个文件'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'diff',
        args: ['-u', '${file1}', '${file2}']
      }
    ],
    weightedKeywords: [
      { text: '差异', tier: 'core' },
      { text: 'diff', tier: 'core' },
      { text: '比较', tier: 'important' },
    ],
    phrases: [
      { pattern: '查看.*差异', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '文件差异', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    priority: 5,
    tags: ['file', 'diff'],
    category: IntentCategory.QUERY,
  },

  DOCKER_BUILD: {
    name: 'DOCKER_BUILD',
    description: '构建 Docker 镜像',
    keywords: ['docker', 'build', '镜像', '构建镜像', 'docker build', 'container'],
    weight: 0.85,
    cli: ['docker'],
    params: {
      tag: {
        type: 'string',
        required: false,
        description: '镜像标签'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'docker',
        args: ['build', '-t', '${tag}', '.']
      }
    ],
    weightedKeywords: [
      { text: 'docker', tier: 'core' },
      { text: 'build', tier: 'core' },
      { text: '镜像', tier: 'core' },
      { text: '构建镜像', tier: 'core' },
    ],
    phrases: [
      { pattern: '构建镜像', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: 'docker.*build', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: 'build.*docker.*image', isRegex: true, weight: 1.0, bonus: 2.5 },
    ],
    priority: 4,
    tags: ['docker', 'build'],
    category: IntentCategory.EXECUTE,
  },

  SYSTEM_INFO: {
    name: 'SYSTEM_INFO',
    description: '查看系统信息',
    keywords: ['系统信息', '系统', 'system', '信息', 'info', '磁盘使用', '查看系统'],
    weight: 0.8,
    cli: ['uname', 'df', 'systeminfo'],
    params: {},
    steps: [
      {
        type: 'exec',
        cli: 'uname',
        args: ['-a']
      }
    ],
    weightedKeywords: [
      { text: '系统信息', tier: 'core' },
      { text: '系统', tier: 'important' },
      { text: '磁盘使用', tier: 'important' },
    ],
    phrases: [
      { pattern: '查看系统信息', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: '系统信息', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '查看磁盘使用', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '监控', strength: 'soft' },
      { text: '负载', strength: 'soft' },
    ],
    priority: 5,
    tags: ['system', 'info'],
    category: IntentCategory.QUERY,
  },

  QUERY_INFO: {
    name: 'QUERY_INFO',
    description: '通用信息查询',
    keywords: ['查询', 'query', '信息', 'what', 'how', '是什么', '怎么做'],
    weight: 0.7,
    cli: [],
    params: {},
    steps: [
      {
        type: 'exec',
        cli: 'echo',
        args: ['Querying information']
      }
    ],
    weightedKeywords: [
      { text: '查询', tier: 'core' },
      { text: '信息', tier: 'important' },
    ],
    phrases: [
      { pattern: '查询.*信息', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    priority: 2,
    tags: ['query', 'info'],
    category: IntentCategory.QUERY,
  },

  NETWORK_INFO: {
    name: 'NETWORK_INFO',
    description: '查看网络信息',
    keywords: ['网络信息', '网络', 'network', 'ip', 'ifconfig', '查看网络', '网络状态'],
    weight: 0.8,
    cli: ['ifconfig', 'ip', 'netstat'],
    params: {},
    steps: [
      {
        type: 'exec',
        cli: 'ifconfig',
        args: []
      }
    ],
    weightedKeywords: [
      { text: '网络信息', tier: 'core' },
      { text: '网络', tier: 'important' },
      { text: 'ip', tier: 'important' },
    ],
    phrases: [
      { pattern: '查看网络信息', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: '网络信息', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    priority: 5,
    tags: ['network', 'info'],
    category: IntentCategory.QUERY,
  },

  DATA_SCRAPING: {
    name: 'DATA_SCRAPING',
    description: '数据爬取或抓取',
    keywords: ['爬取', '抓取', 'scrape', 'crawl', '数据采集', '爬取数据', '网页数据'],
    weight: 0.9,
    cli: ['curl', 'wget', 'python'],
    params: {
      url: {
        type: 'string',
        required: false,
        description: '目标URL'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'curl',
        args: ['${url}']
      }
    ],
    weightedKeywords: [
      { text: '爬取', tier: 'core' },
      { text: '抓取', tier: 'core' },
      { text: '数据采集', tier: 'core' },
    ],
    phrases: [
      { pattern: '爬取.*数据', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '数据采集', isRegex: false, weight: 1.0, bonus: 2.5 },
    ],
    priority: 5,
    tags: ['data', 'scraping'],
    category: IntentCategory.GENERATE,
  },

  CONTENT_SUMMARY: {
    name: 'CONTENT_SUMMARY',
    description: '内容摘要或总结',
    keywords: ['摘要', '总结', 'summary', 'summarize', '内容摘要', '文章摘要', '文本摘要'],
    weight: 0.9,
    cli: [],
    params: {
      content: {
        type: 'string',
        required: false,
        description: '需要摘要的内容'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'echo',
        args: ['Generating content summary']
      }
    ],
    weightedKeywords: [
      { text: '摘要', tier: 'core' },
      { text: '总结', tier: 'core' },
      { text: '内容摘要', tier: 'core' },
    ],
    phrases: [
      { pattern: '内容摘要', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: '摘要.*内容', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    priority: 5,
    tags: ['content', 'summary'],
    category: IntentCategory.GENERATE,
  },

  GH_MAINTENANCE: {
    name: 'GH_MAINTENANCE',
    description: 'GitHub 自动维护与批量处理',
    keywords: ['获取 GitHub 最近失败的运行记录', '处理这些', '批量处理github', '修复所有失败'],
    weight: 1.0,
    cli: ['gh', 'vectahub'],
    params: {},
    steps: [
      {
        type: 'exec',
        cli: 'vectahub',
        args: ['run', '-f', 'templates/gh-auto-process-all.yaml', '--mode', 'relaxed']
      }
    ],
    weightedKeywords: [
      { text: '获取 GitHub 最近失败的运行记录', tier: 'core' },
      { text: '处理这些', tier: 'core' },
      { text: 'github', tier: 'important' },
      { text: '失败', tier: 'important' },
    ],
    priority: 10,
    tags: ['github', 'maintenance'],
    category: IntentCategory.EXECUTE,
  },

  GH_LOG_ANALYZE: {
    name: 'GH_LOG_ANALYZE',
    description: '分析 GitHub 错误日志并给出修复建议',
    keywords: ['分析日志', '修复建议', '排查错误', 'log analyze'],
    weight: 0.9,
    cli: ['grep', 'vectahub'],
    params: {
      file: {
        type: 'string',
        required: true,
        description: '日志文件路径'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'grep',
        args: ['-E', 'error|failed|exception|timeout', '${file}']
      }
    ],
    phrases: [
      { pattern: '分析.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '修复建议', isRegex: false, weight: 1.0, bonus: 1.5 },
    ],
    priority: 8,
    tags: ['github', 'debug'],
    category: IntentCategory.GENERATE,
  }
};

export function getIntentTemplate(name: string): IntentTemplate | undefined {
  return INTENT_TEMPLATES[name];
}

export function getAllIntentNames(): string[] {
  return Object.keys(INTENT_TEMPLATES);
}

export function buildKeywordSummary(): string {
  const lines: string[] = [];

  for (const template of Object.values(INTENT_TEMPLATES)) {
    lines.push(`${template.name}:`);
    const coreKw: string[] = [];
    const importantKw: string[] = [];

    if (template.weightedKeywords) {
      for (const kw of template.weightedKeywords) {
        if (kw.tier === 'core') {
          coreKw.push(kw.text);
        } else {
          importantKw.push(kw.text);
        }
      }
    }

    if (coreKw.length > 0) {
      lines.push(`  Core: ${coreKw.slice(0, 5).join(', ')}`);
    }
    if (importantKw.length > 0) {
      lines.push(`  Keywords: ${importantKw.slice(0, 5).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function detectNegation(input: string): boolean {
  const negationPatterns = [
    /\b不\b/, /\b没\b/, /\b无\b/, /\b非\b/,
    /\b不要\b/, /\b不用\b/, /\b别\b/,
    /\bnot\b/i, /\bno\b/i, /\bnever\b/i,
  ];
  return negationPatterns.some(p => p.test(input));
}

export function shouldSuppressDueToNegation(input: string, template: IntentTemplate): boolean {
  if (!detectNegation(input)) return false;

  const negativeKeywords = template.negativeKeywords || [];
  const hasNegativeKeyword = negativeKeywords.some(
    (neg) => input.includes(neg.text)
  );

  return hasNegativeKeyword && negativeKeywords.find(n => input.includes(n.text))?.strength === 'hard';
}