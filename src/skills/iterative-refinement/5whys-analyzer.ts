import type {
  FiveWhysAnalysis,
  WhyQuestion,
  RootCause,
  RootCauseCategory,
  AnalysisStatus,
} from './types.js';

interface ErrorPattern {
  pattern: RegExp;
  category: RootCauseCategory;
  whyTemplate: string;
  fixSuggestions: string[];
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /(?:module not found|cannot find module|require.*failed|import.*error)/i,
    category: 'DEPENDENCY',
    whyTemplate: '为什么找不到这个依赖模块?',
    fixSuggestions: [
      '运行 npm install/yarn install',
      '检查 package.json 中的依赖版本',
      '确认 node_modules 是否存在',
    ],
  },
  {
    pattern: /(?:ENOENT|file not found|cannot find|no such file)/i,
    category: 'CONFIGURATION',
    whyTemplate: '为什么找不到这个文件?',
    fixSuggestions: [
      '检查文件路径是否正确',
      '确认文件是否存在',
      '验证工作目录是否正确',
    ],
  },
  {
    pattern: /(?:EACCES|permission denied|not allowed|access denied)/i,
    category: 'PERMISSION',
    whyTemplate: '为什么没有权限执行这个操作?',
    fixSuggestions: [
      '检查文件/目录权限',
      '确认用户身份',
      '尝试使用sudo(谨慎)',
    ],
  },
  {
    pattern: /(?:ENOTFOUND|connection refused|network error|timeout|could not connect)/i,
    category: 'NETWORK',
    whyTemplate: '为什么无法建立网络连接?',
    fixSuggestions: [
      '检查网络连接',
      '验证URL/地址是否正确',
      '确认防火墙设置',
      '检查代理配置',
    ],
  },
  {
    pattern: /(?:syntax error|unexpected token|invalid syntax|parse error)/i,
    category: 'LOGIC',
    whyTemplate: '为什么会出现语法错误?',
    fixSuggestions: [
      '检查代码语法',
      '确认使用的语言版本',
      '验证配置文件格式',
    ],
  },
  {
    pattern: /(?:command not found|not recognized|is not a function|undefined is not)/i,
    category: 'ENVIRONMENT',
    whyTemplate: '为什么这个命令/函数不可用?',
    fixSuggestions: [
      '检查命令是否已安装',
      '确认PATH环境变量',
      '验证依赖版本兼容性',
    ],
  },
  {
    pattern: /(?:out of memory|heap limit|allocation failed)/i,
    category: 'ENVIRONMENT',
    whyTemplate: '为什么会出现内存不足?',
    fixSuggestions: [
      '增加内存限制',
      '优化代码减少内存使用',
      '分批处理数据',
    ],
  },
];

