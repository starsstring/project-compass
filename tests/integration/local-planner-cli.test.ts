import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { runCli } from '../../src/cli.js';
import { fakeGitHub } from '../unit/discovery/fixtures.js';
import type { DiscoveryReport, ExternalSemanticPlan } from '../../src/discovery/model.js';

const idea = '找一个离线 Markdown 笔记工具';
const model = 'qwen2.5:7b';
const basePlan = (): ExternalSemanticPlan => ({
  version: 1, idea, intent: 'find_project',
  core: { object: 'markdown notes', action: 'editor' },
  alternative: { object: 'offline notes', action: 'editor' },
  required_conditions: ['支持 Markdown'], excluded_conditions: ['云端上传'],
  unknowns: ['是否真的离线'], clarification: null,
});
function fixture(t: { after: (f: () => void) => void }) {
  const base = resolve('.tools/local-planner-tests'); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'case-'));
  t.after(() => { assert.ok(resolve(dir).startsWith(base + sep)); rmSync(dir, { recursive: true, force: true }); });
  return { dir, out: join(dir, 'report') };
}
function respond(plan: unknown = basePlan(), status = 200) {
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return status === 200
      ? Response.json({ done: true, response: JSON.stringify(plan) })
      : Response.json({ error: 'mocked model missing' }, { status });
  };
  return { calls, fetcher };
}
const silent = () => ({ stdout: () => undefined, stderr: () => undefined });

test('one Chinese idea uses a local JSON plan and bounded GitHub search without manually creating JSON', async t => {
  const w = fixture(t), ollama = respond(), github = fakeGitHub();
  assert.equal(await runCli([idea, '--local-model', model, '--out', w.out], {
    ...silent(), fetcher: github.fetcher, plannerFetcher: ollama.fetcher,
  }), 0);
  assert.equal(ollama.calls.length, 1);
  assert.equal(ollama.calls[0]!.url, 'http://127.0.0.1:11434/api/generate');
  const options = ollama.calls[0]!.options!;
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
  assert.equal(new Headers(options.headers).has('Authorization'), false);
  assert.deepEqual(JSON.parse(String(options.body)).model, model);
  assert.equal(JSON.parse(String(options.body)).stream, false);
  const report = JSON.parse(readFileSync(join(w.out, 'report.json'), 'utf8')) as DiscoveryReport;
  assert.equal(report.plan.semantic?.source, 'local_model');
  assert.equal(report.plan.semantic?.input.idea, idea);
  assert.deepEqual(report.plan.semantic?.input.excluded_conditions, ['云端上传']);
  assert.ok(report.candidates.every(x => x.external_conditions?.every(c => c.status === 'unknown')));
  assert.ok(github.calls.length <= 7);
  const markdown = readFileSync(join(w.out, 'report.md'), 'utf8');
  assert.match(markdown, /本地 Ollama 模型生成/u);
  assert.doesNotMatch(markdown, /未调用语言模型/u);
});

test('an unconfigured model is never contacted in ordinary default mode', async t => {
  const w = fixture(t), github = fakeGitHub(), ollama = respond();
  assert.equal(await runCli([idea, '--out', w.out], { ...silent(),
    fetcher: github.fetcher, plannerFetcher: ollama.fetcher }), 0);
  assert.equal(ollama.calls.length, 0);
  const report = JSON.parse(readFileSync(join(w.out, 'report.json'), 'utf8')) as DiscoveryReport;
  assert.equal(report.plan.semantic, undefined);
});

test('AI export discloses that local Ollama was called for planning, not for exported analysis', async t => {
  const w = fixture(t), ollama = respond(), github = fakeGitHub();
  let diagnostics = '';
  assert.equal(await runCli([idea, '--local-model', model, '--prepare-ai', '--out', w.out], {
    fetcher: github.fetcher, plannerFetcher: ollama.fetcher,
    stdout: () => undefined, stderr: text => { diagnostics += text; },
  }), 0);
  const instructions = readFileSync(join(w.out, 'ai-instructions.md'), 'utf8');
  assert.match(instructions, /曾调用.*本地 Ollama 模型生成检索计划/u);
  assert.match(instructions, /导出步骤没有再次调用模型/u);
  assert.doesNotMatch(instructions, /本程序未调用模型/u);
  assert.match(diagnostics, /已调用本地 Ollama 生成检索计划/u);
  assert.match(diagnostics, /导出步骤未再次调用分析模型/u);
  assert.doesNotMatch(diagnostics, /未调用模型或发送资料/u);
  assert.equal(ollama.calls.length, 1);
});

