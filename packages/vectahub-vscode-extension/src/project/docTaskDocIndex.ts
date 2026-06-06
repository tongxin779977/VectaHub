export interface DocHeading {
  start: number;
  level: number;
  text: string;
}

export interface DocIndex {
  content: string;
  headings: DocHeading[];
}

export function buildDocIndex(content: string): DocIndex {
  const headings: DocHeading[] = [];
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

export function findHeadingSection(docIndex: DocIndex, taskId: string): string | undefined {
  const headingIndex = docIndex.headings.findIndex(heading => heading.text.includes(taskId));
  if (headingIndex < 0) return undefined;

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
