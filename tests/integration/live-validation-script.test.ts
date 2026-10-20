import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('the full live-validation source script respects its budget and clarifies without requests or output',t=>{
  const workspace=mkdtempSync(join(tmpdir(),'compass-live-validation-'));
  t.after(()=>rmSync(workspace,{recursive:true,force:true}));
  const child=spawnSync(process.execPath,['--import',pathToFileURL(resolve('tests/fixtures/live-validation-preload.mjs')).href,
    resolve('scripts/validate-v1-live.mjs')],{cwd:workspace,encoding:'utf8',timeout:30000,windowsHide:true});
  assert.ifError(child.error);assert.equal(child.status,0,child.stderr);
  const saved=/Saved: (.+)/u.exec(child.stdout)?.[1]?.trim();assert.ok(saved);
  const summary=JSON.parse(readFileSync(saved,'utf8'));
  assert.equal(summary.results.length,3);
  for(const row of summary.results){
    assert.equal(row.exit,0);assert.equal(row.candidates.length,5);assert.equal(row.requests,7);
    assert.equal(row.links.length,2);assert.ok(row.links.every((link:{status:number})=>link.status===200));
  }
  assert.equal(summary.failure_case.idea,'我想做一个很厉害的软件');
  assert.equal(summary.failure_case.exit,2);assert.equal(summary.failure_case.network_requests,0);
  assert.equal(summary.failure_case.report_directory_created,false);
  assert.equal(existsSync(join(summary.directory,'clarification')),false);
  const counts=JSON.parse(readFileSync(join(workspace,'fetch-counts.json'),'utf8'));
  assert.deepEqual(counts,{api:21,pages:6,unexpected:0,external_network_requests:0});
});
