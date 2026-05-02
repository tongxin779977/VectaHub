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
}

export const INTENT_TEMPLATES: Record<string, IntentTemplate> = {
  FILE_FIND: {
    name: 'FILE_FIND',
    description: '查找文件',
    keywords: ['找出', '查找', 'find', 'search', '文件', 'file'],
    weight: 0.9,
    cli: ['find', 'fd', 'locate'],
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
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', 'f', '-name', '${name:-*}']
      }
    ]
  },

  GIT_WORKFLOW: {
    name: 'GIT_WORKFLOW',
    description: 'Git 操作流程',
    keywords: ['提交', 'commit', '推送', 'push', '拉取', 'pull', 'git', 'add'],
    weight: 1.0,
    cli: ['git'],
    params: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型 (add|commit|push|pull|status)'
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
