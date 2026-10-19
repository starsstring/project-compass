import { failure, success, type DomainResult } from './result.js';

export const WEIGHTS = Object.freeze({ demand: 25, gap: 20, distribution: 20, feasibility: 15, retention: 10, demo: 10 });
export const DIMENSIONS = Object.freeze(['demand', 'gap', 'distribution', 'feasibility', 'retention', 'demo'] as const);
export type Dimension = typeof DIMENSIONS[number];
export interface ScoreRange {
  score: number | null;
  lower: number;
  upper: number;
  missing: Dimension[];
  interpretation: '逻辑范围；不是成功概率或置信区间';
}

export function scoreRange(input: unknown): DomainResult<ScoreRange> {
  if (input === null || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 6 || DIMENSIONS.some(key => !Object.hasOwn(input, key))) {
    return failure('INVALID_INPUT', '/ratings', 'Exactly six v0.3 dimensions are required; use null for unknown.');
  }
  const ratings = input as Record<string, unknown>;
  let lower = 0, unknownWeight = 0;
  const missing: Dimension[] = [];
  for (const key of DIMENSIONS) {
    const value = ratings[key];
    if (value === null) { unknownWeight += WEIGHTS[key]; missing.push(key); continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5) {
      return failure('INVALID_INPUT', `/ratings/${key}`, 'Expected a finite 0..5 rating or null.');
    }
    lower += WEIGHTS[key] * value / 5;
  }
  const round = (value: number): number => Math.round(value * 1e10) / 1e10;
  return success({ score: missing.length ? null : round(lower), lower: round(lower),
    upper: round(lower + unknownWeight), missing, interpretation: '逻辑范围；不是成功概率或置信区间' });
}
