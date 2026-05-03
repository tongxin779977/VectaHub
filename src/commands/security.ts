import { Command } from 'commander';
import { getSecurityManager } from '../security-protocol/index.js';
import { audit, getCurrentSessionId, AuditEventType } from '../utils/audit.js';

export const securityCmd = new Command('security')
  .description('Security protocol management commands');

securityCmd
  .command('status')
  .description('Show current security status')
  .action(async () => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const config = manager.getConfig();
    const db = manager.getDatabase();
    const enabledRules = manager.getEnabledRules();

    const output: string[] = [];
    output.push('\n🔒 Security Status:');
    output.push('─'.repeat(60));
    output.push(`Total Rules: ${db.rules.length}`);
    output.push(`Enabled Rules: ${enabledRules.length}`);
    output.push(`Disabled Rules: ${db.rules.length - enabledRules.length}`);
    output.push(`Database Version: ${db.version}`);
    output.push(`Last Updated: ${db.lastUpdated}`);
    output.push(`Auto Update: ${config.autoUpdate ? 'Enabled' : 'Disabled'}`);
    output.push('');

    console.log(output.join('\n'));
    audit.cliOutput('security status', output.join('\n'), sessionId);
  });

securityCmd
  .command('policy')
  .description('Show current security policy details')
  .action(async () => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const config = manager.getConfig();

    const output: string[] = [];
    output.push('\n📋 Security Policy:');
    output.push('─'.repeat(60));
    output.push(`Auto Update: ${config.autoUpdate ? 'Enabled' : 'Disabled'}`);
    output.push(`Database Path: ${config.databasePath}`);
    output.push('');

    console.log(output.join('\n'));
    audit.cliOutput('security policy', output.join('\n'), sessionId);
  });

securityCmd
  .command('list')
  .description('List all security rules')
  .option('--enabled', 'Show only enabled rules')
  .option('--disabled', 'Show only disabled rules')
  .action(async (options) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    let rules;

    if (options.enabled) {
      rules = manager.getEnabledRules();
    } else if (options.disabled) {
      const enabledIds = manager.getEnabledRules().map(r => r.id);
      rules = manager.getAllRules().filter(r => !enabledIds.includes(r.id));
    } else {
      rules = manager.getAllRules();
    }

    const enabledIds = manager.getEnabledRules().map(r => r.id);
    const output: string[] = [];

    output.push('\n🔒 Security Rules:');
    output.push('─'.repeat(100));
    output.push('ID'.padEnd(30) + 'Name'.padEnd(30) + 'Severity'.padEnd(10) + 'Status'.padEnd(10) + 'Source');
    output.push('─'.repeat(100));

    for (const rule of rules) {
      const isEnabled = enabledIds.includes(rule.id);
      output.push(
        rule.id.padEnd(30) +
        rule.name.padEnd(30) +
        rule.severity.padEnd(10) +
        (isEnabled ? '✅ Enabled' : '❌ Disabled').padEnd(10) +
        rule.source
      );
    }

    output.push(`\nTotal: ${rules.length} rules\n`);

    console.log(output.join('\n'));
    audit.cliOutput('security list', output.join('\n'), sessionId);
    audit.log({
      event: AuditEventType.SECURITY_ACTION,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Security',
      action: 'list_rules',
      input: { filter: options.enabled ? 'enabled' : options.disabled ? 'disabled' : 'all' },
      output: { count: rules.length },
      success: true,
    });
  });

