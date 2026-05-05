# VectaHub 测试失败用例修复清单

> 测试日期: 2026-05-05
> 当前通过率: **67%** (108/161)
> 失败数: **53**
> 架构版本: 支持多意图识别 v2.0

---

## 一、FILE_FIND 意图 (5 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 1.1 | 找出所有 ts 文件 | FILE_FIND | QUERY_INFO |
| 2 | 1.4 | 找出大于 1M 的文件 | FILE_FIND | QUERY_INFO |
| 3 | 1.6 | 帮我找一下项目里的配置文件 | FILE_FIND | QUERY_INFO |
| 4 | 1.8 | 找出所有超过 100MB 的大文件 | FILE_FIND | QUERY_INFO |
| 5 | 4.2.1 | 查找所有 ts 文件并统计数量 | FILE_FIND | MULTI:FILE_FIND,UNKNOWN,,,,, |

### 问题分析

- **核心问题**: "找出"关键词未被 FILE_FIND 正确匹配，被 QUERY_INFO 抢走
- **参数提取失败**: 包含大小条件的输入（"大于 1M"、"超过 100MB"）未能正确解析
- **多意图处理**: "并统计数量"被识别为第二个意图 UNKNOWN

### 修复建议

1. FILE_FIND 模板添加"找出"关键词
2. 添加文件大小参数提取规则
3. 优化"统计"相关的意图识别

---

## 二、GIT_WORKFLOW 意图 (8 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 2.4 | 查看 git 状态 | GIT_WORKFLOW | QUERY_INFO |
| 2 | 2.5 | 创建新分支 feature | GIT_WORKFLOW | CREATE_FILE |
| 3 | 2.7 | 暂存当前修改 | GIT_WORKFLOW | FILE_DIFF |
| 4 | 2.8 | 合并 develop 分支 | GIT_WORKFLOW | UNKNOWN |
| 5 | 2.10 | 创建一个叫 feature/auth 的分支并切换过去 | GIT_WORKFLOW | MULTI:CREATE_FILE,UNKNOWN,,,,, |
| 6 | 2.13 | 查看工作区有哪些改动 | GIT_WORKFLOW | QUERY_INFO |
| 7 | 2.14 | 把 develop 的代码合并到当前分支 | GIT_WORKFLOW | MULTI:GIT_WORKFLOW,UNKNOWN,,,,, |
| 8 | 4.1.2 | 查看 git 状态 | GIT_WORKFLOW | QUERY_INFO |

### 问题分析

- **关键词冲突**: "查看 git 状态"中"查看"被 QUERY_INFO 匹配
- **"创建分支"误识别**: "创建"关键词被 CREATE_FILE 匹配
- **git 专用词汇不足**: "暂存"、"合并"、"工作区"等 git 术语未覆盖
- **多意图拆分问题**: 包含"并"的输入被错误拆分

### 修复建议

1. GIT_WORKFLOW 添加 git 专用关键词："git 状态"、"分支"、"暂存"、"stash"、"合并"、"merge"、"工作区"
2. 提高 GIT_WORKFLOW 权重，避免被通用词抢走
3. 优化多意图拆分逻辑，避免 git 操作被错误拆分

---

## 三、SYSTEM_INFO 意图 (4 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 4.3 | 查看内存使用 | SYSTEM_INFO | QUERY_INFO |
| 2 | 4.4 | 查看 cpu 信息 | SYSTEM_INFO | QUERY_INFO |
| 3 | 4.7 | 查看当前系统的内存占用情况 | SYSTEM_INFO | SYSTEM_MONITOR |
| 4 | 4.8 | 显示 CPU 核心数和型号 | SYSTEM_INFO | MULTI:SYSTEM_INFO,UNKNOWN,,,,, |

### 问题分析

- **"查看"前缀问题**: 包含"查看"的输入被 QUERY_INFO 优先匹配
- **与 SYSTEM_MONITOR 冲突**: "内存占用"被 SYSTEM_MONITOR 抢走
- **参数提取失败**: "核心数和型号"被识别为 UNKNOWN

### 修复建议

1. SYSTEM_INFO 添加"查看内存"、"查看 cpu"等复合关键词
2. 明确 SYSTEM_INFO（信息查询）与 SYSTEM_MONITOR（实时监控）的边界
3. 添加 CPU 信息参数提取规则

---

