import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cases from '../fixtures/semantic-validation-cases.json' with { type: 'json' };
import { runCli } from '../../src/cli.js';
import type { DiscoveryReport } from '../../src/discovery/model.js';
import { fakeGitHub, repository } from '../unit/discovery/fixtures.js';

// Created after d73d7f1, rather than used to tune the planner. The synthetic
// server exercises CLI contracts; it is not candidate-quality or blind evidence.
for (const item of cases.cases) test(`post-freeze ${item.id}: ${item.coverage} (synthetic transport)`, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'compass-post-freeze-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'semantic.json'), output = join(dir, 'report'); writeFileSync(file, JSON.stringify(item.plan));
  const repo = { ...repository(`synthetic/${item.id.toLowerCase()}`, 1),
    description: item.plan.intent === 'learn' ? 'A curated list and course notes for model checking.' : 'Synthetic data with cloud features planned; not a real candidate.' };
  const fake = fakeGitHub({ items: [repo], ...(item.coverage === 'privacy_readme404' ? { readmeStatus: 404 } : {}) });
  let calls = 0, searches = 0, stdout = '';
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    if (String(input).includes('/search/') && ++searches === 1 && item.coverage === 'long_tail_forced_empty_then_fallback') {
      return Response.json({ total_count: 0, incomplete_results: false, items: [] });
    }
    return fake.fetcher(input, init);
  };
  const exit = await runCli([item.plan.idea, '--semantic-plan', file, '--out', output, '--json'], {
    fetcher, stdout: text => { stdout += text; }, stderr: () => undefined,
  });
  if (item.plan.clarification) {
    assert.equal(exit, 2); assert.equal(calls, 0); assert.equal(existsSync(output), false);
    assert.equal(JSON.parse(stdout).status, 'needs_clarification');
    t.diagnostic(JSON.stringify({ validation_case: item.id, exit, status: 'needs_clarification', queries: [], search: 0, readme: 0, directory_created: false }));
    return;
  }
  assert.equal(exit, item.coverage === 'privacy_readme404' ? 5 : 0);
  const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8')) as DiscoveryReport;
  assert.deepEqual(report.plan.queries, item.expected_queries);
  assert.equal(report.plan.understanding!.intent, item.plan.intent);
  assert.deepEqual(report.plan.semantic!.input.required_conditions, item.plan.required_conditions);
  assert.deepEqual(report.plan.semantic!.input.excluded_conditions, item.plan.excluded_conditions);
  assert.deepEqual(report.plan.semantic!.input.unknowns, item.plan.unknowns);
  assert.equal(report.candidates.length, 1);
  assert.ok(report.candidates[0]!.external_conditions!.every(c => c.status === 'unknown'));
  assert.equal(report.query_execution!.fallback.attempted, item.coverage === 'long_tail_forced_empty_then_fallback');
  assert.equal(searches, item.expected_queries.length); assert.equal(calls, searches + 1);
  assert.ok(searches <= 2 && calls <= 7);
  t.diagnostic(JSON.stringify({ validation_case: item.id, exit, status: report.status, queries: report.plan.queries,
    search: searches, readme: calls - searches, fallback: report.query_execution!.fallback.attempted, intent: report.plan.understanding!.intent }));
});
