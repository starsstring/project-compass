import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubSearch } from '../../../src/adapters/github/search.js';
import { discover } from '../../../src/discovery/analyze.js';
import { renderDiscovery } from '../../../src/discovery/markdown.js';
import { planSearch } from '../../../src/discovery/query.js';
import type { DiscoveryReport } from '../../../src/discovery/model.js';
import { fakeGitHub } from './fixtures.js';

async function sample(options: Parameters<typeof fakeGitHub>[0] = {}): Promise<DiscoveryReport> {
  return discover(planSearch('我想做一个 Markdown 笔记工具'), new GitHubSearch(fakeGitHub(options).fetcher));
}

function quickSection(markdown: string): string {
  return markdown.split('## 一分钟结论（初步调查，非最终决策)')[1]?.split('报告生成时间：')[0] ?? '';
}

test('quick summary precedes technical report and cites author-mentioned evidence without certifying it', async () => {
  const markdown = renderDiscovery(await sample());
  const brief = quickSection(markdown);
  assert.ok(brief.length > 0);
  assert.ok(markdown.indexOf('## 一分钟结论') < markdown.indexOf('## 检索记录'));
  assert.match(brief, /sample\/markdown-notes/u);
  assert.match(brief, /作者材料提及/u);
  assert.match(brief, /\[E\d+\]\(https:\/\/github\.com\//u);
  assert.match(brief, /没有安装实测/u);
  assert.match(brief, /建议先做的一件事/u);
  assert.match(brief, /复用或停止条件/u);
  assert.doesNotMatch(brief, /成功率\s*\d+%/u);
});

test('zero results show uncertainty and no invented project or direction', async () => {
  const markdown = renderDiscovery(await sample({ items: [] }));
  const brief = quickSection(markdown);
  assert.match(brief, /本轮未获得可展示的候选/u);
  assert.match(brief, /不能据此认定没有竞品/u);
  assert.match(brief, /先核对原句与实际检索词/u);
  assert.doesNotMatch(brief, /sample\/markdown-notes/u);
});

test('partial and replay are visibly distinguished in the first screen', async () => {
  const report = await sample({ readmeStatus: 404, incomplete: true });
  assert.equal(report.status, 'partial');
  assert.match(quickSection(renderDiscovery(report)), /部分完成，结果可能缺失/u);
  const replay = { ...report, mode: 'replay' as const };
  assert.match(quickSection(renderDiscovery(replay)), /离线重放，没有重新联网/u);
});

test('external conditions are displayed as unverified, not treated as features', async () => {
  const base = await sample();
  const report: DiscoveryReport = { ...base, plan: { ...base.plan, semantic: {
    source: 'external', verification: 'unverified', sha256: 'f'.repeat(64),
    input: { version: 1, idea: base.plan.idea, intent: 'find_project',
      core: { object: 'markdown', action: 'notes' }, required_conditions: ['必须离线存储'],
      excluded_conditions: ['上传到云端'], unknowns: [], clarification: null },
  } } };
  const brief = quickSection(renderDiscovery(report));
  assert.match(brief, /必须离线存储.*尚未逐项验收/u);
  assert.doesNotMatch(brief, /已满足必须离线存储/u);
});

test('unsafe idea, repository names and recommended actions are Markdown-escaped', async () => {
  const original = await sample();
  const candidate = original.candidates[0]!;
  const direction = original.directions[0]!;
  const poisoned: DiscoveryReport = {
    ...original, plan: { ...original.plan, idea: '**标记** <script>hi</script>' },
    candidates: [{ ...candidate, full_name: '**fake** | name' }],
    directions: [{ ...direction, validation: '[点击](https://evil.example) <script>' }],
  };
  const markdown = renderDiscovery(poisoned);
  const brief = quickSection(markdown);
  assert.match(brief, /\\\*\\\*fake\\\*\\\*/u);
  assert.match(brief, /\\\[点击\\\]/u);
  assert.match(brief, /&lt;script&gt;/u);
  assert.doesNotMatch(brief, /\[点击\]\(https:\/\/evil\.example\)/u);
});
