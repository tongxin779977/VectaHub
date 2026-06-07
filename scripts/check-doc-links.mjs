import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.cache',
  '.tmp',
  '.test-reports',
]);

const failures = [];

function listTrackedMarkdownFiles() {
  try {
    const output = execFileSync('git', ['ls-files', '-z', 'README.md', 'AGENTS.md', 'docs/**/*.md'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .split('\0')
      .filter(Boolean)
      .map(file => path.join(root, file));
  } catch {
    return walkMarkdownFiles(root);
  }
}

function walkMarkdownFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdownFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

function normalizeLink(rawHref) {
  let href = rawHref.trim();
  if (!href || href.startsWith('#')) {
    return '';
  }

  if (href.startsWith('<') && href.endsWith('>')) {
    href = href.slice(1, -1);
  }

  const titleIndex = href.search(/\s+["']/);
  if (titleIndex >= 0) {
    href = href.slice(0, titleIndex);
  }

  return href;
}

function checkLink(file, rawHref) {
  const href = normalizeLink(rawHref);
  if (!href) {
    return;
  }

  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return;
  }

  if (href.startsWith('/')) {
    failures.push(`${path.relative(root, file)}: local absolute link is not portable: ${href}`);
    return;
  }

  const [target] = href.split('#');
  if (!target) {
    return;
  }

  const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
  if (!fs.existsSync(resolved)) {
    failures.push(`${path.relative(root, file)}: missing link target: ${href}`);
  }
}

const markdownFiles = listTrackedMarkdownFiles();

for (const file of markdownFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    checkLink(file, match[1]);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(`Checked ${markdownFiles.length} Markdown files.`);
