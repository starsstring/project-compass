// Explicit opt-in real CLI subprocesses. Private captures remain gitignored.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import {join,resolve,relative,dirname} from 'node:path';
import {parseArgs} from 'node:util';
const {values} = parseArgs({options:{live:{type:'boolean'},out:{type:'string'}}});
if (!values.live) throw Error('Pass --live to make anonymous public GitHub requests');
const directory = resolve('.compass/issue-1-followup', String(Date.now()));
mkdirSync(directory,{recursive:true});
const source = execFileSync('git',['-c',`safe.directory=${resolve('.').replaceAll('\\','/')}`,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const response = await fetch('https://api.github.com/rate_limit',{headers:{'User-Agent':'Project-Compass-Bounded-Review'},signal:AbortSignal.timeout(15000)});
const rate = await response.json();
const preflight = {at:new Date().toISOString(),http_status:response.status,resources:rate.resources};
writeFileSync(join(directory,'quota.json'),JSON.stringify(preflight,null,2)+'\n',{flag:'wx'});
if (!response.ok || rate.resources?.search?.remaining < 6 || rate.resources?.core?.remaining < 12) throw Error('Insufficient anonymous quota; no CLI searches started');
const cases = [
  {id:'H04',input:'想找一个能在 macOS 上运行的音频降噪工具'},
  {id:'H03',input:'我想开发一个不需要联网的家庭药品到期提醒工具'},
  {id:'N06',input:'Find an offline Linux spectral analyzer'},
];
const results = [];
for (const row of cases) {
  const output = join(directory,row.id);
  const args = ['dist/src/cli.js',row.input,'--limit','3','--out',output,'--json'];
  const started = new Date().toISOString();
  const child = spawnSync(process.execPath,args,{encoding:'utf8',timeout:120000,windowsHide:true});
  writeFileSync(join(directory,`${row.id}-stdout.txt`),child.stdout??'',{flag:'wx'});
  writeFileSync(join(directory,`${row.id}-stderr.txt`),child.stderr??'',{flag:'wx'});
  const report = existsSync(join(output,'report.json')) ? JSON.parse(readFileSync(join(output,'report.json'),'utf8')) : null;
  const captures = existsSync(join(output,'captures.json')) ? JSON.parse(readFileSync(join(output,'captures.json'),'utf8')) : [];
  results.push({...row,execution:'actual_node_CLI_subprocess_anonymous_GitHub',started_at:started,completed_at:new Date().toISOString(),exit:child.status,signal:child.signal,error:child.error?.code??null,
    status:report?.status??'failed',private_report_directory:relative(resolve('.'),output).replaceAll('\\','/'),
    plan:report?.plan??null,searches:report?.searches??[],candidates:report?.candidates.map(candidate=>({name:candidate.full_name,url:candidate.url,license:candidate.license,
      relevance:candidate.relevance,requirement_clues:candidate.requirement_clues,readme:{status:candidate.readme.status,url:candidate.readme.url,blob_sha:candidate.readme.blob_sha,content_sha256:candidate.readme.content_sha256}}))??[],
    requests:captures.map(({body,...metadata})=>metadata)});
  console.log(JSON.stringify({id:row.id,exit:child.status,candidates:results.at(-1).candidates.map(candidate=>candidate.name),requests:captures.length}));
  if (captures.some(capture=>capture.status===429||(capture.status===403&&capture.remaining==='0'))) break;
}
const summary = {source_commit:source,node:process.version,quota_preflight:preflight,limitation:'Anonymous read-only retrieval; no manual query, no models, no repository installation. Candidate mentions are not verified capabilities. Raw captures and third-party full READMEs remain local.',results};
const target = values.out ? resolve(values.out) : new URL('./live-summary.json',import.meta.url);
if (values.out) mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log('Saved safe live summary; original reports/captures remain in .compass.');
