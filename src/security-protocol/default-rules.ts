import type { SecurityRule } from './types.js';

export const DEFAULT_SECURITY_RULES: SecurityRule[] = [
  {
    id: 'rule-sudo',
    name: 'Sudo Command',
    description: 'Detects sudo commands for privilege escalation',
    category: 'system',
    severity: 'critical',
    patterns: ['^sudo\\s+', '^doas\\s+'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-rm-root',
    name: 'Root Directory Removal',
    description: 'Detects attempts to remove root directory',
    category: 'filesystem',
    severity: 'critical',
    patterns: ['^rm\\s+.*-rf.*\\s+/', '^rm\\s+.*-fr.*\\s+/', '^rm\\s+.*-r.*\\s+/'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-chmod-777',
    name: 'Global Permission Change',
    description: 'Detects chmod 777 on system directories',
    category: 'filesystem',
    severity: 'critical',
    patterns: ['^chmod\\s+777', '^chmod\\s+.*-R.*777'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-dd-write',
    name: 'Disk Direct Write',
    description: 'Detects dd writing directly to disk devices',
    category: 'system',
    severity: 'critical',
    patterns: ['^dd\\s+.*of=/dev/'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-mkfs',
    name: 'Filesystem Format',
    description: 'Detects mkfs commands for formatting disks',
    category: 'system',
    severity: 'critical',
    patterns: ['^mkfs', '^mke2fs', '^mkfs\\.'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-shutdown',
    name: 'System Shutdown/Reboot',
    description: 'Detects system shutdown or reboot commands',
    category: 'system',
    severity: 'critical',
    patterns: ['^shutdown', '^reboot', '^halt', '^poweroff', '^init\\s+[06]', '^telinit\\s+[06]'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-fork-bomb',
    name: 'Fork Bomb',
    description: 'Detects fork bomb patterns',
    category: 'resource',
    severity: 'critical',
    patterns: [':\\(\\)\\s*\\{\\s*:\\s*\\|\\s*:\\s*&\\s*\\}\\s*;'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-overwrite-etc',
    name: 'Overwrite System Configuration',
    description: 'Detects attempts to overwrite files in /etc directory',
    category: 'filesystem',
    severity: 'high',
    patterns: ['>\\s*/etc/', '>>\\s*/etc/'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-mv-root',
    name: 'Move Root Directory',
    description: 'Detects attempts to move root directory',
    category: 'filesystem',
    severity: 'high',
    patterns: ['^mv\\s+/\\s+', '^mv\\s+/\\s*$'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-bind-mount',
    name: 'Bind Mount',
    description: 'Detects bind mount operations',
    category: 'filesystem',
    severity: 'high',
    patterns: ['^mount\\s+.*--bind', '^mount\\s+.*-B'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-iptables',
    name: 'Firewall Modification',
    description: 'Detects iptables or firewall modification commands',
    category: 'network',
    severity: 'high',
    patterns: ['^iptables', '^ip6tables', '^firewall-cmd', '^ufw'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-network-down',
    name: 'Network Interface Down',
    description: 'Detects commands to bring network interfaces down',
    category: 'network',
    severity: 'high',
    patterns: ['^ip\\s+link\\s+delete', '^ip\\s+link\\s+set.*down', '^ifconfig.*down'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-pipe-shell',
    name: 'Pipe to Shell',
    description: 'Detects piping commands directly to shell',
    category: 'resource',
    severity: 'medium',
    patterns: ['\\|\\s*sh\\s*\\|', '\\|\\s*bash\\s*\\|', '\\|\\s*zsh\\s*\\|'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-eval',
    name: 'Eval Command',
    description: 'Detects eval usage which can execute arbitrary code',
    category: 'resource',
    severity: 'medium',
    patterns: ['^eval\\s+'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-write-dev',
    name: 'Write to Device',
    description: 'Detects writing directly to device files',
    category: 'filesystem',
    severity: 'medium',
    patterns: ['>\\s*/dev/', '>>\\s*/dev/'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-rm-node-modules',
    name: 'Remove Node Modules',
    description: 'Detects removal of node_modules directory',
    category: 'filesystem',
    severity: 'low',
    patterns: ['^rm\\s+.*-rf.*node_modules'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  },
  {
    id: 'rule-npm-install-global',
    name: 'Global NPM Install',
    description: 'Detects global npm package installation',
    category: 'resource',
    severity: 'low',
    patterns: ['^npm\\s+install\\s+.*-g', '^npm\\s+install\\s+.*--global'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'builtin'
  }
];

export function getDefaultRules(): SecurityRule[] {
  return [...DEFAULT_SECURITY_RULES];
}
