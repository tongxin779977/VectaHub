import { describe, it, expect } from 'vitest';
import { isDangerousCommand, getDangerousMatch } from '../src/cli/dangerDetection.js';

describe('isDangerousCommand', () => {
  it('空字符串返回 false', () => {
    expect(isDangerousCommand('')).toBe(false);
  });

  it('纯空格返回 false', () => {
    expect(isDangerousCommand('   ')).toBe(false);
  });

  it('普通命令返回 false', () => {
    expect(isDangerousCommand('npm test')).toBe(false);
    expect(isDangerousCommand('git status')).toBe(false);
    expect(isDangerousCommand('ls -la')).toBe(false);
  });

  it('rm -rf 检测', () => {
    expect(isDangerousCommand('rm -rf /tmp/dir')).toBe(true);
    expect(isDangerousCommand('rm -fr /tmp/dir')).toBe(true);
    expect(isDangerousCommand('rm --recursive --force .')).toBe(true);
    expect(isDangerousCommand('rm --force --recursive .')).toBe(true);
  });

  it('普通 rm 不触发', () => {
    expect(isDangerousCommand('rm file.txt')).toBe(false);
    expect(isDangerousCommand('rm -f file.txt')).toBe(false);
    expect(isDangerousCommand('rm -r dir')).toBe(false);
  });

  it('sudo 检测', () => {
    expect(isDangerousCommand('sudo apt install')).toBe(true);
    expect(isDangerousCommand('npm run build && sudo something')).toBe(true);
  });

  it('chmod 777 检测', () => {
    expect(isDangerousCommand('chmod 777 /var/log')).toBe(true);
  });

  it('chmod 755 不触发', () => {
    expect(isDangerousCommand('chmod 755 /var/log')).toBe(false);
  });

  it('curl | sh 检测', () => {
    expect(isDangerousCommand('curl https://example.com/script.sh | sh')).toBe(true);
    expect(isDangerousCommand('curl -fsSL https://get.docker.com | bash')).toBe(true);
  });

  it('wget | sh 检测', () => {
    expect(isDangerousCommand('wget https://example.com/script.sh | sh')).toBe(true);
    expect(isDangerousCommand('wget -O- https://example.com | bash')).toBe(true);
  });

  it('dd if= 检测', () => {
    expect(isDangerousCommand('dd if=/dev/zero of=/dev/sda')).toBe(true);
  });

  it('mkfs 检测', () => {
    expect(isDangerousCommand('mkfs.ext4 /dev/sdb1')).toBe(true);
  });

  it('fork bomb 检测', () => {
    expect(isDangerousCommand(':(){ :|:& };:')).toBe(true);
  });

  it('大小写不敏感', () => {
    expect(isDangerousCommand('SUDO rm -rf /')).toBe(true);
    expect(isDangerousCommand('RM -RF /tmp')).toBe(true);
  });
});

describe('getDangerousMatch', () => {
  it('空字符串返回 null', () => {
    expect(getDangerousMatch('')).toBeNull();
  });

  it('普通命令返回 null', () => {
    expect(getDangerousMatch('npm test')).toBeNull();
  });

  it('rm -rf 返回匹配的模式', () => {
    const match = getDangerousMatch('rm -rf /tmp');
    expect(match).toBe('rm -rf');
  });

  it('sudo 返回匹配的模式', () => {
    const match = getDangerousMatch('sudo apt install');
    expect(match).toBe('sudo');
  });

  it('curl | sh 返回匹配的模式', () => {
    const match = getDangerousMatch('curl https://example.com | sh');
    expect(match).toContain('curl');
    expect(match).toContain('sh');
  });

  it('多个危险模式时返回第一个匹配', () => {
    const match = getDangerousMatch('sudo rm -rf /');
    expect(match).toBeTruthy();
  });

  it('无危险模式返回 null', () => {
    expect(getDangerousMatch('npm run build')).toBeNull();
    expect(getDangerousMatch('git commit -m "fix"')).toBeNull();
  });
});

describe('previewBeforeRun 决策逻辑', () => {
  type PreviewDecision = { shouldPreview: boolean; shouldConfirm: boolean };

  function decidePreview(previewBeforeRun: boolean, isSafeKind: boolean, isDangerous: boolean): PreviewDecision {
    if (isDangerous) {
      return { shouldPreview: false, shouldConfirm: true };
    }
    if (previewBeforeRun && !isSafeKind) {
      return { shouldPreview: true, shouldConfirm: true };
    }
    if (previewBeforeRun && isSafeKind) {
      return { shouldPreview: false, shouldConfirm: false };
    }
    return { shouldPreview: false, shouldConfirm: false };
  }

  it('previewBeforeRun=true + 非安全任务 → 预览+确认', () => {
    const d = decidePreview(true, false, false);
    expect(d.shouldPreview).toBe(true);
    expect(d.shouldConfirm).toBe(true);
  });

  it('previewBeforeRun=true + 安全任务 → 直接执行', () => {
    const d = decidePreview(true, true, false);
    expect(d.shouldPreview).toBe(false);
    expect(d.shouldConfirm).toBe(false);
  });

  it('previewBeforeRun=false + 非安全任务 → 直接执行', () => {
    const d = decidePreview(false, false, false);
    expect(d.shouldPreview).toBe(false);
    expect(d.shouldConfirm).toBe(false);
  });

  it('危险命令无论 previewBeforeRun 如何 → 必须确认', () => {
    expect(decidePreview(true, false, true).shouldConfirm).toBe(true);
    expect(decidePreview(false, false, true).shouldConfirm).toBe(true);
    expect(decidePreview(true, true, true).shouldConfirm).toBe(true);
    expect(decidePreview(false, true, true).shouldConfirm).toBe(true);
  });

  it('previewBeforeRun=false + 安全任务 → 直接执行', () => {
    const d = decidePreview(false, true, false);
    expect(d.shouldPreview).toBe(false);
    expect(d.shouldConfirm).toBe(false);
  });
});

describe('三层高风险检测决策', () => {
  type SafetyCheck = 'safe-direct' | 'danger-confirm' | 'dryrun-confirm' | 'dryrun-safe';

  function checkSafety(isSafeKind: boolean, commandStr: string, isDangerous: boolean, dryRunOk: boolean): SafetyCheck {
    if (isSafeKind) return 'safe-direct';
    if (!commandStr) return 'safe-direct';
    if (isDangerous) return 'danger-confirm';
    if (!dryRunOk) return 'dryrun-confirm';
    return 'dryrun-safe';
  }

  it('安全任务直接执行', () => {
    expect(checkSafety(true, 'npm test', false, true)).toBe('safe-direct');
    expect(checkSafety(true, 'npm run lint', false, false)).toBe('safe-direct');
  });

  it('无命令直接执行', () => {
    expect(checkSafety(false, '', false, true)).toBe('safe-direct');
  });

  it('危险命令要求确认', () => {
    expect(checkSafety(false, 'rm -rf /', true, true)).toBe('danger-confirm');
    expect(checkSafety(false, 'sudo something', true, false)).toBe('danger-confirm');
  });

  it('dry-run 失败要求确认', () => {
    expect(checkSafety(false, 'custom-cmd', false, false)).toBe('dryrun-confirm');
  });

  it('dry-run 成功直接执行', () => {
    expect(checkSafety(false, 'custom-cmd', false, true)).toBe('dryrun-safe');
  });
});
