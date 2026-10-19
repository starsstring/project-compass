import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHubSearch } from '../../../src/adapters/github/search.js';
import { planSearch } from '../../../src/discovery/query.js';
import { discover } from '../../../src/discovery/analyze.js';
import { renderDiscovery } from '../../../src/discovery/markdown.js';
import { DiscoveryError } from '../../../src/discovery/model.js';
import { repository, fakeGitHub } from './fixtures.js';

test('Chinese ideas produce inspectable queries in three different topics', () => {
  assert.deepEqual(planSearch('我想做一个本地 Markdown 笔记工具').queries, ['markdown notes', 'markdown note-taking']);
  assert.deepEqual(planSearch('面向开发板的串口调试工具').queries, ['serial monitor', 'serial terminal']);
  assert.deepEqual(planSearch('支持断点续传的下载工具').queries, ['download manager', 'download resume']);
});
test('English free text and explicit queries do not require a model or repository fixtures', () => {
  assert.deepEqual(planSearch('I want to build a screenshot tool').queries, ['screenshot']);
  assert.deepEqual(planSearch('一种尚未识别的全新方向', ['aquarium controller']).queries, ['aquarium controller']);
  assert.deepEqual(planSearch('I want to build a DNS debugger').queries, ['dns debugger']);
});
test('unknown Chinese input, blank query and oversized input fail visibly', () => {
  for (const action of [() => planSearch(''), () => planSearch('一种尚未识别的全新方向'), () => planSearch('a'.repeat(2001)),
    () => planSearch('a valid idea', ['']), () => planSearch('a valid idea', ['a', 'b', 'c'])]) assert.throws(action, DiscoveryError);
});
test('deduplicates repositories across queries and does not rank by stars', async () => {
  const fake = fakeGitHub({ items: [repository('sample/unrelated', 2, 999999), repository()] });
  // Make the high-star candidate textually unrelated.
  const fetcher: typeof fetch = async (input, init) => {
    const response = await fake.fetcher(input, init);
    if (String(input).includes('/search/')) {
      const data = await response.json() as { items: ReturnType<typeof repository>[] };
      data.items[0]!.description = 'A synthetic database'; data.items[0]!.topics = ['database'];
      return Response.json({ ...data, total_count: 2, incomplete_results: false });
    }
    return response;
  };
  const client = new GitHubSearch(fetcher);
  const report = await discover(planSearch('我想做一个 Markdown 笔记工具'), client);
  assert.equal(report.candidates.length, 2);
  assert.equal(report.candidates[0]!.full_name, 'sample/markdown-notes');
  assert.equal(report.candidates[1]!.relevance.level, '待人工核查');
  assert.equal(report.candidates[0]!.matched_queries.length, 2);
  assert.equal(fake.calls.length, 4);
  for (const call of fake.calls) {
    assert.equal(new URL(call.url).origin, 'https://api.github.com');
    assert.equal(call.init?.method, 'GET');
    assert.equal(call.init?.redirect, 'error');
    assert.equal(new Headers(call.init?.headers).has('Authorization'), false);
  }
  assert.ok(report.directions.every(direction => direction.basis.every(url => report.candidates.some(repo => repo.url === url))));
});
test('captures exact API bodies and hashes without embedding bodies in the report', async () => {
  const fake = fakeGitHub(); const client = new GitHubSearch(fake.fetcher);
  const report = await discover(planSearch('a markdown notes tool', ['markdown notes']), client);
  assert.equal(report.status, 'complete');
  assert.equal(report.candidates[0]!.readme.status, 'captured');
  assert.equal(report.requests[0]!.sha256, createHash('sha256').update(client.captures[0]!.body).digest('hex'));
  assert.equal('body' in report.requests[0]!, false);
  assert.equal(report.candidates[0]!.readme.blob_sha, 'a'.repeat(40));
});
test('empty results mean incomplete knowledge, not an absence of competition', async () => {
  const fake = fakeGitHub({ items: [] });
  const report = await discover(planSearch('some unusual idea', ['no-such-keyword']), new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates.length, 0); assert.equal(report.directions.length, 0);
  assert.match(report.warnings.join(), /不代表没有竞品/u);
});
test('license-unknown public projects and course materials remain visible as exclusions', async () => {
  const fake = fakeGitHub({ items: [repository(), { ...repository('sample/unknown-license', 2), license: null },
    { ...repository('sample/course', 3), description: 'The raw markdown notes for a university course.' }] });
  const report = await discover(planSearch('a markdown notes tool', ['markdown notes']), new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates.length, 1); assert.equal(report.excluded.length, 2);
  assert.match(renderDiscovery(report), /本次排除的结果/u);
});
test('exact task phrases outrank incidental single-keyword matches', async () => {
  const fake = fakeGitHub({ items: [{ ...repository('sample/battery-driver', 2), description: 'Battery Monitor driver for serial battery', topics: ['serial'] },
    { ...repository('sample/serial-tool', 3), description: 'Cross-platform serial monitor and terminal', topics: ['serial'] }] });
  const report = await discover(planSearch('面向开发板的串口调试工具'), new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates[0]!.full_name, 'sample/serial-tool');
  assert.equal(report.candidates[1]!.relevance.level, '部分文本关联');
});
test('missing README and incomplete search are reported as partial', async () => {
  const fake = fakeGitHub({ readmeStatus: 404, incomplete: true });
  const report = await discover(planSearch('a markdown notes tool', ['notes']), new GitHubSearch(fake.fetcher));
  assert.equal(report.status, 'partial');
  assert.equal(report.candidates[0]!.readme.author_excerpt, null);
  assert.match(report.candidates[0]!.readme.note, /HTTP 404/u);
});
test('rate limits stop further network requests and expose reset information', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response('{"message":"API rate limit exceeded"}',
    { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792407800' } }); };
  const client = new GitHubSearch(fetcher);
  await assert.rejects(() => client.search('notes'), /1792407800/u);
  await assert.rejects(() => client.search('notes'), /限流/u);
  assert.equal(calls, 1); assert.equal(client.captures[0]!.status, 403);
});
test('rate limit after a successful search preserves candidates and a partial report', async () => {
  const fake = fakeGitHub();
  const fetcher: typeof fetch = async (input, init) => String(input).includes('/search/') ? fake.fetcher(input, init)
    : new Response('{}', { status: 429, headers: { 'retry-after': '60' } });
  const report = await discover(planSearch('a markdown notes tool', ['notes']), new GitHubSearch(fetcher));
  assert.equal(report.status, 'partial'); assert.equal(report.candidates.length, 1);
  assert.match(report.candidates[0]!.readme.note, /RATE_LIMIT/u);
});
test('network failures never generate a successful no-competitor report', async () => {
  const fetcher: typeof fetch = async () => { throw new Error('a hidden internal network message'); };
  await assert.rejects(() => discover(planSearch('a markdown notes tool'), new GitHubSearch(fetcher)), error =>
    error instanceof DiscoveryError && error.code === 'NETWORK' && !error.message.includes('hidden'));
});
test('malformed JSON, wrong shapes and spoofed repository links are rejected', async () => {
  for (const body of ['not json', '{}', JSON.stringify({ total_count: 1, incomplete_results: false,
    items: [{ ...repository(), html_url: 'https://evil.example/not-github' }] })]) {
    const fetcher: typeof fetch = async () => new Response(body);
    await assert.rejects(() => new GitHubSearch(fetcher).search('notes'), error => error instanceof DiscoveryError && error.code === 'BAD_RESPONSE');
  }
});
test('oversized streamed response is bounded even without Content-Length', async () => {
  const fetcher: typeof fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.close();
  } }));
  await assert.rejects(() => new GitHubSearch(fetcher).search('notes'), /2 MiB/u);
});
test('untrusted Markdown, HTML and terminal control sequences are escaped', async () => {
  const fake = fakeGitHub({ items: [{ ...repository(), description: '<script>alert(1)</script> [click](javascript:evil)\u001b[31m' }] });
  const report = await discover(planSearch('a markdown notes tool', ['notes']), new GitHubSearch(fake.fetcher));
  const markdown = renderDiscovery(report);
  assert.equal(markdown.includes('<script>'), false); assert.equal(markdown.includes('\u001b'), false);
  assert.equal(markdown.includes('[click](javascript:evil)'), false);
  assert.match(markdown, /作者简介（功能声称）/u); assert.match(markdown, /假设/u);
  assert.match(markdown, /材料未确认/u); assert.match(markdown, /不能解释为软件没有/u);
  report.candidates[0]!.readme.url = 'https://github.com/sample/markdown-notes/blob/main/README).md';
  assert.match(renderDiscovery(report), /README%29\.md/u);
});