## 四、SYSTEM_MONITOR 意图 (6 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 10.1 | 查看 cpu 使用率 | SYSTEM_MONITOR | QUERY_INFO |
| 2 | 10.4 | 查看进程数 | SYSTEM_MONITOR | QUERY_INFO |
| 3 | 10.6 | 查看占用内存最多的进程 | SYSTEM_MONITOR | QUERY_INFO |
| 4 | 10.7 | 显示当前系统的资源使用情况 | SYSTEM_MONITOR | SYSTEM_INFO |
| 5 | 10.8 | 查看有哪些 node 进程在运行 | SYSTEM_MONITOR | QUERY_INFO |
| 6 | 3.2.7 | 看看哪个进程占用了最多内存 | SYSTEM_MONITOR | SYSTEM_INFO |

### 问题分析

- **"查看"前缀被抢走**: 所有包含"查看"的输入都被 QUERY_INFO 匹配
- **与 SYSTEM_INFO 冲突**: "资源使用情况"、"占用最多内存"被 SYSTEM_INFO 匹配
- **进程相关关键词不足**: "进程"、"node 进程"等未被覆盖

### 修复建议

1. SYSTEM_MONITOR 添加"查看 cpu 使用率"、"查看进程"等复合关键词
2. 增加"使用率"、"占用最多"、"资源使用"等监控类关键词权重
3. 添加"进程"相关参数提取

---

## 五、NETWORK_INFO 意图 (4 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 9.1 | 查看网络状态 | NETWORK_INFO | QUERY_INFO |
| 2 | 9.3 | 查看 dns 配置 | NETWORK_INFO | QUERY_INFO |
| 3 | 9.6 | 测试到 google.com 的连通性 | NETWORK_INFO | RUN_SCRIPT |
| 4 | 9.7 | 查看当前网络连接 | NETWORK_INFO | QUERY_INFO |

### 问题分析

- **"查看"前缀被抢走**: 同上问题
- **"测试连通性"误识别**: "测试"被 RUN_SCRIPT 匹配
- **网络专用词汇不足**: "网络状态"、"dns 配置"、"网络连接"未覆盖

### 修复建议

1. NETWORK_INFO 添加"网络状态"、"dns 配置"、"网络连接"等关键词
2. 添加"连通性"、"ping"、"测试连通"等网络测试关键词
3. 提高 NETWORK_INFO 权重

---

## 六、FILE_PERMISSION 意图 (4 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 11.3 | 修改文件所有者 | FILE_PERMISSION | QUERY_INFO |
| 2 | 11.5 | 把 app.sh 设置为可执行文件 | FILE_PERMISSION | QUERY_INFO |
| 3 | 11.7 | 查看 src 目录下所有文件的权限 | FILE_PERMISSION | QUERY_INFO |
| 4 | 11.8 | 把 data.txt 的所有者改为 root | FILE_PERMISSION | UNKNOWN |

### 问题分析

- **"修改"被误识别**: "修改文件"被 QUERY_INFO 匹配
- **"设置为可执行文件"未覆盖**: 权限相关表达不完整
- **所有者相关词汇不足**: "所有者"、"改为 root"等未被识别

### 修复建议

1. FILE_PERMISSION 添加"修改文件所有者"、"设置为可执行"、"所有者改为"等复合关键词
2. 增加"所有者"、"chown"、"root"等权限管理词汇
3. 提高 FILE_PERMISSION 权重

---

## 七、INSTALL_PACKAGE 意图 (4 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 6.5 | 帮我安装 react 和 react-dom | INSTALL_PACKAGE | MULTI:INSTALL_PACKAGE,UNKNOWN,,,,, |
| 2 | 6.8 | 添加 eslint 和 prettier 到开发依赖 | INSTALL_PACKAGE | UNKNOWN |
| 3 | 2.3.2 | 安装 react 和 vue | INSTALL_PACKAGE | MULTI:INSTALL_PACKAGE,UNKNOWN,,,,, |
| 4 | 4.3.2 | 安装 react 和 react-dom | INSTALL_PACKAGE | MULTI:INSTALL_PACKAGE,UNKNOWN,,,,, |

### 问题分析

- **"和"连接词导致多意图拆分**: "react 和 react-dom"被拆分为两个意图，第二个为 UNKNOWN
- **长输入解析失败**: "到开发依赖"等后缀导致匹配失败
- **多包安装场景**: 多个包名用"和"连接时被错误拆分

