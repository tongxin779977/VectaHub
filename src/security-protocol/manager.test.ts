import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSecurityManager, setTestMode } from './manager.js';

describe('SecurityProtocolManager', () => {
  beforeEach(() => {
    setTestMode(true);
  });

  afterEach(() => {
    setTestMode(false);
  });

  it('resetToDefaults should clear enabled/disabled overrides and restore builtin rules', () => {
    const manager = getSecurityManager();

    expect(manager.getEnabledRules().some((rule) => rule.id === 'rule-sudo')).toBe(true);

    manager.disableRule('rule-sudo');
    expect(manager.getEnabledRules().some((rule) => rule.id === 'rule-sudo')).toBe(false);

    manager.resetToDefaults();

    expect(manager.getEnabledRules().some((rule) => rule.id === 'rule-sudo')).toBe(true);
    expect(manager.getConfig().rules.enabled).toEqual([]);
    expect(manager.getConfig().rules.disabled).toEqual([]);
  });
});
