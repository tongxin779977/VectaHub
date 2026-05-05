# VectaHub 全量用户测试文档

> 版本: 1.0.0
> 更新日期: 2026-05-04
> 用途: 模拟真实用户操作，验证意图识别（关键词匹配 + LLM 解析）的准确性和完整性

---

## 测试环境准备

```bash
# 1. 确保项目已构建
npm run build

# 2. 确保 CLI 可用
vectahub --version

# 3. 检查 LLM 配置（可选，用于 LLM 解析测试）
cat ~/.vectahub/config.yaml

# 4. 创建测试目录
mkdir -p /tmp/vectahub-test && cd /tmp/vectahub-test
```

---

## 测试说明

| 测试类型 | 说明 | 执行方式 |
|----------|------|----------|
| **关键词匹配** | 基于规则/关键词的意图识别 | `vectahub run --dry-run "输入"` |
| **LLM 解析** | 基于大语言模型的意图识别 | 需配置 LLM，同上命令自动选择 |
| **混合测试** | 验证 LLM 失败时回退到关键词匹配 | 禁用 LLM 后测试 |

### 测试命令

```bash
# 关键词匹配测试（推荐）
vectahub run --dry-run "测试输入"

# LLM 解析测试（需配置 LLM）
vectahub run --dry-run "测试输入"

# 保存工作流（验证完整流程）
vectahub run "测试输入" --save
```

### 预期结果判断

| 状态 | 说明 |
|------|------|
| ✅ 通过 | 正确识别意图，生成对应命令 |
| ❌ 失败 | 意图识别错误或未识别 |
| ⚠️ 警告 | 意图识别正确但参数提取不完整 |

---

## 第一部分：全量意图识别测试（16 个意图）

### 1. FILE_FIND - 查找文件

**描述**: 查找文件，支持按名称、类型、时间、大小筛选

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 1.1 | 找出所有 ts 文件 | FILE_FIND | 关键词 | `find . -type f -name "*.ts"` |
| 1.2 | 查找 src 目录下的文件 | FILE_FIND | 关键词 | `find src -type f` |
| 1.3 | 搜索 7 天内修改的文件 | FILE_FIND | 关键词 | `find . -type f -mtime -7` |
| 1.4 | 找出大于 1M 的文件 | FILE_FIND | 关键词 | `find . -type f -size +1M` |
| 1.5 | 查找所有的目录 | FILE_FIND | 关键词 | `find . -type d` |
| 1.6 | 帮我找一下项目里的配置文件 | FILE_FIND | LLM | `find . -type f -name "*config*"` |
| 1.7 | 搜索最近三天修改的日志文件 | FILE_FIND | LLM | `find . -type f -name "*.log" -mtime -3` |
| 1.8 | 找出所有超过 100MB 的大文件 | FILE_FIND | LLM | `find . -type f -size +100M` |
| 1.9 | 在 docs 文件夹下查找 markdown 文件 | FILE_FIND | LLM | `find docs -type f -name "*.md"` |
| 1.10 | find all json files in config directory | FILE_FIND | 关键词 | `find config -type f -name "*.json"` |

---

### 2. GIT_WORKFLOW - Git 操作流程

**描述**: Git 提交、推送、拉取、分支管理等操作

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 2.1 | 提交代码 | GIT_WORKFLOW | 关键词 | `git add -A && git commit -m "..."` |
| 2.2 | 推送到远程 | GIT_WORKFLOW | 关键词 | `git push` |
| 2.3 | 拉取最新代码 | GIT_WORKFLOW | 关键词 | `git pull` |
| 2.4 | 查看 git 状态 | GIT_WORKFLOW | 关键词 | `git status` |
| 2.5 | 创建新分支 feature | GIT_WORKFLOW | 关键词 | `git branch feature` |
| 2.6 | 查看提交历史 | GIT_WORKFLOW | 关键词 | `git log` |
| 2.7 | 暂存当前修改 | GIT_WORKFLOW | 关键词 | `git stash` |
| 2.8 | 合并 develop 分支 | GIT_WORKFLOW | 关键词 | `git merge develop` |
| 2.9 | 帮我提交代码，提交信息是"修复登录 bug" | GIT_WORKFLOW | LLM | `git add -A && git commit -m "修复登录 bug"` |
| 2.10 | 创建一个叫 feature/auth 的分支并切换过去 | GIT_WORKFLOW | LLM | `git checkout -b feature/auth` |
| 2.11 | 把当前改动推送到 origin main | GIT_WORKFLOW | LLM | `git push origin main` |
| 2.12 | 查看最近 5 次提交记录 | GIT_WORKFLOW | LLM | `git log -5` |
| 2.13 | 查看工作区有哪些改动 | GIT_WORKFLOW | LLM | `git status` |
| 2.14 | 把 develop 的代码合并到当前分支 | GIT_WORKFLOW | LLM | `git merge develop` |

