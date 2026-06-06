import { Command } from 'commander';
import { format } from 'node:util';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { AuditQueryOptions } from '../infrastructure/interfaces/audit-service.js';

interface AuditCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

function createAuditCommandOutput(): AuditCommandOutput {
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

/**
 * 创建审计命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createAuditCmd(context: InfrastructureContext): Command {
  const auditLogger = context.audit.getLogger();
  const output = createAuditCommandOutput();

  function queryAuditLogs(options: AuditQueryOptions = {}) {
    return auditLogger.query(options);
  }

  const auditCmd = new Command('audit')
    .description('Audit log management commands');

  auditCmd
    .command('query')
    .description('Query audit logs')
    .option('--event <type>', 'Filter by event type (e.g., CLI_COMMAND, SECURITY_ALERT)')
    .option('--module <name>', 'Filter by module')
    .option('--limit <number>', 'Maximum number of results', '50')
    .action(async (options) => {
      const logs = queryAuditLogs({
        eventType: options.event,
        module: options.module,
        limit: parseInt(options.limit, 10) || 50,
      });

      if (logs.length === 0) {
        output.log('\n📋 No audit logs found matching the criteria.\n');
        return;
      }

      output.log('\n📋 Audit Logs:');
      output.log('─'.repeat(120));
      output.log('Timestamp'.padEnd(30) + 'Event'.padEnd(20) + 'Module'.padEnd(12) + 'Action'.padEnd(25) + 'Status');
      output.log('─'.repeat(120));

      for (const log of logs) {
        const timestamp = log.timestamp.split('T')[1]?.substring(0, 8) || log.timestamp;
        const status = log.success ? '✅' : '❌';
        output.log(
          timestamp.padEnd(30) +
          (log.event as string).padEnd(20) +
          log.module.padEnd(12) +
          (log.action || '').padEnd(25) +
          status
        );
      }
      output.log('─'.repeat(120));
      output.log(`Total: ${logs.length} logs\n`);
    });

  auditCmd
    .command('list')
    .description('List recent audit logs')
    .option('--event <type>', 'Filter by event type')
    .option('--module <name>', 'Filter by module')
    .option('--limit <number>', 'Maximum number of results', '20')
    .action(async (options) => {
      const logs = queryAuditLogs({
        eventType: options.event,
        module: options.module,
        limit: parseInt(options.limit, 10) || 20,
      });

      if (logs.length === 0) {
        output.log('\n📋 No audit logs found matching the criteria.\n');
        return;
      }

      output.log('\n📋 Audit Logs (Most Recent):');
      output.log('─'.repeat(120));
      output.log('Timestamp'.padEnd(30) + 'Event'.padEnd(20) + 'Module'.padEnd(12) + 'Action'.padEnd(25) + 'Status');
      output.log('─'.repeat(120));

      for (const log of logs) {
        const timestamp = log.timestamp.split('T')[1]?.substring(0, 8) || log.timestamp;
        const status = log.success ? '✅' : '❌';
        output.log(
          timestamp.padEnd(30) +
          (log.event as string).padEnd(20) +
          log.module.padEnd(12) +
          (log.action || '').padEnd(25) +
          status
        );
      }
      output.log('─'.repeat(120));
      output.log(`Total: ${logs.length} logs\n`);
    });

  auditCmd
    .command('stats')
    .description('Show audit statistics')
    .action(async () => {
      const logs = queryAuditLogs({ limit: 1000 });

      const stats: Record<string, { total: number; success: number; failed: number }> = {};
      for (const log of logs) {
        const key = log.event;
        if (!stats[key]) {
          stats[key] = { total: 0, success: 0, failed: 0 };
        }
        stats[key].total++;
        if (log.success) stats[key].success++;
        else stats[key].failed++;
      }

      output.log('\n📊 Audit Statistics (last 1000 entries):');
      output.log('─'.repeat(60));
      output.log('Event Type'.padEnd(25) + 'Total'.padEnd(12) + 'Success'.padEnd(12) + 'Failed');
      output.log('─'.repeat(60));

      for (const [event, data] of Object.entries(stats)) {
        output.log(
          event.padEnd(25) +
          String(data.total).padEnd(12) +
          String(data.success).padEnd(12) +
          String(data.failed)
        );
      }
      output.log('─'.repeat(60));
      output.log(`Total Events: ${logs.length}\n`);
    });

  return auditCmd;
}
