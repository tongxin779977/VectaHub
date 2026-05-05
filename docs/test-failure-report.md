# VectaHub 全量用户测试失败报告

> 测试日期: 2026-05-05 11:00:41 CST
> 架构版本: v2.0 (支持多意图识别)
> 测试脚本: `/tmp/run_all_tests_v2.sh`

---

## 测试总览

| 指标 | 数值 |
|------|------|
| 总用例数 | 161 |
| 通过 | 145 |
| 失败 | 16 |
| 通过率 | 90% |

---

## 失败用例明细

### FILE_FIND (2 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 1.6 | 帮我找一下项目里的配置文件 | FILE_FIND | QUERY_INFO |
| 4.2.1 | 查找所有 ts 文件并统计数量 | FILE_FIND | MULTI:FILE_FIND,UNKNOWN,,,,, |

### GIT_WORKFLOW (3 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 2.7 | 暂存当前修改 | GIT_WORKFLOW | FILE_DIFF |
| 2.10 | 创建一个叫 feature/auth 的分支并切换过去 | GIT_WORKFLOW | MULTI:GIT_WORKFLOW,UNKNOWN,,,,, |
| 2.13 | 查看工作区有哪些改动 | GIT_WORKFLOW | QUERY_INFO |

### SYSTEM_INFO (1 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 4.7 | 查看当前系统的内存占用情况 | SYSTEM_INFO | SYSTEM_MONITOR |

### SYSTEM_MONITOR (4 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 10.4 | 查看进程数 | SYSTEM_MONITOR | QUERY_INFO |
| 10.7 | 显示当前系统的资源使用情况 | SYSTEM_MONITOR | SYSTEM_INFO |
| 10.8 | 查看有哪些 node 进程在运行 | SYSTEM_MONITOR | RUN_SCRIPT |
| 3.2.7 | 看看哪个进程占用了最多内存 | SYSTEM_MONITOR | SYSTEM_INFO |

### NETWORK_INFO (1 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 9.3 | 查看 dns 配置 | NETWORK_INFO | QUERY_INFO |

### FILE_DIFF (2 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 12.5 | 用并排方式比较两个文件 | FILE_DIFF | UNKNOWN |
| 12.6 | 比较 package.json 和 package-lock.json 的差异 | FILE_DIFF | MULTI:INSTALL_PACKAGE,FILE_DIFF,,,,, |

### FETCH_HOT_NEWS (2 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 13.3 | 查看排行榜 | FETCH_HOT_NEWS | QUERY_INFO |
| 13.6 | 查看 GitHub trending 项目 | FETCH_HOT_NEWS | GIT_WORKFLOW |

### QUERY_INFO (1 个失败)

| 编号 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 3.2.4 | 这个项目用了哪些 npm 包 | QUERY_INFO | INSTALL_PACKAGE |

---

## 按意图维度统计

| 意图 | 总数 | 通过 | 失败 | 通过率 |
|------|------|------|------|--------|
| MULTI_INTENT | 6 | 6 | 0 | 100% |
| UNKNOWN | 5 | 5 | 0 | 100% |
| DATA_SCRAPING | 4 | 4 | 0 | 100% |
| CREATE_FILE | 11 | 11 | 0 | 100% |
| SOCIAL_MEDIA_SEARCH | 4 | 4 | 0 | 100% |
| CONTENT_SUMMARY | 4 | 4 | 0 | 100% |
| RUN_SCRIPT | 11 | 11 | 0 | 100% |
| FILE_ARCHIVE | 10 | 10 | 0 | 100% |
| INSTALL_PACKAGE | 12 | 12 | 0 | 100% |
| FILE_PERMISSION | 10 | 10 | 0 | 100% |
| NETWORK_INFO | 9 | 8 | 1 | 88% |
| SYSTEM_INFO | 11 | 10 | 1 | 90% |
| QUERY_INFO | 11 | 10 | 1 | 90% |
| FILE_FIND | 14 | 12 | 2 | 85% |
| GIT_WORKFLOW | 17 | 14 | 3 | 82% |
| FILE_DIFF | 7 | 5 | 2 | 71% |
| FETCH_HOT_NEWS | 6 | 4 | 2 | 66% |
| SYSTEM_MONITOR | 9 | 5 | 4 | 55% |
| **总计** | **161** | **145** | **16** | **90%** |

---

