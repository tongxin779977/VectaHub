import type { CommandRule } from './types.js';
import type { SecurityTemplate } from './types.js';

export const DEFAULT_TEMPLATES: Record<SecurityTemplate, CommandRule[]> = {
  default: [
    // --- Block rules (evaluated first by analyzeCommand) ---
    { id: 'block-rm-rf', pattern: 'rm -rf /', action: 'block', reason: '删除根目录极其危险', description: '阻止删除系统根目录' },
    { id: 'block-rm-rf-root', pattern: 'rm -rf /root', action: 'block', reason: '删除root目录' },
    { id: 'block-rm-no-preserve-root', pattern: 'rm.*--no-preserve-root', action: 'block', reason: '尝试删除根文件系统' },
    { id: 'block-sudo', pattern: 'sudo rm -rf *', action: 'block', reason: '使用sudo删除所有' },
    { id: 'block-all-sudo', pattern: '^sudo\\s', action: 'block', reason: 'sudo 提权命令需要额外确认', description: '阻止所有 sudo 命令' },
    { id: 'block-chmod-777', pattern: 'chmod 777 /', action: 'block', reason: '全局设置777权限' },
    { id: 'block-chmod-777-root', pattern: 'chmod 777 /root', action: 'block', reason: 'root目录777权限' },
    { id: 'block-suid', pattern: 'chmod.*\\+s|chmod.*(4755|6755|2755)', action: 'block', reason: '设置 SUID/SGID 位可能导致提权' },
    { id: 'block-overwrite-etc-passwd', pattern: 'echo * > /etc/passwd', action: 'block', reason: '覆盖系统密码文件' },
    { id: 'block-overwrite-etc-shadow', pattern: 'echo * > /etc/shadow', action: 'block', reason: '覆盖系统影子密码文件' },
    { id: 'block-dd-if', pattern: 'dd if=/dev/zero of=/dev/sda', action: 'block', reason: '直接写入块设备' },
    { id: 'block-git-force-push', pattern: 'git push.*(--force|-f\\b)', action: 'block', reason: '强制推送可能覆盖远程历史', description: '阻止 git push --force / -f' },
    { id: 'block-curl-pipe-shell', pattern: '(curl|wget).*\\|.*\\b(sh|bash|zsh|dash)\\b', action: 'block', reason: '下载并执行远程脚本极其危险', description: '阻止 curl/wget 管道到 shell' },
    { id: 'block-base64-exec', pattern: 'base64.*\\|.*\\b(sh|bash)\\b', action: 'block', reason: 'Base64 编码命令执行可能隐藏恶意意图' },
    { id: 'block-reverse-shell', pattern: '(nc|ncat|netcat).*(-e|--exec)', action: 'block', reason: 'Netcat 反向/绑定 shell' },
    { id: 'block-dev-tcp', pattern: '/dev/tcp/', action: 'block', reason: 'Bash /dev/tcp 网络连接（可能为反弹 shell）' },
    { id: 'block-find-exec-rm', pattern: 'find.*-exec.*(rm|shred|unlink)', action: 'block', reason: '文件搜索配合破坏性执行' },
    { id: 'block-read-sensitive-files', pattern: '(cat|less|more|head|tail).*(/etc/passwd|/etc/shadow|/etc/sudoers|\\.ssh/id_)', action: 'block', reason: '尝试读取敏感系统或凭证文件' },
    // --- Allow rules ---
    { id: 'allow-git-status', pattern: 'git status', action: 'allow', description: '允许查看 git 状态' },
    { id: 'allow-git-diff', pattern: 'git diff', action: 'allow', description: '允许查看 git diff' },
    { id: 'allow-git-log', pattern: 'git log', action: 'allow', description: '允许查看 git 日志' },
    { id: 'allow-git-add', pattern: 'git add', action: 'allow', description: '允许 git add' },
    { id: 'allow-git-commit', pattern: 'git commit', action: 'allow', description: '允许 git commit' },
    { id: 'allow-npm-install', pattern: 'npm install', action: 'allow', description: '允许 npm 安装' },
    { id: 'allow-npm-run', pattern: 'npm run', action: 'allow', description: '允许 npm run' },
  ],
  strict: [
    { id: 'block-all-sudo', pattern: 'sudo *', action: 'block', reason: 'STRICT模式下禁止所有sudo' },
    { id: 'block-rm-rf', pattern: 'rm -rf *', action: 'block', reason: '禁止递归删除' },
    { id: 'allow-ls', pattern: 'ls', action: 'allow', description: '允许ls' },
    { id: 'allow-pwd', pattern: 'pwd', action: 'allow', description: '允许pwd' },
    { id: 'allow-cd', pattern: 'cd', action: 'allow', description: '允许cd' },
    { id: 'allow-git', pattern: 'git *', action: 'allow', description: '允许git操作' },
    { id: 'allow-npm', pattern: 'npm *', action: 'allow', description: '允许npm操作' },
  ],
  relaxed: [
    { id: 'allow-everything', pattern: '*', action: 'allow', description: 'RELAXED模式下允许所有' },
  ],
};

export function getSecurityTemplate(template: SecurityTemplate): CommandRule[] {
  return DEFAULT_TEMPLATES[template] || DEFAULT_TEMPLATES.default;
}
