import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { runCli } from '../../src/cli.js';
import { fakeGitHub } from '../unit/discovery/fixtures.js';
import { aiFixture, reviewFixture } from '../unit/discovery/ai-fixtures.js';
import type { AiInput } from '../../src/advice/model.js';

function workspace(t:{after:(fn:()=>void)=>void}) {
  const base=resolve('.tools/ai-review-tests'); mkdirSync(base,{recursive:true});
  const directory=mkdtempSync(join(base,'run-'));
  t.after(()=>{assert.ok(resolve(directory).startsWith(base+sep));rmSync(directory,{recursive:true,force:true});});
  return directory;
}
const silent={stdout:()=>undefined,stderr:()=>undefined};
test('CLI exports AI input and instructions from real adapter responses, and replay preserves the exact packet',async t=>{
  const base=workspace(t),first=join(base,'first'),replay=join(base,'replay');const fake=fakeGitHub();
  assert.equal(await runCli(['a markdown notes tool','--prepare-ai','--out',first],{...silent,fetcher:fake.fetcher}),0);
  for(const name of ['report.md','report.json','captures.json','ai-input.json','ai-instructions.md','ai-sources.md','ai-review.schema.json']) assert.ok(existsSync(join(first,name)));
  const previous=fake.calls.length;
  assert.equal(await runCli(['a markdown notes tool','--replay',join(first,'captures.json'),'--prepare-ai','--out',replay],{...silent,fetcher:fake.fetcher}),0);
  assert.equal(fake.calls.length,previous);
  assert.deepEqual(JSON.parse(readFileSync(join(first,'ai-input.json'),'utf8')),JSON.parse(readFileSync(join(replay,'ai-input.json'),'utf8')));
});

test('CLI imports validated analysis fully offline and preserves structured type boundaries',async t=>{
  const base=workspace(t),inputPath=join(base,'input.json'),reviewPath=join(base,'review.json'),output=join(base,'result');
  const {input}=await aiFixture();writeFileSync(inputPath,JSON.stringify(input));writeFileSync(reviewPath,JSON.stringify(reviewFixture(input)));
  let stdout='',calls=0;
  const exit=await runCli(['--import-ai',reviewPath,'--ai-input',inputPath,'--out',output,'--json'],{...silent,stdout:t=>{stdout+=t;},fetcher:async()=>{calls++;throw new Error('No network');}});
  assert.equal(exit,0);assert.equal(calls,0);
  const result=JSON.parse(stdout);assert.equal(result.format,'compass-ai-review-result-v1');
  assert.equal(result.validation.semantic_support,'not_checked');
  assert.deepEqual(result,JSON.parse(readFileSync(join(output,'ai-review.json'),'utf8')));
  assert.equal(JSON.parse(readFileSync(join(output,'ai-input.json'),'utf8')).sha256,input.sha256);
});

test('CLI rejects invalid references, wrong hashes and oversized analysis before reserving output',async t=>{
  const base=workspace(t),inputPath=join(base,'input.json'),reviewPath=join(base,'review.json');const {input}=await aiFixture();
  writeFileSync(inputPath,JSON.stringify(input));
  const changed=reviewFixture(input);changed.directions[0]!.basis_ids=['U1'];writeFileSync(reviewPath,JSON.stringify(changed));
  let calls=0;const io={...silent,fetcher:async()=>{calls++;throw new Error('No network');}};
  const args=(out:string)=>['--import-ai',reviewPath,'--ai-input',inputPath,'--out',join(base,out)];
  assert.equal(await runCli(args('invalid'),io),2);assert.equal(existsSync(join(base,'invalid')),false);
  writeFileSync(reviewPath,Buffer.alloc(1024*1024+1));
  assert.equal(await runCli(args('large'),io),2);assert.equal(existsSync(join(base,'large')),false);
  writeFileSync(reviewPath,Buffer.from([0xff]));
  assert.equal(await runCli(args('utf8'),io),2);
  writeFileSync(reviewPath,JSON.stringify(reviewFixture(input))); const broken:AiInput=structuredClone(input);broken.sha256='0'.repeat(64);writeFileSync(inputPath,JSON.stringify(broken));
  assert.equal(await runCli(args('hash'),io),2);assert.equal(calls,0);
});

test('CLI rejects conflicting modes and refuses existing output without touching earlier files',async t=>{
  const base=workspace(t),inputPath=join(base,'input.json'),reviewPath=join(base,'review.json'),output=join(base,'existing');const {input}=await aiFixture();
  writeFileSync(inputPath,JSON.stringify(input));writeFileSync(reviewPath,JSON.stringify(reviewFixture(input)));mkdirSync(output);writeFileSync(join(output,'keep.txt'),'keep');
  const args=['--import-ai',reviewPath,'--ai-input',inputPath,'--out',output];
  let calls=0;const io={...silent,fetcher:async()=>{calls++;throw new Error('No network');}};
  assert.equal(await runCli([...args,'--prepare-ai'],io),2);
  assert.equal(await runCli([...args,'--replay','x'],io),2);
  assert.equal(await runCli([...args,'--limit','3'],io),2);
  assert.equal(await runCli([...args,'a new idea'],io),2);
  assert.equal(await runCli(['--ai-input',inputPath],io),2);
  assert.equal(await runCli(args,io),4);assert.equal(readFileSync(join(output,'keep.txt'),'utf8'),'keep');assert.equal(calls,0);
});

test('CLI rejects an explicitly empty replay path without falling back to live search',async t=>{
  const base=workspace(t),output=join(base,'not-created');let calls=0;
  assert.equal(await runCli(['a markdown notes tool','--prepare-ai','--replay=','--out',output],{...silent,fetcher:async()=>{calls++;throw new Error('No network');}}),2);
  assert.equal(calls,0);assert.equal(existsSync(output),false);
});