---

### 3. RUN_SCRIPT - 运行脚本

**描述**: 运行项目脚本（build、test、start 等）

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 3.1 | 构建项目 | RUN_SCRIPT | 关键词 | `npm run build` |
| 3.2 | 运行测试 | RUN_SCRIPT | 关键词 | `npm run test` |
| 3.3 | 启动项目 | RUN_SCRIPT | 关键词 | `npm run start` |
| 3.4 | 运行 dev 模式 | RUN_SCRIPT | 关键词 | `npm run dev` |
| 3.5 | 执行 build 脚本 | RUN_SCRIPT | 关键词 | `npm run build` |
| 3.6 | 跑一下单元测试 | RUN_SCRIPT | LLM | `npm run test` |
| 3.7 | 帮我构建这个项目 | RUN_SCRIPT | LLM | `npm run build` |
| 3.8 | 启动开发服务器 | RUN_SCRIPT | LLM | `npm run dev` |
| 3.9 | 运行 lint 检查 | RUN_SCRIPT | LLM | `npm run lint` |
| 3.10 | 执行 typecheck | RUN_SCRIPT | LLM | `npm run typecheck` |

---

### 4. SYSTEM_INFO - 查看系统信息

**描述**: 查看系统信息（磁盘、内存、CPU 等）

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 4.1 | 查看磁盘使用情况 | SYSTEM_INFO | 关键词 | `df -h` |
| 4.2 | 系统信息查询 | SYSTEM_INFO | 关键词 | `uname -a` |
| 4.3 | 查看内存使用 | SYSTEM_INFO | 关键词 | `free -h` |
| 4.4 | 查看 cpu 信息 | SYSTEM_INFO | 关键词 | `lscpu` |
| 4.5 | 磁盘使用 | SYSTEM_INFO | 关键词 | `df -h` |
| 4.6 | 帮我看看磁盘还剩多少空间 | SYSTEM_INFO | LLM | `df -h` |
| 4.7 | 查看当前系统的内存占用情况 | SYSTEM_INFO | LLM | `free -h` |
| 4.8 | 显示 CPU 核心数和型号 | SYSTEM_INFO | LLM | `lscpu` |
| 4.9 | 查看系统版本信息 | SYSTEM_INFO | LLM | `uname -a` |
| 4.10 | 显示操作系统的详细信息 | SYSTEM_INFO | LLM | `uname -a && cat /etc/os-release` |

---

### 5. QUERY_INFO - 查询信息

**描述**: 查看目录内容、文件结构等

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 5.1 | 查看当前目录 | QUERY_INFO | 关键词 | `ls -la` |
| 5.2 | 列出文件 | QUERY_INFO | 关键词 | `ls` |
| 5.3 | 显示目录内容 | QUERY_INFO | 关键词 | `ls -la` |
| 5.4 | 看看当前有什么文件 | QUERY_INFO | LLM | `ls -la` |
| 5.5 | 列出 src 目录下的所有文件 | QUERY_INFO | LLM | `ls -la src` |
| 5.6 | 查看项目结构 | QUERY_INFO | LLM | `ls -la && find . -maxdepth 2 -type d` |
| 5.7 | 显示隐藏文件 | QUERY_INFO | LLM | `ls -la` |
| 5.8 | 列出当前目录下的所有子目录 | QUERY_INFO | LLM | `ls -d */` |

---

### 6. INSTALL_PACKAGE - 安装依赖包

