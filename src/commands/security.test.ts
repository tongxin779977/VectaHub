import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import { createSecurityCmd } from './security.js';
import { setTestMode } from '../security-protocol/manager.js';

describe('security command', () => {
  let oldHome: string | undefined;
  let oldAuditDisabled: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    oldAuditDisabled = process.env.VECTAHUB_AUDIT_DISABLED;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-security-cmd-'));
    process.env.VECTAHUB_AUDIT_DISABLED = '1';
    resetDefaultContext();
    setTestMode(false);
  });

  afterEach(() => {
    setTestMode(false);
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    if (oldAuditDisabled === undefined) {
      delete process.env.VECTAHUB_AUDIT_DISABLED;
    } else {
      process.env.VECTAHUB_AUDIT_DISABLED = oldAuditDisabled;
    }
    rmSync(tempHome, { recursive: true, force: true });
    resetDefaultContext();
  });

  it.each([
    { args: ['status'], action: 'security status' },
    { args: ['policy'], action: 'security policy' },
    { args: ['list'], action: 'security list' },
    { args: ['add', '--name', 'test-rule', '--pattern', '^test$'], action: 'security add' },
    { args: ['update', 'rule-sudo', '--name', 'updated-rule'], action: 'security update' },
    { args: ['delete', 'rule-sudo'], action: 'security delete' },
    { args: ['enable', 'rule-sudo'], action: 'security enable' },
    { args: ['disable', 'rule-sudo'], action: 'security disable' },
    { args: ['import', 'rules.json'], action: 'security import' },
    { args: ['export', 'rules.json'], action: 'security export' },
    { args: ['test', 'npm test'], action: 'security test' },
    { args: ['reset', '--force'], action: 'security reset' },
    { args: ['config'], action: 'security config' },
  ])('fails with contextual error when security manager initialization fails for $action', async ({ args, action }) => {
    const blockedHome = join(tempHome, 'blocked-home');
    writeFileSync(blockedHome, 'not-a-directory', 'utf-8');
    process.env.VECTAHUB_HOME = blockedHome;

    await expect(
      createSecurityCmd(getDefaultContext()).parseAsync(args, { from: 'user' })
    ).rejects.toThrow(`Failed to initialize security manager for ${action}`);
  });
});
