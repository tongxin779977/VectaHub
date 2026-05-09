# 沙盒架构设计文档

> 版本: 1.1.1 | 最后更新: 2026-05-09
> 定义 VectaHub 沙盒系统的设计与实现细节

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
