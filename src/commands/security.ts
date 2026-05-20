import { Command } from 'commander';
import { getSecurityManager } from '../security-protocol/index.js';
import { AuditEventType } from '../infrastructure/audit/index.js';
import { getDefaultContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

function getSecurityManagerOrThrow(action: string) {
  try {
    return getSecurityManager();
  } catch (error) {
    throw new VectaHubError(`Failed to initialize security manager for ${action}`, ErrorType.FILESYSTEM, error);
  }
}

function getAuditHelper() {
  return getDefaultContext().audit.getHelper();
}

function getCurrentSessionId(): string {
  return getDefaultContext().audit.getLogger().getSessionId();
}

export const securityCmd = new Command('security')
  .description('Security protocol management commands');

securityCmd
  .command('status')
  .description('Show current security status')
  .action(async () => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security status');
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
    getAuditHelper().cliOutput('security status', output.join('\n'), sessionId);
  });

securityCmd
  .command('policy')
  .description('Show current security policy details')
  .action(async () => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security policy');
    const config = manager.getConfig();

    const output: string[] = [];
    output.push('\n📋 Security Policy:');
    output.push('─'.repeat(60));
    output.push(`Auto Update: ${config.autoUpdate ? 'Enabled' : 'Disabled'}`);
    output.push(`Database Path: ${config.databasePath}`);
    output.push('');

    console.log(output.join('\n'));
    getAuditHelper().cliOutput('security policy', output.join('\n'), sessionId);
  });

securityCmd
  .command('list')
  .description('List all security rules')
  .option('--enabled', 'Show only enabled rules')
  .option('--disabled', 'Show only disabled rules')
  .action(async (options: { enabled?: boolean; disabled?: boolean }) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security list');
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
    getAuditHelper().cliOutput('security list', output.join('\n'), sessionId);
    getAuditHelper().log({
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
  .action(async (options: {
    name: string;
    description: string;
    category: 'system' | 'filesystem' | 'network' | 'resource' | 'custom';
    severity: 'critical' | 'high' | 'medium' | 'low';
    pattern: string | string[];
    cliTool?: string | string[];
  }) => {
    const sessionId = getCurrentSessionId();

    if (!options.name || !options.pattern) {
      const errorMessage = 'Name and at least one pattern are required';
      console.error(`❌ ${errorMessage}`);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'add_rule',
        input: { name: options.name },
        success: false,
        error: errorMessage,
      });
      throw new VectaHubError(errorMessage, ErrorType.CONFIGURATION);
    }

    const patterns = Array.isArray(options.pattern) ? options.pattern : [options.pattern];
    const cliTools = options.cliTool ? (Array.isArray(options.cliTool) ? options.cliTool : [options.cliTool]) : undefined;

    const manager = getSecurityManagerOrThrow('security add');
    const rule = manager.addRule({
      name: options.name,
      description: options.description,
      category: options.category,
      severity: options.severity,
      patterns,
      cliTools,
      enabled: true,
    });

    const output = `\n✅ Rule added successfully!\nID: ${rule.id}\nName: ${rule.name}\nSeverity: ${rule.severity}\n`;
    console.log(output);

    getAuditHelper().log({
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
  .action(async (ruleId: string, options: {
    name?: string;
    description?: string;
    category?: 'system' | 'filesystem' | 'network' | 'resource' | 'custom';
    severity?: 'critical' | 'high' | 'medium' | 'low';
    addPattern?: string | string[];
    removePattern?: string | string[];
  }) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security update');
    const existing = manager.getRuleById(ruleId);

    if (!existing) {
      const errorMessage = `Rule not found: ${ruleId}`;
      console.error(`❌ ${errorMessage}`);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'update_rule',
        input: { ruleId },
        success: false,
        error: errorMessage,
      });
      throw new VectaHubError(errorMessage, ErrorType.CONFIGURATION);
    }

    const updates: Partial<{
      name: string;
      description: string;
      category: 'system' | 'filesystem' | 'network' | 'resource' | 'custom';
      severity: 'critical' | 'high' | 'medium' | 'low';
      patterns: string[];
    }> = {};
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
      getAuditHelper().log({
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
      const errorMessage = 'Failed to update rule';
      console.error(`❌ ${errorMessage}\n`);
      throw new VectaHubError(errorMessage, ErrorType.RUNTIME);
    }
  });

securityCmd
  .command('delete <ruleId>')
  .description('Delete a security rule')
  .action(async (ruleId: string) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security delete');
    const success = manager.deleteRule(ruleId);

    if (success) {
      console.log(`\n✅ Rule deleted successfully: ${ruleId}\n`);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'delete_rule',
        input: { ruleId },
        success: true,
      });
    } else {
      const errorMessage = `Rule not found: ${ruleId}`;
      console.error(`❌ ${errorMessage}\n`);
      throw new VectaHubError(errorMessage, ErrorType.CONFIGURATION);
    }
  });

