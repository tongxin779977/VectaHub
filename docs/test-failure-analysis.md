# VectaHub 未修复问题分析文档

> 生成日期: 2026-05-04
> 当前测试通过率: **88%** (142/161)
> 待修复失败数: **19**

---

## 一、FILE_FIND 意图 (8 个失败)

| # | 测试输入 | 实际意图 | 通过率 |
|---|----------|----------|--------|
| 1.2 | 查找 src 目录下的文件 | CREATE_FILE | ❌ |
| 1.3 | 搜索 7 天内修改的文件 | UNKNOWN | ❌ |
| 1.5 | 查找所有的目录 | CREATE_FILE | ❌ |
| 1.6 | 帮我找一下项目里的配置文件 | UNKNOWN | ❌ |
| 1.9 | 在 docs 文件夹下查找 markdown 文件 | CREATE_FILE | ❌ |
| 2.3.1 | 在 /tmp 目录下查找 log 文件 | CREATE_FILE | ❌ |
| 4.2.1 | 查找所有 ts 文件并统计数量 | UNKNOWN | ❌ |
| 4.3.1 | 在 src 目录下查找 test 文件 | RUN_SCRIPT | ❌ |

### 根本原因

FILE_FIND 的关键词被大幅删减后，丢失了关键匹配词：

1. **删除了"查找"、"搜索"** → 导致包含"查找"的输入无法匹配 FILE_FIND
2. **删除了"文件"关键词** → 很多包含"文件"的输入被 CREATE_FILE（包含"创建"+"文件"）或 INSTALL_PACKAGE 抢走
3. **删除了"目录"关键词** → 包含"目录"的输入被 CREATE_FILE 匹配（因为 CREATE_FILE 有"创建"+"目录"）
4. **缺少时间/路径参数关键词** → "7 天内"、"/tmp 目录下"等参数表达无法被解析

### 修复方向

- 恢复"查找"、"搜索"、"文件"等基础关键词，但降低权重（0.8）
- 添加复合关键词如"查找文件"、"搜索文件"、"目录下查找"
- 添加时间表达关键词："天内"、"天内修改"、"最近"
- 添加路径表达关键词："目录下"、"在...下查找"

---

## 二、MULTI_INTENT 多意图 (6 个失败)

| # | 测试输入 | 实际意图 | 通过率 |
|---|----------|----------|--------|
| 2.2.1 | 查找文件并提交 | GIT_WORKFLOW | ❌ |
| 2.2.2 | 安装依赖然后构建项目 | RUN_SCRIPT | ❌ |
| 2.2.3 | 创建文件并修改权限 | CREATE_FILE | ❌ |
| 2.2.4 | 查看系统信息然后检查网络 | SYSTEM_INFO | ❌ |
| 4.2.2 | 安装依赖然后构建项目 | RUN_SCRIPT | ❌ |
| 4.2.3 | 创建目录并初始化 git 仓库 | CREATE_FILE | ❌ |

### 根本原因

**测试期望与架构不匹配**：测试脚本期望返回 `MULTI_INTENT`，但当前系统的 `IntentName` 类型定义中（`src/types/nl.ts`）**不存在 `MULTI_INTENT` 这个意图类型**。

当前系统支持的意图类型：
- FILE_FIND, GIT_WORKFLOW, RUN_SCRIPT, SYSTEM_INFO, QUERY_INFO
- INSTALL_PACKAGE, CREATE_FILE, FETCH_HOT_NEWS, SOCIAL_MEDIA_SEARCH
- DATA_SCRAPING, CONTENT_SUMMARY, FILE_ARCHIVE, NETWORK_INFO
- SYSTEM_MONITOR, FILE_PERMISSION, FILE_DIFF, DOCKER_BUILD, UNKNOWN

**系统行为说明**：当输入包含多个意图（如"查找文件并提交"）时，关键词匹配器会返回**置信度最高的单一意图**，这是当前架构的设计行为，不是 bug。

### 修复方向

这不是代码 bug，而是测试期望问题。有两种方案：
1. **修改测试期望**：将 MULTI_INTENT 用例的预期改为实际返回的单一意图
2. **添加 MULTI_INTENT 意图**：需要在类型定义、模板、匹配器中添加完整支持（架构级改动）

**建议**：采用方案 1，修改测试期望以匹配当前架构能力。

---

## 三、SYSTEM_INFO 与 SYSTEM_MONITOR 冲突 (3 个失败)

