import type { CommandRule } from './types.js';
import type { SecurityTemplate } from './types.js';

export const DEFAULT_TEMPLATES: Record<SecurityTemplate, CommandRule[]> = {
  default: [
    { id: 'block-rm-rf', pattern: 'rm -rf /', action: 'block', reason: '删除根目录极其危险', description: '阻止删除系统根目录' },
    { id: 'block-rm-rf-root', pattern: 'rm -rf /root', action: 'block', reason: '删除root目录' },
    { id: 'block-sudo', pattern: 'sudo rm -rf *', action: 'block', reason: '使用sudo删除所有' },
    { id: 'block-chmod-777', pattern: 'chmod 777 /', action: 'block', reason: '全局设置777权限' },
    { id: 'block-chmod-777-root', pattern: 'chmod 777 /root', action: 'block', reason: 'root目录777权限' },
    { id: 'block-overwrite-etc-passwd', pattern: 'echo * > /etc/passwd', action: 'block', reason: '覆盖系统密码文件' },
    { id: 'block-overwrite-etc-shadow', pattern: 'echo * > /etc/shadow', action: 'block', reason: '覆盖系统影子密码文件' },
    { id: 'block-dd-if', pattern: 'dd if=/dev/zero of=/dev/sda', action: 'block', reason: '直接写入块设备' },
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
