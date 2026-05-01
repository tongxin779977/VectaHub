import type { IntentName } from '../types/index.js';
import type { IntentTemplate } from './templates/index.js';
import { getIntentTemplate } from './templates/index.js';

export interface ExtractedParams {
  [key: string]: unknown;
}

export interface ParamExtractor {
  extract(input: string, intent: IntentName): ExtractedParams;
}

export function createParamExtractor(): ParamExtractor {
  function extract(input: string, intent: IntentName): ExtractedParams {
    const template = getIntentTemplate(intent);
    const params: ExtractedParams = {};

    if (!template) {
      return params;
    }

    for (const [paramName, paramDef] of Object.entries(template.params)) {
      const extractedValue = extractParamValue(input, paramName, paramDef);
      if (extractedValue !== undefined) {
        params[paramName] = extractedValue;
      } else if (paramDef.default !== undefined) {
        params[paramName] = paramDef.default;
      }
    }

    return params;
  }

  function extractParamValue(input: string, paramName: string, paramDef: {
    type: string;
    required: boolean;
    default?: unknown;
    description: string;
  }): unknown {
    const lowerInput = input.toLowerCase();

    switch (paramName) {
      case 'path':
      case 'source':
      case 'destination':
      case 'file':
      case 'archive':
        return extractFilePath(input);

      case 'pattern':
        return extractPattern(input);

      case 'quality':
      case 'port':
      case 'lines':
        return extractNumber(input);

      case 'recursive':
      case 'force':
      case 'dev':
      case 'detached':
      case 'directory':
      case 'compress':
        return extractBoolean(input, paramName);

      case 'message':
        return extractMessage(input);

      case 'branch':
      case 'from':
      case 'to':
        return extractBranchName(input);

      case 'action':
        return extractAction(input);

      case 'package':
        return extractPackageName(input);

      case 'script':
        return extractScriptName(input);

      case 'image':
      case 'container':
      case 'name':
        return extractName(input);

      case 'tag':
        return extractTag(input);

      case 'dockerfile':
      case 'context':
        return extractFilePath(input);

      case 'schedule':
        return extractSchedule(input);

      case 'command':
        return extractCommand(input);

      case 'env':
      case 'type':
        return extractEnv(input);

      case 'find':
      case 'replace':
        return extractFindReplace(input, paramName);

      case 'host':
      case 'checkUrl':
        return extractUrl(input);

      case 'owner':
      case 'format':
      case 'runner':
      case 'testRunner':
        return extractSimpleParam(input, paramName);

      case 'ports':
        return extractPorts(input);

      case 'steps':
        return extractSteps(input);

      case 'mode':
        return extractMode(input);

      case 'filter':
        return extractFilter(input);

      case 'key':
      case 'value':
        return extractKeyValue(input, paramName);

      default:
        return undefined;
    }
  }

  function extractFilePath(input: string): string | undefined {
    const filePathPatterns = [
      /['"]([^'" ]+\.(ts|tsx|js|jsx|py|go|rs|json|yml|yaml|md|txt))['" ]?/i,
      /(?:\.\/|\/)[a-zA-Z0-9_\-./]+/i,
      /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|py|go|rs|json|yml|yaml|md|txt))/i,
    ];

    for (const pattern of filePathPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return undefined;
  }

  function extractPattern(input: string): string | undefined {
    const patterns = [
      /['"](\*\.[a-z0-9]+)['"]?/i,
      /(['"][^'"]+)['"]?/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  function extractNumber(input: string): number | undefined {
    const match = input.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  function extractBoolean(input: string, paramName: string): boolean | undefined {
    const lowerInput = input.toLowerCase();
    const truePatterns = [
      new RegExp(`(?:-r|--recursive|recursive|递归)`),
      new RegExp(`(?:-f|--force|force|强制)`),
      new RegExp(`(?:--dev|dev|开发)`),
      new RegExp(`(?:-d|--detached|detached|后台)`),
      new RegExp(`(?:-R|--directory|directory|目录)`),
      new RegExp(`(?:compress|压缩|zip)`),
    ];

    const falsePatterns = [
      new RegExp(`(?:not recursive|不递归|non-recursive)`),
    ];

    for (const pattern of truePatterns) {
      if (pattern.test(lowerInput)) {
        return true;
      }
    }

    for (const pattern of falsePatterns) {
      if (pattern.test(lowerInput)) {
        return false;
      }
    }

    return undefined;
  }

  function extractMessage(input: string): string | undefined {
    const messagePattern = /['"]([^'"]+)['"]/;
    const match = input.match(messagePattern);
    if (match) {
      return match[1];
    }

    const commitPattern = /提交(?:信息|消息)?['"]?([^'"]+)['"]?/i;
    const commitMatch = input.match(commitPattern);
    if (commitMatch) {
      return commitMatch[1];
    }

    return undefined;
  }

  function extractBranchName(input: string): string | undefined {
    const branchPatterns = [
      /(?:branch|checkout|切换|切换到|from|into)\s+(['"]?)([a-zA-Z0-9_\-/]+)\1/i,
      /(?:分支|切换)\s+['"]?([a-zA-Z0-9_\-/]+)['"]?/i,
    ];

    for (const pattern of branchPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[2] || match[1];
      }
    }

    return undefined;
  }

  function extractAction(input: string): string | undefined {
    const lowerInput = input.toLowerCase();

    const actionMap: Record<string, string[]> = {
      add: ['add', '添加'],
      commit: ['commit', '提交'],
      push: ['push', '推送'],
      pull: ['pull', '拉取'],
      status: ['status', '状态'],
      create: ['create', '创建', '新建'],
      delete: ['delete', '删除', '移除', 'rm'],
      checkout: ['checkout', '切换', '签出'],
      list: ['list', '列出', '查看'],
      build: ['build', '构建', '编译'],
      run: ['run', '运行', '执行'],
      stop: ['stop', '停止'],
      save: ['save', '保存', '暂存'],
      pop: ['pop', '恢复'],
      clear: ['clear', '清除'],
      edit: ['edit', '编辑'],
      remove: ['remove', '删除'],
      format: ['format', '格式化'],
      lint: ['lint', '检查'],
      rename: ['rename', '重命名', '改名'],
      replace: ['replace', '替换'],
      disk: ['disk', '磁盘'],
      memory: ['memory', '内存'],
      cpu: ['cpu', '处理器'],
      all: ['all', '全部'],
    };

    for (const [action, keywords] of Object.entries(actionMap)) {
      for (const keyword of keywords) {
        if (lowerInput.includes(keyword)) {
          return action;
        }
      }
    }

    return undefined;
  }

  function extractPackageName(input: string): string | undefined {
    const packagePatterns = [
      /(?:install|add|require|安装|添加|引入)\s+(['"]?)([@a-zA-Z0-9_\-./]+)\1/i,
      /(?:npm|yarn|pnpm)\s+(?:install|add)?\s*(['"]?)([@a-zA-Z0-9_\-./]+)\1/i,
    ];

    for (const pattern of packagePatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[2] || match[1];
      }
    }

    return undefined;
  }

  function extractScriptName(input: string): string | undefined {
    const scriptPatterns = [
      /(?:run|执行|运行|跑)\s+(?:script|脚本)?\s*['"]?([a-zA-Z0-9_\-]+)['"]?/i,
      /(?:build|test|start|dev|lint|format)\s*(?!\.)/i,
    ];

    for (const pattern of scriptPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    const keywords = ['build', 'test', 'start', 'dev', 'lint', 'format'];
    for (const keyword of keywords) {
      if (input.toLowerCase().includes(keyword)) {
        return keyword;
      }
    }

    return undefined;
  }

  function extractName(input: string): string | undefined {
    const namePatterns = [
      /(?:name|名称|容器|镜像|image|container)\s*(?:为|叫|是)?\s*['"]?([a-zA-Z0-9_\-./]+)['"]?/i,
    ];

    for (const pattern of namePatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  function extractTag(input: string): string | undefined {
    const tagPatterns = [
      /(?:tag|标签|版本)\s*(?:为|是)?\s*['"]?([a-zA-Z0-9_\-.]+)['"]?/i,
      /:([a-zA-Z0-9_\-.]+)\s*$/i,
    ];

    for (const pattern of tagPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return 'latest';
  }

  function extractSchedule(input: string): string | undefined {
    return undefined;
  }

  function extractCommand(input: string): string | undefined {
    return undefined;
  }

  function extractEnv(input: string): string | undefined {
    const envPatterns = [
      /(?:env|环境)\s*(?:为|是|到)?\s*['"]?([a-zA-Z0-9_\-]+)['"]?/i,
    ];

    for (const pattern of envPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    const envs = ['production', 'prod', 'development', 'dev', 'staging', 'test'];
    for (const env of envs) {
      if (input.toLowerCase().includes(env)) {
        return env;
      }
    }

    return undefined;
  }

  function extractFindReplace(input: string, paramName: string): string | undefined {
    const lowerInput = input.toLowerCase();

    if (paramName === 'find') {
      const findPattern = /(?:查找|搜索|find|search)\s*(?:为|内容)?\s*['"]?([^'"]+)['"]?/i;
      const match = input.match(findPattern);
      if (match) {
        return match[1];
      }
    }

    if (paramName === 'replace') {
      const replacePattern = /(?:替换|replace)\s*(?:为|成|为)?\s*['"]?([^'"]+)['"]?/i;
      const match = input.match(replacePattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  function extractUrl(input: string): string | undefined {
    const urlPatterns = [
      /(https?:\/\/[^\s'"]+)/i,
      /(?:host|主机|url|网址)\s*(?:为|是)?\s*['"]?([^\s'"]+)['"]?/i,
    ];

    for (const pattern of urlPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  function extractSimpleParam(input: string, paramName: string): string | undefined {
    return undefined;
  }

  function extractPorts(input: string): string[] | undefined {
    return undefined;
  }

  function extractSteps(input: string): string[] | undefined {
    return undefined;
  }

  function extractMode(input: string): string | undefined {
    const modePatterns = [
      /(?:mode|模式)\s*(?:为|是)?\s*['"]?([a-zA-Z0-9]+)['"]?/i,
    ];

    for (const pattern of modePatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  function extractFilter(input: string): string | undefined {
    return undefined;
  }

  function extractKeyValue(input: string, paramName: string): string | undefined {
    return undefined;
  }

  return {
    extract,
  };
}
