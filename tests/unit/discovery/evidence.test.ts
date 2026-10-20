import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyzeCandidate, extractProse } from '../../../src/discovery/evidence.js';
import { readmeExcerpt, discover } from '../../../src/discovery/analyze.js';
import { planSearch } from '../../../src/discovery/query.js';
import { GitHubSearch } from '../../../src/adapters/github/search.js';
import { replayGitHub } from '../../../src/adapters/github/replay.js';
import { buildDirections } from '../../../src/discovery/directions.js';
import type { Repository, Candidate, ApiCapture } from '../../../src/discovery/model.js';

const repo: Repository = { id: 1, full_name: 'sample/engine', url: 'https://github.com/sample/engine',
  description: 'A Python research framework.', language: 'Python', license: 'MIT', stars: 0,
  topics: [], pushed_at: '2026-10-19T00:00:00Z', matched_queries: ['backtesting'] };
const readme = (content: string) => ({ content, url: `${repo.url}/blob/main/README.md` });
const state = (content: string, key: string) => analyzeCandidate(repo, readme(content)).capabilities.find(item => item.key === key)?.state;

test('headings, fenced/indented code, badges and images do not establish capabilities', () => {
  const content = '# Backtesting\n\n```python\nfrom backtesting import Backtest\n# live trading\n```\n\n    print("portfolio optimization")\n\n![Download and resume](image.png)\n';
  assert.equal(state(content, 'backtest'), 'not_established');
  assert.equal(state(content, 'live'), 'not_established');
  assert.equal(state(content, 'optimize'), 'not_established');
  assert.equal(readmeExcerpt(content, ['backtesting']), null);
});
test('real prose and feature lists produce cited capabilities rather than import lines', () => {
  const content = '# Engine\n\nThis framework supports strategy backtesting and parameter optimization.\n\n- It provides [transaction costs](costs.md) and slippage modeling.\n- It exports portfolio charts for comparison.\n';
  const result = analyzeCandidate(repo, readme(content));
  for (const key of ['backtest', 'optimize', 'costs', 'portfolio', 'report']) {
    const capability = result.capabilities.find(item => item.key === key)!;
    assert.equal(capability.state, 'author_mentioned', key);
    const source = result.evidence.find(item => item.id === capability.evidence_ids[0])!;
    assert.match(source.url, /#L\d+-L\d+$/u);
    assert.equal(source.text_sha256, createHash('sha256').update(source.text).digest('hex'));
    assert.equal(source.text.includes('costs.md'), false);
  }
  assert.match(readmeExcerpt(content, ['backtest'])!, /supports strategy backtesting/u);
});
test('negative support and conflicting author text remain limited, never false support', () => {
  assert.equal(state('This framework does not support live trading.', 'live'), 'author_limited');
  assert.equal(state('Live trading is not supported in this version.', 'live'), 'author_limited');
  assert.equal(state('本框架当前不支持实盘交易，但提供独立的研究入口。', 'live'), 'author_limited');
  const result = analyzeCandidate(repo, readme('This framework supports live trading.\n\nLive trading is not supported under the demo adapter.'));
  assert.equal(result.capabilities.find(item => item.key === 'live')!.evidence_ids.length, 2);
});
test('no-overwrite behavior does not negate Markdown export capabilities', () => {
  const content = 'It exports Markdown notes.\n\nThe tool does not overwrite markdown files when exporting.';
  assert.equal(state(content, 'markdown'), 'author_mentioned');
  assert.equal(state(content, 'transfer'), 'author_mentioned');
});
test('planned features and README tables cannot turn unknowns into support', () => {
  assert.equal(state('# Roadmap\n\nAdd live trading and parameter optimization next year.', 'live'), 'not_established');
  assert.equal(state('We plan to support live trading in a future release.', 'live'), 'not_established');
  assert.equal(state('| Feature | Status |\n|---|---|\n| live trading | No |', 'live'), 'not_established');
});
test('navigation link titles do not establish data migration or live trading support', () => {
  const content = '- [Upgrading and Migration](docs/migration.md)\n- [Live trading guide](docs/live.md)\n\n**Import and export**\n';
  assert.equal(state(content, 'transfer'), 'not_established');
  assert.equal(state(content, 'live'), 'not_established');
});

test('source directory descriptions do not establish product integrity or resume capabilities', () => {
  const content = '# Project layout\n\n- `Sources/Utility`: checksum and resume-data utilities\n- src/downloader: download and checksum helpers\n';
  assert.equal(state(content, 'integrity'), 'not_established');
  assert.equal(state(content, 'resume'), 'not_established');
  assert.equal(state(content, 'download'), 'not_established');
  assert.equal(state('The download manager verifies checksums of downloaded files.', 'integrity'), 'author_mentioned');
});

test('generic collaboration evidence is labeled without claiming real-time editing', () => {
  const analysis = analyzeCandidate(repo, readme('- **Collaboration**: Invite other users to access your vaults'));
  const capability = analysis.capabilities.find(item => item.key === 'collaborate')!;
  assert.equal(capability.state, 'author_mentioned');
  assert.equal(capability.label, '协作');
  assert.doesNotMatch(analysis.summary, /实时/u);
  assert.equal(state('This application supports real-time collaborative editing.', 'collaborate'), 'author_mentioned');
});
test('license boilerplate and installation text do not become functional limitations', () => {
  const result = analyzeCandidate(repo, readme('# Installation\n\nOnly install the data dependencies.\n\n# License\n\nTHE SOFTWARE IS PROVIDED AS IS WITHOUT WARRANTY, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY.'));
  assert.equal(result.limitations.length, 0);
  assert.equal(result.capabilities.find(item => item.key === 'data')!.state, 'not_established');
});
test('RST body prose is extracted while its literal code is omitted', () => {
  const prose = extractProse('Engine\n======\n\nLive Trading and backtesting platform written in Python.\n\nExample::\n\n    from engine import Backtest\n', repo.url);
  assert.ok(prose.some(item => item.text.includes('platform written in Python')));
  assert.ok(prose.every(item => !item.text.includes('from engine')));
});
test('nested quote and list evidence ranges contain the actual source words', () => {
  const content = '# Demo\n\n> Supports serial port\n> monitoring and chart plotting.\n\n- Nested capability:\n  supports batch downloads\n  and resume transfers.\n';
  const prose = extractProse(content, repo.url);
  for (const unit of prose) {
    const [, first, last] = unit.url.match(/#L(\d+)-L(\d+)$/u)!;
    const sourceRange = content.split('\n').slice(Number(first) - 1, Number(last)).join(' ').replace(/[>#*-]/gu, '').replace(/\s+/gu, ' ').trim();
    assert.ok(sourceRange.includes(unit.text), JSON.stringify({ unit, sourceRange }));
  }
});
test('quant scope is disclosed and not silently restricted to a market', () => {
  const plan = planSearch('开发一个量化软件');
  assert.match(plan.warnings.join(), /未覆盖所有行情数据/u);
  assert.match(plan.warnings.join(), /不默认限定 A 股或实盘/u);
});

function candidate(id: number, content: string): Candidate {
  const repository = { ...repo, id, full_name: `sample/engine-${id}`, url: `https://github.com/sample/engine-${id}` };
  return { ...repository, analysis: analyzeCandidate(repository, { content, url: `${repository.url}/blob/main/README.md` }),
    readme: { status: 'captured', url: null, blob_sha: null, content_sha256: null, author_excerpt: null, note: '' },
    relevance: { level: '较强文本关联', matched_terms: ['backtest'], reason: 'Synthetic test input.' }, unknowns: [] };
}
test('cross-engine recommendation requires two evidenced engines and cites their exact material', () => {
  const plan = planSearch('开发一个量化软件');
  const one = candidate(1, 'It supports strategy backtesting with transaction costs.');
  const two = candidate(2, 'It supports event-driven backtesting and portfolios.');
  assert.equal(buildDirections(plan, [one]).some(item => item.title.includes('跨引擎')), false);
  const directions = buildDirections(plan, [one, two]);
  const cross = directions.find(item => item.title.includes('跨引擎'))!;
  assert.match(cross.proposed_change, /sample\/engine-1 与 sample\/engine-2/u);
  assert.match(cross.validation, /十根构造 K 线/u);
  assert.ok(cross.evidence.every(ref => [one, two].find(item => item.full_name === ref.repository)!.analysis.evidence.some(item => item.id === ref.evidence_id && item.url === ref.url)));
  assert.ok(cross.stop_if.length > 0);
  assert.equal(buildDirections(plan, [candidate(3, 'This tool generates charts from existing data.')]).some(item => item.title.includes('回测引擎')), false);
});

function capture(url: string, body: unknown, status = 200): ApiCapture {
  const text = JSON.stringify(body);
  return { url, body: text, sha256: createHash('sha256').update(text).digest('hex'), fetched_at: '2026-10-18T08:00:00Z',
    status, remaining: '9', reset: null, retry_after: null };
}
test('replay preserves collection times, hashes and mode without falling back to fetch', async () => {
  const plan = planSearch('an unusual project idea', ['unique-query']);
  const params = new URLSearchParams({ q: 'unique-query archived:false fork:false', per_page: '10' });
  const original = capture(`https://api.github.com/search/repositories?${params}`, { items: [], total_count: 0, incomplete_results: false });
  const client = replayGitHub([original]);
  const report = await discover(plan, client);
  assert.equal(report.mode, 'replay');
  assert.equal(report.requests[0]!.fetched_at, original.fetched_at);
  assert.equal(report.requests[0]!.sha256, original.sha256);
  await assert.rejects(() => client.search('not-in-snapshot'), /不会联网补齐/u);
});
test('replay refuses altered hashes, foreign hosts, duplicate records and invalid collection dates', () => {
  const original = capture('https://api.github.com/search/repositories?q=test', {});
  for (const input of [[{ ...original, body: 'modified' }], [{ ...original, url: 'https://evil.example/search' }], [original, original],
    [{ ...original, fetched_at: 'tomorrow' }], []]) assert.throws(() => replayGitHub(input));
});