## 通过用例明细（按意图分类）

### FILE_FIND (12 个通过)
- 1.1 找出所有 ts 文件 → FILE_FIND ✅
- 1.2 查找 src 目录下的文件 → FILE_FIND ✅
- 1.3 搜索 7 天内修改的文件 → FILE_FIND ✅
- 1.4 找出大于 1M 的文件 → FILE_FIND ✅
- 1.5 查找所有的目录 → FILE_FIND ✅
- 1.7 搜索最近三天修改的日志文件 → FILE_FIND ✅
- 1.8 找出所有超过 100MB 的大文件 → FILE_FIND ✅
- 1.9 在 docs 文件夹下查找 markdown 文件 → FILE_FIND ✅
- 1.10 find all json files in config directory → FILE_FIND ✅
- 2.3.1 在 /tmp 目录下查找 log 文件 → FILE_FIND ✅
- 2.4.1 find 所有的 ts 文件 → FILE_FIND ✅
- 4.3.1 在 src 目录下查找 test 文件 → FILE_FIND ✅

### GIT_WORKFLOW (14 个通过)
- 2.1 提交代码 → GIT_WORKFLOW ✅
- 2.2 推送到远程 → GIT_WORKFLOW ✅
- 2.3 拉取最新代码 → GIT_WORKFLOW ✅
- 2.4 查看 git 状态 → GIT_WORKFLOW ✅
- 2.5 创建新分支 feature → GIT_WORKFLOW ✅
- 2.6 查看提交历史 → GIT_WORKFLOW ✅
- 2.8 合并 develop 分支 → GIT_WORKFLOW ✅
- 2.9 帮我提交代码，提交信息是修复登录 bug → GIT_WORKFLOW ✅
- 2.11 把当前改动推送到 origin main → GIT_WORKFLOW ✅
- 2.12 查看最近 5 次提交记录 → GIT_WORKFLOW ✅
- 2.14 把 develop 的代码合并到当前分支 → GIT_WORKFLOW ✅
- 2.4.2 帮我 commit 一下代码 → GIT_WORKFLOW ✅
- 3.2.2 帮我把最新的改动提交到 git 上 → GIT_WORKFLOW ✅
- 4.1.2 查看 git 状态 → GIT_WORKFLOW ✅

### RUN_SCRIPT (11 个通过)
- 3.1 构建项目 → RUN_SCRIPT ✅
- 3.2 运行测试 → RUN_SCRIPT ✅
- 3.3 启动项目 → RUN_SCRIPT ✅
- 3.4 运行 dev 模式 → RUN_SCRIPT ✅
- 3.5 执行 build 脚本 → RUN_SCRIPT ✅
- 3.6 跑一下单元测试 → RUN_SCRIPT ✅
- 3.7 帮我构建这个项目 → RUN_SCRIPT ✅
- 3.8 启动开发服务器 → RUN_SCRIPT ✅
- 3.9 运行 lint 检查 → RUN_SCRIPT ✅
- 3.10 执行 typecheck → RUN_SCRIPT ✅
- 2.4.4 run test 跑一下 → RUN_SCRIPT ✅

### SYSTEM_INFO (10 个通过)
- 4.1 查看磁盘使用情况 → SYSTEM_INFO ✅
- 4.2 系统信息查询 → SYSTEM_INFO ✅
- 4.3 查看内存使用 → SYSTEM_INFO ✅
- 4.4 查看 cpu 信息 → SYSTEM_INFO ✅
- 4.5 磁盘使用 → SYSTEM_INFO ✅
- 4.6 帮我看看磁盘还剩多少空间 → SYSTEM_INFO ✅
- 4.8 显示 CPU 核心数和型号 → SYSTEM_INFO ✅
- 4.9 查看系统版本信息 → SYSTEM_INFO ✅
- 4.10 显示操作系统的详细信息 → SYSTEM_INFO ✅
- 4.1.1 查看磁盘使用情况 → SYSTEM_INFO ✅

