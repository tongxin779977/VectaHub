export type ConfidenceLevel = 'exact' | 'high' | 'medium' | 'low' | 'below_threshold';

export const DEFAULT_CONFIDENCE_THRESHOLDS = {
  exact: 0.95,
  high: 0.85,
  medium: 0.65,
  low: 0.5,
};

export function classifyConfidence(confidence: number, thresholds?: { exact?: number; high?: number; medium?: number; low?: number }): ConfidenceLevel {
  const t = {
    exact: thresholds?.exact ?? 0.95,
    high: thresholds?.high ?? 0.85,
    medium: thresholds?.medium ?? 0.65,
    low: thresholds?.low ?? 0.5,
  };
  if (confidence >= t.exact) return 'exact';
  if (confidence >= t.high) return 'high';
  if (confidence >= t.medium) return 'medium';
  if (confidence >= t.low) return 'low';
  return 'below_threshold';
}
