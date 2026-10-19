import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePacket, renderCard } from './decision-card.mjs';
const original = JSON.parse(readFileSync(new URL('../research/decision-cases.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(original);
test('three research examples validate without assigning scores', () => {
  assert.equal(original.cases.length, 3); assert.equal(validatePacket(original), true);
});
test('a factual source claim with no source is rejected', () => {
  const p = fresh(); p.cases[0].claims[0].source_ids = []; assert.throws(() => validatePacket(p));
});
test('dangling source references are rejected', () => {
  const p = fresh(); p.cases[0].claims[0].source_ids = ['invented']; assert.throws(() => validatePacket(p));
});
test('broken revision ancestry is rejected', () => {
  const p = fresh(); p.cases[0].revisions[1].supersedes = 'missing'; assert.throws(() => validatePacket(p));
});
test('changed recommendation without evidence or design change is rejected', () => {
  const p = fresh(); p.cases[0].revisions[1].new_source_ids = []; assert.throws(() => validatePacket(p));
});
test('already introduced evidence cannot be relabeled as new', () => {
  const p = fresh(); p.cases[0].revisions[0].new_source_ids = ['E01']; assert.throws(() => validatePacket(p));
});
test('unsafe URLs and path-like case IDs are rejected', () => {
  const p = fresh(); p.sources[0].url = 'javascript:alert(1)'; assert.throws(() => validatePacket(p));
  const q = fresh(); q.cases[0].id = '../../bad'; assert.throws(() => validatePacket(q));
});
test('render preserves prior recommendation and escapes raw HTML', () => {
  const p = fresh(); p.cases[0].title = '<script>alert(1)</script>';
  const result = renderCard(p, p.cases[0]);
  assert.ok(result.includes('C01-r1')); assert.ok(result.includes('C01-r2'));
  assert.ok(result.includes('&lt;script&gt;')); assert.ok(!result.includes('<script>'));
});
test('render is deterministic and does not rewrite source records', () => {
  const p = fresh(), before = JSON.stringify(p);
  assert.equal(renderCard(p, p.cases[0]), renderCard(p, p.cases[0]));
  assert.equal(JSON.stringify(p), before);
});
