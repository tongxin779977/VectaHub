/**
 * Check whether a command matches a rule pattern.
 *
 * Supports exact match (case-insensitive) and wildcard patterns where `*`
 * matches any sequence of characters. Whitespace in patterns is normalized
 * to match one or more whitespace characters in the command.
 */
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

/**
 * Parse a full command string into its constituent parts.
 *
 * Splits the command by whitespace into tool name, optional subcommand,
 * and remaining arguments.
 */
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