securityCmd
  .command('add')
  .description('Add a new security rule')
  .option('--name <name>', 'Rule name', '')
  .option('--description <desc>', 'Rule description', '')
  .option('--category <cat>', 'Category: system|filesystem|network|resource|custom', 'custom')
  .option('--severity <sev>', 'Severity: critical|high|medium|low', 'medium')
  .option('--pattern <pattern>', 'Regex pattern (can use multiple times)')
  .option('--cli-tool <tool>', 'CLI tool this rule applies to (can use multiple times)')
  .action(async (options) => {
    const sessionId = getCurrentSessionId();

    if (!options.name || !options.pattern) {
      const error = 'Name and at least one pattern are required';
      console.error(`❌ ${error}`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'add_rule',
        input: { name: options.name },
        success: false,
        error,
      });
      process.exit(1);
    }

    const patterns = Array.isArray(options.pattern) ? options.pattern : [options.pattern];
    const cliTools = options.cliTool ? (Array.isArray(options.cliTool) ? options.cliTool : [options.cliTool]) : undefined;

    const manager = getSecurityManager();
    const rule = manager.addRule({
      name: options.name,
      description: options.description,
      category: options.category as any,
      severity: options.severity as any,
      patterns,
      cliTools,
      enabled: true,
    });

    const output = `\n✅ Rule added successfully!\nID: ${rule.id}\nName: ${rule.name}\nSeverity: ${rule.severity}\n`;
    console.log(output);

    audit.log({
      event: AuditEventType.SECURITY_ACTION,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Security',
      action: 'add_rule',
      input: { name: rule.name, severity: rule.severity, patterns },
      output: { ruleId: rule.id },
      success: true,
    });
  });

securityCmd
  .command('update <ruleId>')
  .description('Update an existing security rule')
  .option('--name <name>', 'Update rule name')
  .option('--description <desc>', 'Update description')
  .option('--category <cat>', 'Update category')
  .option('--severity <sev>', 'Update severity')
  .option('--add-pattern <pattern>', 'Add new pattern (can use multiple times)')
  .option('--remove-pattern <pattern>', 'Remove pattern (can use multiple times)')
  .action(async (ruleId, options) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const existing = manager.getRuleById(ruleId);

    if (!existing) {
      console.error(`❌ Rule not found: ${ruleId}`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'update_rule',
        input: { ruleId },
        success: false,
        error: 'Rule not found',
      });
      process.exit(1);
    }

    const updates: any = {};
    if (options.name) updates.name = options.name;
    if (options.description !== undefined) updates.description = options.description;
    if (options.category) updates.category = options.category;
    if (options.severity) updates.severity = options.severity;

    let newPatterns = [...existing.patterns];
    if (options.addPattern) {
      const addPatterns = Array.isArray(options.addPattern) ? options.addPattern : [options.addPattern];
      newPatterns = [...new Set([...newPatterns, ...addPatterns])];
    }
    if (options.removePattern) {
      const removePatterns = Array.isArray(options.removePattern) ? options.removePattern : [options.removePattern];
      newPatterns = newPatterns.filter(p => !removePatterns.includes(p));
    }
    if (options.addPattern || options.removePattern) {
      updates.patterns = newPatterns;
    }

    const updated = manager.updateRule(ruleId, updates);

    if (updated) {
      console.log(`\n✅ Rule updated successfully!\n`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'update_rule',
        input: { ruleId, updates },
        output: { success: true },
        success: true,
      });
    } else {
      console.error(`❌ Failed to update rule\n`);
      process.exit(1);
    }
  });

securityCmd
  .command('delete <ruleId>')
  .description('Delete a security rule')
  .action(async (ruleId) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const success = manager.deleteRule(ruleId);

    if (success) {
      console.log(`\n✅ Rule deleted successfully: ${ruleId}\n`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'delete_rule',
        input: { ruleId },
        success: true,
      });
    } else {
      console.error(`❌ Rule not found: ${ruleId}\n`);
      process.exit(1);
    }
  });

securityCmd
  .command('enable <ruleId>')
  .description('Enable a security rule')
  .action(async (ruleId) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const success = manager.enableRule(ruleId);

    if (success) {
      console.log(`\n✅ Rule enabled: ${ruleId}\n`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'enable_rule',
        input: { ruleId },
        output: { result: 'ENABLED' },
        success: true,
      });
    } else {
      console.error(`❌ Rule not found: ${ruleId}\n`);
      process.exit(1);
    }
  });

securityCmd
  .command('disable <ruleId>')
  .description('Disable a security rule')
  .action(async (ruleId) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const success = manager.disableRule(ruleId);

    if (success) {
      console.log(`\n✅ Rule disabled: ${ruleId}\n`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'disable_rule',
        input: { ruleId },
        output: { result: 'DISABLED' },
        success: true,
      });
    } else {
      console.error(`❌ Rule not found: ${ruleId}\n`);
      process.exit(1);
    }
  });

