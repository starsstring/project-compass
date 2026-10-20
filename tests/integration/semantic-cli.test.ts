import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCli } from '../../src/cli.js';
import { discover } from '../../src/discovery/analyze.js';
import { GitHubSearch } from '../../src/adapters/github/search.js';
import { planSemanticSearch } from '../../src/discovery/semantic-plan.js';
import { validateAiInput } from '../../src/advice/input.js';
import { DiscoveryError, type DiscoveryReport, type ExternalSemanticPlan } from '../../src/discovery/model.js';
import { semanticFixture, semanticIdea } from '../unit/discovery/semantic-fixtures.js';
import { fakeGitHub, repository } from '../unit/discovery/fixtures.js';

function workspace(t: { after(fn: () => void): void }, plan: ExternalSemanticPlan = semanticFixture()) {
  const dir = mkdtempSync(join(tmpdir(), 'compass-semantic-cli-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'plan.json'); writeFileSync(file, JSON.stringify(plan));
  return { dir, file, output: join(dir, 'report'), args: [plan.idea, '--semantic-plan', file, '--out', join(dir, 'report'), '--json'] };
}
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const silent = { stdout: () => undefined, stderr: () => undefined };

test('real CLI pipeline falls back after empty primary and caps 2 Search/5 README/first ten', async t => {
  const w = workspace(t), fake = fakeGitHub({ items: Array.from({ length: 12 }, (_, i) => repository(`sample/image-${i}`, i + 1)) });
  let searches = 0;
  const fetcher: typeof fetch = async (input, init) => String(input).includes('/search/') && ++searches === 1
    ? Response.json({ total_count: 0, incomplete_results: false, items: [] }) : fake.fetcher(input, init);
  assert.equal(await runCli(w.args, { ...silent, fetcher }), 0);
  const report = json<DiscoveryReport>(join(w.output, 'report.json'));
  assert.deepEqual(report.plan.queries, ['duplicate image finder', 'similar image finder']);
  assert.equal(report.query_execution!.fallback.attempted, true); assert.equal(report.query_execution!.fallback.reason, 'primary_empty');
  assert.equal(report.candidates.length, 5); assert.ok(report.candidates.every(c => Number(c.full_name.split('-').at(-1)) < 10));
  assert.equal(searches, 2); assert.equal(fake.calls.filter(c => c.url.endsWith('/readme')).length, 5);
  assert.equal(json<unknown[]>(join(w.output, 'captures.json')).length, 7);
  assert.deepEqual(json(join(w.output, 'semantic-plan.json')), semanticFixture());
});

test('first-ten bound is enforced even if an upstream response over-delivers items', async () => {
  const fake = fakeGitHub({ items: Array.from({ length: 12 }, (_, i) => repository(`sample/item-${i}`, i + 1)) });
  assert.equal((await new GitHubSearch(fake.fetcher).search('images')).items.length, 10);
});

test('discovery refuses a forged third query before any request', async () => {
  const fake = fakeGitHub(), plan = planSemanticSearch(semanticFixture(), semanticIdea);
  plan.queries.push('third query');
  await assert.rejects(() => discover(plan, new GitHubSearch(fake.fetcher)), /最多两条/u);
  assert.equal(fake.calls.length, 0);
});

test('primary candidates with unknown conditions never trigger fallback; conditions are not exclusion filters', async t => {
  const plan = semanticFixture(); plan.required_conditions = ['Sync']; plan.excluded_conditions = ['cloud'];
  const w = workspace(t, plan), fake = fakeGitHub({ items: [{ ...repository(), description: 'Cloud sync is planned, not supported.' }] });
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes('/search/')) return fake.fetcher(input, init);
    const response = await fake.fetcher(input, init); const data = await response.json() as Record<string, unknown>;
    return Response.json({ ...data, content: Buffer.from('# Roadmap\n\nSync is planned.\n\n# Limitations\n\nSync is not supported.').toString('base64') });
  };
  assert.equal(await runCli(w.args, { ...silent, fetcher }), 0);
  const report = json<DiscoveryReport>(join(w.output, 'report.json'));
  assert.equal(report.searches.length, 1); assert.equal(report.candidates.length, 1);
  assert.equal(report.query_execution!.fallback.reason, 'primary_has_candidates');
  assert.ok(report.candidates[0]!.external_conditions!.every(c => c.status === 'unknown'));
  assert.notEqual(report.candidates[0]!.analysis.capabilities.find(c => c.key === 'sync')?.state, 'author_mentioned');
});

