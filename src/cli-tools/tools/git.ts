import type { CliTool } from '../types.js';

export const gitTool: CliTool = {
  name: 'git',
  description: 'Distributed version control system',
  version: '>=2.0.0',
  dangerousCommands: [
    'push --force',
    'reset --hard',
    'clean -fd',
    'filter-branch',
    'push --delete',
  ],
  commands: {
    init: {
      name: 'init',
      description: 'Create an empty Git repository or reinitialize an existing one',
      usage: 'git init [directory]',
      examples: [
        'git init',
        'git init my-project',
      ],
      options: [
        {
          name: '--bare',
          description: 'Create a bare repository',
          type: 'boolean',
        },
        {
          name: '--template',
          description: 'Directory from which templates will be used',
          type: 'string',
        },
      ],
    },
    clone: {
      name: 'clone',
      description: 'Clone a repository into a new directory',
      usage: 'git clone <repository> [directory]',
      examples: [
        'git clone https://github.com/user/repo.git',
        'git clone https://github.com/user/repo.git my-folder',
      ],
      options: [
        {
          name: '--depth',
          description: 'Create a shallow clone with a history truncated to the specified number of commits',
          type: 'number',
        },
        {
          name: '--branch',
          alias: '-b',
          description: 'Clone a specific branch',
          type: 'string',
        },
        {
          name: '--recursive',
          description: 'Initialize submodules in the clone',
          type: 'boolean',
        },
      ],
    },
    add: {
      name: 'add',
      description: 'Add file contents to the index',
      usage: 'git add <pathspec>...',
      examples: [
        'git add .',
        'git add src/',
        'git add package.json',
      ],
      options: [
        {
          name: '--all',
          alias: '-A',
          description: 'Add all changes',
          type: 'boolean',
        },
        {
          name: '--update',
          alias: '-u',
          description: 'Update tracked files',
          type: 'boolean',
        },
        {
          name: '--interactive',
          alias: '-i',
          description: 'Add modified contents interactively',
          type: 'boolean',
        },
      ],
    },
    commit: {
      name: 'commit',
      description: 'Record changes to the repository',
      usage: 'git commit -m <message>',
      examples: [
        'git commit -m "Add new feature"',
        'git commit --amend',
      ],
      options: [
        {
          name: '--message',
          alias: '-m',
          description: 'Commit message',
          type: 'string',
          required: true,
        },
        {
          name: '--amend',
          description: 'Amend previous commit',
          type: 'boolean',
        },
        {
          name: '--no-verify',
          description: 'Bypass pre-commit and commit-msg hooks',
          type: 'boolean',
        },
      ],
    },
    push: {
      name: 'push',
      description: 'Update remote refs along with associated objects',
      usage: 'git push [repository] [refspec]',
      examples: [
        'git push origin main',
        'git push --set-upstream origin feature-branch',
      ],
      options: [
        {
          name: '--force',
          alias: '-f',
          description: 'Force push (dangerous)',
          type: 'boolean',
        },
        {
          name: '--set-upstream',
          alias: '-u',
          description: 'Add upstream reference',
          type: 'boolean',
        },
        {
          name: '--all',
          description: 'Push all branches',
          type: 'boolean',
        },
        {
          name: '--tags',
          description: 'Push all tags',
          type: 'boolean',
        },
      ],
      dangerous: false,
    },
    'push --force': {
      name: 'push --force',
      description: 'Force push to remote (dangerous)',
      usage: 'git push --force [repository] [refspec]',
      examples: [
        'git push --force origin main',
      ],
      dangerous: true,
      dangerLevel: 'high',
      requiresConfirmation: true,
    },
    pull: {
      name: 'pull',
      description: 'Fetch from and integrate with another repository or a local branch',
      usage: 'git pull [repository] [refspec]',
      examples: [
        'git pull origin main',
        'git pull --rebase',
      ],
      options: [
        {
          name: '--rebase',
          description: 'Rebase the current branch on top of the upstream branch',
          type: 'boolean',
        },
        {
          name: '--no-rebase',
          description: 'Do not rebase, create a merge commit instead',
          type: 'boolean',
        },
      ],
    },
    fetch: {
      name: 'fetch',
      description: 'Download objects and refs from another repository',
      usage: 'git fetch [repository]',
      examples: [
        'git fetch origin',
        'git fetch --all',
      ],
      options: [
        {
          name: '--all',
          description: 'Fetch all remotes',
          type: 'boolean',
        },
        {
          name: '--prune',
          description: 'Remove remote-tracking references that no longer exist',
          type: 'boolean',
        },
      ],
    },
    merge: {
      name: 'merge',
      description: 'Join two or more development histories together',
      usage: 'git merge <branch>',
      examples: [
        'git merge feature-branch',
        'git merge --no-ff develop',
      ],
      options: [
        {
          name: '--no-ff',
          description: 'Create a merge commit even when the merge resolves as a fast-forward',
          type: 'boolean',
        },
        {
          name: '--ff-only',
          description: 'Refuse to merge and exit with non-zero status unless the current HEAD is already up to date',
          type: 'boolean',
        },
      ],
    },
    rebase: {
      name: 'rebase',
      description: 'Reapply commits on top of another base tip',
      usage: 'git rebase <upstream>',
      examples: [
        'git rebase main',
        'git rebase -i HEAD~3',
      ],
      options: [
        {
          name: '--interactive',
          alias: '-i',
          description: 'Interactive rebase',
          type: 'boolean',
        },
        {
          name: '--continue',
          description: 'Continue rebase after resolving conflicts',
          type: 'boolean',
        },
        {
          name: '--abort',
          description: 'Abort the rebase operation',
          type: 'boolean',
        },
      ],
    },
    branch: {
      name: 'branch',
      description: 'List, create, or delete branches',
      usage: 'git branch [options] [branch-name]',
      examples: [
        'git branch',
        'git branch feature-xyz',
        'git branch -d old-feature',
      ],
      options: [
        {
          name: '--list',
          description: 'List branches',
          type: 'boolean',
        },
        {
          name: '--delete',
          alias: '-d',
          description: 'Delete a branch',
          type: 'boolean',
        },
        {
          name: '--force',
          alias: '-D',
          description: 'Force delete a branch',
          type: 'boolean',
        },
      ],
    },
    checkout: {
      name: 'checkout',
      description: 'Switch branches or restore working tree files',
      usage: 'git checkout <branch>',
      examples: [
        'git checkout main',
        'git checkout -b new-feature',
      ],
      options: [
        {
          name: '--branch',
          alias: '-b',
          description: 'Create and checkout a new branch',
          type: 'string',
        },
        {
          name: '--force',
          alias: '-f',
          description: 'Force checkout',
          type: 'boolean',
        },
      ],
    },
    switch: {
      name: 'switch',
      description: 'Switch branches',
      usage: 'git switch <branch>',
      examples: [
        'git switch main',
        'git switch -c new-feature',
      ],
      options: [
        {
          name: '--create',
          alias: '-c',
          description: 'Create and switch to a new branch',
          type: 'string',
        },
      ],
    },
    status: {
      name: 'status',
      description: 'Show the working tree status',
      usage: 'git status',
      examples: [
        'git status',
        'git status -s',
      ],
      options: [
        {
          name: '--short',
          alias: '-s',
          description: 'Give the output in the short-format',
          type: 'boolean',
        },
      ],
    },
    log: {
      name: 'log',
      description: 'Show commit logs',
      usage: 'git log [options]',
      examples: [
        'git log',
        'git log --oneline -10',
        'git log --graph --all',
      ],
      options: [
        {
          name: '--oneline',
          description: 'Shorthand for "--pretty=oneline --abbrev-commit"',
          type: 'boolean',
        },
        {
          name: '--graph',
          description: 'Draw a text-based graphical representation of the commit history',
          type: 'boolean',
        },
        {
          name: '--all',
          description: 'Pretend as if all the refs in refs/ are listed on the command line',
          type: 'boolean',
        },
      ],
    },
    diff: {
      name: 'diff',
      description: 'Show changes between commits, commit and working tree, etc',
      usage: 'git diff [options]',
      examples: [
        'git diff',
        'git diff HEAD~1',
        'git diff --cached',
      ],
      options: [
        {
          name: '--cached',
          description: 'Show staged changes',
          type: 'boolean',
        },
        {
          name: '--stat',
          description: 'Output a diffstat instead of a patch',
          type: 'boolean',
        },
      ],
    },
    reset: {
      name: 'reset',
      description: 'Reset current HEAD to the specified state',
      usage: 'git reset [mode] [commit]',
      examples: [
        'git reset HEAD~1',
        'git reset --hard HEAD',
      ],
      options: [
        {
          name: '--soft',
          description: 'Does not touch the index file or the working tree',
          type: 'boolean',
        },
        {
          name: '--mixed',
          description: 'Resets the index but not the working tree',
          type: 'boolean',
        },
        {
          name: '--hard',
          description: 'Resets the index and working tree (dangerous)',
          type: 'boolean',
        },
      ],
    },
    'reset --hard': {
      name: 'reset --hard',
      description: 'Reset index and working tree (dangerous)',
      usage: 'git reset --hard [commit]',
      examples: [
        'git reset --hard HEAD',
        'git reset --hard origin/main',
      ],
      dangerous: true,
      dangerLevel: 'high',
      requiresConfirmation: true,
    },
    stash: {
      name: 'stash',
      description: 'Stash the changes in a dirty working directory away',
      usage: 'git stash [options]',
      examples: [
        'git stash',
        'git stash pop',
        'git stash list',
      ],
      options: [
        {
          name: 'push',
          description: 'Save your local modifications to a new stash',
          type: 'boolean',
        },
        {
          name: 'pop',
          description: 'Remove a single stashed state from the stash list and apply it on top of the current working tree state',
          type: 'boolean',
        },
        {
          name: 'list',
          description: 'List the stash entries',
          type: 'boolean',
        },
      ],
    },
    tag: {
      name: 'tag',
      description: 'Create, list, delete or verify a tag object signed with GPG',
      usage: 'git tag [options] [name]',
      examples: [
        'git tag v1.0.0',
        'git tag -a v1.0.0 -m "Version 1.0.0"',
        'git tag -d v1.0.0',
      ],
      options: [
        {
          name: '--annotate',
          alias: '-a',
          description: 'Make an unsigned, annotated tag object',
          type: 'boolean',
        },
        {
          name: '--delete',
          alias: '-d',
          description: 'Delete existing tags with the given names',
          type: 'boolean',
        },
        {
          name: '--list',
          alias: '-l',
          description: 'List tags',
          type: 'boolean',
        },
      ],
    },
    remote: {
      name: 'remote',
      description: 'Manage set of tracked repositories',
      usage: 'git remote [options]',
      examples: [
        'git remote -v',
        'git remote add origin https://github.com/user/repo.git',
      ],
      options: [
        {
          name: '--verbose',
          alias: '-v',
          description: 'Be a little more verbose and show remote url after name',
          type: 'boolean',
        },
        {
          name: 'add',
          description: 'Add a remote named <name> for the repository at <url>',
          type: 'boolean',
        },
        {
          name: 'remove',
          description: 'Remove the remote named <name>',
          type: 'boolean',
        },
      ],
    },
    clean: {
      name: 'clean',
      description: 'Remove untracked files from the working tree',
      usage: 'git clean [options]',
      examples: [
        'git clean -fd',
      ],
      dangerous: true,
      dangerLevel: 'medium',
      requiresConfirmation: true,
      options: [
        {
          name: '--force',
          alias: '-f',
          description: 'Force clean',
          type: 'boolean',
        },
        {
          name: '--directories',
          alias: '-d',
          description: 'Remove untracked directories in addition to untracked files',
          type: 'boolean',
        },
        {
          name: '--dry-run',
          alias: '-n',
          description: "Don't actually remove anything, just show what would be done",
          type: 'boolean',
        },
      ],
    },
  },
};
