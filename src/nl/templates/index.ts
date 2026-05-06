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
  items?: string;
  outputVar?: string;
  site?: string;
  command?: string;
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
    ],
    priority: 5,
    tags: ['file-operation'],
    category: IntentCategory.QUERY,
  },

  GIT_WORKFLOW: {
    name: 'GIT_WORKFLOW',
    description: 'Git 操作流程',
    keywords: ['提交', 'commit', '推送', 'push', '拉取', 'pull', 'git', 'add', '分支', 'branch', '标签', 'tag', '暂存', 'stash', '变基', 'rebase', '合并', 'merge', '历史', 'history', '改动', '工作区', 'repo', '查看 git', 'git 状态', '查看状态', '新分支', 'feature', '切换', '有哪些改动', 'git status', 'checkout', 'checkout -b', 'git log', '查看历史'],
    weight: 1.0,
    cli: ['git'],
    params: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型 (add|commit|push|pull|status|branch|tag|stash|rebase|merge|log|diff)'
      },
      message: {
        type: 'string',
        required: false,
        description: '提交信息'
      },
      branch: {
        type: 'string',
        required: false,
        description: '分支名'
      },
      tag: {
        type: 'string',
        required: false,
        description: '标签名'
      },
      target: {
        type: 'string',
        required: false,
        description: '合并/变基目标分支'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'git',
        args: ['add', '-A'],
        condition: '${action} in ["add", "commit", "push"]'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['commit', '-m', '${message}'],
        condition: '${action} in ["commit"]'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['push', 'origin', '${branch:-main}'],
        condition: '${action} in ["push"]'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['pull', 'origin', '${branch:-main}'],
        condition: '${action} == "pull"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['status'],
        condition: '${action} == "status"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['branch'],
        condition: '${action} == "branch"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['checkout', '-b', '${branch}'],
        condition: '${action} in ["branch", "create_branch"]'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['tag', '${tag}'],
        condition: '${action} in ["tag"]'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['stash', 'push', '-m', '${message:-stashed changes}'],
        condition: '${action} == "stash"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['stash', 'pop'],
        condition: '${action} == "stash_pop"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['rebase', '${target}'],
        condition: '${action} == "rebase"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['merge', '${target}'],
        condition: '${action} == "merge"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['log', '--oneline', '-20'],
        condition: '${action} in ["log", "history"]'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['diff'],
        condition: '${action} == "diff"'
      }
    ],
    weightedKeywords: [
      { text: '提交', tier: 'core' },
      { text: 'commit', tier: 'core' },
      { text: '推送', tier: 'core' },
      { text: 'push', tier: 'core' },
      { text: '拉取', tier: 'important' },
      { text: 'pull', tier: 'important' },
      { text: '合并', tier: 'important' },
      { text: 'merge', tier: 'important' },
      { text: 'git 状态', tier: 'core' },
      { text: '查看 git', tier: 'core' },
      { text: '分支', tier: 'core' },
      { text: '暂存', tier: 'core' },
      { text: '工作区', tier: 'core' },
      { text: '切换', tier: 'core' },
      { text: 'git', tier: 'generic' },
      { text: '代码', tier: 'generic' },
    ],
    phrases: [
      { pattern: 'git.*状态', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查看.*git', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '创建.*分支', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '合并.*分支', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '暂存.*修改', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '工作区.*改动', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查看工作区', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '切换.*分支', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '创建.*分支.*切换', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '分支.*切换', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '新分支', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '创建文件', strength: 'hard' },
      { text: 'trending', strength: 'hard' },
    ],
    priority: 1,
    tags: ['git', 'vcs'],
    category: IntentCategory.EXECUTE,
  },

  RUN_SCRIPT: {
    name: 'RUN_SCRIPT',
    description: '运行脚本',
    keywords: ['运行', '执行', '跑', 'run', 'script', '脚本', 'build', 'test', 'start', 'dev', '构建', '启动', '开发服务器', 'lint', 'typecheck', '构建项目', '单元测试', '启动项目', '启动开发', 'run test'],
    weight: 0.95,
    cli: ['npm', 'yarn', 'node', 'python'],
    params: {
      script: {
        type: 'string',
        required: true,
        description: '脚本名称'
      },
      runner: {
        type: 'string',
        required: false,
        default: 'npm',
        description: '运行器'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: '${runner}',
        args: ['${runner in ["npm", "yarn"] ? "run" : ""}', '${script}']
      }
    ],
    weightedKeywords: [
      { text: '构建', tier: 'core' },
      { text: 'build', tier: 'core' },
      { text: 'typecheck', tier: 'core' },
      { text: '运行', tier: 'important' },
      { text: 'run', tier: 'important' },
      { text: '脚本', tier: 'important' },
      { text: 'script', tier: 'important' },
      { text: '启动', tier: 'generic' },
      { text: '测试', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '安装', strength: 'soft' },
      { text: '进程', strength: 'hard' },
      { text: '内存', strength: 'hard' },
      { text: 'cpu', strength: 'hard' },
    ],
    priority: 3,
    tags: ['script', 'build'],
    category: IntentCategory.EXECUTE,
  },

  SYSTEM_INFO: {
    name: 'SYSTEM_INFO',
    description: '查看系统信息',
    keywords: ['系统信息', 'system', 'info', '磁盘使用情况', 'disk', '系统查询', '系统版本', '操作系统', '详细信息', 'uname', '磁盘使用', '帮我看看磁盘', '内存使用', 'cpu 信息', '内存占用', '核心数', '型号', 'cpu信息', '查看内存', '查看 cpu', '系统版本', 'os version', '查看系统版本', '显示 cpu', '显示内存', 'cpu 核心数', 'cpu 型号'],
    weight: 0.95,
    cli: ['df', 'du', 'free', 'top', 'uname'],
    params: {
      type: {
        type: 'string',
        required: false,
        default: 'disk',
        description: '信息类型 (disk|memory|cpu|all)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'df',
        args: ['-h'],
        condition: '${type} == "disk"'
      },
      {
        type: 'exec',
        cli: 'du',
        args: ['-sh', '.'],
        condition: '${type} == "disk"'
      },
      {
        type: 'exec',
        cli: 'top',
        args: ['-bn', '1'],
        condition: '${type} in ["cpu", "all"]'
      },
      {
        type: 'exec',
        cli: 'uname',
        args: ['-a'],
        condition: '${type} == "all"'
      }
    ],
    weightedKeywords: [
      { text: '系统信息', tier: 'core' },
      { text: '磁盘', tier: 'important' },
      { text: '内存', tier: 'important' },
      { text: 'cpu', tier: 'important' },
      { text: '系统', tier: 'generic' },
    ],
    phrases: [
      { pattern: '查看系统', isRegex: false, weight: 1.0, bonus: 1.5 },
      { pattern: '系统信息', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '磁盘使用', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '查看.*内存', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '查看.*cpu', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '当前系统.*内存', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '核心数.*型号', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '显示.*核心', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '操作.*详细', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '系统版本', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '监控', strength: 'soft' },
      { text: '使用率', strength: 'soft' },
      { text: '负载', strength: 'soft' },
      { text: '资源使用情况', strength: 'soft' },
      { text: '进程', strength: 'hard' },
    ],
    priority: 5,
    tags: ['system'],
    category: IntentCategory.QUERY,
  },

  QUERY_INFO: {
    name: 'QUERY_INFO',
    description: '查询信息',
    keywords: ['查看当前', '看看当前', '当前目录', '显示目录', '列出', 'view', 'list', 'show', '结构', '目录内容', 'ls', '项目结构', '显示隐藏', '列出当前', '列出src', '用了哪些', '项目用了', '看看当前有什么', '列出文件', '列出当前目录', '列出src目录'],
    weight: 0.95,
    cli: ['ls', 'cat'],
    params: {
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '路径'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'ls',
        args: ['-la', '${path}']
      }
    ],
    weightedKeywords: [
      { text: '查看', tier: 'important' },
      { text: '列出', tier: 'core' },
      { text: 'list', tier: 'core' },
      { text: '目录', tier: 'important' },
      { text: '内容', tier: 'important' },
      { text: '文件', tier: 'generic' },
      { text: '用了哪些', tier: 'core' },
      { text: '项目用了', tier: 'core' },
    ],
    phrases: [
      { pattern: '项目用了哪些.*包', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '用了哪些.*包', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '当前目录', isRegex: false, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: 'git', strength: 'hard' },
      { text: '网络', strength: 'hard' },
      { text: '系统', strength: 'soft' },
      { text: '内存', strength: 'soft' },
      { text: 'cpu', strength: 'soft' },
      { text: '工作区', strength: 'hard' },
      { text: '改动', strength: 'hard' },
      { text: '进程', strength: 'hard' },
      { text: 'dns', strength: 'hard' },
    ],
    priority: 2,
    tags: ['query'],
    category: IntentCategory.QUERY,
  },

  INSTALL_PACKAGE: {
    name: 'INSTALL_PACKAGE',
    description: '安装依赖包',
    keywords: ['安装', 'install', '添加', 'add', '依赖', 'package', 'npm包', '开发依赖', '到开发依赖', '添加到', '安装依赖', '安装到'],
    weight: 0.95,
    cli: ['npm', 'yarn', 'pnpm', 'pip'],
    params: {
      package: {
        type: 'string',
        required: true,
        description: '包名'
      },
      dev: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否开发依赖'
      },
      packageManager: {
        type: 'string',
        required: false,
        default: 'npm',
        description: '包管理器'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: '${packageManager}',
        args: ['${packageManager == "npm" ? "install" : "add"}', '${dev ? "-D" : ""}', '${package}']
      }
    ],
    weightedKeywords: [
      { text: '安装', tier: 'core' },
      { text: 'install', tier: 'core' },
      { text: '依赖', tier: 'important' },
      { text: '包', tier: 'important' },
      { text: 'package', tier: 'important' },
      { text: '开发依赖', tier: 'important' },
      { text: 'npm', tier: 'generic' },
      { text: 'yarn', tier: 'generic' },
      { text: 'pnpm', tier: 'generic' },
    ],
    phrases: [
      { pattern: '安装.*依赖', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '添加到.*依赖', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '安装.*和', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '安装.*包', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '帮我安装', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '用了哪些', strength: 'hard' },
      { text: '哪些.*包', strength: 'hard' },
      { text: '.json', strength: 'hard' },
      { text: '差异', strength: 'hard' },
      { text: '比较', strength: 'soft' },
    ],
    priority: 4,
    tags: ['package'],
    category: IntentCategory.EXECUTE,
  },

  CREATE_FILE: {
    name: 'CREATE_FILE',
    description: '创建新文件',
    keywords: ['创建', 'create', '新建', '添加', 'touch', '目录', '文件夹', '创建文件', '新建文件', '创建目录', '新建目录', '添加文件', '创建文件夹', '新建文件夹', '空的', '需要一个', '新文件', '添加一个', '添加新文件', '需要...文件夹', '创建新文件', '新建文件夹'],
    weight: 0.95,
    cli: ['touch', 'mkdir'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件路径'
      },
      directory: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否创建目录'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'mkdir',
        args: ['-p', '${path}'],
        condition: '${directory}'
      },
      {
        type: 'exec',
        cli: 'touch',
        args: ['${path}'],
        condition: '!${directory}'
      }
    ],
    weightedKeywords: [
      { text: '创建', tier: 'core' },
      { text: '新建', tier: 'core' },
      { text: 'create', tier: 'core' },
      { text: 'mkdir', tier: 'core' },
      { text: 'touch', tier: 'core' },
      { text: '文件', tier: 'generic' },
      { text: '目录', tier: 'generic' },
    ],
    phrases: [
      { pattern: '创建.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '新建.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '添加.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '需要.*文件夹', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '创建.*目录', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '新建.*目录', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '修改', strength: 'soft' },
    ],
    priority: 4,
    tags: ['file-operation'],
    category: IntentCategory.EXECUTE,
  },

  FETCH_HOT_NEWS: {
    name: 'FETCH_HOT_NEWS',
    description: '获取热榜信息',
    keywords: ['热榜', 'hot', 'trending', '排行榜', '热搜', '看看今天', 'github trending', 'githut', '查看热榜', '查看排行榜', '获取 trending', 'GitHub trending', '今日热榜', '热门新闻', '热搜榜'],
    weight: 0.95,
    cli: ['opencli', 'curl'],
    params: {
      site: {
        type: 'string',
        required: false,
        default: 'hackernews',
        description: '热榜站点名称'
      }
    },
    steps: [
      {
        type: 'opencli',
        site: '${site}',
        command: 'top',
        args: ['--limit', '10']
      }
    ],
    weightedKeywords: [
      { text: '热点', tier: 'core' },
      { text: '新闻', tier: 'core' },
      { text: 'hot', tier: 'core' },
      { text: 'news', tier: 'core' },
      { text: '热搜', tier: 'core' },
      { text: '热榜', tier: 'core' },
      { text: '排行榜', tier: 'core' },
      { text: 'trending', tier: 'core' },
      { text: '趋势', tier: 'important' },
    ],
    phrases: [
      { pattern: '查看.*热榜', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查看排行榜', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '获取.*trending', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: 'GitHub.*trending', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 3,
    tags: ['social', 'news'],
    category: IntentCategory.QUERY,
  },

  SOCIAL_MEDIA_SEARCH: {
    name: 'SOCIAL_MEDIA_SEARCH',
    description: '社交媒体搜索',
    keywords: ['twitter', '微博', '社交媒体', 'facebook', '小红书', 'instagram', 'tiktok', '微博热搜', '小红书上', 'twitter上', '微博上', '查找微博', '搜索小红书', '微博热搜', '社交媒体搜索'],
    weight: 0.95,
    cli: ['opencli', 'curl'],
    params: {
      query: {
        type: 'string',
        required: true,
        description: '搜索关键词'
      },
      platform: {
        type: 'string',
        required: false,
        default: 'twitter',
        description: '社交媒体平台'
      }
    },
    steps: [
      {
        type: 'opencli',
        site: '${platform}',
        command: 'search',
        args: ['--query', '${query}']
      }
    ],
    weightedKeywords: [
      { text: '搜索', tier: 'core' },
      { text: 'search', tier: 'core' },
      { text: '社交', tier: 'important' },
      { text: '媒体', tier: 'important' },
      { text: '微博', tier: 'core' },
      { text: '小红书', tier: 'core' },
      { text: 'twitter', tier: 'generic' },
    ],
    phrases: [
      { pattern: '微博.*热搜', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '搜索.*小红书', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查找.*微博', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 3,
    tags: ['social'],
    category: IntentCategory.QUERY,
  },

  DATA_SCRAPING: {
    name: 'DATA_SCRAPING',
    description: '网页数据爬取',
    keywords: ['爬取', 'scrape', '抓取', '采集', '网页数据', '网页内容', '提取', 'extract', 'example.com', 'from 网页', '从网页中', '采集网页', '抓取数据', '爬取数据', '网页提取', '数据提取'],
    weight: 0.95,
    cli: ['opencli', 'curl'],
    params: {
      url: {
        type: 'string',
        required: true,
        description: '目标 URL'
      }
    },
    steps: [
      {
        type: 'opencli',
        site: '${url}',
        command: 'scrape',
        args: ['--output', 'json']
      }
    ],
    weightedKeywords: [
      { text: '抓取', tier: 'core' },
      { text: '爬取', tier: 'core' },
      { text: '采集', tier: 'core' },
      { text: 'scrape', tier: 'core' },
      { text: '提取', tier: 'important' },
      { text: 'extract', tier: 'important' },
      { text: '爬虫', tier: 'important' },
      { text: 'crawler', tier: 'important' },
      { text: '数据', tier: 'generic' },
    ],
    phrases: [
      { pattern: '从网页.*提取', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '采集.*网页', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '抓取.*数据', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '提取.*标题', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '网页.*提取', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 1,
    tags: ['scraping'],
    category: IntentCategory.GENERATE,
  },

  CONTENT_SUMMARY: {
    name: 'CONTENT_SUMMARY',
    description: '内容摘要',
    keywords: ['摘要', 'summary', '汇总', '总结', '总结一下', '帮我总结', '摘要内容', '汇总一下', '要点', '总结一下', '总结要点', '文档要点', '内容总结', '概括一下'],
    weight: 0.95,
    cli: ['opencli', 'cat'],
    params: {
      source: {
        type: 'string',
        required: true,
        description: '内容来源'
      }
    },
    steps: [
      {
        type: 'opencli',
        site: '${source}',
        command: 'summary',
        args: ['--format', 'text']
      }
    ],
    weightedKeywords: [
      { text: '总结', tier: 'core' },
      { text: '摘要', tier: 'core' },
      { text: 'summary', tier: 'core' },
      { text: '汇总', tier: 'core' },
      { text: '要点', tier: 'important' },
      { text: '概括', tier: 'important' },
      { text: '归纳', tier: 'important' },
    ],
    phrases: [
      { pattern: '汇总.*要点', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '总结.*要点', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '文档.*要点', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 1,
    tags: ['content'],
    category: IntentCategory.GENERATE,
  },

  FILE_ARCHIVE: {
    name: 'FILE_ARCHIVE',
    description: '文件压缩解压',
    keywords: ['压缩', '解压', 'zip', 'tar', 'gzip', '打包', 'archive', 'unzip', '打包目录', '打包文件夹', '文件夹打包', '压缩包', '把', '目录压缩', '目录打包'],
    weight: 0.95,
    cli: ['tar', 'zip', 'gzip', 'unzip'],
    params: {
      source: {
        type: 'string',
        required: true,
        description: '源文件或目录'
      },
      target: {
        type: 'string',
        required: false,
        description: '目标文件名'
      },
      action: {
        type: 'string',
        required: false,
        default: 'compress',
        description: '操作类型 (compress|extract)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'tar',
        args: ['-czf', '${target:-archive.tar.gz}', '${source}'],
        condition: '${action} in ["compress"]'
      },
      {
        type: 'exec',
        cli: 'tar',
        args: ['-xzf', '${source}', '-C', '${target:-.}'],
        condition: '${action} in ["extract"]'
      },
      {
        type: 'exec',
        cli: 'unzip',
        args: ['${source}', '-d', '${target:-.}'],
        condition: '${source} endsWith ".zip"'
      }
    ],
    weightedKeywords: [
      { text: '压缩', tier: 'core' },
      { text: '打包', tier: 'core' },
      { text: '解压', tier: 'core' },
      { text: 'zip', tier: 'important' },
      { text: 'tar', tier: 'important' },
      { text: '目录', tier: 'generic' },
    ],
    phrases: [
      { pattern: '打包目录', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '压缩目录', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '打包.*目录', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '压缩.*目录', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '解压.*到', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '解压.*zip', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '解压.*tar', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '文件夹打包', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '目录打包', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '目录压缩', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '创建', strength: 'soft' },
    ],
    priority: 4,
    tags: ['file-operation'],
    category: IntentCategory.EXECUTE,
  },

  NETWORK_INFO: {
    name: 'NETWORK_INFO',
    description: '网络信息查询',
    keywords: ['网络', '状态', 'ifconfig', 'ping', 'dns', 'ip', '端口', '连接', 'network', '连通性', 'dns 配置', 'ip 地址', '本机 ip', 'ip address', '查看网络', '网络状态', '网络连接', '测试连通', 'google.com', '网络信息', '网络配置', '查看网络状态', '查看 ip', '测试网络', '网络连通'],
    weight: 0.95,
    cli: ['ping', 'ifconfig', 'ip', 'netstat', 'curl'],
    params: {
      type: {
        type: 'string',
        required: false,
        default: 'ping',
        description: '查询类型 (ping|ip|dns|port|all)'
      },
      target: {
        type: 'string',
        required: false,
        default: 'localhost',
        description: '目标主机或地址'
      },
      port: {
        type: 'string',
        required: false,
        description: '端口号'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'ping',
        args: ['-c', '4', '${target}'],
        condition: '${type} in ["ping"]'
      },
      {
        type: 'exec',
        cli: 'ifconfig',
        args: [],
        condition: '${type} in ["ip", "all"]'
      },
      {
        type: 'exec',
        cli: 'nslookup',
        args: ['${target}'],
        condition: '${type} in ["dns", "all"]'
      },
      {
        type: 'exec',
        cli: 'curl',
        args: ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://${target}:${port}'],
        condition: '${type} in ["port"]'
      }
    ],
    weightedKeywords: [
      { text: '网络', tier: 'core' },
      { text: 'network', tier: 'core' },
      { text: 'ip', tier: 'core' },
      { text: 'ping', tier: 'core' },
      { text: '网络状态', tier: 'core' },
      { text: '连通性', tier: 'important' },
      { text: '端口', tier: 'important' },
      { text: 'port', tier: 'important' },
      { text: 'dns', tier: 'important' },
    ],
    phrases: [
      { pattern: '网络.*状态', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '网络.*连接', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '测试.*连通', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查看.*dns', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: 'dns.*配置', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 2,
    tags: ['network'],
    category: IntentCategory.QUERY,
  },

  SYSTEM_MONITOR: {
    name: 'SYSTEM_MONITOR',
    description: '系统状态监控',
    keywords: ['系统', '监控', 'top', 'ps', 'cpu', '负载', 'load', '进程数', '使用率', '占用', '资源', 'node 进程', '运行', 'cpu 使用率', '占用内存最多', '有哪些 node', '查看 cpu', '查看内存', '查看进程', '资源使用', 'cpu 核心数', '内存占用情况', '监控 cpu', '监控内存', '实时监控', '系统负载', '当前负载'],
    weight: 0.85,
    cli: ['top', 'ps', 'df', 'free', 'vmstat'],
    params: {
      type: {
        type: 'string',
        required: false,
        default: 'all',
        description: '监控类型 (cpu|memory|disk|process|all)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'top',
        args: ['-bn', '1'],
        condition: '${type} in ["cpu", "all"]'
      },
      {
        type: 'exec',
        cli: 'ps',
        args: ['aux', '--sort', '-%mem', '|', 'head', '-20'],
        condition: '${type} in ["memory", "all"]'
      },
      {
        type: 'exec',
        cli: 'df',
        args: ['-h'],
        condition: '${type} in ["disk", "all"]'
      },
      {
        type: 'exec',
        cli: 'ps',
        args: ['aux', '|', 'wc', '-l'],
        condition: '${type} in ["process", "all"]'
      }
    ],
    weightedKeywords: [
      { text: '监控', tier: 'core' },
      { text: '内存占用', tier: 'core' },
      { text: '磁盘空间', tier: 'core' },
      { text: 'cpu 使用率', tier: 'core' },
      { text: '负载', tier: 'important' },
      { text: '进程', tier: 'important' },
      { text: '系统', tier: 'generic' },
    ],
    phrases: [
      { pattern: '监控.*进程', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '内存占用', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '磁盘空间', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '查看.*使用率', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '占用.*内存.*最多', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '查看进程', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '进程数', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '资源使用', isRegex: false, weight: 1.0, bonus: 1.5 },
      { pattern: 'node 进程', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '哪些.*进程.*运行', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '占用最多.*进程', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '资源使用情况', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: '显示.*系统.*资源', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查看系统', strength: 'soft' },
      { text: '系统信息', strength: 'soft' },
      { text: '当前系统', strength: 'soft' },
    ],
    priority: 2,
    tags: ['system'],
    category: IntentCategory.QUERY,
  },

  FILE_PERMISSION: {
    name: 'FILE_PERMISSION',
    description: '文件权限管理',
    keywords: ['权限', 'chmod', 'chown', 'permission', '所有者', '可执行', '修改权限', '设置权限', '添加执行', '执行权限', '改为777', '改为755', '权限改为', '设置权限', '755', '777', 'root', '+x', 'rwx', '设置为可执行', '权限管理', '加上权限', '加上可执行', '脚本加上', '修改文件所有者', '所有者改为', '查看权限', '文件权限', '可执行文件', '权限设置'],
    weight: 0.95,
    cli: ['chmod', 'chown', 'ls'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件或目录路径'
      },
      mode: {
        type: 'string',
        required: false,
        description: '权限模式 (如 755, +x, u+rwx)'
      },
      owner: {
        type: 'string',
        required: false,
        description: '所有者'
      },
      action: {
        type: 'string',
        required: false,
        default: 'chmod',
        description: '操作类型 (chmod|chown|check)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'chmod',
        args: ['${mode}', '${path}'],
        condition: '${action} in ["chmod"]'
      },
      {
        type: 'exec',
        cli: 'chown',
        args: ['${owner}', '${path}'],
        condition: '${action} in ["chown"]'
      },
      {
        type: 'exec',
        cli: 'ls',
        args: ['-la', '${path}'],
        condition: '${action} in ["check"]'
      }
    ],
    weightedKeywords: [
      { text: '权限', tier: 'core' },
      { text: 'chmod', tier: 'core' },
      { text: 'chown', tier: 'core' },
      { text: '所有者', tier: 'important' },
      { text: '可执行', tier: 'important' },
    ],
    phrases: [
      { pattern: '文件权限', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '修改权限', isRegex: false, weight: 1.0, bonus: 1.5 },
      { pattern: '查看.*权限', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '设置为.*可执行', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 5,
    tags: ['file-operation'],
    category: IntentCategory.EXECUTE,
  },

  FILE_DIFF: {
    name: 'FILE_DIFF',
    description: '文件内容比较',
    keywords: ['比较', '差异', 'diff', 'compare', '对比', '不同', '区别', '比较', '并排方式', '比较文件', '对比文件', '有什么不同', '文件差异', '对比两个'],
    weight: 0.95,
    cli: ['diff', 'cmp', 'comm'],
    params: {
      file1: {
        type: 'string',
        required: true,
        description: '第一个文件'
      },
      file2: {
        type: 'string',
        required: true,
        description: '第二个文件'
      },
      mode: {
        type: 'string',
        required: false,
        default: 'diff',
        description: '比较模式 (diff|sidebyside|stat)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'diff',
        args: ['-u', '${file1}', '${file2}'],
        condition: '${mode} in ["diff"]'
      },
      {
        type: 'exec',
        cli: 'diff',
        args: ['-y', '-W', '80', '${file1}', '${file2}'],
        condition: '${mode} in ["sidebyside"]'
      },
      {
        type: 'exec',
        cli: 'diff',
        args: ['--stat', '${file1}', '${file2}'],
        condition: '${mode} in ["stat"]'
      }
    ],
    weightedKeywords: [
      { text: '对比', tier: 'core' },
      { text: '差异', tier: 'core' },
      { text: 'diff', tier: 'core' },
      { text: '比较', tier: 'core' },
      { text: 'compare', tier: 'important' },
      { text: '变更', tier: 'important' },
      { text: '修改', tier: 'generic' },
      { text: '不同', tier: 'core' },
      { text: '区别', tier: 'core' },
    ],
    phrases: [
      { pattern: '文件差异', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '查看.*差异', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '比较.*和', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '对比.*和', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '并排.*比较', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '并排方式', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: '比较.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '对比.*文件', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '比较.*不同', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '比较.*区别', isRegex: true, weight: 1.0, bonus: 2.5 },
      { pattern: '对比.*不同', isRegex: true, weight: 1.0, bonus: 2.0 },
      { pattern: '有什么不同', isRegex: false, weight: 1.0, bonus: 2.5 },
      { pattern: '.*的差异', isRegex: true, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 4,
    tags: ['diff', 'vcs'],
    category: IntentCategory.QUERY,
  },

  DOCKER_BUILD: {
    name: 'DOCKER_BUILD',
    description: 'Docker镜像构建',
    keywords: ['docker', '构建镜像', 'build', 'dockerfile', '镜像构建', '容器构建'],
    weight: 0.95,
    cli: ['docker'],
    params: {
      tag: {
        type: 'string',
        required: false,
        default: 'latest',
        description: '镜像标签'
      },
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '构建上下文路径'
      },
      dockerfile: {
        type: 'string',
        required: false,
        default: 'Dockerfile',
        description: 'Dockerfile路径'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'docker',
        args: ['build', '-t', '${tag}', '-f', '${dockerfile}', '${path}']
      }
    ],
    weightedKeywords: [
      { text: 'docker', tier: 'core' },
      { text: '构建镜像', tier: 'core' },
      { text: 'build', tier: 'important' },
      { text: 'dockerfile', tier: 'important' },
    ],
    phrases: [
      { pattern: 'docker build', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '构建.*镜像', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '启动', strength: 'soft' },
      { text: '运行', strength: 'soft' },
    ],
    priority: 6,
    tags: ['docker', 'container'],
    category: IntentCategory.EXECUTE,
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
    const phrases: string[] = [];

    if (template.weightedKeywords) {
      for (const kw of template.weightedKeywords) {
        if (kw.tier === 'core') {
          coreKw.push(kw.text);
        } else if (kw.tier === 'important') {
          importantKw.push(kw.text);
        }
      }
    }

    if (template.phrases) {
      for (const phrase of template.phrases) {
        phrases.push(phrase.pattern);
      }
    }

    if (coreKw.length > 0) {
      lines.push(`  核心词: ${coreKw.join(', ')}`);
    }
    if (importantKw.length > 0) {
      lines.push(`  重要词: ${importantKw.join(', ')}`);
    }
    if (phrases.length > 0) {
      lines.push(`  短语: ${phrases.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