### QUERY_INFO (10 个通过)
- 5.1 查看当前目录 → QUERY_INFO ✅
- 5.2 列出文件 → QUERY_INFO ✅
- 5.3 显示目录内容 → QUERY_INFO ✅
- 5.4 看看当前有什么文件 → QUERY_INFO ✅
- 5.5 列出 src 目录下的所有文件 → QUERY_INFO ✅
- 5.6 查看项目结构 → QUERY_INFO ✅
- 5.7 显示隐藏文件 → QUERY_INFO ✅
- 5.8 列出当前目录下的所有子目录 → QUERY_INFO ✅
- 3.2.1 我想看看这个项目的文件结构是什么样的 → QUERY_INFO ✅
- 4.1.3 列出当前目录文件 → QUERY_INFO ✅

### INSTALL_PACKAGE (12 个通过)
- 6.1 安装 lodash → INSTALL_PACKAGE ✅
- 6.2 添加依赖 express → INSTALL_PACKAGE ✅
- 6.3 安装开发依赖 typescript → INSTALL_PACKAGE ✅
- 6.4 npm 包安装 axios → INSTALL_PACKAGE ✅
- 6.5 帮我安装 react 和 react-dom → INSTALL_PACKAGE ✅
- 6.6 安装 vitest 作为开发依赖 → INSTALL_PACKAGE ✅
- 6.7 用 yarn 安装 next → INSTALL_PACKAGE ✅
- 6.8 添加 eslint 和 prettier 到开发依赖 → INSTALL_PACKAGE ✅
- 2.3.2 安装 react 和 vue → INSTALL_PACKAGE ✅
- 2.4.3 install axios 这个包 → INSTALL_PACKAGE ✅
- 3.2.10 帮我安装项目需要的依赖包 → INSTALL_PACKAGE ✅
- 4.3.2 安装 react 和 react-dom → INSTALL_PACKAGE ✅

### CREATE_FILE (11 个通过)
- 7.1 创建文件 test.txt → CREATE_FILE ✅
- 7.2 新建 README.md → CREATE_FILE ✅
- 7.3 创建目录 src/utils → CREATE_FILE ✅
- 7.4 添加一个新文件 → CREATE_FILE ✅
- 7.5 帮我创建一个叫 config.yaml 的文件 → CREATE_FILE ✅
- 7.6 在 src 目录下创建 components 文件夹 → CREATE_FILE ✅
- 7.7 创建 test/unit 目录 → CREATE_FILE ✅
- 7.8 新建一个空的 package.json → CREATE_FILE ✅
- 2.3.3 创建 src/components/Button.tsx → CREATE_FILE ✅
- 3.2.3 我需要一个叫 utils 的文件夹 → CREATE_FILE ✅
- 4.3.3 创建 test/unit 目录 → CREATE_FILE ✅

### FILE_ARCHIVE (10 个通过)
- 8.1 压缩 file.txt → FILE_ARCHIVE ✅
- 8.2 解压 archive.tar.gz → FILE_ARCHIVE ✅
- 8.3 打包 src 目录 → FILE_ARCHIVE ✅
- 8.4 解压 zip 文件 → FILE_ARCHIVE ✅
- 8.5 把 dist 目录压缩成 dist.tar.gz → FILE_ARCHIVE ✅
- 8.6 解压 backup.zip 到当前目录 → FILE_ARCHIVE ✅
- 8.7 将 logs 文件夹打包 → FILE_ARCHIVE ✅
- 8.8 解压 data.tar.gz 到 /tmp 目录 → FILE_ARCHIVE ✅
- 3.2.5 把 dist 目录打包成一个压缩包 → FILE_ARCHIVE ✅
- 2.3.4 压缩 dist 目录为 dist.zip → FILE_ARCHIVE ✅

### NETWORK_INFO (8 个通过)
- 9.1 查看网络状态 → NETWORK_INFO ✅
- 9.2 ping baidu.com → NETWORK_INFO ✅
- 9.4 检查端口 8080 → NETWORK_INFO ✅
- 9.5 查看本机 IP 地址 → NETWORK_INFO ✅
- 9.6 测试到 google.com 的连通性 → NETWORK_INFO ✅
- 9.7 查看当前网络连接 → NETWORK_INFO ✅
- 9.8 检查 3000 端口是否被占用 → NETWORK_INFO ✅
- 3.2.6 我想知道当前电脑的 IP 地址 → NETWORK_INFO ✅

### SYSTEM_MONITOR (5 个通过)
- 10.1 查看 cpu 使用率 → SYSTEM_MONITOR ✅
- 10.2 查看内存占用 → SYSTEM_MONITOR ✅
- 10.3 查看磁盘空间 → SYSTEM_MONITOR ✅
- 10.5 系统负载是多少 → SYSTEM_MONITOR ✅
- 10.6 查看占用内存最多的进程 → SYSTEM_MONITOR ✅