| # | 测试输入 | 实际意图 | 通过率 |
|---|----------|----------|--------|
| 4.7 | 查看当前系统的内存占用情况 | SYSTEM_MONITOR | ❌ |
| 10.2 | 查看内存占用 | SYSTEM_INFO | ❌ |
| 10.3 | 查看磁盘空间 | UNKNOWN | ❌ |

### 根本原因

两个意图关键词重叠严重：
- SYSTEM_INFO 包含"内存占用"、"内存使用"
- SYSTEM_MONITOR 包含"占用"、"使用率"
- SYSTEM_INFO 权重 0.95，SYSTEM_MONITOR 权重 0.85
- 导致"内存占用"被 SYSTEM_INFO 抢走

"查看磁盘空间" → UNKNOWN 是因为：
- SYSTEM_INFO 关键词删除了"磁盘空间"（之前只保留"磁盘使用情况"）
- SYSTEM_MONITOR 关键词删除了"磁盘空间"

### 修复方向

- SYSTEM_INFO 保留"系统信息"、"系统版本"等查询类关键词，移除"监控"类关键词
- SYSTEM_MONITOR 保留"使用率"、"占用"、"监控"等监控类关键词，增加"磁盘空间"
- 调整权重区分度

---

## 四、FILE_ARCHIVE (1 个失败)

| # | 测试输入 | 实际意图 | 通过率 |
|---|----------|----------|--------|
| 8.3 | 打包 src 目录 | CREATE_FILE | ❌ |

### 根本原因

FILE_ARCHIVE 包含"打包"关键词，但 CREATE_FILE 包含"创建"+"目录"关键词。"打包 src 目录"中：
- FILE_ARCHIVE 匹配"打包"（权重 0.95）
- CREATE_FILE 匹配"创建"（缺失）+"目录"（权重 0.95）

实际 CREATE_FILE 不应该匹配"打包"，但"目录"关键词权重过高导致误匹配。

### 修复方向

- FILE_ARCHIVE 添加"打包目录"、"目录打包"等复合关键词
- CREATE_FILE 降低"目录"单独关键词的权重

---

## 五、FILE_PERMISSION (1 个失败)

| # | 测试输入 | 实际意图 | 通过率 |
|---|----------|----------|--------|
| 11.7 | 查看 src 目录下所有文件的权限 | CREATE_FILE | ❌ |

### 根本原因

输入包含"查看"+"目录"+"文件"+"权限"：
- CREATE_FILE 匹配"创建"（缺失）+"目录"+"文件"
- FILE_PERMISSION 匹配"权限"

由于 CREATE_FILE 包含"目录"、"文件"等通用词，且权重 0.95，可能覆盖了 FILE_PERMISSION 的"权限"匹配。

### 修复方向

- FILE_PERMISSION 添加"目录下所有文件的权限"、"文件权限"等复合关键词
- 降低 CREATE_FILE 中"目录"、"文件"的匹配优先级

---

## 六、SYSTEM_MONITOR (2 个失败)

| # | 测试输入 | 实际意图 | 通过率 |
|---|----------|----------|--------|
| 10.2 | 查看内存占用 | SYSTEM_INFO | ❌ |
| 10.3 | 查看磁盘空间 | UNKNOWN | ❌ |

### 根本原因

同第三部分的 SYSTEM_INFO/SYSTEM_MONITOR 冲突分析。

---

## 七、汇总统计表

| 问题类别 | 失败数 | 可修复性 | 修复难度 |
|----------|--------|----------|----------|
| FILE_FIND 关键词不足 | 8 | ✅ 可修复 | 中 |
| MULTI_INTENT 架构限制 | 6 | ❌ 需架构改动 | 高 |
| SYSTEM_INFO/MONITOR 冲突 | 3 | ✅ 可修复 | 低 |
| FILE_ARCHIVE 关键词不足 | 1 | ✅ 可修复 | 低 |
| FILE_PERMISSION 关键词不足 | 1 | ✅ 可修复 | 低 |
| **总计** | **19** | **13 可修复** | - |

---

## 八、修复优先级

### 高优先级（预计可修复 8 个失败）
1. FILE_FIND 关键词恢复与优化
2. SYSTEM_INFO vs SYSTEM_MONITOR 关键词分离

### 中优先级（预计可修复 2 个失败）
3. FILE_ARCHIVE 复合关键词
4. FILE_PERMISSION 复合关键词

### 暂不修复（需架构改动，6 个失败）
5. MULTI_INTENT 多意图支持