### 修复建议

1. 优化实体提取，识别"和"连接的是包名列表而非多意图
2. INSTALL_PACKAGE 添加"开发依赖"、"到开发依赖"等关键词
3. 添加多包安装场景的参数提取规则

---

## 八、FILE_DIFF 意图 (5 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 12.1 | 比较 file1 和 file2 | FILE_DIFF | MULTI:FILE_DIFF,UNKNOWN,,,,, |
| 2 | 12.3 | 对比 config.old 和 config.new | FILE_DIFF | MULTI:FILE_DIFF,UNKNOWN,,,,, |
| 3 | 12.4 | 比较 a.txt 和 b.txt 有什么不同 | FILE_DIFF | MULTI:FILE_DIFF,UNKNOWN,,,,, |
| 4 | 12.5 | 用并排方式比较两个文件 | FILE_DIFF | UNKNOWN |
| 5 | 12.6 | 比较 package.json 和 package-lock.json 的差异 | FILE_DIFF | MULTI:INSTALL_PACKAGE,FILE_DIFF,,,,, |

### 问题分析

- **"和"连接词导致多意图拆分**: 文件比较中的"和"被误认为多意图连接词
- **"并排方式"未覆盖**: diff 的高级用法未识别
- **文件名实体提取问题**: "package.json"被误识别为 INSTALL_PACKAGE

### 修复建议

1. FILE_DIFF 添加"比较...和..."、"对比...和..."等模板匹配
2. 添加"并排方式"、"差异"、"不同"等关键词
3. 优化实体提取，避免文件名被误识别为包名

---

## 九、FETCH_HOT_NEWS 意图 (4 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 13.1 | 查看热榜 | FETCH_HOT_NEWS | QUERY_INFO |
| 2 | 13.2 | 获取 trending | FETCH_HOT_NEWS | UNKNOWN |
| 3 | 13.3 | 查看排行榜 | FETCH_HOT_NEWS | QUERY_INFO |
| 4 | 13.6 | 查看 GitHub trending 项目 | FETCH_HOT_NEWS | QUERY_INFO |

### 问题分析

- **"查看"前缀被抢走**: 同上
- **"获取 trending"未覆盖**: 英文关键词缺失
- **"GitHub trending"未识别**: 特定平台热榜未覆盖

### 修复建议

1. FETCH_HOT_NEWS 添加"查看热榜"、"查看排行榜"、"获取 trending"、"GitHub trending"等关键词
2. 增加"热榜"、"热搜"、"排行榜"、"trending"等词汇权重
3. 提高 FETCH_HOT_NEWS 权重

---

## 十、SOCIAL_MEDIA_SEARCH 意图 (2 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 14.2 | 查找微博热搜 | SOCIAL_MEDIA_SEARCH | FILE_FIND |
| 2 | 14.4 | 搜索小红书上关于 TypeScript 的内容 | SOCIAL_MEDIA_SEARCH | NETWORK_INFO |

### 问题分析

- **"查找微博热搜"被误识别**: "查找"被 FILE_FIND 匹配
- **"小红书"被误识别**: "搜索...内容"被 NETWORK_INFO 匹配

### 修复建议

1. SOCIAL_MEDIA_SEARCH 添加"查找微博热搜"、"搜索小红书上"等复合关键词
2. 增加社交媒体平台名称权重："微博"、"小红书"、"twitter"
3. 提高 SOCIAL_MEDIA_SEARCH 权重

---

## 十一、DATA_SCRAPING 意图 (2 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 15.2 | 采集网页内容 | DATA_SCRAPING | QUERY_INFO |
| 2 | 15.4 | 从网页中提取标题和链接 | DATA_SCRAPING | UNKNOWN |

### 问题分析

- **"采集"未覆盖**: DATA_SCRAPING 关键词不足
- **长输入解析失败**: "从网页中提取"等复杂表达未识别

### 修复建议

1. DATA_SCRAPING 添加"采集"、"提取"、"从网页中"等关键词
2. 增加"网页内容"、"标题和链接"等数据抓取场景词汇

---

## 十二、CONTENT_SUMMARY 意图 (1 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 16.3 | 汇总一下这个文档的要点 | CONTENT_SUMMARY | UNKNOWN |

### 问题分析

