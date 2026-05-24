/**
 * Shell Tokenizer - A robust parser to decompose complex shell commands
 * Handles pipes, redirects, and multiple commands (&&, ||, ;)
 */

export interface ShellCommand {
  cli: string;
  args: string[];
  operator?: '&&' | '||' | '|' | ';';
  raw: string;
}

type ShellOperator = NonNullable<ShellCommand['operator']>;

export class ShellTokenizer {
  /**
   * Decomposes a full command line into individual command components.
   * Example: 'ls -la | grep "foo" && rm -rf /'
   * Returns: [
   *   { cli: 'ls', args: ['-la'], operator: '|', raw: 'ls -la' },
   *   { cli: 'grep', args: ['foo'], operator: '&&', raw: 'grep "foo"' },
   *   { cli: 'rm', args: ['-rf', '/'], raw: 'rm -rf /' }
   * ]
   */
  static tokenize(input: string): ShellCommand[] {
    const commands: ShellCommand[] = [];
    const parts = this.splitByOperators(input);

    for (const part of parts) {
      const tokens = this.parseArguments(part.content);
      if (tokens.length > 0) {
        commands.push({
          cli: tokens[0],
          args: tokens.slice(1),
          operator: part.operator,
          raw: part.content.trim()
        });
      }
    }

    return commands;
  }

  private static splitByOperators(input: string): { content: string, operator?: ShellOperator }[] {
    const results: { content: string, operator?: ShellOperator }[] = [];
    let current = '';
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let i = 0;

    while (i < input.length) {
      const char = input[i];
      const nextChar = input[i + 1];

      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;

      if (!inDoubleQuote && !inSingleQuote) {
        // Match operators: &&, ||, |, ;
        if (char === '&' && nextChar === '&') {
          results.push({ content: current, operator: '&&' });
          current = '';
          i += 2;
          continue;
        }
        if (char === '|' && nextChar === '|') {
          results.push({ content: current, operator: '||' });
          current = '';
          i += 2;
          continue;
        }
        if (char === '|') {
          results.push({ content: current, operator: '|' });
          current = '';
          i++;
          continue;
        }
        if (char === ';') {
          results.push({ content: current, operator: ';' });
          current = '';
          i++;
          continue;
        }
      }

      current += char;
      i++;
    }

    results.push({ content: current });
    return results;
  }

  /**
   * Robust argument parser that respects quotes and escapes
   */
  private static parseArguments(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (!inDoubleQuote && !inSingleQuote && /\s/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }
}
