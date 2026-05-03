import { Command } from 'commander';
import { queryAuditLogs } from '../utils/audit.js';

export const auditCmd = new Command('audit')
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
      console.log('\n📋 No audit logs found matching the criteria.\n');
      return;
    }

    console.log('\n📋 Audit Logs:');
    console.log('─'.repeat(120));
    console.log('Timestamp'.padEnd(30) + 'Event'.padEnd(20) + 'Module'.padEnd(12) + 'Action'.padEnd(25) + 'Status');
    console.log('─'.repeat(120));

    for (const log of logs) {
      const timestamp = log.timestamp.split('T')[1]?.substring(0, 8) || log.timestamp;
      const status = log.success ? '✅' : '❌';
      console.log(
        timestamp.padEnd(30) +
        (log.event as string).padEnd(20) +
        log.module.padEnd(12) +
        (log.action || '').padEnd(25) +
        status
      );
    }
    console.log('─'.repeat(120));
    console.log(`Total: ${logs.length} logs\n`);
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

    console.log('\n📊 Audit Statistics (last 1000 entries):');
    console.log('─'.repeat(60));
    console.log('Event Type'.padEnd(25) + 'Total'.padEnd(12) + 'Success'.padEnd(12) + 'Failed');
    console.log('─'.repeat(60));

    for (const [event, data] of Object.entries(stats)) {
      console.log(
        event.padEnd(25) +
        String(data.total).padEnd(12) +
        String(data.success).padEnd(12) +
        String(data.failed)
      );
    }
    console.log('─'.repeat(60));
    console.log(`Total Events: ${logs.length}\n`);
  });