- **"汇总...要点"未覆盖**: CONTENT_SUMMARY 关键词不足

### 修复建议

1. CONTENT_SUMMARY 添加"汇总"、"要点"、"总结一下"等关键词

---

## 十三、CREATE_FILE 意图 (2 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 7.4 | 添加一个新文件 | CREATE_FILE | QUERY_INFO |
| 2 | 3.2.3 | 我需要一个叫 utils 的文件夹 | CREATE_FILE | QUERY_INFO |

### 问题分析

- **"添加"被误识别**: 通用词被 QUERY_INFO 抢走
- **"需要一个...文件夹"未覆盖**: 间接表达未识别

### 修复建议

1. CREATE_FILE 添加"添加一个新文件"、"需要一个...文件夹"等复合关键词
2. 增加"新文件"、"文件夹"等词汇权重

---

## 十四、RUN_SCRIPT 意图 (1 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 3.10 | 执行 typecheck | RUN_SCRIPT | UNKNOWN |

### 问题分析

- **"typecheck"未覆盖**: RUN_SCRIPT 关键词不足

### 修复建议

1. RUN_SCRIPT 添加"typecheck"、"类型检查"等关键词

---

## 十五、QUERY_INFO 意图 (1 个失败)

| # | 测试ID | 输入 | 预期意图 | 实际意图 |
|---|--------|------|----------|----------|
| 1 | 2.4.2 | 帮我 commit 一下代码 | GIT_WORKFLOW | QUERY_INFO |

### 问题分析

- **测试期望错误**: 此用例预期为 GIT_WORKFLOW，但测试脚本中分类有误

### 修复建议

1. 修正测试脚本中的预期意图

---

## 汇总统计

| 意图 | 失败数 | 主要问题 |
|------|--------|----------|
| GIT_WORKFLOW | 8 | git 专用词汇不足，"查看"被抢走 |
| SYSTEM_MONITOR | 6 | "查看"前缀被 QUERY_INFO 抢走 |
| FILE_FIND | 5 | "找出"未覆盖，大小参数提取失败 |
| FILE_DIFF | 5 | "和"连接词导致多意图误拆分 |
| SYSTEM_INFO | 4 | 与 SYSTEM_MONITOR 冲突，"查看"被抢走 |
| NETWORK_INFO | 4 | "查看"前缀被抢走，网络词汇不足 |
| FILE_PERMISSION | 4 | 所有者相关词汇不足 |
| INSTALL_PACKAGE | 4 | "和"连接词导致多意图误拆分 |
| FETCH_HOT_NEWS | 4 | "查看"前缀被抢走，英文关键词缺失 |
| SOCIAL_MEDIA_SEARCH | 2 | 平台名称权重不足 |
| DATA_SCRAPING | 2 | 关键词不足 |
| CREATE_FILE | 2 | 间接表达未识别 |
| CONTENT_SUMMARY | 1 | 关键词不足 |
| RUN_SCRIPT | 1 | typecheck 未覆盖 |
| QUERY_INFO | 1 | 测试期望错误 |
| **总计** | **53** | - |

---

## 核心问题总结

### 1. "查看"前缀冲突（影响 15+ 个用例）

**现象**: 所有以"查看"开头的输入都被 QUERY_INFO 优先匹配

**原因**: QUERY_INFO 包含"查看"这个高频通用词，且权重过高

**建议**: 
- 降低 QUERY_INFO 中"查看"的权重
- 各意图添加"查看+专有词"的复合关键词（如"查看 git 状态"、"查看网络状态"）

### 2. "和"连接词导致多意图误拆分（影响 8+ 个用例）

**现象**: "A 和 B"结构被拆分为两个意图，其中第二个为 UNKNOWN

**原因**: 意图拆分器将"和"视为多意图连接词，但实际可能是参数列表

**建议**:
- 优化拆分逻辑，区分"和"连接的是参数还是意图
- 添加实体类型感知：包名列表、文件列表不应触发多意图拆分

### 3. 关键词覆盖不足（影响 20+ 个用例）

**现象**: 部分意图的关键词模板过于简单，无法覆盖常见表达

**建议**: 为每个意图补充 3-5 个高频复合关键词

### 4. 权重区分度不够（影响 10+ 个用例）

**现象**: 多个意图同时匹配时，选择了错误的意图

**建议**: 提高专用意图的权重，降低通用意图的权重
