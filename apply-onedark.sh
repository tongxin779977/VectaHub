#!/bin/bash
# 将 One Dark 配色写入 iTerm2 Default Profile

# 读取 One Dark 配色文件
ONEDARK=$(cat "/tmp/iterm2-schemes/schemes/Atom One Dark.itermcolors")

# 用 PlistBuddy 更新 Default Profile
PLIST="$HOME/Library/Preferences/com.googlecode.iterm2.plist"
PROFILE="Default"

# 先导入配色预设
/usr/libexec/PlistBuddy -c "Add :'Custom Color Presets':'OneDark' dict" "$PLIST" 2>/dev/null || true

# 解析 XML 并写入
python3 << 'PYEOF'
import plistlib
import subprocess

# 读取 One Dark 配色文件
with open("/tmp/iterm2-schemes/schemes/Atom One Dark.itermcolors", "rb") as f:
    colors = plistlib.load(f)

# 读取当前 iTerm2 配置
result = subprocess.run(
    ["defaults", "read", "com.googlecode.iterm2"],
    capture_output=True, text=True
)

# 用 PlistBuddy 更新每个颜色键
plist_path = os.path.expanduser("~/Library/Preferences/com.googlecode.iterm2.plist")

for key, value in colors.items():
    # 跳过非颜色键
    if not isinstance(value, dict):
        continue
    r = value.get("Red Component", 0)
    g = value.get("Green Component", 0)
    b = value.get("Blue Component", 0)
    a = value.get("Alpha Component", 1)
    
    # 更新到 Default Profile
    subprocess.run([
        "/usr/libexec/PlistBuddy", "-c",
        f"Set :'New Bookmarks':0:'{key}' %{{Red Component={r},Green Component={g},Blue Component={b},Alpha Component={a}}}",
        plist_path
    ], capture_output=True)

print("One Dark 配色已写入 iTerm2 Default Profile")
print("请重启 iTerm2 或 Cmd+I 切换配色生效")
PYEOF
