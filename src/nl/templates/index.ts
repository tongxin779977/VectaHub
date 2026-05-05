import type { IntentName } from '../../types/index.js';
import type { WeightedKeyword, CompositePhrase, NegativeKeyword } from '../types.js';

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
    keywords: ['找出', 'find', 'search', '找出所有', '找出大于', '搜索最近', '在docs', '搜索twitter', '所有ts'],
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
      { text: '搜索', tier: 'core' },
      { text: 'find', tier: 'core' },
      { text: 'search', tier: 'core' },
      { text: '文件', tier: 'generic' },
    ],
    phrases: [
      { pattern: '查找.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '搜索.*修改', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '目录下查找', isRegex: false, weight: 1.0, bonus: 1.2 },
    ],
    negativeKeywords: [
      { text: '创建', strength: 'soft' },
      { text: '新建', strength: 'soft' },
    ],
    priority: 5,
    tags: ['file-operation'],
  },

  GIT_WORKFLOW: {
    name: 'GIT_WORKFLOW',
    description: 'Git 操作流程',
    keywords: ['提交', 'commit', '推送', 'push', '拉取', 'pull', 'git', 'add', '分支', 'branch', '标签', 'tag', '暂存', 'stash', '变基', 'rebase', '合并', 'merge', '历史', 'history', '改动', '工作区', 'repo'],
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
      { text: 'git', tier: 'generic' },
      { text: '代码', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 2,
    tags: ['git', 'vcs'],
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
      { text: '运行', tier: 'important' },
      { text: 'run', tier: 'important' },
      { text: '脚本', tier: 'important' },
      { text: 'script', tier: 'important' },
      { text: '启动', tier: 'generic' },
      { text: '测试', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '安装', strength: 'soft' },
    ],
    priority: 3,
    tags: ['script', 'build'],
  },

  SYSTEM_INFO: {
    name: 'SYSTEM_INFO',
    description: '查看系统信息',
    keywords: ['系统信息', 'system', 'info', '磁盘使用情况', 'disk', '系统查询', '系统版本', '操作系统', '详细信息', 'uname', '磁盘使用', '帮我看看磁盘', '内存使用', 'cpu 信息', '内存占用', '核心数', '型号', 'cpu信息'],
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
    ],
    negativeKeywords: [
      { text: '监控', strength: 'soft' },
    ],
    priority: 5,
    tags: ['system'],
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
      { text: '查看', tier: 'core' },
      { text: '列出', tier: 'core' },
      { text: 'list', tier: 'core' },
      { text: '目录', tier: 'important' },
      { text: '内容', tier: 'important' },
      { text: '文件', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 1,
    tags: ['query'],
  },

  INSTALL_PACKAGE: {
    name: 'INSTALL_PACKAGE',
    description: '安装依赖包',
    keywords: ['安装', 'install', '添加', 'add', '依赖', 'package', 'npm包'],
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
      { text: 'npm', tier: 'generic' },
      { text: 'yarn', tier: 'generic' },
      { text: 'pnpm', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 4,
    tags: ['package'],
  },

  CREATE_FILE: {
    name: 'CREATE_FILE',
    description: '创建新文件',
    keywords: ['创建', 'create', '新建', '添加', 'touch', '目录', '文件夹', '创建文件', '新建文件', '创建目录', '新建目录', '添加文件', '创建文件夹', '新建文件夹', '空的', '需要一个', '新文件', '添加一个'],
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
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '修改', strength: 'soft' },
    ],
    priority: 3,
    tags: ['file-operation'],
  },

  FETCH_HOT_NEWS: {
    name: 'FETCH_HOT_NEWS',
    description: '获取热榜信息',
    keywords: ['热榜', 'hot', 'trending', '排行榜', '热搜', '看看今天', 'github trending', 'githut'],
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
      { text: '热搜', tier: 'important' },
      { text: '趋势', tier: 'important' },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 1,
    tags: ['social', 'news'],
  },

  SOCIAL_MEDIA_SEARCH: {
    name: 'SOCIAL_MEDIA_SEARCH',
    description: '社交媒体搜索',
    keywords: ['twitter', '微博', '社交媒体', 'facebook', '小红书', 'instagram', 'tiktok', '微博热搜', '小红书上', 'twitter上', '微博上'],
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
      { text: '微博', tier: 'generic' },
      { text: 'twitter', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 1,
    tags: ['social'],
  },

  DATA_SCRAPING: {
    name: 'DATA_SCRAPING',
    description: '网页数据爬取',
    keywords: ['爬取', 'scrape', '抓取', '采集', '网页数据', '网页内容', '提取', 'extract', 'example.com', 'from 网页'],
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
      { text: 'scrape', tier: 'core' },
      { text: '爬虫', tier: 'important' },
      { text: 'crawler', tier: 'important' },
      { text: '数据', tier: 'generic' },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 1,
    tags: ['scraping'],
  },

  CONTENT_SUMMARY: {
    name: 'CONTENT_SUMMARY',
    description: '内容摘要',
    keywords: ['摘要', 'summary', '汇总', '总结', '总结一下', '帮我总结', '摘要内容'],
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
      { text: '概括', tier: 'important' },
      { text: '归纳', tier: 'important' },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 1,
    tags: ['content'],
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
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
      { text: '创建', strength: 'soft' },
    ],
    priority: 4,
    tags: ['file-operation'],
  },

  NETWORK_INFO: {
    name: 'NETWORK_INFO',
    description: '网络信息查询',
    keywords: ['网络', '状态', 'ifconfig', 'ping', 'dns', 'ip', '端口', '连接', 'network', '连通性', 'dns 配置', 'ip 地址', '本机 ip', 'ip address'],
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
      { text: '端口', tier: 'important' },
      { text: 'port', tier: 'important' },
      { text: 'dns', tier: 'important' },
    ],
    negativeKeywords: [
      { text: '查找文件', strength: 'hard' },
    ],
    priority: 3,
    tags: ['network'],
  },

  SYSTEM_MONITOR: {
    name: 'SYSTEM_MONITOR',
    description: '系统状态监控',
    keywords: ['系统', '监控', 'top', 'ps', 'cpu', '负载', 'load', '进程数', '使用率', '占用', '资源', 'node 进程', '运行', 'cpu 使用率', '占用内存最多', '有哪些 node'],
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
      { text: '负载', tier: 'important' },
      { text: '进程', tier: 'important' },
      { text: '系统', tier: 'generic' },
    ],
    phrases: [
      { pattern: '监控.*进程', isRegex: true, weight: 1.0, bonus: 1.5 },
      { pattern: '内存占用', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '磁盘空间', isRegex: false, weight: 1.0, bonus: 2.0 },
    ],
    negativeKeywords: [
      { text: '查看系统', strength: 'hard' },
      { text: '系统信息', strength: 'hard' },
    ],
    priority: 3,
    tags: ['system'],
  },

  FILE_PERMISSION: {
    name: 'FILE_PERMISSION',
    description: '文件权限管理',
    keywords: ['权限', 'chmod', 'chown', 'permission', '所有者', '可执行', '修改权限', '设置权限', '添加执行', '执行权限', '改为777', '改为755', '权限改为', '设置权限', '755', '777', 'root', '+x', 'rwx', '设置为可执行', '权限管理', '加上权限', '加上可执行', '脚本加上'],
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
    ],
    phrases: [
      { pattern: '文件权限', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '修改权限', isRegex: false, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 5,
    tags: ['file-operation'],
  },

  FILE_DIFF: {
    name: 'FILE_DIFF',
    description: '文件内容比较',
    keywords: ['比较', '差异', 'diff', 'compare', '对比', '不同', '区别', '和', '比较'],
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
      { text: '比较', tier: 'important' },
      { text: 'compare', tier: 'important' },
      { text: '变更', tier: 'important' },
      { text: '修改', tier: 'generic' },
    ],
    phrases: [
      { pattern: '文件差异', isRegex: false, weight: 1.0, bonus: 2.0 },
      { pattern: '查看.*差异', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '查找', strength: 'soft' },
    ],
    priority: 4,
    tags: ['diff', 'vcs'],
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
  }
};

export function getIntentTemplate(name: string): IntentTemplate | undefined {
  return INTENT_TEMPLATES[name];
}

export function getAllIntentNames(): string[] {
  return Object.keys(INTENT_TEMPLATES);
}
