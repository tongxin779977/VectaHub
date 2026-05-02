import type { CliTool } from '../types.js';

export const npmTool: CliTool = {
  name: 'npm',
  description: 'Node package manager',
  version: '>=6.0.0',
  category: 'package-management',
  tags: ['node', 'package', 'npm', 'dependency', 'javascript', 'typescript'],
  examples: [
    {
      description: 'Initialize package.json',
      command: 'npm init -y',
    },
    {
      description: 'Install a package',
      command: 'npm install lodash',
    },
    {
      description: 'Install dev dependency',
      command: 'npm install --save-dev typescript',
    },
    {
      description: 'Run build script',
      command: 'npm run build',
    },
    {
      description: 'Run tests',
      command: 'npm test',
    },
  ],
  relatedTools: ['git', 'node'],
  dangerousCommands: [
    'publish',
    'unpublish',
    'access owner drop',
  ],
  commands: {
    init: {
      name: 'init',
      description: 'Initialize a new package.json file',
      usage: 'npm init',
      examples: ['npm init -y'],
      options: [
        {
          name: '--yes',
          alias: '-y',
          description: 'Skip the questionnaire',
          type: 'boolean',
        },
      ],
    },
    install: {
      name: 'install',
      description: 'Install a package',
      usage: 'npm install <package>',
      examples: ['npm install lodash', 'npm install express@4.18.0'],
      options: [
        {
          name: '--save-dev',
          alias: '-D',
          description: 'Save to devDependencies',
          type: 'boolean',
        },
        {
          name: '--save',
          alias: '-S',
          description: 'Save to dependencies (default)',
          type: 'boolean',
        },
        {
          name: '--save-exact',
          alias: '-E',
          description: 'Save exact version',
          type: 'boolean',
        },
        {
          name: '--global',
          alias: '-g',
          description: 'Install globally',
          type: 'boolean',
        },
        {
          name: '--dry-run',
          description: 'Simulate install without actually installing',
          type: 'boolean',
        },
      ],
    },
    uninstall: {
      name: 'uninstall',
      description: 'Remove a package',
      usage: 'npm uninstall <package>',
      examples: ['npm uninstall lodash'],
      options: [
        {
          name: '--save-dev',
          alias: '-D',
          description: 'Remove from devDependencies',
          type: 'boolean',
        },
      ],
    },
    update: {
      name: 'update',
      description: 'Update packages to the latest version',
      usage: 'npm update [package]',
      examples: ['npm update', 'npm update lodash'],
    },
    run: {
      name: 'run',
      description: 'Run a script defined in package.json',
      usage: 'npm run <script>',
      examples: ['npm run start', 'npm run build', 'npm test'],
    },
    test: {
      name: 'test',
      description: 'Run tests',
      usage: 'npm test',
      examples: ['npm test'],
    },
    start: {
      name: 'start',
      description: 'Start the application',
      usage: 'npm start',
      examples: ['npm start'],
    },
    build: {
      name: 'build',
      description: 'Run the build script',
      usage: 'npm run build',
      examples: ['npm run build'],
    },
    publish: {
      name: 'publish',
      description: 'Publish a package to the npm registry',
      usage: 'npm publish [options]',
      examples: ['npm publish', 'npm publish --tag next'],
      dangerous: true,
      dangerLevel: 'high',
      requiresConfirmation: true,
      options: [
        {
          name: '--tag',
          description: 'Tag to publish with',
          type: 'string',
        },
        {
          name: '--access',
          description: 'Access level (public, restricted)',
          type: 'string',
        },
        {
          name: '--dry-run',
          description: 'Do everything except publish',
          type: 'boolean',
        },
      ],
    },
    unpublish: {
      name: 'unpublish',
      description: 'Unpublish a package from the registry',
      usage: 'npm unpublish <package>@<version>',
      examples: ['npm unpublish my-package@1.0.0'],
      dangerous: true,
      dangerLevel: 'critical',
      requiresConfirmation: true,
    },
    list: {
      name: 'list',
      description: 'List installed packages',
      usage: 'npm list [package]',
      examples: ['npm list', 'npm list --depth=0'],
      options: [
        {
          name: '--depth',
          description: 'Depth to list',
          type: 'number',
        },
        {
          name: '--global',
          alias: '-g',
          description: 'List global packages',
          type: 'boolean',
        },
      ],
    },
    outdated: {
      name: 'outdated',
      description: 'Check for outdated packages',
      usage: 'npm outdated',
      examples: ['npm outdated'],
    },
    audit: {
      name: 'audit',
      description: 'Run a security audit on package dependencies',
      usage: 'npm audit',
      examples: ['npm audit', 'npm audit fix'],
      options: [
        {
          name: '--fix',
          description: 'Automatically fix vulnerabilities',
          type: 'boolean',
        },
      ],
    },
    cache: {
      name: 'cache',
      description: 'Manage the npm cache',
      usage: 'npm cache <command>',
      examples: ['npm cache clean --force', 'npm cache verify'],
      options: [
        {
          name: '--force',
          alias: '-f',
          description: 'Force cache clean',
          type: 'boolean',
        },
      ],
    },
  },
};