test('model-free AI export keeps accurate no-model disclosure', async t => {
  const w = fixture(t), ollama = respond(), github = fakeGitHub();
  let diagnostics = '';
  assert.equal(await runCli([idea, '--prepare-ai', '--out', w.out], {
    fetcher: github.fetcher, plannerFetcher: ollama.fetcher,
    stdout: () => undefined, stderr: text => { diagnostics += text; },
  }), 0);
  const instructions = readFileSync(join(w.out, 'ai-instructions.md'), 'utf8');
  assert.match(instructions, /未通过 Compass 调用语义规划模型/u);
  assert.match(instructions, /导出步骤也没有调用分析模型/u);
  assert.match(diagnostics, /本次未调用语义规划模型/u);
  assert.equal(ollama.calls.length, 0);
});

test('local model and replay or explicit planning modes reject before all networking and file writes', async t => {
  const w = fixture(t), github = fakeGitHub(), ollama = respond();
  for (const extra of [['--replay', join(w.dir, 'missing.json')], ['--query', 'notes'], ['--semantic-plan', 'x.json']]) {
    const result = await runCli([idea, '--local-model', model, ...extra, '--out', w.out], {
      ...silent(), fetcher: github.fetcher, plannerFetcher: ollama.fetcher,
    });
    assert.equal(result, 2);
  }
  assert.equal(github.calls.length, 0); assert.equal(ollama.calls.length, 0);
  assert.equal(existsSync(w.out), false);
});

test('invalid local model responses and absent models fail before GitHub or reports', async t => {
  const cases = [respond(basePlan(), 404),
    respond({ ...basePlan(), idea: 'tampered original idea' }),
    respond({ ...basePlan(), core: { object: 'bad or query', action: 'editor' } }),
    respond({ ...basePlan(), required_conditions: [], excluded_conditions: ['cloud'], added_field: true })];
  for (const ollama of cases) {
    const w = fixture(t), github = fakeGitHub();
    assert.notEqual(await runCli([idea, '--local-model', model, '--out', w.out], {
      ...silent(), fetcher: github.fetcher, plannerFetcher: ollama.fetcher,
    }), 0);
    assert.equal(github.calls.length, 0);
    assert.equal(existsSync(w.out), false);
  }
});

test('invalid model name and invalid ideas trigger no network', async t => {
  const w = fixture(t), github = fakeGitHub(), ollama = respond();
  for (const args of [
    [idea, '--local-model', 'bad model', '--out', w.out],
    ['ab', '--local-model', model, '--out', w.out],
  ]) {
    assert.equal(await runCli(args, { ...silent(), fetcher: github.fetcher, plannerFetcher: ollama.fetcher }), 2);
  }
  assert.equal(ollama.calls.length, 0); assert.equal(github.calls.length, 0);
});

test('local model clarification does not contact GitHub or create a report', async t => {
  const w = fixture(t), github = fakeGitHub(), ollama = respond({
    ...basePlan(), core: null, alternative: null, intent: 'unclear',
    clarification: '请说明你要找的软件主要做什么？',
  });
  let output = '';
  assert.equal(await runCli([idea, '--local-model', model, '--out', w.out, '--json'], {
    fetcher: github.fetcher, plannerFetcher: ollama.fetcher, stdout: text => { output += text; },
    stderr: () => undefined,
  }), 2);
  assert.equal(JSON.parse(output).status, 'needs_clarification');
  assert.equal(github.calls.length, 0);
  assert.equal(existsSync(w.out), false);
});

test('model responses cannot redirect local requests to an external URL', async t => {
  const w = fixture(t), urls: string[] = [];
  const fake: typeof fetch = async input => {
    urls.push(String(input));
    throw Error('refused');
  };
  assert.equal(await runCli([idea, '--local-model', model, '--out', w.out], {
    ...silent(), fetcher: fake, plannerFetcher: fake,
  }), 5);
  assert.deepEqual(urls, ['http://127.0.0.1:11434/api/generate']);
});