**描述**: 安装 npm 包或其他依赖

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 6.1 | 安装 lodash | INSTALL_PACKAGE | 关键词 | `npm install lodash` |
| 6.2 | 添加依赖 express | INSTALL_PACKAGE | 关键词 | `npm install express` |
| 6.3 | 安装开发依赖 typescript | INSTALL_PACKAGE | 关键词 | `npm install -D typescript` |
| 6.4 | npm 包安装 axios | INSTALL_PACKAGE | 关键词 | `npm install axios` |
| 6.5 | 帮我安装 react 和 react-dom | INSTALL_PACKAGE | LLM | `npm install react react-dom` |
| 6.6 | 安装 vitest 作为开发依赖 | INSTALL_PACKAGE | LLM | `npm install -D vitest` |
| 6.7 | 用 yarn 安装 next | INSTALL_PACKAGE | LLM | `yarn add next` |
| 6.8 | 添加 eslint 和 prettier 到开发依赖 | INSTALL_PACKAGE | LLM | `npm install -D eslint prettier` |

---

### 7. CREATE_FILE - 创建新文件

**描述**: 创建文件或目录

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 7.1 | 创建文件 test.txt | CREATE_FILE | 关键词 | `touch test.txt` |
| 7.2 | 新建 README.md | CREATE_FILE | 关键词 | `touch README.md` |
| 7.3 | 创建目录 src/utils | CREATE_FILE | 关键词 | `mkdir -p src/utils` |
| 7.4 | 添加一个新文件 | CREATE_FILE | 关键词 | `touch newfile` |
| 7.5 | 帮我创建一个叫 config.yaml 的文件 | CREATE_FILE | LLM | `touch config.yaml` |
| 7.6 | 在 src 目录下创建 components 文件夹 | CREATE_FILE | LLM | `mkdir -p src/components` |
| 7.7 | 创建 test/unit 目录 | CREATE_FILE | LLM | `mkdir -p test/unit` |
| 7.8 | 新建一个空的 package.json | CREATE_FILE | LLM | `touch package.json` |

---

### 8. FILE_ARCHIVE - 文件压缩解压

**描述**: 压缩或解压文件

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 8.1 | 压缩 file.txt | FILE_ARCHIVE | 关键词 | `tar -czf file.txt.tar.gz file.txt` |
| 8.2 | 解压 archive.tar.gz | FILE_ARCHIVE | 关键词 | `tar -xzf archive.tar.gz` |
| 8.3 | 打包 src 目录 | FILE_ARCHIVE | 关键词 | `tar -czf src.tar.gz src` |
| 8.4 | 解压 zip 文件 | FILE_ARCHIVE | 关键词 | `unzip file.zip` |
| 8.5 | 把 dist 目录压缩成 dist.tar.gz | FILE_ARCHIVE | LLM | `tar -czf dist.tar.gz dist` |
| 8.6 | 解压 backup.zip 到当前目录 | FILE_ARCHIVE | LLM | `unzip backup.zip` |
| 8.7 | 将 logs 文件夹打包 | FILE_ARCHIVE | LLM | `tar -czf logs.tar.gz logs` |
| 8.8 | 解压 data.tar.gz 到 /tmp 目录 | FILE_ARCHIVE | LLM | `tar -xzf data.tar.gz -C /tmp` |

---

### 9. NETWORK_INFO - 网络信息查询

**描述**: 网络状态、ping、DNS、端口等

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 9.1 | 查看网络状态 | NETWORK_INFO | 关键词 | `ifconfig` |
| 9.2 | ping baidu.com | NETWORK_INFO | 关键词 | `ping -c 4 baidu.com` |
| 9.3 | 查看 dns 配置 | NETWORK_INFO | 关键词 | `cat /etc/resolv.conf` |
| 9.4 | 检查端口 8080 | NETWORK_INFO | 关键词 | `lsof -i :8080` |
| 9.5 | 查看本机 IP 地址 | NETWORK_INFO | LLM | `ifconfig | grep inet` |
| 9.6 | 测试到 google.com 的连通性 | NETWORK_INFO | LLM | `ping -c 4 google.com` |
| 9.7 | 查看当前网络连接 | NETWORK_INFO | LLM | `netstat -an` |
| 9.8 | 检查 3000 端口是否被占用 | NETWORK_INFO | LLM | `lsof -i :3000` |

---

### 10. SYSTEM_MONITOR - 系统状态监控

