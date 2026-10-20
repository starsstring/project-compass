import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runCli} from '../../src/cli.js';
import {planSearch} from '../../src/discovery/query.js';
import {discover} from '../../src/discovery/analyze.js';
import {GitHubSearch} from '../../src/adapters/github/search.js';
import {fakeGitHub,repository} from '../unit/discovery/fixtures.js';
import {reviewFixture} from '../unit/discovery/ai-fixtures.js';

function workspace(t:{after:(fn:()=>void)=>void}){
  const path=mkdtempSync(join(tmpdir(),'compass-planning-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;
}
const silent={stdout:(_text:string)=>undefined,stderr:(_text:string)=>undefined};

test('clarification returns structured output without a report directory or network',async t=>{
  const output=join(workspace(t),'not-created');let calls=0,stdout='';
  const exit=await runCli(['我想逆向一切','--json','--out',output],{...silent,stdout:text=>{stdout+=text;},fetcher:async()=>{calls++;throw Error('network forbidden');}});
  assert.equal(exit,2);assert.equal(calls,0);assert.equal(existsSync(output),false);
  const result=JSON.parse(stdout);assert.equal(result.status,'needs_clarification');
  assert.deepEqual(result.plan.queries,[]);assert.match(result.plan.understanding.clarification,/对象/u);
});

test('actual CLI subprocess gives a concise clarification and does not pretend a search succeeded',t=>{
  const output=join(workspace(t),'not-created');
  const child=spawnSync(process.execPath,[resolve('dist/src/cli.js'),'我想做一个很厉害的软件','--out',output],{encoding:'utf8',timeout:15000});
  assert.ifError(child.error);assert.equal(child.status,2);assert.match(child.stdout,/需要澄清/u);
  assert.doesNotMatch(child.stdout,/GitHub 返回/u);assert.equal(existsSync(output),false);
});

test('a V1-style snapshot automatically retains its old queries even after planner changes',async t=>{
  const base=workspace(t),snapshot=join(base,'legacy-captures.json'),output=join(base,'replay');
  const idea='我想做一个离线加密笔记软件';
  assert.notDeepEqual(planSearch(idea).queries,['notes','note-taking']);
  const client=new GitHubSearch(fakeGitHub().fetcher);
  await discover(planSearch(idea,['notes','note-taking']),client);
  writeFileSync(snapshot,JSON.stringify(client.captures));let calls=0;
  const exit=await runCli([idea,'--replay',snapshot,'--out',output],{...silent,fetcher:async()=>{calls++;throw Error('network forbidden');}});
  assert.equal(exit,0);assert.equal(calls,0);
  const report=JSON.parse(readFileSync(join(output,'report.json'),'utf8'));
  assert.equal(report.plan.method,'replay_queries');assert.deepEqual(report.plan.queries,['notes','note-taking']);
  assert.equal(report.mode,'replay');assert.ok(report.plan.understanding.requirements.some((item:{key:string})=>item.key==='encryption'));
  assert.deepEqual(report.requests.map((item:{fetched_at:string})=>item.fetched_at),client.captures.map(item=>item.fetched_at));
});

test('new constrained reports still use the existing AI file export/import contract',async t=>{
  const base=workspace(t),prepared=join(base,'prepared'),accepted=join(base,'accepted'),reviewPath=join(base,'review.json');
  assert.equal(await runCli(['我想做一个离线加密笔记软件','--prepare-ai','--out',prepared],{...silent,fetcher:fakeGitHub().fetcher}),0);
  const input=JSON.parse(readFileSync(join(prepared,'ai-input.json'),'utf8'));
  assert.equal(input.format,'compass-ai-input-v1');assert.match(input.content.warnings.join(' '),/离线.*加密/u);
  const replayed=join(base,'reexported');
  assert.equal(await runCli(['我想做一个离线加密笔记软件','--replay',join(prepared,'captures.json'),'--prepare-ai','--out',replayed],silent),0);
  assert.deepEqual(JSON.parse(readFileSync(join(replayed,'ai-input.json'),'utf8')),input);
  writeFileSync(reviewPath,JSON.stringify(reviewFixture(input)));let calls=0;
  assert.equal(await runCli(['--import-ai',reviewPath,'--ai-input',join(prepared,'ai-input.json'),'--out',accepted],{...silent,fetcher:async()=>{calls++;throw Error('network forbidden');}}),0);
  assert.equal(calls,0);assert.equal(existsSync(join(accepted,'ai-review.md')),true);
});

test('offline replay keeps attempted candidates instead of selecting an uncaptured README',async t=>{
  const base=workspace(t),snapshot=join(base,'old.json'),output=join(base,'replayed');
  const client=new GitHubSearch(fakeGitHub({items:[{...repository('sample/captured',1),description:'Notes'},
    {...repository('sample/not-captured',2),description:'Offline encrypted notes'}]}).fetcher);
  const search=await client.search('notes');await client.readme(search.items[0]!);
  writeFileSync(snapshot,JSON.stringify(client.captures));
  const exit=await runCli(['我想做一个离线加密笔记软件','--replay',snapshot,'--out',output],silent);
  assert.equal(exit,0);
  const report=JSON.parse(readFileSync(join(output,'report.json'),'utf8'));
  assert.deepEqual(report.candidates.map((item:{full_name:string})=>item.full_name),['sample/captured']);
});

test('taskless or overlong fallback requests clarify before creating files or accessing GitHub', async t => {
  const base = workspace(t);
  const ideas = ['想找一个支持 macOS 的工具', '我现在还不确定做什么项目', '我想做一个' + '无人值守设备状态监控'.repeat(25)];
  for (const [index, idea] of ideas.entries()) {
    const output = join(base, String(index)); let calls = 0, stdout = '';
    const exit = await runCli([idea, '--json', '--out', output], {...silent, stdout: text => { stdout += text; }, fetcher: async () => { calls++; throw Error('network forbidden'); }});
    assert.equal(exit, 2, idea); assert.equal(calls, 0); assert.equal(existsSync(output), false);
    assert.equal(JSON.parse(stdout).status, 'needs_clarification');
  }
});