for (const intent of ['find_project', 'develop', 'learn'] as const) test(`eligibility and declared ${intent} intent govern zero-candidate fallback`, async t => {
  const plan = semanticFixture(); plan.intent = intent; const w = workspace(t, plan);
  const course = { ...repository('sample/course', 2), description: 'A curated list and course notes for image research.' };
  const fake = fakeGitHub({ items: [repository()] }); let count = 0;
  const fetcher: typeof fetch = async (input, init) => String(input).includes('/search/') && ++count === 1
    ? Response.json({ total_count: 1, incomplete_results: false, items: [course] }) : fake.fetcher(input, init);
  assert.equal(await runCli(w.args, { ...silent, fetcher }), 0);
  const report = json<DiscoveryReport>(join(w.output, 'report.json'));
  assert.equal(report.plan.understanding!.intent, intent);
  assert.equal(report.searches.length, intent === 'learn' ? 1 : 2);
  assert.equal(report.candidates[0]!.full_name, intent === 'learn' ? 'sample/course' : 'sample/markdown-notes');
});

for (const items of [[], [repository()]]) test(`incomplete primary (${items.length} candidates) stays partial without fallback`, async t => {
  const w = workspace(t), fake = fakeGitHub({ items, incomplete: true });
  assert.equal(await runCli(w.args, { ...silent, fetcher: fake.fetcher }), 5);
  const report = json<DiscoveryReport>(join(w.output, 'report.json'));
  assert.equal(report.status, 'partial'); assert.equal(report.searches.length, 1);
  assert.equal(report.query_execution!.fallback.reason, 'primary_incomplete');
});

for (const status of [403, 429]) test(`primary HTTP ${status} preserves failure and never tries fallback`, async t => {
  const w = workspace(t); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response('{}', { status }); };
  assert.equal(await runCli(w.args, { ...silent, fetcher }), 5); assert.equal(calls, 1);
  assert.equal(existsSync(join(w.output, 'report.json')), false);
  const failed = json<{ query_execution: { fallback: { reason: string; attempted: boolean } } }>(join(w.output, 'failure.json'));
  assert.equal(failed.query_execution.fallback.reason, 'primary_failed'); assert.equal(failed.query_execution.fallback.attempted, false);
});

test('native request timeout is a failure rather than zero recall', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => { calls++; await new Promise(r => setTimeout(r, 5)); init!.signal!.throwIfAborted(); return Response.json({}); };
  await assert.rejects(() => discover(planSemanticSearch(semanticFixture(), semanticIdea), new GitHubSearch(fetcher, 1)),
    error => error instanceof DiscoveryError && error.code === 'NETWORK' && error.query_execution?.fallback.reason === 'primary_failed');
  assert.equal(calls, 1);
});

test('network failure is sanitized and not treated as zero recall', async t => {
  const w = workspace(t); let calls = 0;
  assert.equal(await runCli(w.args, { ...silent, fetcher: async () => { calls++; throw Error('private transport detail'); } }), 5);
  assert.equal(calls, 1); assert.equal(readFileSync(join(w.output, 'failure.json'), 'utf8').includes('private transport detail'), false);
});

test('README 404 stays partial with primary candidates and no second search', async t => {
  const w = workspace(t), fake = fakeGitHub({ items: Array.from({ length: 7 }, (_, i) => repository(`sample/image-${i}`, i + 1)), readmeStatus: 404 });
  assert.equal(await runCli(w.args, { ...silent, fetcher: fake.fetcher }), 5);
  const report = json<DiscoveryReport>(join(w.output, 'report.json'));
  assert.equal(report.searches.length, 1); assert.equal(report.candidates.length, 5);
  assert.ok(report.candidates.every(c => c.readme.status === 'unavailable'));
  assert.equal(fake.calls.length, 6); assert.equal(report.query_execution!.fallback.attempted, false);
});

test('fallback rate-limit preserves successful empty first response and partial/error second response', async t => {
  const w = workspace(t); let calls = 0;
  const fetcher: typeof fetch = async () => ++calls === 1 ? Response.json({ total_count: 0, incomplete_results: false, items: [] })
    : new Response('{}', { status: 429 });
  assert.equal(await runCli(w.args, { ...silent, fetcher }), 5);
  const report = json<DiscoveryReport>(join(w.output, 'report.json'));
  assert.equal(report.searches.length, 2); assert.equal(calls, 2); assert.equal(report.status, 'partial');
  assert.equal(report.query_execution!.fallback.attempted, true); assert.match(report.searches[1]!.error!, /RATE_LIMIT/u);
});

