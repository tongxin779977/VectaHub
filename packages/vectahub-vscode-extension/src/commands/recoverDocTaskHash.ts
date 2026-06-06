export function resolveRecoveryInstructionHash(input: {
  currentHash?: string;
  latestInstructionHash?: string;
}): string | undefined {
  return input.currentHash ?? input.latestInstructionHash;
}
