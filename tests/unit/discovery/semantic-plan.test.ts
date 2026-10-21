import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSemanticSearch, readSemanticPlan, validateSemanticPlan, SEMANTIC_PLAN_MAX_BYTES } from '../../../src/discovery/semantic-plan.js';
import { semanticFixture, semanticIdea } from './semantic-fixtures.js';

test('external semantic plan produces bounded English queries and unverified detached provenance', () => {
  const input = semanticFixture(); input.core!.object = 'Duplicate Image';
  const plan = planSemanticSearch(input, semanticIdea);
  assert.deepEqual(plan.queries, ['duplicate image finder', 'similar image finder']);
  assert.equal(plan.method, 'explicit_query'); assert.equal(plan.semantic!.verification, 'unverified');
  assert.equal(plan.understanding!.intent, 'find_project');
  assert.deepEqual(plan.semantic!.input.required_conditions, input.required_conditions);
  input.required_conditions.push('changed'); assert.equal(plan.semantic!.input.required_conditions.length, 2);
  assert.match(plan.warnings.join(), /未调用模型/u);
});

test('same normalized synonym is deduplicated; optional alternative may be absent', () => {
  const input = semanticFixture(); input.alternative = { object: 'Duplicate Image', action: 'Finder' };
  assert.deepEqual(planSemanticSearch(input, semanticIdea).queries, ['duplicate image finder']);
  delete input.alternative;
  assert.deepEqual(planSemanticSearch(input, semanticIdea).queries, ['duplicate image finder']);
});

const valid = semanticFixture();
const invalidCases: [string, unknown][] = [
  ['unsupported version', { ...valid, version: 2 }], ['string version', { ...valid, version: '1' }],
  ['extra trust claim', { ...valid, confirmed: true }], ['unknown intent', { ...valid, intent: 'automatic' }],
  ['missing unknowns', { ...valid, unknowns: undefined }], ['null conditions', { ...valid, required_conditions: null }],
  ['missing core without question', { ...valid, core: null }], ['empty question', { ...valid, core: null, clarification: '' }],
  ['blank condition', { ...valid, excluded_conditions: ['   '] }], ['duplicate conditions', { ...valid, unknowns: ['a', 'a'] }],
  ['oversized array', { ...valid, required_conditions: Array.from({ length: 17 }, (_, i) => `item${i}`) }],
  ['oversized field', { ...valid, unknowns: ['x'.repeat(201)] }],
  ['query operator', { ...valid, core: { object: 'repo:private', action: 'finder' } }],
  ['boolean operator', { ...valid, core: { object: 'image OR', action: 'finder' } }],
  ['shell syntax', { ...valid, core: { object: 'image;touch', action: 'finder' } }],
  ['URL core', { ...valid, core: { object: 'https://example.com', action: 'finder' } }],
  ['Chinese query core', { ...valid, core: { object: '重复图片', action: 'finder' } }],
  ['too many words', { ...valid, core: { object: 'one two three', action: 'four five' } }],
  ['too many characters', { ...valid, core: { object: 'a'.repeat(64), action: 'b'.repeat(36) } }],
  ['bad unused alternative', { ...valid, clarification: '请补充用途', alternative: { object: 'x:y', action: 'finder' } }],
  ['extra nested field', { ...valid, core: { ...valid.core, query: 'hidden' } }],
  ['prototype key', JSON.parse(JSON.stringify(valid).replace('"version":1', '"version":1,"__proto__":{"trusted":true}')) as unknown],
];
for (const [name, input] of invalidCases) test(`semantic schema/runtime rejects ${name}`, () => {
  assert.throws(() => validateSemanticPlan(input, semanticIdea), error => error instanceof Error && !error.message.includes('repo:private'));
});

for (const control of ['\n', '\u001b', '\u0085', '\u202e', '\u2066']) test(`semantic text rejects control U+${control.charCodeAt(0).toString(16)}`, () => {
  assert.throws(() => validateSemanticPlan({ ...valid, unknowns: [`text${control}hidden`] }, semanticIdea));
});

test('raw idea must match, and unclear intent alone does not invent a clarification', () => {
  assert.throws(() => validateSemanticPlan(valid, 'another original idea'), /原句一致/u);
  assert.equal(planSemanticSearch({ ...valid, intent: 'unclear' }, semanticIdea).queries.length, 2);
  const input = { ...valid, intent: 'unclear', core: null, alternative: null, clarification: '请说明具体任务。' };
  const plan = planSemanticSearch(input, semanticIdea);
  assert.deepEqual(plan.queries, []); assert.equal(plan.understanding!.clarification, input.clarification);
  assert.deepEqual(planSemanticSearch(input, semanticIdea, ['saved query']).queries, []);
});

test('runtime accepts exactly the documented character/word limit without truncating', () => {
  const input = { ...valid, core: { object: 'a'.repeat(64), action: 'b'.repeat(35) }, alternative: null };
  assert.equal(planSemanticSearch(input, semanticIdea).queries[0]!.length, 100);
  assert.equal(planSemanticSearch({ ...valid, core: { object: 'one two', action: 'three four' } }, semanticIdea).queries[0], 'one two three four');
});

test('bounded file reader rejects malformed, missing, non-file, oversized and invalid UTF-8 input', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'compass-semantic-input-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'plan.json');
  for (const bytes of ['{', Buffer.from([0xff]), 'x'.repeat(SEMANTIC_PLAN_MAX_BYTES + 1)]) {
    writeFileSync(path, bytes); await assert.rejects(() => readSemanticPlan(path, semanticIdea));
  }
  await assert.rejects(() => readSemanticPlan(join(dir, 'missing'), semanticIdea));
  mkdirSync(join(dir, 'directory')); await assert.rejects(() => readSemanticPlan(join(dir, 'directory'), semanticIdea));
  const text = JSON.stringify(valid); writeFileSync(path, text + ' '.repeat(SEMANTIC_PLAN_MAX_BYTES - Buffer.byteLength(text)));
  assert.deepEqual(await readSemanticPlan(path, semanticIdea), valid);
});
