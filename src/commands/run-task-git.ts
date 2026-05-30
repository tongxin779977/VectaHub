import { GitChangeInfo, getContext } from './run-task-shared.js';

export interface GitDiffSnapshot {
  diffStat: string;
  shortStat: string;
  changedFiles: string[];
}

export async function readGitDiffSnapshot(): Promise<GitDiffSnapshot | null> {
  try {
    const { stdout: shortStat } = await getContext().environment.exec('git diff --shortstat');
    const { stdout: statusShort } = await getContext().environment.exec('git status --short --untracked-files=all');
    const untrackedFiles = statusShort.split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.startsWith('?? '))
      .map((line: string) => line.slice(3).trim())
      .filter(Boolean);
    if (!shortStat.trim() && untrackedFiles.length === 0) return null;

    const { stdout: diffStat } = shortStat.trim()
      ? await getContext().environment.exec('git diff --stat')
      : { stdout: '' };
    const changedFiles = diffStat.split('\n')
      .map((line: string) => {
        const parts = line.split('|');
        return parts[0]?.trim() || '';
      })
      .filter((f: string) => f && !f.includes('file') && !f.includes('changed'));
    const allChangedFiles = Array.from(new Set([...changedFiles, ...untrackedFiles]));

    return {
      diffStat: [diffStat.trim(), ...untrackedFiles.map((file: string) => `${file} | untracked`)]
        .filter(Boolean)
        .join('\n')
        .substring(0, 3000),
      shortStat: shortStat.trim() || `${untrackedFiles.length} untracked file${untrackedFiles.length > 1 ? 's' : ''}`,
      changedFiles: allChangedFiles,
    };
  } catch {
    return null;
  }
}

export async function collectGitChanges(before?: GitDiffSnapshot | null): Promise<GitChangeInfo | null> {
  const after = await readGitDiffSnapshot();
  if (!after) return null;
  if (!before) return after;

  const previousFiles = new Set(before.changedFiles);
  const changedFiles = after.changedFiles.filter((file: string) => !previousFiles.has(file));
  if (changedFiles.length === 0) {
    return null;
  }

  return {
    shortStat: `${changedFiles.length} file${changedFiles.length > 1 ? 's' : ''} changed (task delta)`,
    diffStat: changedFiles.join('\n'),
    changedFiles,
  };
}