function generateId(): string {
  return `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function matchErrorPattern(error: string): ErrorPattern | null {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(error)) {
      return pattern;
    }
  }
  return null;
}

function buildDefaultWhyChain(error: string): WhyQuestion[] {
  return [
    {
      id: 1,
      question: '问题是什么?',
      answer: error,
      evidence: [error],
    },
    {
      id: 2,
      question: '为什么会发生这个问题?',
      answer: '需要进一步分析错误原因',
    },
    {
      id: 3,
      question: '根本原因可能是什么?',
      answer: '可能是配置、环境或依赖问题',
    },
    {
      id: 4,
      question: '有什么证据支持这个猜测?',
      answer: '错误信息提供了线索',
    },
    {
      id: 5,
      question: '如何验证和修复这个问题?',
      answer: '需要根据具体错误采取相应措施',
    },
  ];
}

function buildPatternWhyChain(error: string, pattern: ErrorPattern): WhyQuestion[] {
  return [
    {
      id: 1,
      question: '问题是什么?',
      answer: error,
      evidence: [error],
    },
    {
      id: 2,
      question: pattern.whyTemplate,
      answer: `错误模式匹配为 ${pattern.category} 类型`,
      evidence: [`匹配的正则: ${pattern.pattern}`],
    },
    {
      id: 3,
      question: '这个类别通常由什么引起?',
      answer: `${pattern.category} 相关问题`,
    },
    {
      id: 4,
      question: '有哪些可能的解决方案?',
      answer: pattern.fixSuggestions.join('; '),
    },
    {
      id: 5,
      question: '下一步应该做什么?',
      answer: '尝试建议的修复方案',
    },
  ];
}

function extractRootCauses(error: string, pattern: ErrorPattern | null): RootCause[] {
  const causes: RootCause[] = [];

  if (pattern) {
    causes.push({
      category: pattern.category,
      description: `检测到 ${pattern.category} 类型错误`,
      confidence: 0.8,
      suggestedFixes: pattern.fixSuggestions,
    });
  } else {
    causes.push({
      category: 'UNKNOWN',
      description: '无法自动识别的错误类型',
      confidence: 0.3,
      suggestedFixes: [
        '仔细阅读错误信息',
        '检查相关文档',
        '尝试手动复现问题',
      ],
    });
  }

  return causes;
}

export function createFiveWhysAnalyzer() {
  function analyze(taskId: string, error: string): FiveWhysAnalysis {
    const analysis: FiveWhysAnalysis = {
      id: generateId(),
      taskId,
      originalError: error,
      whyChain: [],
      rootCauses: [],
      status: 'ANALYZING',
      createdAt: new Date(),
    };

    try {
      const pattern = matchErrorPattern(error);

      analysis.whyChain = pattern
        ? buildPatternWhyChain(error, pattern)
        : buildDefaultWhyChain(error);

      analysis.rootCauses = extractRootCauses(error, pattern);
      analysis.status = 'COMPLETED';
      analysis.completedAt = new Date();
    } catch (err) {
      analysis.status = 'FAILED';
      analysis.whyChain = [
        {
          id: 1,
          question: '分析过程出错',
          answer: err instanceof Error ? err.message : String(err),
        },
      ];
      analysis.rootCauses = [
        {
          category: 'UNKNOWN',
          description: '分析过程失败',
          confidence: 0,
          suggestedFixes: ['手动分析错误原因'],
        },
      ];
    }

    return analysis;
  }

  function formatAnalysis(analysis: FiveWhysAnalysis): string {
    let output = '\n╔════════════════════════════════════════════════════════════╗';
    output += '\n║                    5 Whys 根因分析                          ║';
    output += '\n╠════════════════════════════════════════════════════════════╣';
    output += `\n║ 任务ID: ${analysis.taskId.padEnd(48)}║`;
    output += `\n║ 状态: ${analysis.status.padEnd(51)}║`;
    output += '\n╠════════════════════════════════════════════════════════════╣';
    output += '\n║ 原始错误:                                                  ║';

    const errorLines = analysis.originalError.split('\n');
    for (const line of errorLines) {
      const padded = line.substring(0, 56);
      output += `\n║   ${padded.padEnd(56)}║`;
    }

    output += '\n╠════════════════════════════════════════════════════════════╣';
    output += '\n║ 5 Whys 链:                                                 ║';

    for (const why of analysis.whyChain) {
      output += `\n║                                                           ║`;
      output += `\n║  ${why.id}. ${why.question.substring(0, 50).padEnd(50)}║`;
      const answerLines = why.answer.split('\n');
      for (const line of answerLines) {
        const parts = line.match(/.{1,52}/g) || [line];
        for (const part of parts) {
          output += `\n║     → ${part.padEnd(52)}║`;
        }
      }
    }

    output += '\n╠════════════════════════════════════════════════════════════╣';
    output += '\n║ 可能的根因:                                                ║';

    for (const cause of analysis.rootCauses) {
      output += `\n║                                                           ║`;
      output += `\n║  [${cause.category}] ${cause.description.substring(0, 38).padEnd(38)}║`;
      output += `\n║     置信度: ${(cause.confidence * 100).toFixed(0)}%${' '.repeat(40)}║`;
      output += `\n║     建议: ${' '.repeat(50)}║`;
      for (let i = 0; i < cause.suggestedFixes.length; i++) {
        const fix = cause.suggestedFixes[i].substring(0, 50);
        output += `\n║       ${i + 1}. ${fix.padEnd(50)}║`;
      }
    }

    output += '\n╚════════════════════════════════════════════════════════════╝\n';

    return output;
  }

  return {
    analyze,
    formatAnalysis,
  };
}

export type FiveWhysAnalyzer = ReturnType<typeof createFiveWhysAnalyzer>;
