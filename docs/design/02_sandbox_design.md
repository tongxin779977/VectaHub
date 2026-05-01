# 沙盒架构设计文档

> 本文档定义 VectaHub 沙盒系统的架构设计与实现细节

---

## 0. 实现状态

| 组件 | 状态 | 说明 |
|------|------|------|
| **危险命令检测** | ✅ 已实现 | 规则匹配 + 黑名单 |
| **黑名单/白名单** | ✅ 已实现 | 配置化规则引擎 |
| **sandbox-exec 集成** | ✅ 已实现 | macOS 原生沙盒 (无需 sudo) |
| **bubblewrap 集成** | ✅ 已实现 | Linux 用户态隔离 (sandbox.ts) |
| **unshare 集成** | ✅ 已实现 | Linux 命名空间隔离 |
| **降级模式** | ✅ 已实现 | 无 sudo 时自动降级到目录隔离 |
| **跨平台检测** | ✅ 已实现 | 自动检测并选择最佳隔离策略 |
| **sudo 权限检测** | ✅ 已实现 | 首次运行自动检测 sudo 权限 |
| **一键配置** | ✅ 已实现 | 自动配置 sudoers |
| **Zero-sudo** | ✅ 已实现 | macOS sandbox-exec 无需 sudo，自动降级策略 |

---

## 1. 设计目标

1. **最小权限**：命令应在最小必要权限下执行
2. **零 sudo 优先**：尽可能不依赖 sudo，但承认部分场景需要
3. **多模式支持**：STRICT / RELAXED / CONSENSUS 三种执行模式
4. **危险命令拦截**：防止恶意或误操作导致的系统破坏
5. **可审计**：所有命令执行都记录日志

---

## 2. 沙盒隔离方案

### 2.0 关于 "Zero-sudo" 的澄清

> **重要澄清**：原设计文档声称"零 sudo"，但这是理想状态，实际有局限性。

| 场景 | Zero-sudo 可行？ | 说明 |
|------|-----------------|------|
| 普通文件操作 | ✅ 可行 | `ls`, `cp`, `mv`, `find` 等 |
| 用户目录内操作 | ✅ 可行 | `~/.vectahub/`, 项目目录 |
| 系统目录写入 | ❌ 不可行 | 需要 sudo |
| Docker 操作 | ⚠️ 受限 | 需要 docker 组权限 |
| 绑定挂载 | ❌ 不可行 | 需要 CAP_SYS_ADMIN |

**结论**：VectaHub 采用"**零 sudo 优先**"策略：
- 默认配置下，**不要求 sudo**
- 黑名单拦截所有 `sudo` 命令
- 但承认某些操作（如 Docker）需要用户手动授权

### 2.1 隔离技术选型（更新版）

| 方案 | 技术 | 优点 | 缺点 | 需要 sudo | 适用平台 |
|------|------|------|------|-----------|----------|
| **macOS Primary** | `sandbox-exec` | 系统级隔离，原生支持，开箱即用 | 规则语法受限 | ❌ | macOS |
| **macOS Fallback** | Seatbelt (应用沙盒) | 原生支持，更严格 | 仅限签名应用 | ❌ | macOS |
| **Linux Primary** | `bubblewrap` | 用户态隔离，功能强大，安全 | 需要安装，首次配置需 sudo | ✅ | Linux |
| **Linux Fallback** | `unshare --user` | 内核内置，轻量 | 需要 CAP_SYS_ADMIN 权限 | ✅ | Linux |
| **通用降级** | 目录隔离 | 简单可靠，零依赖 | 隔离级别较低 | ❌ | 所有平台 |
| **通用保障** | 命令白名单 | 零依赖，灵活配置 | 需要维护规则 | ❌ | 所有平台 |

### 2.2 macOS 实现方案（零 sudo）

**sandbox-exec 配置示例**：
```bash
sandbox-exec -f <<'EOF'
(version 1)
(allow default)
(deny file-write* (/etc/*))
(deny file-write* (/usr/*))
(deny file-write* (/System/*))
(deny mount)
(deny sysctl-write)
EOF
```

**规则说明**：
- 允许默认操作
- 禁止写入系统目录（/etc, /usr, /System）
- 禁止挂载操作
- 禁止修改系统参数

### 2.3 Linux 实现方案（需要 sudo）