**描述**: CPU、内存、磁盘、进程监控

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 10.1 | 查看 cpu 使用率 | SYSTEM_MONITOR | 关键词 | `top -l 1` |
| 10.2 | 查看内存占用 | SYSTEM_MONITOR | 关键词 | `vm_stat` |
| 10.3 | 查看磁盘空间 | SYSTEM_MONITOR | 关键词 | `df -h` |
| 10.4 | 查看进程数 | SYSTEM_MONITOR | 关键词 | `ps aux | wc -l` |
| 10.5 | 系统负载是多少 | SYSTEM_MONITOR | LLM | `uptime` |
| 10.6 | 查看占用内存最多的进程 | SYSTEM_MONITOR | LLM | `ps aux --sort=-%mem | head -10` |
| 10.7 | 显示当前系统的资源使用情况 | SYSTEM_MONITOR | LLM | `top -l 1 && df -h` |
| 10.8 | 查看有哪些 node 进程在运行 | SYSTEM_MONITOR | LLM | `ps aux | grep node` |

---

### 11. FILE_PERMISSION - 文件权限管理

**描述**: 修改文件权限、所有者等

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 11.1 | 修改文件权限为 755 | FILE_PERMISSION | 关键词 | `chmod 755 file` |
| 11.2 | 给脚本添加执行权限 | FILE_PERMISSION | 关键词 | `chmod +x script.sh` |
| 11.3 | 修改文件所有者 | FILE_PERMISSION | 关键词 | `chown user file` |
| 11.4 | 查看文件权限 | FILE_PERMISSION | 关键词 | `ls -la file` |
| 11.5 | 把 app.sh 设置为可执行文件 | FILE_PERMISSION | LLM | `chmod +x app.sh` |
| 11.6 | 将 config 目录权限改为 777 | FILE_PERMISSION | LLM | `chmod -R 777 config` |
| 11.7 | 查看 src 目录下所有文件的权限 | FILE_PERMISSION | LLM | `ls -la src` |
| 11.8 | 把 data.txt 的所有者改为 root | FILE_PERMISSION | LLM | `sudo chown root data.txt` |

---

### 12. FILE_DIFF - 文件内容比较

**描述**: 比较两个文件的差异

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 12.1 | 比较 file1 和 file2 | FILE_DIFF | 关键词 | `diff file1 file2` |
| 12.2 | 查看两个文件的差异 | FILE_DIFF | 关键词 | `diff file1 file2` |
| 12.3 | 对比 config.old 和 config.new | FILE_DIFF | 关键词 | `diff config.old config.new` |
| 12.4 | 比较 a.txt 和 b.txt 有什么不同 | FILE_DIFF | LLM | `diff a.txt b.txt` |
| 12.5 | 用并排方式比较两个文件 | FILE_DIFF | LLM | `diff -y file1 file2` |
| 12.6 | 比较 package.json 和 package-lock.json 的差异 | FILE_DIFF | LLM | `diff package.json package-lock.json` |

---

### 13. FETCH_HOT_NEWS - 获取热榜信息

**描述**: 获取热榜、排行榜信息

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 13.1 | 查看热榜 | FETCH_HOT_NEWS | 关键词 | `curl ...` |
| 13.2 | 获取 trending | FETCH_HOT_NEWS | 关键词 | `curl ...` |
| 13.3 | 查看排行榜 | FETCH_HOT_NEWS | 关键词 | `curl ...` |
| 13.4 | 帮我看看今天的热搜 | FETCH_HOT_NEWS | LLM | `curl ...` |
| 13.5 | 获取 Hacker News 热榜 | FETCH_HOT_NEWS | LLM | `curl ...` |
| 13.6 | 查看 GitHub trending 项目 | FETCH_HOT_NEWS | LLM | `curl ...` |

---

### 14. SOCIAL_MEDIA_SEARCH - 社交媒体搜索

**描述**: 社交媒体平台搜索

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 14.1 | 搜索 twitter 上的 AI 话题 | SOCIAL_MEDIA_SEARCH | 关键词 | `curl ...` |
| 14.2 | 查找微博热搜 | SOCIAL_MEDIA_SEARCH | 关键词 | `curl ...` |
| 14.3 | 在社交媒体上搜索 VectaHub | SOCIAL_MEDIA_SEARCH | LLM | `curl ...` |
| 14.4 | 搜索小红书上关于 TypeScript 的内容 | SOCIAL_MEDIA_SEARCH | LLM | `curl ...` |

---

### 15. DATA_SCRAPING - 网页数据爬取

