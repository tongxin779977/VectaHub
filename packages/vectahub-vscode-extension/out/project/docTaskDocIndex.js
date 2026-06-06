"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDocIndex = buildDocIndex;
exports.findHeadingSection = findHeadingSection;
function buildDocIndex(content) {
    const headings = [];
    const lines = content.split('\n');
    let offset = 0;
    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            headings.push({
                start: offset,
                level: match[1].length,
                text: line,
            });
        }
        offset += line.length + 1;
    }
    return { content, headings };
}
function findHeadingSection(docIndex, taskId) {
    const headingIndex = docIndex.headings.findIndex(heading => heading.text.includes(taskId));
    if (headingIndex < 0)
        return undefined;
    const heading = docIndex.headings[headingIndex];
    let end = docIndex.content.length;
    for (let i = headingIndex + 1; i < docIndex.headings.length; i += 1) {
        const next = docIndex.headings[i];
        if (next.level <= heading.level) {
            end = next.start;
            break;
        }
    }
    return docIndex.content.slice(heading.start, end);
}
//# sourceMappingURL=docTaskDocIndex.js.map