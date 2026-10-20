import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCli } from '../../src/cli.js';
import { GitHubSearch } from '../../src/adapters/github/search.js';
import { fakeGitHub, repository } from '../unit/discovery/fixtures.js';

function workspace(t: { after: (fn: () => void) => void }): string {
  const base = resolve('.tools/discovery-tests'); mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'run-'));
  t.after(() => {
    const target = resolve(directory);
    assert.ok(target.startsWith(base + sep) && target !== base);
    rmSync(target, { recursive: true, force: true });
  });
  return directory;
}

test('CLI produces persisted Markdown, structured report and captures from read-only API data', async t => {
  const output = join(workspace(t), 'new-report'); const fake = fakeGitHub();
  let stdout = '', stderr = '';
  const exit = await runCli(['我想做一个 Markdown 笔记工具', '--out', output, '--json'], {
    fetcher: fake.fetcher, stdout: text => { stdout += text; }, stderr: text => { stderr += text; },
  });
  assert.equal(exit, 0); assert.equal(JSON.parse(stdout).format, 'compass-discovery-v1.1');
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'report.json'), 'utf8')), JSON.parse(stdout));
  assert.match(readFileSync(join(output, 'report.md'), 'utf8'), /sample\/markdown-notes/u);
  assert.equal(JSON.parse(readFileSync(join(output, 'captures.json'), 'utf8')).length, 3);
  assert.match(stderr, /已保存/u);
});
test('CLI refuses an existing destination before sending any network requests', async t => {
  const output = workspace(t); const sentinel = join(output, 'keep.txt'); writeFileSync(sentinel, 'keep');
  const fake = fakeGitHub();
  assert.equal(await runCli(['a markdown notes tool', '--out', output], { fetcher: fake.fetcher, stderr: () => undefined }), 4);
  assert.equal(fake.calls.length, 0); assert.equal(readFileSync(sentinel, 'utf8'), 'keep');
});
test('CLI input and help handling do not access the network or create reports', async t => {
  const output = join(workspace(t), 'unused'); const fake = fakeGitHub(); const stderr: string[] = [];
  const io = { fetcher: fake.fetcher, stdout: () => undefined, stderr: (text: string) => { stderr.push(text); } };
  assert.equal(await runCli(['--help'], io), 0);
  assert.equal(await runCli(['--invalid'], io), 2);
  assert.equal(await runCli(['未识别中文创意', '--out', output], io), 2);
  assert.equal(await runCli(['a markdown notes tool', '--limit', '99', '--out', output], io), 2);
  assert.equal(fake.calls.length, 0); assert.equal(existsSync(output), false);
});
test('CLI persists failure evidence and returns 5 for a rate limited run', async t => {
  const output = join(workspace(t), 'failed');
  const fetcher: typeof fetch = async () => new Response('{"message":"rate limit"}', { status: 429 });
  let stdout = '';
  const exit = await runCli(['a markdown notes tool', '--out', output], {
    fetcher, stdout: text => { stdout += text; }, stderr: () => undefined,
  });
  assert.equal(exit, 5); assert.equal(stdout, '');
  assert.equal(existsSync(join(output, 'report.json')), false);
  assert.equal(JSON.parse(readFileSync(join(output, 'failure.json'), 'utf8')).error.code, 'RATE_LIMIT');
  assert.equal(JSON.parse(readFileSync(join(output, 'captures.json'), 'utf8')).length, 1);
});
test('CLI returns 5 while preserving useful results when README retrieval fails', async t => {
  const output = join(workspace(t), 'partial'); const fake = fakeGitHub({ readmeStatus: 404 });
  const exit = await runCli(['a markdown notes tool', '--out', output], { fetcher: fake.fetcher, stdout: () => undefined, stderr: () => undefined });
  assert.equal(exit, 5);
  assert.equal(JSON.parse(readFileSync(join(output, 'report.json'), 'utf8')).status, 'partial');
});
test('CLI replay uses saved inputs without network calls and preserves source collection dates', async t => {
  const base = workspace(t); const live = join(base, 'live'); const replay = join(base, 'replay');
  const fake = fakeGitHub(); const io = { fetcher: fake.fetcher, stdout: () => undefined, stderr: () => undefined };
  assert.equal(await runCli(['a markdown notes tool', '--out', live], io), 0);
  const previousCalls = fake.calls.length;
  const captures = JSON.parse(readFileSync(join(live, 'captures.json'), 'utf8'));
  assert.equal(await runCli(['a markdown notes tool', '--replay', join(live, 'captures.json'), '--out', replay], io), 0);
  assert.equal(fake.calls.length, previousCalls);
  const report = JSON.parse(readFileSync(join(replay, 'report.json'), 'utf8'));
  assert.equal(report.mode, 'replay');
  assert.deepEqual(report.requests.map((row: { fetched_at: string }) => row.fetched_at), captures.map((row: { fetched_at: string }) => row.fetched_at));
  assert.match(readFileSync(join(replay, 'report.md'), 'utf8'), /未重新联网/u);
});
test('CLI rejects a bad replay hash before reserving output or making network requests', async t => {
  const base = workspace(t), replay = join(base, 'bad.json'), output = join(base, 'not-created');
  writeFileSync(replay, JSON.stringify([{ body: 'modified', sha256: '0'.repeat(64) }]));
  const fake = fakeGitHub();
  assert.equal(await runCli(['a markdown notes tool', '--replay', replay, '--out', output], {
    fetcher: fake.fetcher, stdout: () => undefined, stderr: () => undefined,
  }), 2);
  assert.equal(fake.calls.length, 0); assert.equal(existsSync(output), false);
});

test('actual CLI subprocess retains unknown-license competitors and qualifies unsupported features', async t => {
  const base = workspace(t), output = join(base, 'actual-cli'), snapshot = join(base, 'captures.json');
  const fake = fakeGitHub({ items: [repository(), { ...repository('sample/unknown-license', 2), license: null },
    { ...repository('sample/noassertion', 3), license: { spdx_id: 'NOASSERTION' } }] });
  const fetcher: typeof fetch = async (input, init) => {
    const response = await fake.fetcher(input, init);
    if (String(input).includes('/search/')) return response;
    const data = await response.json() as Record<string, unknown>;
    return Response.json({ ...data, content: Buffer.from('# Features\n\nSync is planned.\n\nSync is not currently supported.\n').toString('base64') });
  };
  const client = new GitHubSearch(fetcher);
  const search = await client.search('markdown notes');
  for (const repo of search.items) await client.readme(repo);
  writeFileSync(snapshot, JSON.stringify(client.captures));
  const child = spawnSync(process.execPath, [resolve('dist/src/cli.js'), 'a markdown notes tool', '--query', 'markdown notes',
    '--replay', snapshot, '--out', output, '--json'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.equal(report.mode, 'replay');
  assert.equal(report.candidates.length, 3);
  assert.equal(report.excluded.length, 0);
  assert.deepEqual(report.candidates.map((item: { license: string | null }) => item.license), ['MIT', null, 'NOASSERTION']);
  for (const repo of report.candidates) {
    assert.equal(repo.readme.status, 'captured');
    assert.equal(repo.analysis.capabilities.find((item: { key: string }) => item.key === 'sync').state, 'author_limited');
  }
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'report.json'), 'utf8')), report);
  assert.match(readFileSync(join(output, 'report.md'), 'utf8'), /任何代码复用须另行核查/u);
});
