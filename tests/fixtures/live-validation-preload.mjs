// Synthetic responses only: never call the real fetch implementation.
import {writeFileSync} from 'node:fs';
import {fakeGitHub,repository} from '../../dist/tests/unit/discovery/fixtures.js';
const fixture=fakeGitHub({items:Array.from({length:5},(_,index)=>repository(`sample/fixture-${index}`,index+1))});
const counts={api:0,pages:0,unexpected:0,external_network_requests:0};
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.origin==='https://api.github.com'){counts.api++;return fixture.fetcher(input,init);}
  if(url.origin==='https://github.com'){counts.pages++;return new Response('Synthetic page',{status:200});}
  counts.unexpected++;throw Error('Unexpected URL blocked; external network disabled');
};
process.on('exit',()=>writeFileSync('fetch-counts.json',JSON.stringify(counts)+'\n',{flag:'wx'}));