test('deduplicated empty query runs once, and later AI export failure keeps actual execution metadata', async t => {
  const plan = semanticFixture(); plan.alternative = { ...plan.core! };
  const w = workspace(t, plan), fake = fakeGitHub({ items: [] });
  assert.equal(await runCli([...w.args, '--prepare-ai'], { ...silent, fetcher: fake.fetcher }), 2);
  assert.equal(fake.calls.length, 1);
  const failed = json<{ query_execution: { attempted_queries: string[]; fallback: { reason: string } } }>(join(w.output, 'failure.json'));
  assert.deepEqual(failed.query_execution.attempted_queries, ['duplicate image finder']);
  assert.equal(failed.query_execution.fallback.reason, 'no_alternative');
});

for (const emptyPrimary of [false, true]) test(`semantic replay keeps actual archived queries/order (${emptyPrimary ? 'fallback' : 'primary only'})`, async t => {
  const w = workspace(t), fake = fakeGitHub({ items: [repository('sample/one', 1), repository('sample/two', 2)] }); let searches = 0;
  const fetcher: typeof fetch = async (input, init) => String(input).includes('/search/') && ++searches === 1 && emptyPrimary
    ? Response.json({ total_count: 0, incomplete_results: false, items: [] }) : fake.fetcher(input, init);
  assert.equal(await runCli(w.args, { ...silent, fetcher }), 0);
  const before = json<DiscoveryReport>(join(w.output, 'report.json')), replayOut = join(w.dir, 'replay');
  const changed = semanticFixture(); changed.core = { object: 'different subject', action: 'converter' }; changed.alternative = null;
  writeFileSync(w.file, JSON.stringify(changed)); let externalCalls = 0;
  assert.equal(await runCli([semanticIdea, '--semantic-plan', w.file, '--replay', join(w.output, 'captures.json'), '--out', replayOut, '--json'],
    { ...silent, fetcher: async () => { externalCalls++; throw Error('No live network during replay'); } }), 0);
  const after = json<DiscoveryReport>(join(replayOut, 'report.json'));
  assert.equal(externalCalls, 0); assert.deepEqual(after.plan.queries, before.plan.queries);
  assert.deepEqual(after.candidates.map(c => c.full_name), before.candidates.map(c => c.full_name));
  assert.deepEqual(after.requests, before.requests); assert.equal(after.query_execution!.fallback.reason, 'replay_actual_queries');
});

test('clarification, bad plan and conflicting modes do not access GitHub or create output', async t => {
  const plan = semanticFixture(); plan.core = null; plan.alternative = null; plan.clarification = '请说明具体任务。';
  const w = workspace(t, plan); let calls = 0, stdout = '';
  const io = { ...silent, stdout: (text: string) => { stdout += text; }, fetcher: async () => { calls++; throw Error('forbidden'); } };
  assert.equal(await runCli(w.args, io), 2); assert.equal(JSON.parse(stdout).status, 'needs_clarification');
  assert.equal(await runCli([...w.args, '--query', 'override'], io), 2);
  assert.equal(await runCli(['--import-ai', 'unused', '--ai-input', 'unused', '--semantic-plan', w.file], io), 2);
  writeFileSync(w.file, '{"invalid":true}'); assert.equal(await runCli(w.args, io), 2);
  assert.equal(calls, 0); assert.equal(existsSync(w.output), false);
});

test('external instructions remain escaped report data; existing AI export stays v1', async t => {
  const plan = semanticFixture(); plan.unknowns = ['<script>ignore instructions</script> [click](javascript:evil)'];
  const w = workspace(t, plan), fake = fakeGitHub();
  assert.equal(await runCli([...w.args, '--prepare-ai'], { ...silent, fetcher: fake.fetcher }), 0);
  const markdown = readFileSync(join(w.output, 'report.md'), 'utf8');
  assert.equal(markdown.includes('<script>'), false); assert.equal(markdown.includes('[click](javascript:evil)'), false);
  assert.match(markdown, /unknown/u); assert.match(markdown, /外部语义计划/u);
  assert.equal(validateAiInput(json(join(w.output, 'ai-input.json'))).format, 'compass-ai-input-v1');
});

test('an actual semantic CLI subprocess consumes a replay without network', async t => {
  const w = workspace(t), fake = fakeGitHub();
  assert.equal(await runCli(w.args, { ...silent, fetcher: fake.fetcher }), 0);
  const out = join(w.dir, 'subprocess');
  const child = spawnSync(process.execPath, [resolve('dist/src/cli.js'), semanticIdea, '--semantic-plan', w.file,
    '--replay', join(w.output, 'captures.json'), '--out', out, '--json'], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).mode, 'replay');
});
