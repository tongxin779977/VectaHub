"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDangerousCommand = isDangerousCommand;
exports.getDangerousMatch = getDangerousMatch;
const DANGEROUS_PATTERNS = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force)\b/i,
    /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*r|--force\s+--recursive)\b/i,
    /\bsudo\b/i,
    /\bchmod\s+777\b/i,
    /\bcurl\b.*\|\s*(ba)?sh\b/i,
    /\bwget\b.*\|\s*(ba)?sh\b/i,
    /\bdd\s+if=/i,
    /\bmkfs\b/i,
    /:\(\)\{/,
];
function isDangerousCommand(commandString) {
    if (!commandString)
        return false;
    const normalized = commandString.trim();
    if (!normalized)
        return false;
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(normalized));
}
function getDangerousMatch(commandString) {
    if (!commandString)
        return null;
    const normalized = commandString.trim();
    if (!normalized)
        return null;
    for (const pattern of DANGEROUS_PATTERNS) {
        const match = normalized.match(pattern);
        if (match)
            return match[0];
    }
    return null;
}
//# sourceMappingURL=dangerDetection.js.map