**bubblewrap 配置示例**：
```bash
sudo bwrap \
  --ro-bind /usr /usr \
  --ro-bind /etc /etc \
  --ro-bind /bin /bin \
  --bind "$HOME/.vectahub/sandbox" /sandbox \
  --bind "$PWD" /workspace \
  --unshare-pid \
  --unshare-net \
  --setenv HOME /sandbox \
  --chdir /workspace \
  /bin/bash -c "$COMMAND"
```

**配置说明**：
| 参数 | 作用 |
|------|------|
| `--ro-bind` | 只读绑定系统目录 |
| `--bind` | 可读写绑定工作目录 |
| `--unshare-pid` | 隔离进程ID命名空间 |
| `--unshare-net` | 隔离网络（可选） |
| `--setenv` | 设置环境变量 |

### 2.4 sudo 权限配置建议

**推荐配置（添加到 /etc/sudoers.d/vectahub）**：
```bash
# 允许 vectahub 用户无密码执行 bubblewrap
%vectahub ALL=(ALL) NOPASSWD: /usr/bin/bwrap
```

**用户体验优化**：
1. 首次运行检测 sudo 权限
2. 如果没有权限，提示用户配置
3. 提供一键配置脚本

### 2.5 降级方案（无 sudo 时）

**目录隔离实现**：
```bash
# 创建隔离目录
SANDBOX_DIR="$HOME/.vectahub/sandbox/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$SANDBOX_DIR"

# 设置环境变量
export VECTAHUB_SANDBOX_DIR="$SANDBOX_DIR"
export PATH="/usr/bin:/bin:/usr/local/bin"

# 限制命令执行范围
cd "$SANDBOX_DIR"
```

**安全限制**：
- 所有命令只能在沙盒目录内执行
- 白名单命令列表
- 禁止访问敏感系统目录

### 2.6 跨平台统一策略

```
┌─────────────────────────────────────────────────────────────┐
│                    VectaHub Sandbox                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 平台检测 ──▶ macOS/Linux/Windows                        │
│         │                                                    │
│         ├─ macOS ──▶ sandbox-exec (无需 sudo)               │
│         │                                                    │
│         └─ Linux ──▶ bwrap (需要 sudo)                      │
│                                                              │
│  2. 黑名单检查 ──▶ 命中 ──▶ ⛔ 拒绝执行                     │
│                                                              │
│  3. 白名单检查 ──▶ 命中 ──▶ ✅ 直接执行                     │
│                                                              │
│  4. 权限检查 ──▶ 需要 sudo ──▶ 提示用户配置                 │
│                                                              │
│  5. 目录检查 ──▶ 超出工作目录 ──▶ ❌ 拒绝                  │
│                                                              │
│  6. 执行命令 ──▶ 记录审计日志 ──▶ 返回结果                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.7 功能清单

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **平台检测** | 自动识别 macOS/Linux/Windows | ✅ 已实现 | P0 |
| **sandbox-exec 集成** | macOS 原生沙盒支持 | ✅ 已实现 | P0 |
| **bubblewrap 集成** | Linux 用户态隔离 | ✅ 已实现 | P0 |
| **unshare 集成** | Linux 命名空间隔离 | ✅ 已实现 | P0 |
| **sudo 权限检测** | 首次运行自动检测 | ✅ 已实现 | P0 |
| **一键配置** | 自动配置 sudoers | ✅ 已实现 | P1 |
| **自动降级模式** | 无 sudo 时自动启用目录隔离 | ✅ 已实现 | P1 |
| **命令签名验证** | 防止命令篡改 (SHA256) | ✅ 已实现 | P2 |
| **文件哈希校验** | 验证执行文件完整性 | ✅ 已实现 | P2 |
| **网络隔离** | 可选禁止网络访问 (bubblewrap/unshare) | ✅ 已实现 | P3 |

---

## 3. 三种执行模式

### 3.1 模式定义

| 模式 | 配置值 | 行为描述 |
|------|--------|----------|
| **STRICT** | `sandbox.mode=strict` | 危险命令直接报错，阻断执行 |
| **RELAXED** | `sandbox.mode=relaxed` | 非危险命令自动执行，危险命令拒绝 |
| **CONSENSUS** | `sandbox.mode=consensus` | 危险命令弹窗/提示用户确认 |

### 3.2 模式切换流程

```
用户输入命令
      │
      ▼
┌─────────────────┐
│ 危险命令检测     │
└─────────────────┘
      │
      ├─ 非危险命令 ──▶ 直接执行
      │
      └─ 危险命令 ──┬─ STRICT ──▶ 报错返回
                    │
                    ├─ RELAXED ──▶ 报错返回
                    │
                    └─ CONSENSUS ──▶ 请求用户确认
                                       │
                              ┌────────┴────────┐
                              │                 │
                            同意              拒绝
                              │                 │
                              ▼                 ▼
                           执行               报错返回
