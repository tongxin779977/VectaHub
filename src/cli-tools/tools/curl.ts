import type { CliTool } from '../types.js';

export const curlTool: CliTool = {
  name: 'curl',
  description: 'Command-line tool for transferring data',
  version: '>=7.60.0',
  category: 'networking',
  tags: ['curl', 'http', 'request', 'networking'],
  examples: [
    {
      description: 'Get a URL',
      command: 'curl https://example.com',
    },
    {
      description: 'POST data',
      command: 'curl -X POST -d "data=123" https://example.com',
    },
  ],
  relatedTools: ['git', 'npm', 'docker'],
  dangerousCommands: [
    '--upload-file',
    '--insecure',
    '--proxy',
    '--config',
    '--data-binary',
  ],
  commands: {
    get: {
      name: 'get',
      description: 'Get a URL',
      usage: 'curl [OPTIONS] URL',
      examples: ['curl https://example.com'],
    },
    post: {
      name: 'post',
      description: 'POST data',
      usage: 'curl -X POST [OPTIONS] URL',
      examples: ['curl -X POST -d "data=123" https://example.com', 'curl -X POST -H "Content-Type: application/json" -d \'{"key":"value"}\' https://example.com'],
      options: [
        { name: '-d', alias: '--data', description: 'Data to send', type: 'string' },
        { name: '-H', alias: '--header', description: 'Header to send', type: 'string' },
      ],
    },
    put: {
      name: 'put',
      description: 'PUT data',
      usage: 'curl -X PUT [OPTIONS] URL',
      examples: ['curl -X PUT -d "data=123" https://example.com'],
      options: [
        { name: '-d', alias: '--data', description: 'Data to send', type: 'string' },
        { name: '-H', alias: '--header', description: 'Header to send', type: 'string' },
      ],
    },
    delete: {
      name: 'delete',
      description: 'DELETE request',
      usage: 'curl -X DELETE [OPTIONS] URL',
      examples: ['curl -X DELETE https://example.com/resource/1'],
    },
    head: {
      name: 'head',
      description: 'HEAD request',
      usage: 'curl -I [OPTIONS] URL',
      examples: ['curl -I https://example.com'],
      options: [
        { name: '-I', description: 'Get headers only', type: 'boolean' },
      ],
    },
    download: {
      name: 'download',
      description: 'Download a file',
      usage: 'curl -O [OPTIONS] URL',
      examples: ['curl -O https://example.com/file.zip', 'curl -o myfile.zip https://example.com/file.zip'],
      options: [
        { name: '-O', alias: '--remote-name', description: 'Write output to a file named like the remote file', type: 'boolean' },
        { name: '-o', alias: '--output', description: 'Write output to file', type: 'string' },
      ],
    },
    '--upload-file': {
      name: '--upload-file',
      description: 'Upload a file (dangerous)',
      usage: 'curl --upload-file <file> <URL>',
      examples: ['curl --upload-file local.txt https://example.com/upload'],
      dangerous: true,
      dangerLevel: 'high',
      requiresConfirmation: true,
    },
    '--insecure': {
      name: '--insecure',
      description: 'Allow insecure SSL connections (dangerous)',
      usage: 'curl --insecure <URL>',
      examples: ['curl --insecure https://self-signed.example.com'],
      dangerous: true,
      dangerLevel: 'medium',
      requiresConfirmation: true,
    },
  },
};