**描述**: 网页数据爬取、采集

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 15.1 | 爬取网页数据 | DATA_SCRAPING | 关键词 | `curl ...` |
| 15.2 | 采集网页内容 | DATA_SCRAPING | 关键词 | `curl ...` |
| 15.3 | 抓取 example.com 的内容 | DATA_SCRAPING | LLM | `curl -s https://example.com` |
| 15.4 | 从网页中提取标题和链接 | DATA_SCRAPING | LLM | `curl -s URL | grep -o '<a.*</a>'` |

---

### 16. CONTENT_SUMMARY - 内容摘要

**描述**: 内容摘要、汇总、总结

| # | 测试输入 | 预期意图 | 测试类型 | 预期命令 |
|---|----------|----------|----------|----------|
| 16.1 | 摘要内容 | CONTENT_SUMMARY | 关键词 | `...` |
| 16.2 | 总结这篇文章 | CONTENT_SUMMARY | 关键词 | `...` |
| 16.3 | 汇总一下这个文档的要点 | CONTENT_SUMMARY | LLM | `...` |
| 16.4 | 帮我总结一下 README 的内容 | CONTENT_SUMMARY | LLM | `cat README.md` |

---

## 第二部分：边界情况测试

### 2.1 模糊输入

| # | 测试输入 | 预期结果 | 说明 |
|---|----------|----------|------|
| 2.1.1 | 你好啊 | UNKNOWN 或回退 | 无明确意图 |
| 2.1.2 | 帮我做点什么 | UNKNOWN 或回退 | 过于模糊 |
| 2.1.3 | ... | UNKNOWN | 无效输入 |
| 2.1.4 | 123 | UNKNOWN | 纯数字 |
| 2.1.5 | 随便 | UNKNOWN | 无意义输入 |

### 2.2 混合意图

| # | 测试输入 | 预期结果 | 说明 |
|---|----------|----------|------|
| 2.2.1 | 查找文件并提交 | 多意图 | 需要拆分任务 |
| 2.2.2 | 安装依赖然后构建项目 | 多意图 | RUN_SCRIPT + INSTALL_PACKAGE |
| 2.2.3 | 创建文件并修改权限 | 多意图 | CREATE_FILE + FILE_PERMISSION |
| 2.2.4 | 查看系统信息然后检查网络 | 多意图 | SYSTEM_INFO + NETWORK_INFO |

### 2.3 参数提取测试

| # | 测试输入 | 预期意图 | 关键参数 | 说明 |
|---|----------|----------|----------|------|
| 2.3.1 | 在 /tmp 目录下查找 log 文件 | FILE_FIND | path=/tmp, name=log | 路径参数 |
| 2.3.2 | 安装 react 和 vue | INSTALL_PACKAGE | packages=[react, vue] | 多包名 |
| 2.3.3 | 创建 src/components/Button.tsx | CREATE_FILE | path=src/components/Button.tsx | 嵌套路径 |
| 2.3.4 | 压缩 dist 目录为 dist.zip | FILE_ARCHIVE | source=dist, target=dist.zip | 源和目标 |
| 2.3.5 | 把 main.js 的权限改为 755 | FILE_PERMISSION | file=main.js, mode=755 | 文件+权限 |

### 2.4 中英文混合

| # | 测试输入 | 预期意图 | 说明 |
|---|----------|----------|------|
| 2.4.1 | find 所有的 ts 文件 | FILE_FIND | 中英混合 |
| 2.4.2 | 帮我 commit 一下代码 | GIT_WORKFLOW | 中英混合 |
| 2.4.3 | install axios 这个包 | INSTALL_PACKAGE | 中英混合 |
| 2.4.4 | run test 跑一下 | RUN_SCRIPT | 中英混合 |

---

## 第三部分：LLM 解析专项测试

### 3.1 LLM 配置验证

```bash
# 检查 LLM 配置
cat ~/.vectahub/config.yaml

# 测试 LLM 连接（如果配置了）
vectahub run --dry-run "查看系统信息"
```

### 3.2 LLM 解析能力测试