```

---

## 4. 命令白名单与黑名单系统

> 以**命令操作**为核心，黑名单命令无条件拒绝，白名单命令无条件放行。简洁、直接、不可绕过。

### 4.1 核心原则

| 原则 | 说明 |
|------|------|
| **黑名单绝对优先** | 命中黑名单 → 直接拒绝，不看工具、不看模式、不看上下文、不看权限 |
| **白名单绝对放行** | 命中白名单 → 直接放行，跳过所有检查 |
| **黑名单 > 白名单** | 同时命中时，黑名单优先 |
| **不可绕过** | 没有"管理员模式"或"特殊权限"能跳过黑名单 |
| **可审计** | 每次命中都记录日志，不可关闭 |

### 4.2 判定流程

```
用户输入命令
      │
      ▼
┌─────────────────────────┐
│ 1. 解析命令              │
│    提取: 动作 + 参数       │
│    例: docker rm -f abc  │
│    → 动作: rm            │
│    → 参数: -f abc        │
└─────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ 2. 黑名单匹配 (最高优先级)        │
│    逐条匹配所有黑名单规则          │
│    命中任意一条 → ⛔ 立即拒绝     │
│    不看沙盒模式                    │
│    不看是否白名单                  │
│    不看用户确认                    │
└─────────────────────────────────┘
      │ 未命中
      ▼
┌─────────────────────────────────┐
│ 3. 白名单匹配 (直接放行)          │
│    逐条匹配所有白名单规则          │
│    命中任意一条 → ✅ 直接放行     │
│    跳过所有其他检查               │
└─────────────────────────────────┘
      │ 未命中
      ▼