securityCmd
  .command('import <filePath>')
  .description('Import security rules from a JSON file')
  .action(async (filePath) => {
    const sessionId = getCurrentSessionId();
    try {
      const manager = getSecurityManager();
      const imported = await manager.importRulesFromFile(filePath);
      console.log(`\n✅ Imported ${imported} rules successfully!\n`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'import_rules',
        input: { filePath },
        output: { count: imported },
        success: true,
      });
    } catch (e: any) {
      console.error(`❌ Import failed:`, e.message);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'import_rules',
        input: { filePath },
        success: false,
        error: e.message,
      });
      process.exit(1);
    }
  });

securityCmd
  .command('export <filePath>')
  .description('Export security rules to a JSON file')
  .option('--include-disabled', 'Include disabled rules')
  .action(async (filePath, options) => {
    const sessionId = getCurrentSessionId();
    try {
      const manager = getSecurityManager();
      manager.exportRulesToFile(filePath, { includeDisabled: options.includeDisabled });
      console.log(`\n✅ Rules exported to: ${filePath}\n`);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'export_rules',
        input: { filePath, includeDisabled: options.includeDisabled },
        success: true,
      });
    } catch (e: any) {
      console.error(`❌ Export failed:`, e.message);
      audit.log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'export_rules',
        input: { filePath },
        success: false,
        error: e.message,
      });
      process.exit(1);
    }
  });

securityCmd
  .command('test <command>')
  .description('Test if a command is dangerous')
  .option('--cli-tool <tool>', 'CLI tool to test against')
  .action(async (command, options) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const result = manager.detectCommand(command, options.cliTool);

    const output: string[] = [];
    output.push('\n🔍 Test Result:');
    output.push('─'.repeat(60));
    output.push(`Command: ${command}`);

    if (options.cliTool) {
      output.push(`CLI Tool: ${options.cliTool}`);
    }

    if (result.isDangerous) {
      output.push(`\n❌ DANGEROUS!`);
      output.push(`Severity: ${result.severity}`);
      if (result.rule) {
        output.push(`Rule: ${result.rule.name}`);
        output.push(`Description: ${result.rule.description}`);
      }
      if (result.matchedPattern) {
        output.push(`Pattern: ${result.matchedPattern}`);
      }

      audit.securityAlert(result.rule?.id || 'unknown', command, result.severity || 'unknown', sessionId);
      audit.securityAction('test_command', command, 'DANGEROUS', sessionId);
    } else {
      output.push(`\n✅ SAFE`);
      audit.securityAction('test_command', command, 'SAFE', sessionId);
    }
    output.push('');

    console.log(output.join('\n'));
    audit.cliOutput('security test', output.join('\n'), sessionId);
  });

securityCmd
  .command('reset')
  .description('Reset all rules to defaults')
  .option('--force', 'Skip confirmation')
  .action(async (options) => {
    const sessionId = getCurrentSessionId();

    if (!options.force) {
      console.warn('⚠️ This will reset all security rules to defaults!');
      console.warn('⚠️ Custom rules will be lost!');
      console.warn('Use --force to skip this warning.\n');
      process.exit(1);
    }

    const manager = getSecurityManager();
    manager.resetToDefaults();
    console.log(`\n✅ All rules reset to defaults!\n`);

    audit.log({
      event: AuditEventType.SECURITY_ACTION,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Security',
      action: 'reset_rules',
      input: {},
      success: true,
    });
  });

securityCmd
  .command('config')
  .description('Show current security configuration')
  .action(async () => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManager();
    const config = manager.getConfig();
    const db = manager.getDatabase();

    const output: string[] = [];
    output.push('\n⚙️ Security Configuration:');
    output.push('─'.repeat(60));
    output.push(`Database Version: ${db.version}`);
    output.push(`Last Updated: ${db.lastUpdated}`);
    output.push(`Auto Update: ${config.autoUpdate ? 'Enabled' : 'Disabled'}`);
    output.push(`Total Rules: ${db.rules.length}`);
    output.push(`Enabled Rules: ${manager.getEnabledRules().length}`);
    output.push('');

    console.log(output.join('\n'));
    audit.cliOutput('security config', output.join('\n'), sessionId);
    audit.log({
      event: AuditEventType.SECURITY_ACTION,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Security',
      action: 'view_config',
      input: {},
      output: { totalRules: db.rules.length, enabledRules: manager.getEnabledRules().length },
      success: true,
    });
  });