| # | 测试输入 | 预期意图 | 测试重点 |
|---|----------|----------|----------|
| 3.2.1 | 我想看看这个项目的文件结构是什么样的 | QUERY_INFO | 语义理解 |
| 3.2.2 | 帮我把最新的改动提交到 git 上 | GIT_WORKFLOW | 意图推断 |
| 3.2.3 | 我需要一个叫 utils 的文件夹 | CREATE_FILE | 参数提取 |
| 3.2.4 | 这个项目用了哪些 npm 包 | QUERY_INFO | 上下文理解 |
| 3.2.5 | 把 dist 目录打包成一个压缩包 | FILE_ARCHIVE | 动作转换 |
| 3.2.6 | 我想知道当前电脑的 IP 地址 | NETWORK_INFO | 自然语言映射 |
| 3.2.7 | 看看哪个进程占用了最多内存 | SYSTEM_MONITOR | 语义映射 |
| 3.2.8 | 给这个脚本加上可执行的权限 | FILE_PERMISSION | 意图推断 |
| 3.2.9 | 我想对比一下两个配置文件有什么不同 | FILE_DIFF | 语义理解 |
| 3.2.10 | 帮我安装项目需要的依赖包 | INSTALL_PACKAGE | 模糊意图 |

### 3.3 LLM 回退测试

```bash
# 1. 禁用 LLM
# 编辑 ~/.vectahub/config.yaml，设置 enabled: false

# 2. 运行测试
vectahub run --dry-run "查找所有 TypeScript 文件"
vectahub run --dry-run "提交代码到 git"
vectahub run --dry-run "安装 lodash"

# 3. 验证回退到关键词匹配
# 预期：日志显示 "LLM 未配置，使用关键词匹配"
```

---

## 第四部分：工作流执行测试

### 4.1 单步骤工作流

```bash
vectahub run "查看磁盘使用情况"
vectahub run "查看 git 状态"
vectahub run "列出当前目录文件"
```

### 4.2 多步骤工作流

```bash
vectahub run "查找所有 ts 文件并统计数量"
vectahub run "安装依赖然后构建项目"
vectahub run "创建目录并初始化 git 仓库"
```

### 4.3 带参数工作流

```bash
vectahub run "在 src 目录下查找 test 文件"
vectahub run "安装 react 和 react-dom"
vectahub run "创建 test/unit 目录"
```

### 4.4 保存和加载工作流

```bash
# 保存工作流
vectahub run "查看系统信息" --save

# 列出已保存的工作流
vectahub list

# 加载并执行
vectahub run --file <workflow-file>
```

---

## 第五部分：测试执行记录表

### 5.1 关键词匹配测试记录

| 意图 | 测试用例数 | 通过 | 失败 | 通过率 | 备注 |
|------|-----------|------|------|--------|------|
| FILE_FIND | 10 | | | | |
| GIT_WORKFLOW | 14 | | | | |
| RUN_SCRIPT | 10 | | | | |
| SYSTEM_INFO | 10 | | | | |
| QUERY_INFO | 8 | | | | |
| INSTALL_PACKAGE | 8 | | | | |
| CREATE_FILE | 8 | | | | |
| FILE_ARCHIVE | 8 | | | | |
| NETWORK_INFO | 8 | | | | |
| SYSTEM_MONITOR | 8 | | | | |
| FILE_PERMISSION | 8 | | | | |
| FILE_DIFF | 6 | | | | |
| FETCH_HOT_NEWS | 6 | | | | |
| SOCIAL_MEDIA_SEARCH | 4 | | | | |
| DATA_SCRAPING | 4 | | | | |
| CONTENT_SUMMARY | 4 | | | | |
| **总计** | **124** | | | | |

### 5.2 LLM 解析测试记录

| 测试类别 | 测试用例数 | 通过 | 失败 | 回退成功 | 备注 |
|----------|-----------|------|------|----------|------|
| 语义理解 | 10 | | | | |
| 意图推断 | 5 | | | | |
| 参数提取 | 5 | | | | |
| 中英混合 | 4 | | | | |
| 模糊输入 | 5 | | | | |
| 多意图 | 4 | | | | |
| **总计** | **33** | | | | |

### 5.3 边界情况测试记录

| 测试类别 | 测试用例数 | 通过 | 失败 | 备注 |
|----------|-----------|------|------|------|
| 模糊输入 | 5 | | | |
| 混合意图 | 4 | | | |
| 参数提取 | 5 | | | |
| 中英文混合 | 4 | | | |
| **总计** | **18** | | | |

---

## 第六部分：快速测试脚本

### 6.1 批量测试脚本