┌─────────────────────────────────┐
│ 4. 危险命令检测                   │
│    使用安全协议系统检测             │
│    根据沙盒模式决定                │
│    STRICT → 拒绝                  │
│    RELAXED → 拒绝                 │
│    CONSENSUS → 需确认             │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ 5. 执行                          │
└─────────────────────────────────┘
```

### 4.3 黑名单 (Blocklist)

> **黑名单 = 绝对禁止**。无论什么工具、什么模式、什么场景，命中即拒绝。

#### 配置文件: `~/.vectahub/command-rules/blocklist.json`

```json
{
  "version": "1.0.0",
  "description": "全局命令黑名单 - 命中即拒绝，不可绕过",
  "rules": [
    {
      "id": "bl-001",
      "pattern": "sudo *",
      "action": "block",
      "reason": "禁止 sudo 提权操作",
      "examples": ["sudo rm -rf /", "sudo apt install", "sudo chmod 777"]
    },
    {
      "id": "bl-002",
      "pattern": "chmod 777 *",
      "action": "block",
      "reason": "禁止设置全开权限",
      "examples": ["chmod 777 file.txt", "chmod -R 777 /tmp"]
    },
    {
      "id": "bl-003",
      "pattern": "rm -rf /",
      "action": "block",
      "reason": "禁止递归删除根目录",
      "examples": ["rm -rf /", "rm -rf /home", "rm -rf /*"]
    },
    {
      "id": "bl-004",
      "pattern": "rm -rf ~",
      "action": "block",
      "reason": "禁止递归删除用户目录",
      "examples": ["rm -rf ~", "rm -rf ~/"]
    },
    {
      "id": "bl-005",
      "pattern": "rm -rf $HOME",
      "action": "block",
      "reason": "禁止递归删除 HOME 目录",
      "examples": ["rm -rf $HOME", "rm -rf ${HOME}/*"]
    },
    {
      "id": "bl-006",
      "pattern": "git push --force *",
      "action": "block",
      "reason": "禁止 git 强制推送",
      "examples": ["git push --force origin main", "git push -f origin main"]
    },
    {
      "id": "bl-007",
      "pattern": "git reset --hard *",
      "action": "block",
      "reason": "禁止 git 硬重置",
      "examples": ["git reset --hard HEAD", "git reset --hard origin/main"]
    },
    {
      "id": "bl-008",
      "pattern": "git clean -fd *",
      "action": "block",
      "reason": "禁止 git 强制清理",
      "examples": ["git clean -fd", "git clean -fdx"]
    },
    {
      "id": "bl-009",
      "pattern": "docker rm -f *",
      "action": "block",
      "reason": "禁止强制删除容器",
      "examples": ["docker rm -f my-container", "docker rm -f $(docker ps -aq)"]
    },
    {
      "id": "bl-010",
      "pattern": "docker system prune --all *",
      "action": "block",
      "reason": "禁止清理所有 Docker 资源",
      "examples": ["docker system prune --all", "docker system prune -af"]
    },
    {
      "id": "bl-011",
      "pattern": "kubectl delete namespace *",
      "action": "block",
      "reason": "禁止删除 Kubernetes 命名空间",
      "examples": ["kubectl delete namespace default", "kubectl delete namespace kube-system"]
    },
    {
      "id": "bl-012",
      "pattern": "npm publish *",
      "action": "block",
      "reason": "禁止直接发布 npm 包（请使用 CI/CD）",
      "examples": ["npm publish", "npm publish --access public"]
    },
    {
      "id": "bl-013",
      "pattern": "cargo publish *",
      "action": "block",
      "reason": "禁止直接发布 crate（请使用 CI/CD）",
      "examples": ["cargo publish", "cargo publish --dry-run"]
    },
    {
      "id": "bl-014",
      "pattern": "> /etc/*",
      "action": "block",
      "reason": "禁止覆写系统配置文件",
      "examples": ["echo 'x' > /etc/passwd", "cat file > /etc/hosts"]
    },
    {
      "id": "bl-015",
      "pattern": "mkfs *",
      "action": "block",
      "reason": "禁止格式化磁盘",
      "examples": ["mkfs.ext4 /dev/sda1", "mkfs -t ntfs /dev/sdb1"]
    },
    {
      "id": "bl-016",
      "pattern": "dd if=* of=/dev/*",
      "action": "block",
      "reason": "禁止直接写入磁盘设备",
      "examples": ["dd if=image.iso of=/dev/sda", "dd if=/dev/zero of=/dev/sdb"]
    },
    {
      "id": "bl-017",
      "pattern": "shutdown *",
      "action": "block",
      "reason": "禁止关机操作",
      "examples": ["shutdown -h now", "shutdown -r now"]
    },
    {
      "id": "bl-018",
      "pattern": "reboot *",
      "action": "block",
      "reason": "禁止重启操作",
      "examples": ["reboot", "reboot -f"]
    },
    {
      "id": "bl-019",
      "pattern": "git push --delete *",
      "action": "block",
      "reason": "禁止删除远程分支",
      "examples": ["git push --delete origin main", "git push origin :main"]
    },
    {
      "id": "bl-020",
      "pattern": "git filter-branch *",
      "action": "block",
      "reason": "禁止重写 git 历史",
      "examples": ["git filter-branch --force", "git filter-branch --env-filter"]
    }
  ]
}
```

#### 黑名单规则格式

```typescript
interface BlockRule {
  id: string;
  pattern: string;
  action: 'block';
  reason: string;
  examples?: string[];
}
```

#### 模式匹配语法

| 语法 | 含义 | 示例 |
|------|------|------|
| `rm *` | rm 开头的任意命令 | `rm file`, `rm -rf dir` |
| `* -rf /` | 以 `-rf /` 结尾的任意命令 | `rm -rf /`, `find . -name x -exec rm -rf / {} +` |
| `docker rm -f *` | 精确匹配 docker rm -f | `docker rm -f abc` |
| `git push --force *` | 精确匹配 git push --force | `git push --force origin main` |
| `* --privileged *` | 包含 --privileged 的任意命令 | `docker run --privileged`, `kubectl ... --privileged` |
| `chmod 777 *` | chmod 777 的任意用法 | `chmod 777 file`, `chmod -R 777 dir` |

### 4.4 白名单 (Allowlist)

> **白名单 = 无条件放行**。跳过所有安全检查，直接执行。

#### 配置文件: `~/.vectahub/command-rules/allowlist.json`

```json
{
  "version": "1.0.0",
  "description": "全局命令白名单 - 命中即放行",
  "rules": [
    {
      "id": "wl-001",
      "pattern": "git status",
      "action": "allow",
      "description": "查看工作区状态",
      "examples": ["git status", "git status -s"]
    },
    {
      "id": "wl-002",
      "pattern": "git log *",
      "action": "allow",
      "description": "查看提交历史",
      "examples": ["git log", "git log --oneline -10"]
    },
    {
      "id": "wl-003",
      "pattern": "git diff *",
      "action": "allow",
      "description": "查看代码差异",
      "examples": ["git diff", "git diff HEAD~1"]
    },
    {
      "id": "wl-004",
      "pattern": "git branch *",
      "action": "allow",
      "description": "查看和管理分支",
      "examples": ["git branch", "git branch -a", "git branch feature/xxx"]
    },
    {
      "id": "wl-005",
      "pattern": "git fetch *",
      "action": "allow",
      "description": "拉取远程更新（不合并）",
      "examples": ["git fetch", "git fetch origin"]
    },
    {
      "id": "wl-006",
      "pattern": "git pull *",
      "action": "allow",
      "description": "拉取并合并",
      "examples": ["git pull", "git pull origin main"]
    },
    {
      "id": "wl-007",
      "pattern": "git add *",
      "action": "allow",
      "description": "暂存文件",
      "examples": ["git add .", "git add src/"]
    },
    {
      "id": "wl-008",
      "pattern": "git commit *",
      "action": "allow",
      "description": "提交代码",
      "examples": ["git commit -m 'fix: bug'"]
    },
    {
      "id": "wl-009",
      "pattern": "git push *",
      "action": "allow",
      "description": "推送到远程",
      "examples": ["git push origin main"]
    },
    {
      "id": "wl-010",
      "pattern": "npm install *",
      "action": "allow",
      "description": "安装依赖",
      "examples": ["npm install", "npm install lodash"]
    },
    {
      "id": "wl-011",
      "pattern": "npm run *",
      "action": "allow",
      "description": "运行脚本",
      "examples": ["npm run build", "npm run test"]
    },
    {
      "id": "wl-012",
      "pattern": "npm list *",
      "action": "allow",
      "description": "查看已安装包",
      "examples": ["npm list", "npm list --depth=0"]
    },
    {
      "id": "wl-013",
      "pattern": "npm audit *",
      "action": "allow",
      "description": "安全审计",
      "examples": ["npm audit", "npm audit fix"]
    },
    {
      "id": "wl-014",
      "pattern": "docker ps *",
      "action": "allow",
      "description": "查看容器列表",
      "examples": ["docker ps", "docker ps -a"]
    },
    {
      "id": "wl-015",
      "pattern": "docker images *",
      "action": "allow",
      "description": "查看镜像列表",
      "examples": ["docker images"]
    },
    {
      "id": "wl-016",
      "pattern": "docker logs *",
      "action": "allow",
      "description": "查看容器日志",
      "examples": ["docker logs my-container"]
    },
    {
      "id": "wl-017",
      "pattern": "docker inspect *",
      "action": "allow",
      "description": "查看容器详情",
      "examples": ["docker inspect my-container"]
    },
    {
      "id": "wl-018",
      "pattern": "docker stats *",
      "action": "allow",
      "description": "查看资源使用",
      "examples": ["docker stats"]
    },
    {
      "id": "wl-019",
      "pattern": "kubectl get *",
      "action": "allow",
      "description": "查看 K8s 资源",
      "examples": ["kubectl get pods", "kubectl get svc"]
    },
    {
      "id": "wl-020",
      "pattern": "kubectl describe *",
      "action": "allow",
      "description": "查看 K8s 资源详情",
      "examples": ["kubectl describe pod my-pod"]
    },
    {
      "id": "wl-021",
      "pattern": "kubectl logs *",
      "action": "allow",
      "description": "查看 K8s Pod 日志",
      "examples": ["kubectl logs my-pod"]
    },
    {
      "id": "wl-022",
      "pattern": "node *",
      "action": "allow",
      "description": "执行 Node.js 脚本",
      "examples": ["node app.js", "node --version"]
    },
    {
      "id": "wl-023",
      "pattern": "python3 *",
      "action": "allow",
      "description": "执行 Python 脚本",
      "examples": ["python3 app.py", "python3 --version"]
    },
    {
      "id": "wl-024",
      "pattern": "cargo build *",
      "action": "allow",
      "description": "Rust 编译",
      "examples": ["cargo build", "cargo build --release"]
    },
    {
      "id": "wl-025",
      "pattern": "cargo test *",
      "action": "allow",
      "description": "Rust 测试",
      "examples": ["cargo test"]
    }
  ]
}
```

#### 白名单规则格式

```typescript
interface AllowRule {
  id: string;
  pattern: string;
  action: 'allow';
  description?: string;
  examples?: string[];
}
```

### 4.5 项目级配置

每个项目可以在 `.vectahub/` 目录下覆盖或补充全局规则：

```
my-project/
├── .vectahub/
│   └── command-rules/
│       ├── blocklist.json   # 项目级黑名单（追加到全局）
│       └── allowlist.json   # 项目级白名单（追加到全局）
└── src/
```

#### 项目级黑名单示例

```json
{
  "version": "1.0.0",
  "description": "项目 my-web-app 的命令黑名单",
  "rules": [
    {
      "id": "proj-bl-001",
      "pattern": "git push * --force *",
      "action": "block",
      "reason": "本项目禁止强制推送"
    },
    {
      "id": "proj-bl-002",
      "pattern": "docker rm *",
      "action": "block",
      "reason": "本项目禁止删除容器（通过 docker-compose 管理）"
    },
    {
      "id": "proj-bl-003",
      "pattern": "npm publish *",
      "action": "block",
      "reason": "本项目通过 CI/CD 发布"
    }
  ]
}
```

#### 项目级白名单示例

```json
{
  "version": "1.0.0",
  "description": "项目 my-web-app 的命令白名单",
  "rules": [
    {
      "id": "proj-wl-001",
      "pattern": "docker-compose *",
      "action": "allow",
      "description": "允许 docker-compose 管理容器"
    },
    {
      "id": "proj-wl-002",
      "pattern": "pnpm *",
      "action": "allow",
      "description": "允许使用 pnpm"
    }
  ]
}
```

### 4.6 规则合并优先级

```
项目级黑名单 (最高优先级)
      │
      ▼
