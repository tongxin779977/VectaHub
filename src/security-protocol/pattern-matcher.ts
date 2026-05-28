function escapeRegexSegment(segment: string): string {
  return segment
    .replace(/[-/\\^$+().|[\]{}]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
}

function matchSingleSegmentWildcard(pattern: string, commandParts: string[]): boolean {
  if (pattern === '*') return true;

  const isSuffixWildcard = pattern.endsWith('*') && (pattern.match(/\*/g)?.length ?? 0) === 1;
  const isPrefixWildcard = pattern.startsWith('*') && (pattern.match(/\*/g)?.length ?? 0) === 1;

  if (isSuffixWildcard && !isPrefixWildcard) {
    return commandParts.some(part => part.startsWith(pattern.slice(0, -1)));
  }

  if (isPrefixWildcard && !pattern.endsWith('*')) {
    return commandParts.some(part => part.endsWith(pattern.slice(1)));
  }

  const regex = new RegExp(`^${escapeRegexSegment(pattern)}$`);
  return commandParts.some(part => regex.test(part));
}

function matchWildcardSegment(patternPart: string, commandPart: string): boolean {
  if (patternPart === '?') return true;
  if (patternPart === commandPart) return true;
  if (!patternPart.includes('*') && !patternPart.includes('?')) return false;
  return new RegExp(`^${escapeRegexSegment(patternPart)}$`).test(commandPart);
}

function matchMultiSegmentWildcard(patternParts: string[], commandParts: string[]): boolean {
  if (patternParts.length > commandParts.length + 1) return false;

  if (patternParts.length === 1) {
    return matchSingleSegmentWildcard(patternParts[0], commandParts);
  }

  let patternIndex = 0;
  let commandIndex = 0;

  while (patternIndex < patternParts.length && commandIndex < commandParts.length) {
    const patternPart = patternParts[patternIndex];

    if (patternPart === '*') {
      patternIndex++;
      if (patternIndex === patternParts.length) return true;

      const remainingPattern = patternParts.slice(patternIndex);
      const remainingCommand = commandParts.slice(commandIndex);

      for (let start = 0; start <= remainingCommand.length - remainingPattern.length; start++) {
        let matches = true;
        for (let i = 0; i < remainingPattern.length; i++) {
          const nextPattern = remainingPattern[i];
          const nextCommand = remainingCommand[start + i];
          if (nextPattern === '*') continue;
          if (!matchWildcardSegment(nextPattern, nextCommand)) {
            matches = false;
            break;
          }
        }
        if (matches) return true;
      }
      return false;
    }

    const commandPart = commandParts[commandIndex];
    if (!matchWildcardSegment(patternPart, commandPart)) return false;

    patternIndex++;
    commandIndex++;
  }

  if (patternIndex < patternParts.length && patternParts.slice(patternIndex).every(p => p === '*')) {
    return true;
  }

  return patternIndex === patternParts.length && commandIndex === commandParts.length;
}

/**
 * Matches a command against a blocked command pattern.
 * Supports exact match, prefix match, and wildcard patterns (* and ?).
 */
export function matchBlockedCommand(command: string, blockedPattern: string): boolean {
  const normalizedCommand = command.trim().toLowerCase();
  const normalizedPattern = blockedPattern.trim().toLowerCase();

  if (normalizedCommand === normalizedPattern) return true;

  const commandParts = normalizedCommand.split(/\s+/);
  const patternParts = normalizedPattern.split(/\s+/);

  if (!normalizedPattern.includes('*') && !normalizedPattern.includes('?')) {
    if (patternParts.length > commandParts.length) return false;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== commandParts[i]) return false;
    }
    return true;
  }

  return matchMultiSegmentWildcard(patternParts, commandParts);
}