```bash
#!/bin/bash
# 保存为 test-intents.sh

echo "=== VectaHub 意图识别批量测试 ==="
echo ""

# 定义测试用例
declare -a TESTS=(
  "找出所有 ts 文件"
  "提交代码"
  "构建项目"
  "查看磁盘使用情况"
  "查看当前目录"
  "安装 lodash"
  "创建文件 test.txt"
  "压缩 file.txt"
  "查看网络状态"
  "查看 cpu 使用率"
  "修改文件权限为 755"
  "比较 file1 和 file2"
  "你好啊"
  "帮我做点什么"
)

PASS=0
FAIL=0

for test in "${TESTS[@]}"; do
  echo -n "测试: $test ... "
  output=$(vectahub run --dry-run "$test" 2>&1)
  
  if echo "$output" | grep -q "UNKNOWN"; then
    echo "⚠️  未识别"
    ((FAIL++))
  elif echo "$output" | grep -q "解析意图"; then
    echo "✅ 通过"
    ((PASS++))
  else
    echo "❌ 失败"
    ((FAIL++))
  fi
done

echo ""
echo "=== 测试结果 ==="
echo "通过: $PASS"
echo "失败: $FAIL"
echo "总计: $((PASS + FAIL))"
```

### 6.2 LLM 专项测试

```bash
#!/bin/bash
# 保存为 test-llm.sh

echo "=== LLM 解析能力测试 ==="
echo ""

declare -a LLM_TESTS=(
  "我想看看这个项目的文件结构是什么样的"
  "帮我把最新的改动提交到 git 上"
  "我需要一个叫 utils 的文件夹"
  "把 dist 目录打包成一个压缩包"
  "我想知道当前电脑的 IP 地址"
)

for test in "${LLM_TESTS[@]}"; do
  echo "测试: $test"
  vectahub run --dry-run "$test" 2>&1 | grep -E "INFO|ERROR|解析"
  echo "---"
done
```

---

## 附录

### A. 意图关键词映射表

| 意图 | 关键词 |
|------|--------|
| FILE_FIND | 找出, 查找, find, search, 文件, file, 搜索 |
| GIT_WORKFLOW | 提交, commit, 推送, push, 拉取, pull, git, add, 分支, branch |
| RUN_SCRIPT | 运行, 执行, 跑, run, script, 脚本, build, test, start, dev |
| SYSTEM_INFO | 系统, system, 信息, info, 磁盘, disk, 内存, memory, cpu |
| QUERY_INFO | 查看, 看看, 显示, 列出, view, list, show, 结构, 目录, ls |
| INSTALL_PACKAGE | 安装, install, 添加, add, 依赖, package, npm包 |
| CREATE_FILE | 创建, create, 新建, 添加, 文件, file, touch |
| FILE_ARCHIVE | 压缩, 解压, zip, tar, gzip, 打包, archive, unzip |
| NETWORK_INFO | 网络, 状态, ifconfig, ping, dns, ip, 端口, 连接, network |
| SYSTEM_MONITOR | 系统, 监控, top, ps, df, cpu, 负载, load, 进程, memory |
| FILE_PERMISSION | 权限, 授权, 拒绝, chmod, chown, rwx, 读写, 执行, permission |
| FILE_DIFF | 比较, 差异, diff, compare, 对比, 不同, 区别 |
| FETCH_HOT_NEWS | 热榜, hot, trending, 排行榜 |
| SOCIAL_MEDIA_SEARCH | 搜索, search, 查找, find |
| DATA_SCRAPING | 爬取, scrape, 抓取, 采集 |
| CONTENT_SUMMARY | 摘要, summary, 汇总, 总结 |

### B. 常见问题

**Q: 意图识别不准确怎么办？**
A: 检查输入是否包含意图关键词，或配置 LLM 提升语义理解能力。

**Q: LLM 解析失败会怎样？**
A: 会自动回退到关键词匹配，确保基本功能可用。

**Q: 如何添加新的意图？**
A: 在 `src/nl/templates/index.ts` 中添加新的 IntentTemplate。

**Q: 如何调试意图识别？**
A: 使用 `--dry-run` 参数查看识别过程，或检查日志输出。

### C. 测试数据清理

```bash
# 清理测试产生的工作流文件
rm -rf ~/.vectahub/workflows/*

# 清理测试目录
rm -rf /tmp/vectahub-test
```