全局黑名单
      │
      ▼
项目级白名单
      │
      ▼
全局白名单
      │
      ▼
危险命令检测 (原有沙盒安全协议)
```

**合并规则**：

1. 项目级和全局级黑名单**合并**，任一命中即拒绝
2. 项目级和全局级白名单**合并**，任一命中即放行
3. **黑名单永远优先于白名单**：如果一条命令同时命中黑名单和白名单，黑名单生效
4. 未命中任何规则的命令，交给危险命令检测系统处理

### 4.7 匹配引擎

```typescript
interface CommandRule {
  id: string;
  pattern: string;
  action: 'block' | 'allow';
  reason?: string;
  description?: string;
  examples?: string[];
}

interface CommandAnalysis {
  tool: string;
  subcommand: string;
  fullCommand: string;
  args: string[];
}

type RuleResult =
  | { matched: false }
  | { matched: true; rule: CommandRule; scope: 'global' | 'project' };

class CommandRuleEngine {
  private globalBlocklist: CommandRule[];
  private globalAllowlist: CommandRule[];
  private projectBlocklist: CommandRule[];
  private projectAllowlist: CommandRule[];

  constructor(config: {
    globalBlocklist: CommandRule[];
    globalAllowlist: CommandRule[];
    projectBlocklist?: CommandRule[];
    projectAllowlist?: CommandRule[];
  }) {
    this.globalBlocklist = config.globalBlocklist;
    this.globalAllowlist = config.globalAllowlist;
    this.projectBlocklist = config.projectBlocklist || [];
    this.projectAllowlist = config.projectAllowlist || [];
  }

