import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCandidate } from '../../../src/discovery/evidence.js';
import type { Repository } from '../../../src/discovery/model.js';

const repository: Repository = { id: 1, full_name: 'sample/notes', url: 'https://github.com/sample/notes',
  description: 'A note-taking application.', topics: ['notes'], language: 'TypeScript', license: 'MIT', stars: 0,
  pushed_at: '2026-10-19T00:00:00Z', matched_queries: ['notes'] };
function state(text: string, description = false) {
  const repo = description ? { ...repository, description: text } : repository;
  return analyzeCandidate(repo, description ? null : { content: `# Features\n\n${text}\n`, url: `${repo.url}/blob/main/README.md` })
    .capabilities.find(item => item.key === 'sync')!.state;
}

// External audit sentences, passed through the real Markdown/evidence pipeline.
// This selected corpus is a regression set, not a population accuracy estimate.
const positive = [
  'We support synchronization across devices.', 'Synchronization is available.', 'Our app supports sync.',
  'Sync is enabled by default.', 'Synchronize your notes with the server.', 'The application provides offline sync.',
];
const negativeOrFuture = [
  'We do not support sync.', 'There is no sync.', 'The software works without sync.',
  'Sync is not available yet.', 'Sync is not currently supported.', 'Sync is currently unavailable.',
  'We have no plans to support sync.', 'Sync was removed in version 2.', 'Sync cannot be used on Android.',
  'Sync is disabled and cannot be enabled.', 'Sync is planned.', 'Sync will be supported next year.',
  'Sync is coming soon.', 'Sync is in our roadmap.', 'Sync may be added in future versions.',
  'We hope to offer sync in future.', 'We plan to implement sync.', 'We are working on sync, not released yet.',
];
for (const text of positive) test(`affirmative author text is still recognized: ${text}`, () => {
  assert.equal(state(text), 'author_mentioned');
});
for (const text of negativeOrFuture) test(`absence or future text is not support: ${text}`, () => {
  assert.notEqual(state(text), 'author_mentioned');
});

test('Chinese absence, passive limitations and future work remain qualified', () => {
  for (const text of ['本工具目前尚未支持同步，仍可离线编辑笔记。', '本工具暂未提供同步功能，当前只能离线使用。',
    '同步功能尚未实现，本版本仅能用于离线编辑。', '同步目前不可用，可以继续使用本地文件。',
    '计划在下一版本加入同步功能，目前先提供本地笔记。', '同步功能仍在开发中，尚未发布给用户使用。']) {
    assert.notEqual(state(text), 'author_mentioned', text);
  }
  assert.equal(state('本工具已经支持同步功能，用户可以在多台设备间使用笔记。'), 'author_mentioned');
});

test('the same guards apply to GitHub descriptions', () => {
  for (const text of negativeOrFuture) assert.notEqual(state(text, true), 'author_mentioned', text);
  assert.equal(state('A notes application with sync across devices.', true), 'author_mentioned');
});

test('nested roadmap headings remain future context until a peer section starts', () => {
  const analysis = analyzeCandidate(repository, { url: `${repository.url}/blob/main/README.md`, content:
    '# Roadmap\n\n## Next release\n\nSynchronize your notes with the server.\n\n# Features\n\nIt supports Markdown editing with local files.\n' });
  assert.equal(analysis.capabilities.find(item => item.key === 'sync')!.state, 'not_established');
  assert.equal(analysis.capabilities.find(item => item.key === 'markdown')!.state, 'author_mentioned');
});

test('a second mention can limit a capability in the same sentence', () => {
  assert.equal(state('We support sync on desktop, but sync is not supported on mobile.'), 'author_limited');
  assert.equal(state('同步在桌面上可以使用，但同步在此版本不支持。'), 'author_limited');
});

test('unrelated negations do not suppress an affirmative capability', () => {
  for (const text of ['Sync is not limited to desktop devices.', 'We support sync without overwriting existing files.',
    'Sync is not only supported but also enabled by default.']) assert.equal(state(text), 'author_mentioned', text);
});
