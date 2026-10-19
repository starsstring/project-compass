import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, DIMENSIONS, scoreRange, enumerateCounterexamples } from './score-audit.mjs';
const ratings = value => Object.fromEntries(DIMENSIONS.map(key => [key, value]));

test('v0.3 weights remain 25/20/20/15/10/10 and cannot be silently edited', () => {
  assert.deepEqual(Object.values(WEIGHTS), [25, 20, 20, 15, 10, 10]);
  assert.throws(() => { WEIGHTS.demand = 40; }, TypeError);
});
test('complete extremes are 0 and 100', () => {
  assert.equal(scoreRange(ratings(0)).score, 0);
  assert.equal(scoreRange(ratings(5)).score, 100);
});
test('low feasibility can still receive 85: expose, do not hide, compensation', () => {
  assert.equal(scoreRange({ ...ratings(5), feasibility: 0 }).score, 85);
});
test('zero demand can still receive 75 under original formula', () => {
  assert.equal(scoreRange({ ...ratings(5), demand: 0 }).score, 75);
});
test('missing demand is unknown rather than 0 or midpoint or a renormalized total', () => {
  const result = scoreRange({ ...ratings(5), demand: null });
  assert.equal(result.score, null);
  assert.equal(result.lower, 75);
  assert.equal(result.upper, 100);
});
test('all missing has no score and full logical range', () => {
  const result = scoreRange(ratings(null));
  assert.equal(result.score, null);
  assert.equal(result.lower, 0);
  assert.equal(result.upper, 100);
});
test('invalid, infinite, coercible and out-of-range ratings are rejected', () => {
  for (const bad of [undefined, NaN, Infinity, -1, 5.01, '5', true]) {
    assert.throws(() => scoreRange({ ...ratings(3), demand: bad }));
  }
});
test('missing or invented dimensions are rejected', () => {
  const value = ratings(3); delete value.gap;
  assert.throws(() => scoreRange(value));
  assert.throws(() => scoreRange({ ...ratings(3), hype: 5 }));
});
test('fixed input is reproducible and input is not mutated', () => {
  const value = Object.freeze({ demand: 4, gap: 3, distribution: 1, feasibility: 4, retention: 4, demo: 2 });
  assert.equal(scoreRange(value).score, 60);
  assert.deepEqual(scoreRange(value), scoreRange(value));
});
test('exhaustive finite audit covers 6^6 possible integer inputs', () => {
  const result = enumerateCounterexamples();
  assert.equal(result.total, 46656);
  assert.equal(result.highWithoutDemand, 1);
  assert.ok(result.highWithoutFeasibility > 0);
});
