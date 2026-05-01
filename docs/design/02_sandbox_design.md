# 沙盒架构设计文档

> 本文档定义 VectaHub 沙盒系统的架构设计与实现细节

---

## 1. 设计目标

1. **零 sudo**：所有操作在普通用户权限下完成
2. **进程级隔离**：通过 Linux Namespace 实现资源隔离
3. **多模式支持**：STRICT / RELAXED / CONSENSUS 三种执行模式
4. **危险命令拦截**：防止恶意或误操作导致的系统破坏

---

## 2. 沙盒隔离方案

### 2.1 隔离技术选型

| 方案 | 技术 | 优点 | 缺点 |
|------|------|------|------|
| **Primary** | `unshare --user` | 内核内置，不需安装 | 需要 CAP_SYS_ADMIN |
| **Fallback** | `bubblewrap` | 更安全，限制更多 | 需要安装 |
| **Last Resort** | 目录隔离 + 白名单 | 简单可靠 | 隔离级别低 |

### 2.2 实现原理

```bash
# Primary 方案：使用 unshare 创建用户命名空间
unshare --user --map-root-user \
        --mount \
        --pid \
        --fork \
        --kill-sigstop \
        bash -c '
          # 在隔离的环境中执行命令
          echo "Running in sandboxed namespace"
          /bin/bash -c "$@"
        ' _ <user-command>
```

### 2.3 命名空间隔离层级

```
┌─────────────────────────────────────┐
│         Host Environment            │
├─────────────────────────────────────┤
│  PID Namespace (隔离进程树)          │
│  User Namespace (映射 root)          │
│  Mount Namespace (隔离文件系统视图)   │
│  Network Namespace (可选，隔离网络)   │
└─────────────────────────────────────┘
```

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

## 4. 危险命令检测

### 4.1 危险命令分类

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
