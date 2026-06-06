"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMarkdownDocTaskStatus = updateMarkdownDocTaskStatus;
const fs = __importStar(require("fs"));
/**
 * 更新 Markdown 文档中指定任务的状态。
 *
 * 逻辑：
 * 1. 寻找包含 "状态" 的 Markdown 表格。
 * 2. 找到 ID 匹配且状态列包含 "待补" 或 "部分" 的行。
 * 3. 将状态列替换为 "已有"。
 * 4. 如果没找到表格，尝试寻找以 ID 开头的列表项并标记完成。
 */
async function updateMarkdownDocTaskStatus(filePath, taskId) {
    if (!fs.existsSync(filePath))
        return false;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        let modified = false;
        // 1. 尝试寻找路线图表格
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('|') || !line.includes('状态'))
                continue;
            const nextLine = lines[i + 1].trim();
            if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine))
                continue;
            // 找到表格头，解析列索引
            const headers = splitMarkdownTableRow(line);
            const statusIdx = headers.findIndex(cell => /状态/.test(cell));
            const idIdx = headers.findIndex(cell => /(ID|编号|序号)/i.test(cell));
            if (statusIdx === -1)
                continue;
            let rowIdx = i + 2;
            while (rowIdx < lines.length) {
                const rowLine = lines[rowIdx];
                const cells = splitMarkdownTableRow(rowLine);
                if (cells.length === 0)
                    break;
                const idCandidate = (idIdx >= 0 ? cells[idIdx] : cells.find(cell => new RegExp(`^${taskId}$`, 'i').test(cell.trim()))) ?? '';
                if (idCandidate.trim().toLowerCase() === taskId.toLowerCase()) {
                    // 匹配到 ID，更新状态列
                    const oldStatus = cells[statusIdx];
                    if (oldStatus.includes('待补') || oldStatus.includes('部分') || oldStatus.includes('pending') || oldStatus.includes('partial')) {
                        cells[statusIdx] = '已有';
                        lines[rowIdx] = joinMarkdownTableRow(cells, rowLine.startsWith('|'));
                        modified = true;
                    }
                    break; // 找到即停止
                }
                rowIdx++;
            }
            if (modified)
                break;
        }
        // 2. 如果表格没找到或未修改，尝试正则替换列表项
        if (!modified) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 匹配 [-*] ID. Label 或 ID. Label 等
                const listPattern = new RegExp(`^(\\s*[-*]?\\s*)${taskId}([.、:)]\\s+)(.+)$`);
                const match = line.match(listPattern);
                if (match) {
                    // 如果已经是完成状态，跳过
                    if (line.includes('已完成') || line.includes('✅'))
                        continue;
                    lines[i] = `${match[1]}${taskId}${match[2]}✅ ${match[3]} (已完成)`;
                    modified = true;
                    break;
                }
            }
        }
        if (modified) {
            fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
            return true;
        }
    }
    catch (err) {
        console.error(`[updateMarkdownDocTaskStatus] Error: ${err}`);
    }
    return false;
}
function splitMarkdownTableRow(line) {
    let raw = line.trim();
    if (!raw.startsWith('|') && !raw.includes('|'))
        return [];
    if (raw.startsWith('|'))
        raw = raw.slice(1);
    if (raw.endsWith('|'))
        raw = raw.slice(0, -1);
    return raw.split('|').map(cell => cell.trim());
}
function joinMarkdownTableRow(cells, leadingPipe) {
    const content = cells.join(' | ');
    return leadingPipe ? `| ${content} |` : content;
}
//# sourceMappingURL=docTaskUpdate.js.map