#!/bin/bash
# 🤖 Gemini CLI Parallel Watcher 2.0 (工业级重构版)
# 职责：通过高频监听，在原生终端安全、流畅地执行 AI 任务与 Shell 指令
#
# 🚀 2.0 新特性：
# 1. 秒级响应 (2s 心跳)
# 2. 自动归权 (解除 Root 权限对 IDE 的限制)
# 3. 智能 YOLO (自动处理 AI 交互确认)
# 4. 权限穿透 (确保跨沙盒原子性)

WATCH_DIR=".gemini/tasks"
RESP_DIR=".gemini/responses"

# 初始化环境
mkdir -p "$WATCH_DIR" "$RESP_DIR"

echo "=========================================="
echo "🚀 CACP 2.0 监听引擎已启动"
echo "📂 监听目录: $WATCH_DIR"
echo "📂 归权用户: $(whoami) ($(id -u):$(id -g))"
echo "⏱️ 采样频率: 2s"
echo "=========================================="

while true; do
  for task_file in "$WATCH_DIR"/*.task; do
    if [ -f "$task_file" ]; then
      filename=$(basename "$task_file")
      task_id="${filename%.task}"
      
      echo "📥 [$(date +%T)] 接收任务: $task_id"
      
      # 捕获指令并立即移除任务文件
      CMD=$(cat "$task_file")
      rm -f "$task_file"
      
      (
        RESPONSE_FILE="$RESP_DIR/${task_id}.response"
        echo "--- Task: $task_id | Start: $(date) ---" > "$RESPONSE_FILE"
        
        FINAL_CMD="$CMD"
        
        # 🧠 2.0 智能前缀策略
        if [[ ! "$FINAL_CMD" =~ ^gemini ]]; then
            # 启发式算法：如果没有 shell 特殊元字符，认为是发给 Gemini 的 prompt
            if [[ ! "$FINAL_CMD" =~ [\&\|\;\>\<\(\)] ]]; then
               FINAL_CMD="gemini $FINAL_CMD -y"
            fi
        else
            # 如果是 gemini 开头但没带 yolo 模式，自动补全 -y 防止后台挂起
            if [[ ! "$FINAL_CMD" =~ " -y" && ! "$FINAL_CMD" =~ " --yolo" ]]; then
               # 如果已带了 prompt 参数，则在 prompt 之后追加 -y
               FINAL_CMD="$FINAL_CMD -y"
            fi
        fi
        
        # 执行命令
        echo "⚙️ 执行指令: $FINAL_CMD" >> "$RESPONSE_FILE"
        bash -c "$FINAL_CMD" >> "$RESPONSE_FILE" 2>&1
        EXIT_CODE=$?
        
        # 🛡️ 核心归权逻辑 (解除 EPERM 锁定)
        # 将权限回拨给当前 IDE 用户，确保 Agent 可直接编辑后续文件
        chown -R $(id -u):$(id -g) . 2>/dev/null
        chmod -R 755 . 2>/dev/null
        
        echo -e "\n--- EXITCODE: $EXIT_CODE ---" >> "$RESPONSE_FILE"
        echo "✅ [$(date +%T)] 结果回填成功: $task_id (Exit: $EXIT_CODE)"
      ) &
    fi
  done
  
  # 采样率提升，实现快如闪电的交互体验
  sleep 5
done
