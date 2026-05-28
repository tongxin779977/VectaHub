/**
 * CLI Version Checker with caching support.
 * Provides version comparison, update checking, and version validation.
 */

import { getVersion } from './utils/version.js';

/** Version information. */
export interface VersionInfo {
  current: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/** Version comparison result. */
export type VersionComparison = -1 | 0 | 1;

/** Update check result. */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateType?: 'major' | 'minor' | 'patch';
  checkedAt: number;
}

/** Cached version check. */
interface CachedVersionCheck {
  result: UpdateCheckResult;
  timestamp: number;
  ttl: number;
}

/** Version cache with TTL support. */
const versionCache = new Map<string, CachedVersionCheck>();

/** Default cache TTL in milliseconds (1 hour). */
const DEFAULT_CACHE_TTL = 60 * 60 * 1000;

/** Cached version info. */
let cachedVersionInfo: VersionInfo | undefined;

/**
 * Parse a version string into its components.
 * @param version - Version string (e.g., '1.2.3', '1.2.3-beta.1', '1.2.3+build.123').
 * @returns Parsed version information.
 * @throws {Error} When version string is invalid.
 */
export function parseVersion(version: string): VersionInfo {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?(?:\+([a-zA-Z0-9.]+))?$/;
  const match = version.match(semverRegex);

  if (!match) {
    throw new Error(`Invalid version string: ${version}`);
  }

  return {
    current: version,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Get parsed version info with caching.
 * @returns Parsed version information.
 */
export function getVersionInfo(): VersionInfo {
  if (!cachedVersionInfo) {
    const version = getVersion();
    cachedVersionInfo = parseVersion(version);
  }
  return cachedVersionInfo;
}

/**
 * Compare two version strings.
 * @param version1 - First version string.
 * @param version2 - Second version string.
 * @returns -1 if version1 < version2, 0 if equal, 1 if version1 > version2.
 */
export function compareVersions(version1: string, version2: string): VersionComparison {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  if (v1.major !== v2.major) {
    return v1.major > v2.major ? 1 : -1;
  }

  if (v1.minor !== v2.minor) {
    return v1.minor > v2.minor ? 1 : -1;
  }

  if (v1.patch !== v2.patch) {
    return v1.patch > v2.patch ? 1 : -1;
  }

  if (v1.prerelease && v2.prerelease) {
    return v1.prerelease.localeCompare(v2.prerelease) as VersionComparison;
  }

  if (v1.prerelease) return -1;
  if (v2.prerelease) return 1;

  return 0;
}

/**
 * Check if a version satisfies a semver range.
 * @param version - Version to check.
 * @param range - Semver range (e.g., '>=1.0.0', '^1.2.0', '~1.2.3').
 * @returns True if version satisfies the range.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version);

  if (range.startsWith('>=')) {
    const target = parseVersion(range.slice(2));
    return compareVersions(version, range.slice(2)) >= 0;
  }

  if (range.startsWith('<=')) {
    const target = parseVersion(range.slice(2));
    return compareVersions(version, range.slice(2)) <= 0;
  }

  if (range.startsWith('>')) {
    const target = parseVersion(range.slice(1));
    return compareVersions(version, range.slice(1)) > 0;
  }

  if (range.startsWith('<')) {
    const target = parseVersion(range.slice(1));
    return compareVersions(version, range.slice(1)) < 0;
  }

  if (range.startsWith('^')) {
    const target = parseVersion(range.slice(1));
    return v.major === target.major && compareVersions(version, range.slice(1)) >= 0;
  }

  if (range.startsWith('~')) {
    const target = parseVersion(range.slice(1));
    return v.major === target.major && v.minor === target.minor && compareVersions(version, range.slice(1)) >= 0;
  }

  return version === range;
}

/**
 * Determine the update type between two versions.
 * @param current - Current version string.
 * @param latest - Latest version string.
 * @returns Update type or undefined if versions are equal.
 */
export function getUpdateType(current: string, latest: string): 'major' | 'minor' | 'patch' | undefined {
  const currentInfo = parseVersion(current);
  const latestInfo = parseVersion(latest);

  if (latestInfo.major > currentInfo.major) {
    return 'major';
  }

  if (latestInfo.minor > currentInfo.minor) {
    return 'minor';
  }

  if (latestInfo.patch > currentInfo.patch) {
    return 'patch';
  }

  return undefined;
}

/**
 * Check for updates with caching.
 * @param latestVersion - Optional latest version to compare against.
 * @param cacheTtl - Cache TTL in milliseconds.
 * @returns Update check result.
 */
export function checkForUpdate(
  latestVersion?: string,
  cacheTtl: number = DEFAULT_CACHE_TTL,
): UpdateCheckResult {
  const cacheKey = `update-${latestVersion || 'latest'}`;
  const cached = versionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.result;
  }

  const currentVersion = getVersion();
  let result: UpdateCheckResult;

  if (latestVersion) {
    const comparison = compareVersions(currentVersion, latestVersion);
    result = {
      hasUpdate: comparison < 0,
      currentVersion,
      latestVersion,
      updateType: comparison < 0 ? getUpdateType(currentVersion, latestVersion) : undefined,
      checkedAt: Date.now(),
    };
  } else {
    result = {
      hasUpdate: false,
      currentVersion,
      checkedAt: Date.now(),
    };
  }

  versionCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
    ttl: cacheTtl,
  });

  return result;
}

/**
 * Validate a version string format.
 * @param version - Version string to validate.
 * @returns True if version format is valid.
 */
export function isValidVersion(version: string): boolean {
  try {
    parseVersion(version);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format version info for display.
 * @param info - Version information.
 * @param includeMetadata - Whether to include prerelease and build info.
 * @returns Formatted version string.
 */
export function formatVersion(info: VersionInfo, includeMetadata: boolean = false): string {
  let formatted = `${info.major}.${info.minor}.${info.patch}`;

  if (includeMetadata && info.prerelease) {
    formatted += `-${info.prerelease}`;
  }

  if (includeMetadata && info.build) {
    formatted += `+${info.build}`;
  }

  return formatted;
}

/**
 * Clear the version cache.
 * @param key - Optional specific cache key to clear.
 */
export function clearVersionCache(key?: string): void {
  if (key) {
    versionCache.delete(key);
  } else {
    versionCache.clear();
  }
}

/**
 * Get version cache statistics.
 * @returns Object with cache size and entries.
 */
export function getVersionCacheStats(): { size: number; entries: string[] } {
  return {
    size: versionCache.size,
    entries: Array.from(versionCache.keys()),
  };
}

/**
 * Get a formatted version banner for CLI startup.
 * @param includeUpdateCheck - Whether to include update check info.
 * @returns Formatted version banner string.
 */
export function getVersionBanner(includeUpdateCheck: boolean = false): string {
  const info = getVersionInfo();
  const banner = `VectaHub v${formatVersion(info, true)}`;

  if (includeUpdateCheck) {
    const updateResult = checkForUpdate();
    if (updateResult.hasUpdate) {
      return `${banner} (Update available: v${updateResult.latestVersion})`;
    }
  }

  return banner;
}
