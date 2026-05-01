export function matchPattern(pattern: string, command: string): boolean {
  const normalizedCommand = command.trim();
  const normalizedPattern = pattern.trim();

  if (normalizedPattern.includes('*')) {
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\s+/g, '\\s+');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(normalizedCommand);
  }

  return normalizedCommand.toLowerCase() === normalizedPattern.toLowerCase();
}

export function parseCommand(fullCommand: string): {
  tool: string;
  subcommand: string;
  args: string[];
  fullCommand: string;
} {
  const parts = fullCommand.trim().split(/\s+/);
  const tool = parts[0] || '';
  const subcommand = parts.length > 1 ? parts[1] : '';
  const args = parts.slice(2);

  return {
    tool,
    subcommand,
    args,
    fullCommand,
  };
}