import { createInterface, type Interface } from 'readline';
import { createConfigDir, initConfigFile, configureLLMProvider, closeRl as closeSetupRl } from './first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig } from './cli-scanner.js';

export type InstallationPhase = 'critical' | 'secondary' | 'tertiary';

export interface StepResult {
  success: boolean;
  reason?: string;
}

export interface InstallationStep {
  id: string;
  name: string;
  priority: InstallationPhase;
  execute: () => Promise<StepResult>;
  retryable?: boolean; // defaults to true for critical, false for others
}

export interface PhaseResult {
  total: number;
  succeeded: number;
  failed: number;
}

export interface InstallationSummary {
  phases: Record<InstallationPhase, PhaseResult>;
  overallSuccess: boolean;
}

const PHASE_LABELS: Record<InstallationPhase, string> = {
  critical: '核心配置',
  secondary: '外部工具',
  tertiary: '可选组件',
};

interface InstallerOptions {
  askRetry?: (stepName: string) => Promise<boolean>;
  maxRetries?: number;
}

export interface Installer {
  steps: InstallationStep[];
  run: () => Promise<InstallationSummary>;
}

export function createPriorityInstaller(
  steps: InstallationStep[],
  options?: InstallerOptions,
): Installer {
  const cleanup = (): void => {
    closeSetupRl();
  };

  return {
    steps,
    run: async (): Promise<InstallationSummary> => {
      // Initialize results
      const phases: Record<InstallationPhase, PhaseResult> = {
        critical: { total: 0, succeeded: 0, failed: 0 },
        secondary: { total: 0, succeeded: 0, failed: 0 },
        tertiary: { total: 0, succeeded: 0, failed: 0 },
      };

      // Group steps by phase
      const criticalSteps = steps.filter((s) => s.priority === 'critical');
      const secondarySteps = steps.filter((s) => s.priority === 'secondary');
      const tertiarySteps = steps.filter((s) => s.priority === 'tertiary');

      phases.critical.total = criticalSteps.length;
      phases.secondary.total = secondarySteps.length;
      phases.tertiary.total = tertiarySteps.length;

      let blocked = false;
      let secondaryFailed = false;

      try {
        // Execute critical phase
        for (const step of criticalSteps) {
          const label = PHASE_LABELS.critical;
          const maxRetries = options?.maxRetries ?? 3;
          let retryCount = 0;
          let success = false;
          let lastResult: StepResult | null = null;

          console.log(`🔧 [${label}] 正在: ${step.name}`);

          while (retryCount <= maxRetries) {
            const result = await step.execute();
            lastResult = result;

            if (result.success) {
              success = true;
              break;
            }

            const isRetryable = step.retryable !== false;
            if (!isRetryable || !options?.askRetry || retryCount >= maxRetries) {
              break;
            }

            retryCount++;
            const shouldRetry = await options.askRetry(step.name);
            if (!shouldRetry) {
              break;
            }

            console.log(`🔄 [${label}] 重试 ${retryCount}/${maxRetries}: ${step.name}`);
          }

          if (success) {
            console.log(`✅ [${label}] 完成: ${step.name}`);
            phases.critical.succeeded++;
          } else {
            const reason = lastResult?.reason || 'unknown error';
            console.log(`❌ [${label}] 失败: ${step.name} — ${reason}`);
            phases.critical.failed++;
            blocked = true;
            break;
          }
        }

        // Log critical phase summary
        const criticalLabel = PHASE_LABELS.critical;
        console.log(
          `📋 [${criticalLabel}] 结果: ${phases.critical.succeeded}/${phases.critical.total} 成功`,
        );

        // Execute secondary phase if not blocked
        if (!blocked) {
          for (const step of secondarySteps) {
            const label = PHASE_LABELS.secondary;
            console.log(`🔧 [${label}] 正在: ${step.name}`);

            const result = await step.execute();

            if (result.success) {
              console.log(`✅ [${label}] 完成: ${step.name}`);
              phases.secondary.succeeded++;
            } else {
              const reason = result.reason || 'unknown error';
              console.log(`❌ [${label}] 失败: ${step.name} — ${reason}`);
              phases.secondary.failed++;
              secondaryFailed = true;
              // Continue to next step (tolerate failures)
            }
          }

          // Log secondary phase summary
          const secondaryLabel = PHASE_LABELS.secondary;
          console.log(
            `📋 [${secondaryLabel}] 结果: ${phases.secondary.succeeded}/${phases.secondary.total} 成功`,
          );
        }

        // Execute tertiary phase if not blocked
        if (!blocked) {
          for (const step of tertiarySteps) {
            const label = PHASE_LABELS.tertiary;
            console.log(`🔧 [${label}] 正在: ${step.name}`);

            const result = await step.execute();

            if (result.success) {
              console.log(`✅ [${label}] 完成: ${step.name}`);
              phases.tertiary.succeeded++;
            } else {
              const reason = result.reason || 'unknown error';
              console.warn(`⚠️ [${label}] 步骤失败: ${step.name} — ${reason}`);
              phases.tertiary.failed++;
              // Continue to next step (silent failures)
            }
          }

          // Log tertiary phase summary
          const tertiaryLabel = PHASE_LABELS.tertiary;
          console.log(
            `📋 [${tertiaryLabel}] 结果: ${phases.tertiary.succeeded}/${phases.tertiary.total} 成功`,
          );
        }
      } finally {
        cleanup();
      }

      // Determine overall success
      // blocked = critical failed
      // secondaryFailed = secondary had failures
      // tertiary failures are silent (don't affect overallSuccess)
      const overallSuccess = !blocked && !secondaryFailed;

      return {
        phases,
        overallSuccess,
      };
    },
  };
}

export function createDefaultInstaller(): Installer | null {
  const steps: InstallationStep[] = [
    // Critical: core setup
    { id: 'create-config-dir', name: '创建配置目录', priority: 'critical', execute: createConfigDir },
    { id: 'init-config-file', name: '初始化配置文件', priority: 'critical', execute: initConfigFile },
    { id: 'configure-llm', name: '配置 LLM 提供商', priority: 'critical', execute: configureLLMProvider, retryable: true },

    // Secondary: external tools
    { id: 'scan-cli-tools', name: '扫描外部 CLI 工具', priority: 'secondary', execute: async () => {
      const tools = await scanCLITools();
      updateCLIToolConfig(tools);
      return { success: true }; // always succeeds - partial results are OK
    }},

    // Tertiary: optional
    { id: 'load-templates', name: '加载模板配置', priority: 'tertiary', execute: async () => {
      // Template loading is optional; no-op for now, always succeed
      return { success: true };
    }},
  ];

  return createPriorityInstaller(steps, {
    askRetry: async (stepName: string): Promise<boolean> => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      return new Promise((resolve) => {
        rl.question(`是否重试 "${stepName}"? [Y/n]: `, (answer: string) => {
          rl.close();
          resolve(answer.trim().toLowerCase() !== 'n');
        });
      });
    },
  });
}
