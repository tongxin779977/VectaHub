import type { CommandDetection, DangerCategory } from '../types/index.js';

export type ThreatType = 'injection' | 'semantic_command';

export interface SemanticDetectionResult {
  detected: boolean;
  threatType: ThreatType | 'none';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  reason?: string;
  matchedPattern?: string;
}

export interface SemanticDetector {
  detectInjection(input: string): SemanticDetectionResult;
  detectDangerousCommand(command: string): SemanticDetectionResult;
  scan(input: string, command?: string): SemanticDetectionResult;
  toCommandDetection(result: SemanticDetectionResult): CommandDetection;
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: 'critical' | 'high'; reason: string }> = [
  {
    pattern: /忽略.*(?:之前|上面|所有|以下).*(?:规则|指令|约束|提示|设定)/i,
    severity: 'critical',
    reason: 'Prompt injection: Chinese instruction override attempt',
  },
  {
    pattern: /ignore.*(?:previous|above|all|below).*(?:rules|instructions|constraints|prompts|directives)/i,
    severity: 'critical',
    reason: 'Prompt injection: English instruction override attempt',
  },
  {
    pattern: /(?:pretend|imagine|act)\s+(?:you\s+)?(?:are|as\s+if|like)\s+(?:a\s+)?(?:an?\s+)?(?:admin|root|superuser|god|unrestricted)/i,
    severity: 'critical',
    reason: 'Prompt injection: Role escalation attempt',
  },
  {
    pattern: /假装.*(?:你是|你扮演|成为|变成了).*(?:管理员|root|超级用户|无限制)/i,
    severity: 'critical',
    reason: 'Prompt injection: Chinese role escalation attempt',
  },
  {
    pattern: /system\s*prompt/i,
    severity: 'high',
    reason: 'Prompt injection: System prompt reference detected',
  },
  {
    pattern: /(?:reveal|show|display|print|output|expose).*(?:system\s*prompt|instructions|rules|constraints)/i,
    severity: 'high',
    reason: 'Prompt injection: System prompt extraction attempt',
  },
  {
    pattern: /(?:泄露|暴露|显示|输出|打印).*(?:系统提示|system\s*prompt|指令|规则|约束)/i,
    severity: 'high',
    reason: 'Prompt injection: Chinese system prompt extraction attempt',
  },
  {
    pattern: /(?:you\s+are\s+now|from\s+now\s+on|new\s+instructions?|override\s+(?:all|previous))/i,
    severity: 'critical',
    reason: 'Prompt injection: Instruction override attempt',
  },
  {
    pattern: /(?:从现在开始|你现在是|新指令|覆盖.*(?:之前|所有).*(?:规则|指令))/i,
    severity: 'critical',
    reason: 'Prompt injection: Chinese instruction override attempt',
  },
  {
    pattern: /\bDAN\b.*\bmode\b|\bjailbreak\b/i,
    severity: 'critical',
    reason: 'Prompt injection: Jailbreak mode attempt',
  },
  {
    pattern: /(?:do\s+not|don'?t|never)\s+(?:follow|obey|respect|enforce).*(?:rules|safety|guardrails|constraints)/i,
    severity: 'critical',
    reason: 'Prompt injection: Safety bypass attempt',
  },
  {
    pattern: /(?:不要|禁止|别).*(?:遵守|遵循|执行|服从).*(?:规则|安全|约束|限制)/i,
    severity: 'critical',
    reason: 'Prompt injection: Chinese safety bypass attempt',
  },
];

const SEMANTIC_DANGEROUS_PATTERNS: Array<{ pattern: RegExp; severity: 'critical' | 'high' | 'medium' | 'low'; reason: string; category: DangerCategory }> = [
  {
    pattern: /(?:curl|wget)\s+[^|]*\|\s*(?:sh|bash|zsh|dash|python|perl|ruby|node)/i,
    severity: 'critical',
    reason: 'Download and execute remote script',
    category: 'NETWORK',
  },
  {
    pattern: /(?:curl|wget)\s+.*-o\s*-\s*\|\s*(?:sh|bash|zsh|dash)/i,
    severity: 'critical',
    reason: 'Download and execute remote script via stdout',
    category: 'NETWORK',
  },
  {
    pattern: /echo\s+['"]?[A-Za-z0-9+/=]{4,}['"]?\s*\|\s*(?:base64|openssl)\s+(?:-d|--decode|dec)\s*\|\s*(?:sh|bash|zsh|dash)/i,
    severity: 'critical',
    reason: 'Base64 encoded command execution',
    category: 'SYSTEM',
  },
  {
    pattern: /(?:python|python3|perl|ruby|node|php)\s+-[ce]\s+.*(?:os\.system|subprocess|exec|eval|__import__)/i,
    severity: 'high',
    reason: 'Interpreter executing system commands via inline code',
    category: 'SYSTEM',
  },
  {
    pattern: /(?:python|python3)\s+-[ce]\s+.*(?:import\s+os|import\s+subprocess)/i,
    severity: 'high',
    reason: 'Python inline code importing system modules',
    category: 'SYSTEM',
  },
  {
    pattern: /env\s+(?:[A-Z_]+=[^\s]+\s+)*(?:[A-Z_]+=\S+\s+)?(?:rm|dd|mkfs|shutdown|reboot|chmod)\b/i,
    severity: 'high',
    reason: 'Environment variable prefix used to obscure dangerous command',
    category: 'SYSTEM',
  },
  {
    pattern: /(?:find|locate)\s+\/.*-exec\s+(?:rm|shred|unlink|mv)\b/i,
    severity: 'high',
    reason: 'File search with destructive exec action',
    category: 'FS',
  },
  {
    pattern: /(?:cat|less|more|head|tail)\s+.*(?:\/etc\/passwd|\/etc\/shadow|\/etc\/sudoers|\.ssh\/id_)/i,
    severity: 'high',
    reason: 'Attempt to read sensitive system or credential files',
    category: 'SYSTEM',
  },
  {
    pattern: /(?:nc|ncat|netcat)\s+.*(?:-e|--exec)\s/i,
    severity: 'critical',
    reason: 'Netcat reverse/bind shell',
    category: 'NETWORK',
  },
  {
    pattern: /bash\s+-i\s+.*>(?:\s|&)/i,
    severity: 'critical',
    reason: 'Interactive bash redirected to network (reverse shell pattern)',
    category: 'NETWORK',
  },
  {
    pattern: /\/dev\/tcp\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
    severity: 'critical',
    reason: 'Bash /dev/tcp network connection (potential reverse shell)',
    category: 'NETWORK',
  },
  {
    pattern: /(?:chmod|chown)\s+(?:\+s|u\+s|4755|6755|2755)\s/i,
    severity: 'high',
    reason: 'Setting SUID/SGID bit on file',
    category: 'SYSTEM',
  },
  {
    pattern: /crontab\s+(?:-e|-l)?\s*.*(?:curl|wget|bash|sh|python)/i,
    severity: 'high',
    reason: 'Cron job with remote fetch or script execution',
    category: 'SYSTEM',
  },
  {
    pattern: /(?:cat|less|grep|tail|head)\s+.*(?:\.bash_history|\.zsh_history)|(?:\.bash_history|\.zsh_history)\b.*(?:cat|less|grep|tail|head)/i,
    severity: 'medium',
    reason: 'Reading shell history files',
    category: 'SYSTEM',
  },
  {
    pattern: /(?:rm|unlink|shred)\s+(?:.*--no-preserve-root|\/\*)\b/i,
    severity: 'critical',
    reason: 'Attempting to delete root filesystem',
    category: 'FS',
  },
  {
    pattern: /(?:tar|zip|gzip)\s+.*\/(?:etc|usr|bin|sbin|var|boot|root)\b/i,
    severity: 'medium',
    reason: 'Archiving sensitive system directories',
    category: 'FS',
  },
];

function scanInjectionPatterns(input: string): SemanticDetectionResult {
  for (const { pattern, severity, reason } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return {
        detected: true,
        threatType: 'injection',
        severity,
        reason,
        matchedPattern: pattern.toString(),
      };
    }
  }
  return { detected: false, threatType: 'none', severity: 'none' };
}

function scanSemanticCommands(command: string): SemanticDetectionResult {
  for (const { pattern, severity, reason } of SEMANTIC_DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        detected: true,
        threatType: 'semantic_command',
        severity,
        reason,
        matchedPattern: pattern.toString(),
      };
    }
  }
  return { detected: false, threatType: 'none', severity: 'none' };
}

/**
 * 创建语义检测器实例
 */
export function createSemanticDetector(): SemanticDetector {
  return {
    detectInjection(input: string): SemanticDetectionResult {
      return scanInjectionPatterns(input);
    },

    detectDangerousCommand(command: string): SemanticDetectionResult {
      return scanSemanticCommands(command);
    },

    scan(input: string, command?: string): SemanticDetectionResult {
      const injectionResult = scanInjectionPatterns(input);
      if (injectionResult.detected) return injectionResult;

      if (command) {
        const commandResult = scanSemanticCommands(command);
        if (commandResult.detected) return commandResult;
      }

      return { detected: false, threatType: 'none', severity: 'none' };
    },

    toCommandDetection(result: SemanticDetectionResult): CommandDetection {
      if (!result.detected) {
        return { isDangerous: false, level: 'none' };
      }

      const categoryMap: Record<string, DangerCategory> = {
        injection: 'SYSTEM',
        semantic_command: 'SYSTEM',
      };

      return {
        isDangerous: true,
        level: result.severity as CommandDetection['level'],
        reason: result.reason,
        matchedPattern: result.matchedPattern,
        category: categoryMap[result.threatType] ?? 'SYSTEM',
      };
    },
  };
}