### FILE_PERMISSION (10 个通过)
- 11.1 修改文件权限为 755 → FILE_PERMISSION ✅
- 11.2 给脚本添加执行权限 → FILE_PERMISSION ✅
- 11.3 修改文件所有者 → FILE_PERMISSION ✅
- 11.4 查看文件权限 → FILE_PERMISSION ✅
- 11.5 把 app.sh 设置为可执行文件 → FILE_PERMISSION ✅
- 11.6 将 config 目录权限改为 777 → FILE_PERMISSION ✅
- 11.7 查看 src 目录下所有文件的权限 → FILE_PERMISSION ✅
- 11.8 把 data.txt 的所有者改为 root → FILE_PERMISSION ✅
- 2.3.5 把 main.js 的权限改为 755 → FILE_PERMISSION ✅
- 3.2.8 给这个脚本加上可执行的权限 → FILE_PERMISSION ✅

### FILE_DIFF (5 个通过)
- 12.1 比较 file1 和 file2 → FILE_DIFF ✅
- 12.2 查看两个文件的差异 → FILE_DIFF ✅
- 12.3 对比 config.old 和 config.new → FILE_DIFF ✅
- 12.4 比较 a.txt 和 b.txt 有什么不同 → FILE_DIFF ✅
- 3.2.9 我想对比一下两个配置文件有什么不同 → FILE_DIFF ✅

### FETCH_HOT_NEWS (4 个通过)
- 13.1 查看热榜 → FETCH_HOT_NEWS ✅
- 13.2 获取 trending → FETCH_HOT_NEWS ✅
- 13.4 帮我看看今天的热搜 → FETCH_HOT_NEWS ✅
- 13.5 获取 Hacker News 热榜 → FETCH_HOT_NEWS ✅

### SOCIAL_MEDIA_SEARCH (4 个通过)
- 14.1 搜索 twitter 上的 AI 话题 → SOCIAL_MEDIA_SEARCH ✅
- 14.2 查找微博热搜 → SOCIAL_MEDIA_SEARCH ✅
- 14.3 在社交媒体上搜索 VectaHub → SOCIAL_MEDIA_SEARCH ✅
- 14.4 搜索小红书上关于 TypeScript 的内容 → SOCIAL_MEDIA_SEARCH ✅

### DATA_SCRAPING (4 个通过)
- 15.1 爬取网页数据 → DATA_SCRAPING ✅
- 15.2 采集网页内容 → DATA_SCRAPING ✅
- 15.3 抓取 example.com 的内容 → DATA_SCRAPING ✅
- 15.4 从网页中提取标题和链接 → DATA_SCRAPING ✅

### CONTENT_SUMMARY (4 个通过)
- 16.1 摘要内容 → CONTENT_SUMMARY ✅
- 16.2 总结这篇文章 → CONTENT_SUMMARY ✅
- 16.3 汇总一下这个文档的要点 → CONTENT_SUMMARY ✅
- 16.4 帮我总结一下 README 的内容 → CONTENT_SUMMARY ✅

### UNKNOWN (5 个通过)
- 2.1.1 你好啊 → UNKNOWN ✅
- 2.1.2 帮我做点什么 → UNKNOWN ✅
- 2.1.3 ... → UNKNOWN ✅
- 2.1.4 123 → UNKNOWN ✅
- 2.1.5 随便 → UNKNOWN ✅

### MULTI_INTENT (6 个通过)
- 2.2.1 查找文件并提交 → MULTI:FILE_FIND,GIT_WORKFLOW ✅
- 2.2.2 安装依赖然后构建项目 → MULTI:INSTALL_PACKAGE,RUN_SCRIPT ✅
- 2.2.3 创建文件并修改权限 → MULTI:CREATE_FILE,FILE_PERMISSION ✅
- 2.2.4 查看系统信息然后检查网络 → MULTI:SYSTEM_INFO,NETWORK_INFO ✅
- 4.2.2 安装依赖然后构建项目 → MULTI:INSTALL_PACKAGE,RUN_SCRIPT ✅
- 4.2.3 创建目录并初始化 git 仓库 → MULTI:CREATE_FILE,GIT_WORKFLOW ✅