  evaluate(fullCommand: string): CommandRuleResult {
    const blockResult = this.matchBlocklist(fullCommand);
    if (blockResult.matched) {
      return {
        decision: 'block',
        rule: blockResult.rule,
        scope: blockResult.scope,
        message: `⛔ 命令被黑名单拒绝: ${blockResult.rule.reason}`,
      };
    }

    const allowResult = this.matchAllowlist(fullCommand);
    if (allowResult.matched) {
      return {
        decision: 'allow',
        rule: allowResult.rule,
        scope: allowResult.scope,
        message: `✅ 命令命中白名单: ${allowResult.rule.description || allowResult.rule.id}`,
      };
    }

    return {
      decision: 'passthrough',
      message: '未命中黑白名单，交给危险命令检测系统处理',
    };
  }

  private matchBlocklist(fullCommand: string): RuleResult {
    for (const rule of this.projectBlocklist) {
      if (this.matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'project' };
      }
    }
    for (const rule of this.globalBlocklist) {
      if (this.matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'global' };
      }
    }
    return { matched: false };
  }

  private matchAllowlist(fullCommand: string): RuleResult {
    for (const rule of this.projectAllowlist) {
      if (this.matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'project' };
      }
    }
    for (const rule of this.globalAllowlist) {
      if (this.matchPattern(rule.pattern, fullCommand)) {
        return { matched: true, rule, scope: 'global' };
      }
    }
    return { matched: false };
  }

  private matchPattern(pattern: string, command: string): boolean {
    const regex = this.patternToRegex(pattern);
    return regex.test(command);
  }

  private patternToRegex(pattern: string): RegExp {
    let escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    escaped = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  }
}

