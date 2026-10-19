// Explicit, opt-in live smoke run. Read-only public requests; not a demand benchmark.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runCli } from '../dist/src/cli.js';

const directory = resolve('.compass/v1-validation', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(directory, { recursive: true });
const cases = [
  ['markdown-notes', '我想做一个本地 Markdown 笔记工具'],
  ['serial-debugger', '面向开发板的串口调试工具'],
  ['resumable-download', '支持断点续传的下载工具'],
];
const results = [];
for (const [name, idea] of cases) {
  const output = join(directory, name);
  let diagnostics = '';
  const exit = await runCli([idea, '--out', output], { stdout: () => undefined, stderr: text => { diagnostics += text; } });
  let report;
  try { report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8')); } catch { /* failure recorded by CLI */ }
  const links = [];
  for (const candidate of report?.candidates.slice(0, 2) ?? []) {
    try {
      const response = await fetch(candidate.url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Project-Compass-V1-LinkCheck' } });
      links.push({ url: candidate.url, status: response.status, checked_at: new Date().toISOString() });
      await response.body?.cancel();
    } catch { links.push({ url: candidate.url, status: null, error: 'Link request failed' }); }
  }
  const result = { name, idea, exit, directory: output, status: report?.status ?? 'failed',
    queries: report?.plan.queries ?? [], candidates: report?.candidates.map(repo => ({ name: repo.full_name, url: repo.url,
      relevance: repo.relevance.level, readme: repo.readme.status })) ?? [], requests: report?.requests.length ?? 0, links, diagnostics };
  results.push(result);
  console.log(JSON.stringify(result, null, 2));
}
let failureDiagnostics = '';
const unsupportedExit = await runCli(['面向校园宠物领养的互助系统'], { stdout: () => undefined, stderr: text => { failureDiagnostics += text; } });
const summary = { kind: 'v1_live_smoke_not_market_validation', directory, completed_at: new Date().toISOString(), results,
  failure_case: { idea: '面向校园宠物领养的互助系统', exit: unsupportedExit, diagnostics: failureDiagnostics },
  manual_relevance_review: 'required_separately' };
await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(`Saved: ${join(directory, 'summary.json')}`);
if (results.some(result => result.exit !== 0 || result.candidates.length === 0 || result.links.some(link => link.status !== 200)) || unsupportedExit !== 2) process.exitCode = 1;
