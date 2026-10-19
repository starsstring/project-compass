// Mathematical audit of Master Brief v0.3 section 6.1, not a product predictor.
export const WEIGHTS = Object.freeze({ demand: 25, gap: 20, distribution: 20, feasibility: 15, retention: 10, demo: 10 });
export const DIMENSIONS = Object.freeze(Object.keys(WEIGHTS));

export function scoreRange(ratings) {
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) throw new TypeError('Expected a ratings object');
  if (Object.keys(ratings).length !== DIMENSIONS.length || DIMENSIONS.some(key => !Object.hasOwn(ratings, key))) {
    throw new TypeError('Exactly the six v0.3 dimensions are required; use null for unknown');
  }
  let lower = 0;
  let unknownWeight = 0;
  const missing = [];
  for (const key of DIMENSIONS) {
    const value = ratings[key];
    if (value === null) { unknownWeight += WEIGHTS[key]; missing.push(key); continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5) throw new RangeError(`${key}: expected finite 0..5 or null`);
    lower += WEIGHTS[key] * value / 5;
  }
  const round = x => Math.round(x * 1e10) / 1e10;
  return { score: missing.length ? null : round(lower), lower: round(lower), upper: round(lower + unknownWeight),
    missing, interpretation: 'logical bounds under fixed weights; not a probability or confidence interval' };
}

export function enumerateCounterexamples() {
  let total = 0, highWithoutDemand = 0, highWithoutFeasibility = 0;
  function visit(values) {
    if (values.length < 6) { for (let v = 0; v <= 5; v++) visit([...values, v]); return; }
    const ratings = Object.fromEntries(DIMENSIONS.map((key, i) => [key, values[i]]));
    const { score } = scoreRange(ratings);
    total++;
    if (ratings.demand === 0 && score >= 75) highWithoutDemand++;
    if (ratings.feasibility === 0 && score >= 75) highWithoutFeasibility++;
  }
  visit([]);
  return { total, highWithoutDemand, highWithoutFeasibility,
    warning: 'Enumerated synthetic rating combinations, not users, projects, prevalence, or a validation sample.' };
}