securityCmd
  .command('enable <ruleId>')
  .description('Enable a security rule')
  .action(async (ruleId: string) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security enable');
    const success = manager.enableRule(ruleId);

    if (success) {
      console.log(`\n✅ Rule enabled: ${ruleId}\n`);
      getAuditHelper().log({
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
      const errorMessage = `Rule not found: ${ruleId}`;
      console.error(`❌ ${errorMessage}\n`);
      throw new VectaHubError(errorMessage, ErrorType.CONFIGURATION);
    }
  });

securityCmd
  .command('disable <ruleId>')
  .description('Disable a security rule')
  .action(async (ruleId: string) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security disable');
    const success = manager.disableRule(ruleId);

    if (success) {
      console.log(`\n✅ Rule disabled: ${ruleId}\n`);
      getAuditHelper().log({
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
      const errorMessage = `Rule not found: ${ruleId}`;
      console.error(`❌ ${errorMessage}\n`);
      throw new VectaHubError(errorMessage, ErrorType.CONFIGURATION);
    }
  });

securityCmd
  .command('import <filePath>')
  .description('Import security rules from a JSON file')
  .action(async (filePath: string) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security import');
    try {
      const imported = await manager.importRulesFromFile(filePath);
      console.log(`\n✅ Imported ${imported} rules successfully!\n`);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'import_rules',
        input: { filePath },
        output: { count: imported },
        success: true,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`❌ Import failed:`, errorMessage);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'import_rules',
        input: { filePath },
        success: false,
        error: errorMessage,
      });
      throw new VectaHubError(`Import failed: ${errorMessage}`, ErrorType.RUNTIME);
    }
  });

securityCmd
  .command('export <filePath>')
  .description('Export security rules to a JSON file')
  .option('--include-disabled', 'Include disabled rules')
  .action(async (filePath: string, options: { includeDisabled?: boolean }) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security export');
    try {
      manager.exportRulesToFile(filePath, { includeDisabled: options.includeDisabled });
      console.log(`\n✅ Rules exported to: ${filePath}\n`);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'export_rules',
        input: { filePath, includeDisabled: options.includeDisabled },
        success: true,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`❌ Export failed:`, errorMessage);
      getAuditHelper().log({
        event: AuditEventType.SECURITY_ACTION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Security',
        action: 'export_rules',
        input: { filePath },
        success: false,
        error: errorMessage,
      });
      throw new VectaHubError(`Export failed: ${errorMessage}`, ErrorType.RUNTIME);
    }
  });

securityCmd
  .command('test <command>')
  .description('Test if a command is dangerous')
  .option('--cli-tool <tool>', 'CLI tool to test against')
  .option('--json', 'Output results in JSON format')
  .action(async (command: string, options: { cliTool?: string; json?: boolean }) => {
    const sessionId = getCurrentSessionId();
    const manager = getSecurityManagerOrThrow('security test');
    const result = manager.detectCommand(command, options.cliTool);

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        isDangerous: result.isDangerous,
        severity: result.severity,
        rule: result.rule ? {
          id: result.rule.id,
          name: result.rule.name,
          description: result.rule.description
        } : null,
        matchedPattern: result.matchedPattern
      }, null, 2));
      return;
    }

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

      getAuditHelper().securityAlert(result.rule?.id || 'unknown', command, result.severity || 'unknown', sessionId);
      getAuditHelper().securityAction('test_command', command, 'DANGEROUS', sessionId);
    } else {
      output.push(`\n✅ SAFE`);
      getAuditHelper().securityAction('test_command', command, 'SAFE', sessionId);
    }
    output.push('');

    console.log(output.join('\n'));
    getAuditHelper().cliOutput('security test', output.join('\n'), sessionId);
  });

securityCmd
  .command('reset')
  .description('Reset all rules to defaults')
  .option('--force', 'Skip confirmation')
  .action(async (options: { force?: boolean }) => {
    const sessionId = getCurrentSessionId();

    if (!options.force) {
      console.warn('⚠️ This will reset all security rules to defaults!');
      console.warn('⚠️ Custom rules will be lost!');
      console.warn('Use --force to skip this warning.\n');
      throw new VectaHubError('Confirmation required. Use --force to skip.', ErrorType.CONFIGURATION);
    }

    const manager = getSecurityManagerOrThrow('security reset');
    manager.resetToDefaults();
    console.log(`\n✅ All rules reset to defaults!\n`);

    getAuditHelper().log({
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
    const manager = getSecurityManagerOrThrow('security config');
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
    getAuditHelper().cliOutput('security config', output.join('\n'), sessionId);
    getAuditHelper().log({
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
