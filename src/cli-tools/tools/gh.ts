import type { CliTool } from '../types.js';

export const ghTool: CliTool = {
  name: 'gh',
  description: 'GitHub CLI',
  version: '>=2.0.0',
  category: 'developer-tools',
  tags: ['github', 'cli', 'automation', 'repo', 'workflow'],
  authCheckCommand: 'gh auth status',
  authHelpMessage: '检测到 GitHub CLI 未登录或 Token 无效。请运行 `gh auth login` 进行授权，或确保环境变量 GH_TOKEN 已正确配置。',
  examples: [
    {
      description: 'List recent workflow runs',
      command: 'gh run list --limit 5',
    },
    {
      description: 'View log of a failed run',
      command: 'gh run view <run-id> --log-failed',
    },
  ],
  dangerousCommands: [
    'repo delete',
    'api --method DELETE',
    'secret set',
  ],
  commands: {
    'run list': {
      name: 'run list',
      description: 'List recent workflow runs',
      usage: 'gh run list [options]',
      examples: [
        'gh run list --limit 10',
        'gh run list --status failure',
      ],
      options: [
        {
          name: '--limit',
          alias: '-L',
          description: 'Maximum number of runs to fetch',
          type: 'number',
        },
        {
          name: '--status',
          alias: '-s',
          description: 'Filter runs by status',
          type: 'string',
        },
        {
          name: '--workflow',
          alias: '-w',
          description: 'Filter runs by workflow name or ID',
          type: 'string',
        },
      ],
    },
    'run view': {
      name: 'run view',
      description: 'View details of a workflow run',
      usage: 'gh run view [<run-id>] [options]',
      examples: [
        'gh run view 12345678',
        'gh run view --log-failed',
      ],
      options: [
        {
          name: '--log',
          description: 'Display full log',
          type: 'boolean',
        },
        {
          name: '--log-failed',
          description: 'Display only failed log',
          type: 'boolean',
        },
        {
          name: '--exit-status',
          description: 'Exit with non-zero status if run failed',
          type: 'boolean',
        },
      ],
    },
    'run rerun': {
      name: 'run rerun',
      description: 'Rerun a workflow run',
      usage: 'gh run rerun <run-id>',
      examples: [
        'gh run rerun 12345678',
      ],
      options: [
        {
          name: '--failed',
          description: 'Rerun only failed jobs',
          type: 'boolean',
        },
      ],
    },
    'issue list': {
      name: 'issue list',
      description: 'List issues in a repository',
      usage: 'gh issue list [options]',
      examples: [
        'gh issue list --label bug',
      ],
      options: [
        {
          name: '--limit',
          alias: '-L',
          description: 'Maximum number of issues to fetch',
          type: 'number',
        },
        {
          name: '--label',
          alias: '-l',
          description: 'Filter issues by label',
          type: 'string',
        },
      ],
    },
    'pr list': {
      name: 'pr list',
      description: 'List pull requests in a repository',
      usage: 'gh pr list [options]',
      examples: [
        'gh pr list --state open',
      ],
      options: [
        {
          name: '--limit',
          alias: '-L',
          description: 'Maximum number of PRs to fetch',
          type: 'number',
        },
        {
          name: '--state',
          alias: '-s',
          description: 'Filter PRs by state',
          type: 'string',
        },
      ],
    },
  },
};
