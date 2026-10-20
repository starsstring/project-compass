// Diagnostic fixture only: no real GitHub requests, not a live validation result.
// Run from repository root after npm run build:
// node --import ./validation/issue-1/release-check/smoke-preload.mjs scripts/validate-v1-live.mjs
import {fakeGitHub} from '../../../dist/tests/unit/discovery/fixtures.js';
const fake=fakeGitHub();
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.origin==='https://api.github.com')return fake.fetcher(input,init);
  if(url.origin==='https://github.com')return new Response('Synthetic link check',{status:200});
  throw Error('Unexpected URL blocked; network disabled');
};
