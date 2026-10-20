// One-shot offline developer check. Not an independent evaluator or CLI search.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{planner:{type:'string'},out:{type:'string'}}});
const file=fileURLToPath(new URL('./holdout-protocol.json',import.meta.url));
const bytes=readFileSync(file),protocol=JSON.parse(bytes);
const frozenAt=new Date().toISOString();
let networkAttempts=0;
globalThis.fetch=async()=>{networkAttempts++;throw Error('Network disabled for this check');};
const {planSearch}=await import(pathToFileURL(resolve(values.planner??'dist/src/discovery/query.js')).href);
const results=protocol.cases.map(row=>{
  try{return{...row,execution:'actual_production_planSearch_not_cli',plan:planSearch(row.input),error:null};}
  catch(error){return{...row,execution:'actual_production_planSearch_not_cli',plan:null,error:{code:error.code??null,message:error.message}};}
});
const output=resolve(values.out??`.compass/holdout-${Date.now()}.json`);
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({kind:protocol.kind,frozen_before_execution:frozenAt,completed_at:new Date().toISOString(),
  protocol_sha256:createHash('sha256').update(bytes).digest('hex'),node:process.version,network_attempts:networkAttempts,
  limitation:'These are new developer-selected inputs after reading the implementation, not independent human testing. No result-driven tuning is allowed in this handoff.',results},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cases:results.length,network_attempts:networkAttempts,output}));
