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
  IMAGE_COMPRESS: {
    name: 'IMAGE_COMPRESS',
    description: '压缩图片文件',
    keywords: ['压缩', '缩小', 'resize', 'compress', '图片', 'image'],
    weight: 0.9,
    cli: ['convert', 'sharp', 'cwebp', 'magick'],
    params: {
      pattern: {
        type: 'string',
        required: false,
        default: '*.{jpg,jpeg,png}',
        description: '文件匹配模式'
      },
      quality: {
        type: 'number',
        required: false,
        default: 50,
        description: '压缩质量 (1-100)'
      },
      recursive: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否递归子目录'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'find',
        args: ['.', '-type', 'f', '-name', '${pattern}'],
        outputVar: 'imageFiles'
      },
      {
        type: 'for_each',
        items: 'imageFiles',
        body: [
          {
            type: 'exec',
            cli: 'convert',
            args: ['${item}', '-resize', '${quality}%', '${item}']
          }
        ]
      }
    ]
  },

  FILE_FIND: {
    name: 'FILE_FIND',
    description: '查找文件',
    keywords: ['找出', '查找', 'find', 'search', '文件', 'file'],
    weight: 0.85,
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
      },
      size: {
        type: 'string',
        required: false,
        description: '文件大小 (e.g. "+100M")'
      },
      type: {
        type: 'string',
        required: false,
        default: 'f',
        description: '文件类型 (f=文件, d=目录)'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'find',
        args: ['${path}', '-type', '${type}', '-name', '${name:-*}', '-size', '${size:-}']
      }
    ]
  },

  GIT_WORKFLOW: {
    name: 'GIT_WORKFLOW',
    description: 'Git 操作流程',
    keywords: ['提交', 'commit', '推送', 'push', '拉取', 'pull', 'git'],
    weight: 0.95,
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
      },
      force: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否强制执行'
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
        args: ['push', '${force ? "--force" : ""}', 'origin', '${branch:-main}'],
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

  BATCH_RENAME: {
    name: 'BATCH_RENAME',
    description: '批量重命名文件',
    keywords: ['重命名', '改名', 'rename', '批量', 'batch', '改后缀'],
    weight: 0.85,
    cli: ['rename', 'mmv', 'mv'],
    params: {
      from: {
        type: 'string',
        required: true,
        description: '原文件名模式'
      },
      to: {
        type: 'string',
        required: true,
        description: '目标文件名模式'
      },
      pattern: {
        type: 'string',
        required: false,
        description: '文件匹配模式'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'find',
        args: ['.', '-name', '${pattern:-*}'],
        outputVar: 'files'
      },
      {
        type: 'for_each',
        items: 'files',
        body: [
          {
            type: 'exec',
            cli: 'mv',
            args: ['${item}', '${item/from/to}']
          }
        ]
      }
    ]
  },

  BACKUP: {
    name: 'BACKUP',
    description: '备份文件或目录',
    keywords: ['备份', 'backup', '拷贝', 'copy', '复制', 'cp'],
    weight: 0.8,
    cli: ['rsync', 'cp', 'tar'],
    params: {
      source: {
        type: 'string',
        required: true,
        description: '源路径'
      },
      destination: {
        type: 'string',
        required: true,
        description: '目标路径'
      },
      compress: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否压缩'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'tar',
        args: ['-czf', '${destination}/backup_$(date +%Y%m%d_%H%M%S).tar.gz', '${source}'],
        condition: '${compress}'
      },
      {
        type: 'exec',
        cli: 'cp',
        args: ['-r', '${source}', '${destination}'],
        condition: '!${compress}'
      }
    ]
  },

  CI_PIPELINE: {
    name: 'CI_PIPELINE',
    description: 'CI/CD 流程',
    keywords: ['ci', 'cd', '构建', 'build', '测试', 'test', '部署', 'deploy'],
    weight: 0.75,
    cli: ['npm', 'yarn', 'docker'],
    params: {
      steps: {
        type: 'array',
        required: false,
        default: ['install', 'test', 'build'],
        description: '流程步骤'
      },
      env: {
        type: 'string',
        required: false,
        default: 'production',
        description: '环境'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'npm',
        args: ['install'],
        condition: '"install" in ${steps}'
      },
      {
        type: 'exec',
        cli: 'npm',
        args: ['test'],
        condition: '"test" in ${steps}'
      },
      {
        type: 'exec',
        cli: 'npm',
        args: ['run', 'build'],
        condition: '"build" in ${steps}'
      }
    ]
  },

  INSTALL_PACKAGE: {
    name: 'INSTALL_PACKAGE',
    description: '安装依赖包',
    keywords: ['安装', 'install', '添加', 'add', '依赖', 'package', 'library'],
    weight: 0.9,
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
    keywords: ['创建', 'create', '新建', '添加', '文件', 'file', 'component', '组件'],
    weight: 0.85,
    cli: ['touch', 'cat', 'mkdir'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件路径'
      },
      content: {
        type: 'string',
        required: false,
        description: '文件内容'
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
        args: ['-p', '$(dirname ${path})'],
        condition: '!${directory}'
      },
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
        condition: '!${directory} && !${content}'
      },
      {
        type: 'exec',
        cli: 'cat',
        args: ['<<', "'EOF'", '>', '${path}', '\\n', '${content}', '\\n', 'EOF'],
        condition: '!${directory} && ${content}'
      }
    ]
  },

  MODIFY_FILE: {
    name: 'MODIFY_FILE',
    description: '修改文件',
    keywords: ['修改', '改动', '更新', 'upgrade', 'file', '文件', '代码', 'code'],
    weight: 0.85,
    cli: ['sed', 'mv'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件路径'
      },
      operation: {
        type: 'string',
        required: true,
        description: '操作类型 (rename|replace|append)'
      },
      from: {
        type: 'string',
        required: false,
        description: '原内容'
      },
      to: {
        type: 'string',
        required: false,
        description: '新内容'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'mv',
        args: ['${path}', '${to}'],
        condition: '${operation} == "rename"'
      },
      {
        type: 'exec',
        cli: 'sed',
        args: ['-i', "'s/${from}/${to}/g'", '${path}'],
        condition: '${operation} == "replace"'
      }
    ]
  },

  DELETE_FILE: {
    name: 'DELETE_FILE',
    description: '删除文件',
    keywords: ['删除', '删掉', '移除', 'delete', 'remove', 'rm', 'file', '文件'],
    weight: 0.8,
    cli: ['rm'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件路径'
      },
      recursive: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否递归删除'
      },
      force: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否强制删除'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'rm',
        args: ['${recursive ? "-r" : ""}', '${force ? "-f" : ""}', '${path}']
      }
    ]
  },

  RUN_SCRIPT: {
    name: 'RUN_SCRIPT',
    description: '运行脚本',
    keywords: ['运行', '执行', '跑', 'run', 'script', '脚本', 'build', 'test', 'start', 'dev'],
    weight: 0.9,
    cli: ['npm', 'yarn', 'node', 'python', 'cargo'],
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

  DOCKER_MANAGE: {
    name: 'DOCKER_MANAGE',
    description: 'Docker 容器管理',
    keywords: ['docker', '容器', 'container', 'image', '镜像', 'build', 'run', 'stop'],
    weight: 0.85,
    cli: ['docker'],
    params: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型 (build|run|stop|rm|list)'
      },
      image: {
        type: 'string',
        required: false,
        description: '镜像名'
      },
      tag: {
        type: 'string',
        required: false,
        default: 'latest',
        description: '标签'
      },
      container: {
        type: 'string',
        required: false,
        description: '容器名'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'docker',
        args: ['build', '-t', '${image}:${tag}', '.'],
        condition: '${action} == "build"'
      },
      {
        type: 'exec',
        cli: 'docker',
        args: ['run', '-d', '--name', '${container}', '${image}:${tag}'],
        condition: '${action} == "run"'
      },
      {
        type: 'exec',
        cli: 'docker',
        args: ['stop', '${container}'],
        condition: '${action} == "stop"'
      },
      {
        type: 'exec',
        cli: 'docker',
        args: ['ps', '-a'],
        condition: '${action} == "list"'
      }
    ]
  },

  QUERY_INFO: {
    name: 'QUERY_INFO',
    description: '查询信息',
    keywords: ['查看', '看看', '显示', '列出', 'view', 'list', 'show', '结构', '目录', '内容'],
    weight: 0.8,
    cli: ['ls', 'tree', 'cat', 'grep', 'find'],
    params: {
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '路径'
      },
      pattern: {
        type: 'string',
        required: false,
        description: '搜索模式'
      },
      recursive: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否递归'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'ls',
        args: ['-la', '${path}'],
        condition: '!${recursive} && !${pattern}'
      },
      {
        type: 'exec',
        cli: 'tree',
        args: ['${path}'],
        condition: '${recursive} && !${pattern}'
      },
      {
        type: 'exec',
        cli: 'grep',
        args: ['-r', '${pattern}', '${path}'],
        condition: '${pattern}'
      }
    ]
  },

  DEBUG: {
    name: 'DEBUG',
    description: '调试',
    keywords: ['调试', '排查', 'debug', 'fix', 'repair', '修复', '为什么', 'why'],
    weight: 0.75,
    cli: ['node', 'python', 'npm'],
    params: {
      file: {
        type: 'string',
        required: false,
        description: '文件路径'
      },
      script: {
        type: 'string',
        required: false,
        default: 'test',
        description: '脚本'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'node',
        args: ['--inspect', '${file}'],
        condition: '${file}'
      },
      {
        type: 'exec',
        cli: 'npm',
        args: ['run', '${script}'],
        condition: '!${file}'
      }
    ]
  },

  REFACTOR: {
    name: 'REFACTOR',
    description: '重构',
    keywords: ['重构', 'refactor', '优化', 'optimize', '改进', 'improve'],
    weight: 0.7,
    cli: ['sed', 'eslint', 'prettier'],
    params: {
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '路径'
      },
      action: {
        type: 'string',
        required: false,
        default: 'format',
        description: '操作类型'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'eslint',
        args: ['--fix', '${path}'],
        condition: '${action} in ["lint", "format"]'
      },
      {
        type: 'exec',
        cli: 'prettier',
        args: ['--write', '${path}'],
        condition: '${action} == "format"'
      }
    ]
  },

  GENERATE_TEST: {
    name: 'GENERATE_TEST',
    description: '生成测试',
    keywords: ['生成', '编写', '写', 'generate', 'test', '测试'],
    weight: 0.75,
    cli: ['npm', 'yarn', 'jest', 'vitest', 'pytest'],
    params: {
      file: {
        type: 'string',
        required: true,
        description: '源文件路径'
      },
      testRunner: {
        type: 'string',
        required: false,
        default: 'vitest',
        description: '测试运行器'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: '${testRunner}',
        args: ['generate', '${file}']
      }
    ]
  },

  PROCESS_KILL: {
    name: 'PROCESS_KILL',
    description: '终止进程',
    keywords: ['杀掉', 'kill', '停止', 'stop', '进程', 'process', 'pkill'],
    weight: 0.8,
    cli: ['kill', 'pkill'],
    params: {
      name: {
        type: 'string',
        required: false,
        description: '进程名'
      },
      pid: {
        type: 'string',
        required: false,
        description: '进程 ID'
      },
      force: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否强制'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'pkill',
        args: ['${force ? "-9" : ""}', '${name}'],
        condition: '${name}'
      },
      {
        type: 'exec',
        cli: 'kill',
        args: ['${force ? "-9" : ""}', '${pid}'],
        condition: '${pid}'
      }
    ]
  },

  SYSTEM_INFO: {
    name: 'SYSTEM_INFO',
    description: '查看系统信息',
    keywords: ['系统', 'system', '信息', 'info', '磁盘', 'disk', '内存', 'memory', 'cpu'],
    weight: 0.75,
    cli: ['df', 'du', 'free', 'top', 'uname'],
    params: {
      type: {
        type: 'string',
        required: false,
        default: 'disk',
        description: '信息类型 (disk|memory|cpu|all)'
      },
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
        cli: 'df',
        args: ['-h'],
        condition: '${type} == "disk"'
      },
      {
        type: 'exec',
        cli: 'du',
        args: ['-sh', '${path}'],
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

  NETWORK_CHECK: {
    name: 'NETWORK_CHECK',
    description: '网络检查',
    keywords: ['网络', 'network', '检查', 'check', 'ping', 'curl', 'wget', '连接', 'connect'],
    weight: 0.7,
    cli: ['ping', 'curl', 'wget'],
    params: {
      host: {
        type: 'string',
        required: true,
        description: '主机名或 IP'
      },
      port: {
        type: 'number',
        required: false,
        description: '端口'
      },
      checkUrl: {
        type: 'string',
        required: false,
        description: 'URL'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'ping',
        args: ['-c', '4', '${host}'],
        condition: '${host} && !${checkUrl}'
      },
      {
        type: 'exec',
        cli: 'curl',
        args: ['-I', '${checkUrl}'],
        condition: '${checkUrl}'
      }
    ]
  },

  PROCESS_LIST: {
    name: 'PROCESS_LIST',
    description: '查看进程列表',
    keywords: ['进程', 'process', '列表', 'list', 'ps', 'top'],
    weight: 0.7,
    cli: ['ps', 'top'],
    params: {
      filter: {
        type: 'string',
        required: false,
        description: '过滤条件'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'ps',
        args: ['aux'],
        condition: '!${filter}'
      },
      {
        type: 'exec',
        cli: 'ps',
        args: ['aux', '|', 'grep', '${filter}'],
        condition: '${filter}'
      }
    ]
  },

  ENV_SETUP: {
    name: 'ENV_SETUP',
    description: '环境配置',
    keywords: ['环境', 'env', '配置', 'config', 'setup', 'export', 'source'],
    weight: 0.7,
    cli: ['export', 'source'],
    params: {
      key: {
        type: 'string',
        required: false,
        description: '环境变量名'
      },
      value: {
        type: 'string',
        required: false,
        description: '环境变量值'
      },
      file: {
        type: 'string',
        required: false,
        description: '配置文件'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'export',
        args: ['${key}=${value}'],
        condition: '${key} && ${value}'
      },
      {
        type: 'exec',
        cli: 'source',
        args: ['${file}'],
        condition: '${file}'
      }
    ]
  },

  FILE_PERMISSION: {
    name: 'FILE_PERMISSION',
    description: '权限管理',
    keywords: ['权限', 'permission', 'chmod', 'chown', '修改'],
    weight: 0.75,
    cli: ['chmod', 'chown'],
    params: {
      path: {
        type: 'string',
        required: true,
        description: '文件路径'
      },
      mode: {
        type: 'string',
        required: false,
        description: '权限模式 (如 755)'
      },
      owner: {
        type: 'string',
        required: false,
        description: '所有者'
      },
      recursive: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否递归'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'chmod',
        args: ['${recursive ? "-R" : ""}', '${mode}', '${path}'],
        condition: '${mode}'
      },
      {
        type: 'exec',
        cli: 'chown',
        args: ['${recursive ? "-R" : ""}', '${owner}', '${path}'],
        condition: '${owner}'
      }
    ]
  },

  ARCHIVE: {
    name: 'ARCHIVE',
    description: '归档压缩',
    keywords: ['压缩', '归档', 'archive', 'tar', 'zip', 'gz', '打包'],
    weight: 0.85,
    cli: ['tar', 'zip', 'gzip'],
    params: {
      source: {
        type: 'string',
        required: true,
        description: '源文件/目录'
      },
      destination: {
        type: 'string',
        required: false,
        description: '目标文件名'
      },
      format: {
        type: 'string',
        required: false,
        default: 'tar.gz',
        description: '压缩格式'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'tar',
        args: ['-czf', '${destination:-${source}.tar.gz}', '${source}'],
        condition: '${format} == "tar.gz"'
      },
      {
        type: 'exec',
        cli: 'zip',
        args: ['-r', '${destination:-${source}.zip}', '${source}'],
        condition: '${format} == "zip"'
      }
    ]
  },

  EXTRACT: {
    name: 'EXTRACT',
    description: '解压文件',
    keywords: ['解压', 'extract', 'unzip', 'untar', 'tar'],
    weight: 0.85,
    cli: ['tar', 'unzip', 'gunzip'],
    params: {
      archive: {
        type: 'string',
        required: true,
        description: '归档文件'
      },
      destination: {
        type: 'string',
        required: false,
        default: '.',
        description: '目标目录'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'tar',
        args: ['-xzf', '${archive}', '-C', '${destination}'],
        condition: '${archive}.endsWith(".tar.gz") || ${archive}.endsWith(".tgz")'
      },
      {
        type: 'exec',
        cli: 'unzip',
        args: ['${archive}', '-d', '${destination}'],
        condition: '${archive}.endsWith(".zip")'
      }
    ]
  },

  SEARCH_REPLACE: {
    name: 'SEARCH_REPLACE',
    description: '搜索替换',
    keywords: ['搜索', 'search', '替换', 'replace', 'sed', 'grep', 'find'],
    weight: 0.8,
    cli: ['sed', 'grep', 'find'],
    params: {
      find: {
        type: 'string',
        required: true,
        description: '要查找的内容'
      },
      replace: {
        type: 'string',
        required: true,
        description: '替换为'
      },
      path: {
        type: 'string',
        required: false,
        default: '.',
        description: '路径'
      },
      pattern: {
        type: 'string',
        required: false,
        default: '*',
        description: '文件匹配模式'
      },
      recursive: {
        type: 'boolean',
        required: false,
        default: true,
        description: '是否递归'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'grep',
        args: ['-rl', '${find}', '${path}'],
        outputVar: 'matchingFiles'
      },
      {
        type: 'for_each',
        items: 'matchingFiles',
        body: [
          {
            type: 'exec',
            cli: 'sed',
            args: ['-i', "'s/${find}/${replace}/g'", '${item}']
          }
        ]
      }
    ]
  },

  GIT_BRANCH: {
    name: 'GIT_BRANCH',
    description: '分支操作',
    keywords: ['分支', 'branch', 'git', 'checkout', 'create', 'delete'],
    weight: 0.85,
    cli: ['git'],
    params: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型 (create|delete|checkout|list)'
      },
      branch: {
        type: 'string',
        required: false,
        description: '分支名'
      },
      from: {
        type: 'string',
        required: false,
        default: 'main',
        description: '源分支'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'git',
        args: ['checkout', '-b', '${branch}', '${from}'],
        condition: '${action} == "create"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['checkout', '${branch}'],
        condition: '${action} == "checkout"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['branch', '-d', '${branch}'],
        condition: '${action} == "delete"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['branch', '-a'],
        condition: '${action} == "list"'
      }
    ]
  },

  GIT_STASH: {
    name: 'GIT_STASH',
    description: 'Git 暂存',
    keywords: ['暂存', 'stash', 'git', '保存', '恢复'],
    weight: 0.8,
    cli: ['git'],
    params: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型 (save|pop|list|clear)'
      },
      message: {
        type: 'string',
        required: false,
        description: '暂存信息'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'git',
        args: ['stash', 'save', '${message}'],
        condition: '${action} == "save"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['stash', 'pop'],
        condition: '${action} == "pop"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['stash', 'list'],
        condition: '${action} == "list"'
      },
      {
        type: 'exec',
        cli: 'git',
        args: ['stash', 'clear'],
        condition: '${action} == "clear"'
      }
    ]
  },

  DOCKER_BUILD: {
    name: 'DOCKER_BUILD',
    description: '构建 Docker 镜像',
    keywords: ['docker', '构建', 'build', 'image', '镜像'],
    weight: 0.85,
    cli: ['docker'],
    params: {
      image: {
        type: 'string',
        required: true,
        description: '镜像名'
      },
      tag: {
        type: 'string',
        required: false,
        default: 'latest',
        description: '标签'
      },
      dockerfile: {
        type: 'string',
        required: false,
        default: 'Dockerfile',
        description: 'Dockerfile 路径'
      },
      context: {
        type: 'string',
        required: false,
        default: '.',
        description: '构建上下文'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'docker',
        args: ['build', '-f', '${dockerfile}', '-t', '${image}:${tag}', '${context}']
      }
    ]
  },

  DOCKER_RUN: {
    name: 'DOCKER_RUN',
    description: '运行 Docker 容器',
    keywords: ['docker', '运行', 'run', 'container', '容器'],
    weight: 0.85,
    cli: ['docker'],
    params: {
      image: {
        type: 'string',
        required: true,
        description: '镜像名'
      },
      tag: {
        type: 'string',
        required: false,
        default: 'latest',
        description: '标签'
      },
      name: {
        type: 'string',
        required: false,
        description: '容器名'
      },
      ports: {
        type: 'array',
        required: false,
        description: '端口映射'
      },
      detached: {
        type: 'boolean',
        required: false,
        default: true,
        description: '是否后台运行'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'docker',
        args: [
          'run',
          '${detached ? "-d" : ""}',
          '${name ? "--name " + name : ""}',
          '${ports ? ports.map(p => "-p " + p).join(" ") : ""}',
          '${image}:${tag}'
        ].filter(Boolean)
      }
    ]
  },

  LOG_VIEW: {
    name: 'LOG_VIEW',
    description: '查看日志',
    keywords: ['日志', 'log', '查看', 'view', 'tail', 'cat', 'less', 'history'],
    weight: 0.75,
    cli: ['tail', 'cat', 'less'],
    params: {
      file: {
        type: 'string',
        required: true,
        description: '日志文件路径'
      },
      lines: {
        type: 'number',
        required: false,
        default: 100,
        description: '显示行数'
      },
      follow: {
        type: 'boolean',
        required: false,
        default: false,
        description: '是否持续监控'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'tail',
        args: ['${follow ? "-f" : ""}', '-n', '${lines}', '${file}']
      }
    ]
  },

  CRON_JOB: {
    name: 'CRON_JOB',
    description: '定时任务',
    keywords: ['定时', 'cron', 'schedule', '任务', 'job', 'crontab'],
    weight: 0.65,
    cli: ['crontab'],
    params: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型 (add|list|edit|remove)'
      },
      schedule: {
        type: 'string',
        required: false,
        description: '时间表达式'
      },
      command: {
        type: 'string',
        required: false,
        description: '要执行的命令'
      }
    },
    steps: [
      {
        type: 'exec',
        cli: 'crontab',
        args: ['-e'],
        condition: '${action} in ["add", "edit", "remove"]'
      },
      {
        type: 'exec',
        cli: 'crontab',
        args: ['-l'],
        condition: '${action} == "list"'
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
