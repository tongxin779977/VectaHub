import { Command } from 'commander';
import { performanceMonitor } from '../monitoring/monitor.js';
import { createConsoleLogger } from '../utils/logger.js';
import { type Alert } from '../monitoring/metrics.js';

const logger = createConsoleLogger('monitor');

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatAlertTable(alerts: Alert[]): void {
  if (alerts.length === 0) {
    logger.info('  (no alerts)');
    return;
  }

  const typeColors: Record<string, string> = {
    critical: '\x1b[31mcritical\x1b[0m',
    warning: '\x1b[33mwarning\x1b[0m',
    info: '\x1b[32minfo\x1b[0m',
  };

  console.log(`  ${'Time'.padEnd(25)} ${'Type'.padEnd(12)} ${'Metric'.padEnd(18)} ${'Value'.padEnd(10)} ${'Threshold'.padEnd(10)} Message`);
  console.log(`  ${'─'.repeat(25)} ${'─'.repeat(12)} ${'─'.repeat(18)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(40)}`);

  for (const alert of alerts) {
    const type = typeColors[alert.type] || alert.type;
    console.log(
      `  ${formatTimestamp(alert.timestamp).padEnd(25)} ${type.padEnd(12)} ${alert.metricType.padEnd(18)} ${alert.currentValue.toFixed(2).padEnd(10)} ${alert.threshold.toFixed(2).padEnd(10)} ${alert.message}`
    );
  }
}

function formatSummary(summary: Record<string, { avg: number; max: number; min: number; count: number }>): void {
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

  console.log(`  ${'Metric'.padEnd(20)} ${'Count'.padEnd(6)} ${'Avg'.padEnd(12)} ${'Min'.padEnd(12)} ${'Max'.padEnd(12)}`);
  console.log(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(12)}`);

  for (const [type, stats] of Object.entries(summary)) {
    const name = metricNames[type] || type;
    const unit = unitNames[type] || '';
    console.log(
      `  ${name.padEnd(20)} ${stats.count.toString().padEnd(6)} ${`${stats.avg.toFixed(2)}${unit}`.padEnd(12)} ${`${stats.min.toFixed(2)}${unit}`.padEnd(12)} ${`${stats.max.toFixed(2)}${unit}`.padEnd(12)}`
    );
  }
}

export const monitorCmd = new Command('monitor')
  .description('Performance monitoring and metrics')
  .command('start')
  .description('Start the performance monitor')
  .option('-i, --interval <ms>', 'Monitoring interval in milliseconds', '5000')
  .action(async (options) => {
    const interval = parseInt(options.interval) || 5000;
    performanceMonitor.start(interval);
    logger.info(`\n✅ Performance monitor started with ${interval}ms interval`);
  })
  .command('stop')
  .description('Stop the performance monitor')
  .action(() => {
    performanceMonitor.stop();
    logger.info('\n✅ Performance monitor stopped');
  })
  .command('status')
  .description('Show current metrics')
  .action(() => {
    const summary = performanceMonitor.getSummary();
    logger.info('\nPerformance Metrics Summary:\n');
    formatSummary(summary);
    console.log();
  })
  .command('alerts')
  .description('Show alerts')
  .option('-r, --resolved', 'Show resolved alerts')
  .action((options) => {
    const alerts = performanceMonitor.getAlerts(options.resolved);
    logger.info(`\n${options.resolved ? 'Resolved' : 'Active'} Alerts:\n`);
    formatAlertTable(alerts);
    console.log();
  })
  .command('reset')
  .description('Reset all metrics and alerts')
  .action(() => {
    performanceMonitor.reset();
    logger.info('\n✅ Performance metrics and alerts reset');
  })
  .command('config')
  .description('Configure alert thresholds')
  .option('--enable', 'Enable alerting')
  .option('--disable', 'Disable alerting')
  .option('--cpu-warning <value>', 'CPU warning threshold (%)')
  .option('--cpu-critical <value>', 'CPU critical threshold (%)')
  .option('--memory-warning <value>', 'Memory warning threshold (%)')
  .option('--memory-critical <value>', 'Memory critical threshold (%)')
  .action((options) => {
    const config: Record<string, unknown> = {};

    if (options.enable !== undefined) {
      config.enabled = true;
    }
    if (options.disable !== undefined) {
      config.enabled = false;
    }

    performanceMonitor.setConfig(config as any);
    logger.info('\n✅ Monitor configuration updated');
  });
