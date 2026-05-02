import type { IntentPattern } from '../intent-matcher.js';

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
    keywords: ['找出', '查找', 'find', 'search', '文件', 'file', '搜索'],
    weight: 0.9,
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
    ]
  },

  GIT_WORKFLOW: {
    name: 'GIT_WORKFLOW',
    description: 'Git 操作流程',
    keywords: ['提交', 'commit', '推送', 'push', '拉取', 'pull', 'git', 'add', '分支', 'branch', '标签', 'tag', '暂存', 'stash', '变基', 'rebase', '合并', 'merge', '日志', 'log', '历史', 'history'],
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
    ]
  },

  RUN_SCRIPT: {
    name: 'RUN_SCRIPT',
    description: '运行脚本',
    keywords: ['运行', '执行', '跑', 'run', 'script', '脚本', 'build', 'test', 'start', 'dev', '构建项目'],
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
    ]
  },

  SYSTEM_INFO: {
    name: 'SYSTEM_INFO',
    description: '查看系统信息',
    keywords: ['系统', 'system', '信息', 'info', '磁盘', 'disk', '内存', 'memory', 'cpu', '磁盘使用'],
    weight: 0.85,
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
    ]
  },

  QUERY_INFO: {
    name: 'QUERY_INFO',
    description: '查询信息',
    keywords: ['查看', '看看', '显示', '列出', 'view', 'list', 'show', '结构', '目录', '内容', 'ls'],
    weight: 0.85,
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
    ]
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
    ]
  },

  CREATE_FILE: {
    name: 'CREATE_FILE',
    description: '创建新文件',
    keywords: ['创建', 'create', '新建', '添加', '文件', 'file', 'touch'],
    weight: 0.85,
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
    ]
  },

  FETCH_HOT_NEWS: {
    name: 'FETCH_HOT_NEWS',
    description: '获取热榜信息',
    keywords: ['热榜', 'hot', 'trending', '排行榜'],
    weight: 0.85,
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
    ]
  },

  SOCIAL_MEDIA_SEARCH: {
    name: 'SOCIAL_MEDIA_SEARCH',
    description: '社交媒体搜索',
    keywords: ['搜索', 'search', '查找', 'find'],
    weight: 0.8,
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
    ]
  },

  DATA_SCRAPING: {
    name: 'DATA_SCRAPING',
    description: '网页数据爬取',
    keywords: ['爬取', 'scrape', '抓取', '采集'],
    weight: 0.85,
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
    ]
  },

  CONTENT_SUMMARY: {
    name: 'CONTENT_SUMMARY',
    description: '内容摘要',
    keywords: ['摘要', 'summary', '汇总', '总结'],
    weight: 0.8,
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
    ]
  },

  FILE_ARCHIVE: {
    name: 'FILE_ARCHIVE',
    description: '文件压缩解压',
    keywords: ['压缩', '解压', 'zip', 'tar', 'gzip', '打包', 'archive', 'unzip'],
    weight: 0.85,
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
    ]
  },

  NETWORK_INFO: {
    name: 'NETWORK_INFO',
    description: '网络信息查询',
    keywords: ['网络', '状态', 'ifconfig', 'ping', 'dns', 'ip', '端口', '连接', 'network', '连通性'],
    weight: 0.85,
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
    ]
  },

  SYSTEM_MONITOR: {
    name: 'SYSTEM_MONITOR',
    description: '系统状态监控',
    keywords: ['系统', '监控', 'top', 'ps', 'df', 'cpu', '负载', 'load', '进程', '进程数', 'memory'],
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
    ]
  },

  FILE_PERMISSION: {
    name: 'FILE_PERMISSION',
    description: '文件权限管理',
    keywords: ['权限', '授权', '拒绝', 'chmod', 'chown', 'rwx', '读写', '执行', 'permission', 'access'],
    weight: 0.85,
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
    ]
  },

  FILE_DIFF: {
    name: 'FILE_DIFF',
    description: '文件内容比较',
    keywords: ['比较', '差异', 'diff', 'compare', '对比', '不同', '区别'],
    weight: 0.85,
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
    ]
  }
};

export function getIntentTemplate(name: string): IntentTemplate | undefined {
  return INTENT_TEMPLATES[name];
}

export function getAllIntentNames(): string[] {
  return Object.keys(INTENT_TEMPLATES);
}

export function convertTemplateToPattern(template: IntentTemplate): IntentPattern {
  return {
    intent: template.name as any,
    keywords: template.keywords,
    weight: template.weight
  };
}
