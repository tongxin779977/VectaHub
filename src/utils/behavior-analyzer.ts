export interface BehaviorRule {
  id: string;
  name: string;
  check: (context: BehaviorContext) => { violated: boolean; reason?: string };
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
}

export interface BehaviorContext {
  sessionHistory: Array<{
    timestamp: Date;
    eventType: string;
    severity: string;
    module: string;
    action: string;
    success: boolean;
    riskLevel?: string;
  }>;
  currentCommand: string;
  timeWindow: number;
}

export interface Violation {
  rule: string;
  reason: string;
  severity: string;
}

export interface AnalysisResult {
  violated: boolean;
  violations: Violation[];
}

export class BehaviorAnalyzer {
  private rules: BehaviorRule[] = [];

  constructor() {
    this.initDefaultRules();
  }

  addRule(rule: BehaviorRule): void {
    this.rules.push(rule);
  }

  analyze(context: BehaviorContext): AnalysisResult {
    const violations: Violation[] = [];

    for (const rule of this.rules) {
      const result = rule.check(context);
      if (result.violated && result.reason) {
        violations.push({
          rule: rule.name,
          reason: result.reason,
          severity: rule.severity
        });
      }
    }

    return {
      violated: violations.length > 0,
      violations
    };
  }

  private initDefaultRules(): void {
    // 规则 1: 短时间内大量命令
    this.addRule({
      id: 'high-frequency',
      name: 'High Frequency Commands',
      check: (context: BehaviorContext) => {
        const recentCount = context.sessionHistory.filter(r =>
          Date.now() - r.timestamp.getTime() < context.timeWindow
        ).length;

        if (recentCount > 50) {
          return { violated: true, reason: `Too many commands (${recentCount}) in time window` };
        }
        return { violated: false };
      },
      severity: 'WARNING'
    });

    // 规则 2: 连续的高危命令
    this.addRule({
      id: 'consecutive-dangerous',
      name: 'Consecutive Dangerous Commands',
      check: (context: BehaviorContext) => {
        const recentDangerous = context.sessionHistory.filter(r =>
          r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL'
        ).slice(-5);

        if (recentDangerous.length >= 3) {
          return { violated: true, reason: 'Multiple consecutive dangerous commands detected' };
        }
        return { violated: false };
      },
      severity: 'CRITICAL'
    });
  }
}
