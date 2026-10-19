import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashCanonical, sha256Text } from '../../../src/domain/canonical.js';
import { WEIGHTS, DIMENSIONS, scoreRange } from '../../../src/domain/scoring.js';
import { value, invalid } from './fixtures.js';

test('canonical JSON sorts every object, including integer-like keys, without changing arrays', () => {
  const input = { z: { b: 1, a: 2 }, '2': 2, '10': 10, a: [3, 1] };
  assert.equal(value(canonicalJson(input)), '{"10":10,"2":2,"a":[3,1],"z":{"a":2,"b":1}}');
  assert.equal(value(hashCanonical({ b: 1, a: 2 })), value(hashCanonical({ a: 2, b: 1 })));
  assert.notEqual(value(hashCanonical([1, 2])), value(hashCanonical([2, 1])));
});
test('canonical and text hashes preserve Unicode and newlines exactly', () => {
  assert.notEqual(sha256Text('é'), sha256Text('e\u0301'));
  assert.notEqual(sha256Text('a\r\nb'), sha256Text('a\nb'));
  assert.equal(value(canonicalJson('a\r\n中')), '"a\\r\\n中"');
  assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('canonical JSON rejects non-finite, non-JSON, cyclic and sparse data', () => {
  const cycle: unknown[] = []; cycle.push(cycle);
  for (const input of [NaN, Infinity, -Infinity, undefined, 1n, () => 1, Symbol('x'),
    { x: undefined }, new Date(), new Map(), cycle, Array(1), { [Symbol('key')]: 1 }]) invalid(canonicalJson(input), 'INVALID_INPUT');
});
test('canonical JSON accepts repeated non-cyclic objects and does not mutate', () => {
  const object = Object.freeze({ b: 1, a: 2 });
  assert.equal(value(canonicalJson([object, object])), '[{"a":2,"b":1},{"a":2,"b":1}]');
});

const ratings = (rating: number | null) => Object.fromEntries(DIMENSIONS.map(key => [key, rating]));
test('production score weights and dimension order remain immutable v0.3 constants', () => {
  assert.deepEqual(Object.values(WEIGHTS), [25, 20, 20, 15, 10, 10]);
  assert.equal(Object.isFrozen(WEIGHTS), true);
  assert.equal(Object.isFrozen(DIMENSIONS), true);
});
test('score extremes, fractions and a known example use fixed weights', () => {
  assert.equal(value(scoreRange(ratings(0))).score, 0);
  assert.equal(value(scoreRange(ratings(5))).score, 100);
  assert.equal(value(scoreRange(ratings(2.5))).score, 50);
  assert.equal(value(scoreRange({ demand: 4, gap: 3, distribution: 1, feasibility: 4, retention: 4, demo: 2 })).score, 60);
});
test('compensation counterexamples remain visible rather than adjusting weights', () => {
  assert.equal(value(scoreRange({ ...ratings(5), demand: 0 })).score, 75);
  assert.equal(value(scoreRange({ ...ratings(5), feasibility: 0 })).score, 85);
});
test('unknown ratings are not zero, midpoint or renormalized and ranges are not probabilities', () => {
  const range = value(scoreRange({ ...ratings(5), demand: null }));
  assert.deepEqual(range, { score: null, lower: 75, upper: 100, missing: ['demand'], interpretation: '逻辑范围；不是成功概率或置信区间' });
  const unknown = value(scoreRange(ratings(null)));
  assert.equal(unknown.score, null); assert.equal(unknown.lower, 0); assert.equal(unknown.upper, 100);
});
test('production scores return errors for invalid inputs without coercion or mutation', () => {
  for (const bad of [undefined, NaN, Infinity, -1, 5.01, '5', true]) invalid(scoreRange({ ...ratings(3), demand: bad }), 'INVALID_INPUT');
  const { demand: _missing, ...missing } = ratings(3);
  for (const bad of [null, [], 1, missing, { ...ratings(3), hype: 5 }]) invalid(scoreRange(bad));
  const input = Object.freeze(ratings(3));
  assert.deepEqual(scoreRange(input), scoreRange(input));
});
test('exhaustive production integer scores stay bounded over all 6^6 combinations', () => {
  let total = 0;
  for (let n = 0; n < 6 ** 6; n++) {
    let cursor = n;
    const input = Object.fromEntries(DIMENSIONS.map(key => { const v = cursor % 6; cursor = Math.floor(cursor / 6); return [key, v]; }));
    const result = value(scoreRange(input));
    assert.ok(result.score !== null && result.score >= 0 && result.score <= 100);
    assert.equal(result.lower, result.upper); total++;
  }
  assert.equal(total, 46656);
});
