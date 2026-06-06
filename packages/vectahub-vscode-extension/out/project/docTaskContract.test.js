"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_crypto_1 = require("node:crypto");
const docTaskContract_js_1 = require("./docTaskContract.js");
function computeInstructionHash(input) {
    const sortedAllowed = [...(input.allowedFiles ?? [])].sort().join(',');
    const sortedForbidden = [...(input.forbiddenFiles ?? [])].sort().join(',');
    const content = `${input.taskId}\n${input.label}\n${input.docExcerpt}\ntool=${input.tool ?? ''}\nallowed=${sortedAllowed}\nforbidden=${sortedForbidden}\nconfig=${input.globalConfigDigest ?? ''}`;
    return (0, node_crypto_1.createHash)('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}
function buildHash(input) {
    const excerpt = (0, docTaskContract_js_1.deriveDocExcerptForTask)(input);
    return computeInstructionHash({
        taskId: input.taskId,
        label: input.label,
        docExcerpt: excerpt.excerpt,
        tool: 'codex',
        allowedFiles: ['src/a.ts'],
        forbiddenFiles: ['.env'],
        globalConfigDigest: 'model=test;temperature=0.1',
    });
}
(0, vitest_1.describe)('doc task instruction hash excerpt symmetry', () => {
    (0, vitest_1.it)('任务片段变化时 hash 应变化（即使文档开头不变）', () => {
        const baseHead = '# 项目文档\n\n前言保持不变。\n\n';
        const taskId = 'P2-1';
        const label = '实现合同边界';
        const before = `${baseHead}## ${taskId} ${label}\n修改 \`src/a.ts\`\n`;
        const after = `${baseHead}## ${taskId} ${label}\n修改 \`src/b.ts\`\n`;
        (0, vitest_1.expect)(buildHash({ docContent: before, taskId, label })).not.toBe(buildHash({ docContent: after, taskId, label }));
    });
    (0, vitest_1.it)('仅文档开头变化时 hash 不应变化（任务片段不变）', () => {
        const taskId = 'P2-1';
        const label = '实现合同边界';
        const taskSection = `## ${taskId} ${label}\n修改 \`src/a.ts\`\n`;
        const before = `# 项目文档\n\n前言 A。\n\n${taskSection}`;
        const after = `# 项目文档\n\n前言 B（仅头部变化）。\n\n${taskSection}`;
        (0, vitest_1.expect)(buildHash({ docContent: before, taskId, label })).toBe(buildHash({ docContent: after, taskId, label }));
    });
});
//# sourceMappingURL=docTaskContract.test.js.map