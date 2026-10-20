// Fixed offline planning observations; no assertions or result-driven tuning.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {parseArgs} from 'node:util';
const {values} = parseArgs({options:{out:{type:'string'}}});
import {planSearch} from '../../../dist/src/discovery/query.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const protocol = read('./protocol.json');
const baseline = read('../evidence.json').planner_comparison;
const known = read('../holdout-protocol.json').cases;
const directory = resolve('.');
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${directory.replaceAll('\\', '/')}`, ...args], {encoding:'utf8'}).trim();
const commit = git('rev-parse','HEAD');
if (git('diff','HEAD','--','src','tests')) throw Error('Commit source/tests before this check');
let attempts = 0;
globalThis.fetch = async () => {attempts++; throw Error('Network disabled');};
const cases = [...baseline.map(row => ({id:row.id,input:row.input,group:'known_baseline'})),
  ...known.map(row => ({...row,group:'known_regression'})), ...protocol.cases.map(row => ({...row,group:'new_developer_counterexample'}))];
const started = new Date().toISOString();
const results = cases.map(row => {
  try {return {...row, execution:'production_planSearch_not_cli',plan:planSearch(row.input),error:null};}
  catch(error) {return {...row,execution:'production_planSearch_not_cli',plan:null,error:{code:error.code??null,message:error.message}};}
});
const output = {source_commit:commit,node:process.version,started_at:started,completed_at:new Date().toISOString(),
  protocol_sha256:createHash('sha256').update(readFileSync(new URL('./protocol.json',import.meta.url))).digest('hex'),
  network_attempts:attempts,limitation:protocol.policy,results};
const target = values.out ? resolve(values.out) : new URL('./planning-results.json',import.meta.url);
if (values.out) mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cases:results.length,network_attempts:attempts,new_inputs:results.filter(row=>row.group==='new_developer_counterexample').map(row=>({id:row.id,queries:row.plan?.queries,requirements:row.plan?.understanding?.requirements,clarification:row.plan?.understanding?.clarification}))},null,2));
