import type { CliTool } from '../types.js';

export const dockerTool: CliTool = {
  name: 'docker',
  description: 'Containerization platform',
  version: '>=20.10.0',
  category: 'containerization',
  tags: ['docker', 'container', 'image', 'containerization'],
  examples: [
    {
      description: 'Run a container',
      command: 'docker run -d nginx',
    },
    {
      description: 'Build an image',
      command: 'docker build -t myimage .',
    },
  ],
  relatedTools: ['git', 'npm'],
  dangerousCommands: [
    'rm -f',
    'rmi -f',
    'system prune',
  ],
  commands: {
    run: {
      name: 'run',
      description: 'Run a container',
      usage: 'docker run [OPTIONS] IMAGE',
      examples: ['docker run -d nginx', 'docker run -p 8080:80 nginx'],
      options: [
        { name: '-d', alias: '--detach', description: 'Run container in background', type: 'boolean' },
        { name: '-p', alias: '--publish', description: 'Publish a port', type: 'string' },
      ],
    },
    build: {
      name: 'build',
      description: 'Build an image',
      usage: 'docker build [OPTIONS] PATH',
      examples: ['docker build -t myimage .', 'docker build -f Dockerfile.dev .'],
      options: [
        { name: '-t', alias: '--tag', description: 'Name and optionally a tag', type: 'string' },
        { name: '-f', alias: '--file', description: 'Name of the Dockerfile', type: 'string' },
      ],
    },
    ps: {
      name: 'ps',
      description: 'List containers',
      usage: 'docker ps [OPTIONS]',
      examples: ['docker ps', 'docker ps -a'],
      options: [
        { name: '-a', alias: '--all', description: 'Show all containers', type: 'boolean' },
      ],
    },
    images: {
      name: 'images',
      description: 'List images',
      usage: 'docker images [OPTIONS]',
      examples: ['docker images'],
    },
    pull: {
      name: 'pull',
      description: 'Pull an image',
      usage: 'docker pull IMAGE',
      examples: ['docker pull nginx', 'docker pull ubuntu:22.04'],
    },
    push: {
      name: 'push',
      description: 'Push an image',
      usage: 'docker push IMAGE',
      examples: ['docker push myrepo/myimage'],
      dangerous: true,
      dangerLevel: 'medium',
      requiresConfirmation: true,
    },
    stop: {
      name: 'stop',
      description: 'Stop a container',
      usage: 'docker stop CONTAINER',
      examples: ['docker stop mycontainer'],
    },
    rm: {
      name: 'rm',
      description: 'Remove a container',
      usage: 'docker rm [OPTIONS] CONTAINER',
      examples: ['docker rm mycontainer', 'docker rm -f mycontainer'],
      dangerous: true,
      dangerLevel: 'medium',
      requiresConfirmation: true,
      options: [
        { name: '-f', alias: '--force', description: 'Force remove', type: 'boolean' },
      ],
    },
    rmi: {
      name: 'rmi',
      description: 'Remove an image',
      usage: 'docker rmi [OPTIONS] IMAGE',
      examples: ['docker rmi myimage', 'docker rmi -f myimage'],
      dangerous: true,
      dangerLevel: 'medium',
      requiresConfirmation: true,
      options: [
        { name: '-f', alias: '--force', description: 'Force remove', type: 'boolean' },
      ],
    },
    exec: {
      name: 'exec',
      description: 'Execute a command in a container',
      usage: 'docker exec [OPTIONS] CONTAINER COMMAND',
      examples: ['docker exec -it mycontainer bash'],
      options: [
        { name: '-i', alias: '--interactive', description: 'Keep STDIN open', type: 'boolean' },
        { name: '-t', alias: '--tty', description: 'Allocate a pseudo-TTY', type: 'boolean' },
      ],
    },
    logs: {
      name: 'logs',
      description: 'Fetch container logs',
      usage: 'docker logs [OPTIONS] CONTAINER',
      examples: ['docker logs mycontainer', 'docker logs -f mycontainer'],
      options: [
        { name: '-f', alias: '--follow', description: 'Follow log output', type: 'boolean' },
      ],
    },
    'system prune': {
      name: 'system prune',
      description: 'Remove unused data',
      usage: 'docker system prune [OPTIONS]',
      examples: ['docker system prune'],
      dangerous: true,
      dangerLevel: 'critical',
      requiresConfirmation: true,
      options: [
        { name: '-f', alias: '--force', description: 'Do not prompt for confirmation', type: 'boolean' },
        { name: '-a', alias: '--all', description: 'Remove all unused images', type: 'boolean' },
      ],
    },
  },
};
