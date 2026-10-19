import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { runCli } from '../../src/cli.js';
import { fakeGitHub } from '../unit/discovery/fixtures.js';

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