interface CommandRuleResult {
  decision: 'block' | 'allow' | 'passthrough';
  rule?: CommandRule;
  scope?: 'global' | 'project';
  message: string;
}
```

### 4.8 模式覆盖示例

#### 递归删除类

| 模式 | 覆盖范围 |
|------|----------|
| `rm -rf /` | `rm -rf /`, `rm -rf /*`, `rm -rf /home`, `rm -rf /usr` |
| `rm -rf ~` | `rm -rf ~`, `rm -rf ~/`, `rm -rf ~/*`, `rm -rf ${HOME}` |
| `* -rf /` | 任何命令 + `-rf /`，包括 `find ... -exec rm -rf / {} +` |

#### Git 危险操作类

| 模式 | 覆盖范围 |
|------|----------|
| `git push --force *` | `git push --force origin main`, `git push --force-with-lease` |
| `git push -f *` | `git push -f origin main`, `git push -f` |
| `git push --delete *` | `git push --delete origin main` |
| `git reset --hard *` | `git reset --hard HEAD`, `git reset --hard origin/main` |

#### Docker/K8s 危险操作类

| 模式 | 覆盖范围 |
|------|----------|
| `docker rm -f *` | `docker rm -f abc`, `docker rm -f container1 container2` |
| `docker system prune *` | `docker system prune`, `docker system prune --all` |
| `kubectl delete namespace *` | `kubectl delete namespace default`, `kubectl delete namespace kube-system` |
| `* --privileged *` | 任何含 `--privileged` 的命令 |

### 4.9 CLI 命令

```bash
vectahub rules show
vectahub rules blocklist [--scope global|project]
vectahub rules allowlist [--scope global|project]
vectahub rules block add --pattern "cmd *" --reason "禁止"
vectahub rules allow add --pattern "cmd *" --description "允许"
vectahub rules test "git push --force origin main"
```

### 4.10 审计日志

```json
{
  "id": "audit-cmd-001",
  "timestamp": "2026-05-01T10:30:00Z",
  "command": "git push --force origin main",
  "analysis": {
    "tool": "git",
    "subcommand": "push",
    "args": ["--force", "origin", "main"]
  },
  "decision": {
    "result": "block",
    "ruleId": "bl-006",
    "scope": "global",
    "reason": "禁止 git 强制推送"
  },
  "context": {
    "sandboxMode": "RELAXED",
    "cwd": "/Users/dev/my-project",
    "sessionId": "sess_1234567890_abc"
  }
}
```

### 4.11 文件存储结构

```
~/.vectahub/command-rules/
├── blocklist.json          # 全局黑名单
├── allowlist.json          # 全局白名单
├── audit/                  # 审计日志
│   └── YYYY-MM-DD.jsonl
└── templates/              # 安全模板
    ├── default.json
    ├── strict.json
    └── relaxed.json

<project>/.vectahub/command-rules/
├── blocklist.json          # 项目级黑名单
└── allowlist.json          # 项目级白名单
```

---

## 5. 危险命令检测

### 5.1 危险命令分类

#### 4.1.1 系统级危险命令 (System Critical)

```javascript
const SYSTEM_DANGEROUS = [
  /^sudo\s+/,                           // 提权命令
  /chmod\s+777\s+\//,                    // 全局权限开放
  /chmod\s+-R\s+777\s+\//,               // 递归全局权限
  /^rm\s+-rf\s+\/(?!sandbox)/,          // 递归删除根目录 (排除沙盒)
  /^dd\s+.*\s+of=\/dev\//,              // 磁盘直接写入
  /^mkfs/,                              // 格式化文件系统
  /^shutdown/,                          // 关机
  /^reboot/,                            // 重启
  /^init\s+6/,                          // 切换运行级别
  /^telinit/,                           // 初始化控制
];
```

#### 4.1.2 文件系统危险命令 (Filesystem Critical)

```javascript
const FS_DANGEROUS = [
  />\s*\/etc\//,                        // 覆写系统文件
  />\s*\/boot\//,                       // 覆写启动文件
  /^mv\s+\/\s+/,                        // 移动根目录
  /^ln\s+-sf\s+.*\s+\/(bin|etc|lib)/,  // 符号链接到系统目录
  /^mount\s+--bind/,                    // 绑定挂载
];
```

#### 4.1.3 网络危险命令 (Network Critical)

```javascript
const NETWORK_DANGEROUS = [
  /^iptables/,                          // 防火墙操作
  /^ip\s+link\s+delete/,                // 删除网络接口
  /^ifconfig\s+down/,                   // 关闭网络接口
  /^netstat/,                           // 网络状态
];
```

#### 4.1.4 资源耗尽命令 (Resource Exhaustion)

```javascript
const RESOURCE_DANGEROUS = [
  /:()\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,  // Fork 炸弹
  /\|\s*sh\s*\|/,                        // 管道炸弹
  /^while\s+true\s*;\s*do/,              // 无限循环 (需配合 fork)
];
```

### 4.2 检测算法

```javascript
function detectDangerous(command) {
  const allPatterns = [
    ...SYSTEM_DANGEROUS,
    ...FS_DANGEROUS,
    ...NETWORK_DANGEROUS,
    ...RESOURCE_DANGEROUS
  ];

  for (const pattern of allPatterns) {
    if (pattern.test(command)) {
      return {
        dangerous: true,
        category: getCategory(pattern),  // 'SYSTEM' | 'FS' | 'NETWORK' | 'RESOURCE'
        pattern: pattern.toString()
      };
    }
  }

  return { dangerous: false };
}
```

---

## 5. 沙盒配置

### 5.1 配置文件结构

```json
{
  "sandbox": {
    "enabled": true,
    "mode": "CONSENSUS",
    "root": "./sandbox",
    "workspace": "./sandbox/workspace",
    "tempDir": "./sandbox/tmp",
    "cacheDir": "./sandbox/cache",
    "maxConcurrentTasks": 3,
    "taskTimeout": 60000,
    "dangerousCommandWhitelist": [],
    "dangerousCommandBlacklist": []
  },
  "namespaces": {
    "user": true,
    "mount": true,
    "pid": true,
    "network": false
  },
  "limits": {
    "maxMemoryMB": 512,
    "maxCpuPercent": 50,
    "maxTasks": 10
  }
}
```

### 5.2 环境变量注入

```bash
# 沙盒内可访问的环境变量
export SANDBOX_ROOT="/path/to/sandbox"
export SANDBOX_MODE="CONSENSUS"
export SANDBOX_TASK_ID="task_001"
export SANDBOX_WORKSPACE="/path/to/sandbox/workspace"
export PATH="/usr/local/bin:/usr/bin:/bin"
export HOME="/path/to/sandbox/workspace"
```

---

## 6. 目录结构

```
sandbox/
├── workspace/           # 主要工作目录 (git clone 等)
│   ├── .gitignore       # 隔离的 gitignore
│   └── .npmrc           # 隔离的 npm 配置
├── tmp/                 # 临时文件 (可被清理)
├── cache/               # 缓存目录 (依赖缓存等)
├── tasks/               # 任务队列 (.task 文件)
├── responses/           # 执行回执 (.response 文件)
├── logs/                # 执行日志
│   ├── sandbox.log      # 沙盒运行日志
│   ├── audit.log        # 审计日志
│   └── error.log        # 错误日志
└── config.json          # 沙盒配置
```

---

## 7. API 设计

### 7.1 SandboxManager

```javascript
class SandboxManager {
  constructor(config) {}

  async createSandbox(options) {}
  async destroySandbox(sandboxId) {}

  async execInSandbox(command, options) {
    // options: { timeout, env, cwd, mode }
  }

  getStatus() {}
  getTasks() {}
  cleanup() {}
}
```

### 7.2 执行结果格式

```json
{
  "taskId": "task_001",
  "success": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": "",
  "duration": 1234,
  "executedAt": "2026-05-01T10:00:00Z",
  "mode": "RELAXED",
  "sandboxed": true
}
```

---

## 8. 错误处理

| 错误类型 | 错误码 | 处理方式 |
|----------|--------|----------|
| SANDBOX_INIT_FAILED | E001 | Fallback 到目录隔离模式 |
| NAMESPACE_NOT_SUPPORTED | E002 | 提示用户环境不支持 |
| COMMAND_TIMEOUT | E003 | 终止进程，返回超时错误 |
| COMMAND_DENIED | E004 | 返回拒绝原因 |
| OUT_OF_MEMORY | E005 | 终止任务，清理资源 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
relatedTo:
  - 01_system_architecture.md
  - 03_cli_framework_design.md
```
