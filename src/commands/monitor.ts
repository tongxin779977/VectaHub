import { Command } from 'commander';
import { format } from 'node:util';
import { PerformanceMonitor } from '../monitoring/monitor.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { Alert, AlertConfig } from '../monitoring/metrics.js';

interface MonitorCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface MonitorCommandDeps {
  performanceMonitor?: PerformanceMonitor;
}

function createMonitorCommandOutput(): MonitorCommandOutput {
  const formatMessage = (message?: unknown, optionalParams: unknown[] = []): string => {
    if (message === undefined && optionalParams.length === 0) {
      return '';
    }
    return format(message, ...optionalParams);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${formatMessage(message, optionalParams)}\n`);
    },
  };
}

export function createPerformanceMonitor(context: InfrastructureContext): PerformanceMonitor {
  return new PerformanceMonitor({
    logger: context.logger.getLogger('monitor'),
    getLogDir: () => context.environment.getPath('logs'),
  });
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatAlertTable(alerts: Alert[], logger: { info: (msg: string) => void }, output: MonitorCommandOutput): void {
  if (alerts.length === 0) {
    logger.info('  (no alerts)');
    return;
  }

  const typeColors: Record<string, string> = {
    critical: '\x1b[31mcritical\x1b[0m',
    warning: '\x1b[33mwarning\x1b[0m',
    info: '\x1b[32minfo\x1b[0m',
  };

  output.log(`  ${'Time'.padEnd(25)} ${'Type'.padEnd(12)} ${'Metric'.padEnd(18)} ${'Value'.padEnd(10)} ${'Threshold'.padEnd(10)} Message`);
  output.log(`  ${'─'.repeat(25)} ${'─'.repeat(12)} ${'─'.repeat(18)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(40)}`);

  for (const alert of alerts) {
    const type = typeColors[alert.type] || alert.type;
    output.log(
      `  ${formatTimestamp(alert.timestamp).padEnd(25)} ${type.padEnd(12)} ${alert.metricType.padEnd(18)} ${alert.currentValue.toFixed(2).padEnd(10)} ${alert.threshold.toFixed(2).padEnd(10)} ${alert.message}`
    );
  }
}

function formatSummary(
  summary: Record<string, { avg: number; max: number; min: number; count: number }>,
  output: MonitorCommandOutput
): void {
  const metricNames: Record<string, string> = {
    memory_used: 'Memory Used',
    memory_total: 'Memory Total',
    memory_usage: 'Memory Usage',
    response_time: 'Response Time',
    execution_time: 'Execution Time',
    error_count: 'Error Count',
    success_rate: 'Success Rate',
  };

  const unitNames: Record<string, string> = {
    memory_used: 'MB',
    memory_total: 'MB',
    memory_usage: '%',
    response_time: 'ms',
    execution_time: 'ms',
    error_count: '',
    success_rate: '%',
  };

  output.log(`  ${'Metric'.padEnd(20)} ${'Count'.padEnd(6)} ${'Avg'.padEnd(12)} ${'Min'.padEnd(12)} ${'Max'.padEnd(12)}`);
  output.log(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(12)}`);

  for (const [type, stats] of Object.entries(summary)) {
    const name = metricNames[type] || type;
    const unit = unitNames[type] || '';
    output.log(
      `  ${name.padEnd(20)} ${stats.count.toString().padEnd(6)} ${`${stats.avg.toFixed(2)}${unit}`.padEnd(12)} ${`${stats.min.toFixed(2)}${unit}`.padEnd(12)} ${`${stats.max.toFixed(2)}${unit}`.padEnd(12)}`
    );
  }
}

export function createMonitorCmd(context: InfrastructureContext, deps: MonitorCommandDeps = {}): Command {
  const logger = context.logger.getLogger('monitor');
  const output = createMonitorCommandOutput();
  const performanceMonitor = deps.performanceMonitor ?? createPerformanceMonitor(context);

  const monitorCmd = new Command('monitor')
    .description('Performance monitoring and metrics');

  monitorCmd
    .command('start')
    .description('Start the performance monitor')
    .option('-i, --interval <ms>', 'Monitoring interval in milliseconds', '5000')
    .action(async (options) => {
      const interval = parseInt(options.interval) || 5000;
      performanceMonitor.start(interval);
      logger.info(`\n✅ Performance monitor started with ${interval}ms interval`);
    });

  monitorCmd
    .command('stop')
    .description('Stop the performance monitor')
    .action(() => {
      performanceMonitor.stop();
      logger.info('\n✅ Performance monitor stopped');
    });

  monitorCmd
    .command('status')
    .description('Show current metrics')
    .action(() => {
      const summary = performanceMonitor.getSummary();
      logger.info('\nPerformance Metrics Summary:\n');
      formatSummary(summary, output);
      output.log();
    });

  monitorCmd
    .command('alerts')
    .description('Show alerts')
    .option('-r, --resolved', 'Show resolved alerts')
    .action((options) => {
      const alerts = performanceMonitor.getAlerts(options.resolved);
      logger.info(`\n${options.resolved ? 'Resolved' : 'Active'} Alerts:\n`);
      formatAlertTable(alerts, logger, output);
      output.log();
    });

  monitorCmd
    .command('reset')
    .description('Reset all metrics and alerts')
    .action(() => {
      performanceMonitor.reset();
      logger.info('\n✅ Performance metrics and alerts reset');
    });

  monitorCmd
    .command('config')
    .description('Configure alert thresholds')
    .option('--enable', 'Enable alerting')
    .option('--disable', 'Disable alerting')
    .option('--cpu-warning <value>', 'CPU warning threshold (%)')
    .option('--cpu-critical <value>', 'CPU critical threshold (%)')
    .option('--memory-warning <value>', 'Memory warning threshold (%)')
    .option('--memory-critical <value>', 'Memory critical threshold (%)')
    .action((options) => {
      const config: Partial<AlertConfig> = {};

      if (options.enable !== undefined) {
        config.enabled = true;
      }
      if (options.disable !== undefined) {
        config.enabled = false;
      }

      performanceMonitor.setConfig(config);
      logger.info('\n✅ Monitor configuration updated');
    });

  return monitorCmd;
}
