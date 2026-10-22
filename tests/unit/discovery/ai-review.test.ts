import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiInput, contentHash, validateAiInput, renderAiSources, aiInstructions, serializeAiInput, AI_INPUT_MAX_BYTES } from '../../../src/advice/input.js';
import { sha256Text } from '../../../src/domain/canonical.js';
import { createReviewResult, renderAiReview, validateAiReview } from '../../../src/advice/review.js';
import { aiFixture, reviewFixture } from './ai-fixtures.js';
import { fakeGitHub } from './fixtures.js';
import { GitHubSearch } from '../../../src/adapters/github/search.js';
import { discover } from '../../../src/discovery/analyze.js';
import { planSearch } from '../../../src/discovery/query.js';

const rejects = (fn: () => unknown) => assert.throws(fn, { code: 'INVALID_INPUT' });

test('AI input preserves selected source text, provenance and capture times, with stable canonical hashing', async () => {
  const { input, report, client } = await aiFixture();
  assert.equal(input.content.sources.length, 2);
  assert.equal(input.content.sources[0]!.response_sha256, client.captures[0]!.sha256);
  assert.equal(input.content.sources[0]!.captured_at, client.captures[0]!.fetched_at);
  assert.equal(input.content.sources[1]!.captured_at, client.captures[2]!.fetched_at);
  assert.deepEqual(createAiInput(report, client.captures), input);
  assert.equal(validateAiInput({ content: input.content, sha256: input.sha256, format: input.format }).sha256, input.sha256);
  assert.match(renderAiSources(input), /    1: A synthetic/u);
  assert.match(aiInstructions(input), /未通过 Compass 调用语义规划模型/u);
});

test('AI input rejects changed content and changed source hashes even after envelope rehashing', async () => {
  const { input, report, client } = await aiFixture();
  const changed = structuredClone(input); changed.content.idea = 'a different idea';
  rejects(() => validateAiInput(changed));
  const source = structuredClone(input); source.content.sources[0]!.text = 'altered'; source.sha256 = contentHash(source.content);
  rejects(() => validateAiInput(source));
  const captures = structuredClone(client.captures); captures[0]!.sha256 = '0'.repeat(64);
  rejects(() => createAiInput(report, captures));
});

test('AI input rejects source links outside the candidate, wrong status, duplicate candidates and unrecognized fields', async () => {
  const { input } = await aiFixture();
  for (const mutate of [
    (v: typeof input) => { v.content.sources[1]!.url = 'https://evil.example/readme'; },
    (v: typeof input) => { v.content.sources[1]!.url = 'https://github.com/sample/markdown-notes/blob/../../../other/repo/blob/main/x'; },
    (v: typeof input) => { v.content.candidates[0]!.readme_status = 'unavailable'; },
    (v: typeof input) => { v.content.candidates.push(v.content.candidates[0]!); },
    (v: typeof input) => { v.content.sources[1]!.line_count = 99; },
  ]) {
    const changed = structuredClone(input); mutate(changed); changed.sha256 = contentHash(changed.content);
    rejects(() => validateAiInput(changed));
  }
  rejects(() => validateAiInput({ ...input, trusted: true }));
});

test('AI review separates types, binds source IDs, and labels the result as semantically unverified', async () => {
  const { input } = await aiFixture(); const review = reviewFixture(input);
  const before = JSON.stringify(review);
  const result = createReviewResult(review, input);
  assert.equal(result.validation.semantic_support, 'not_checked');
  assert.equal(result.validation.generator_identity, 'not_verified');
  assert.equal(JSON.stringify(review), before);
  const markdown = renderAiReview(result, input);
  assert.match(markdown, /作者陈述（未实测）/u);
  assert.match(markdown, /## 推断/u); assert.match(markdown, /## 未知/u);
  assert.match(markdown, /R1-D L1–L1/u);
});

test('AI review rejects source fabrication, quote range overflow, repo mismatch and mismatched job hash', async () => {
  const { input } = await aiFixture();
  for (const mutate of [
    (r: ReturnType<typeof reviewFixture>) => { r.input_sha256 = '0'.repeat(64); },
    (r: ReturnType<typeof reviewFixture>) => { const c=r.claims[0]!; if(c.kind==='author_statement') c.evidence[0]!.source_id='invented'; },
    (r: ReturnType<typeof reviewFixture>) => { const c=r.claims[0]!; if(c.kind==='author_statement') c.evidence[0]!.end_line=999; },
    (r: ReturnType<typeof reviewFixture>) => { const c=r.claims[0]!; if(c.kind==='author_statement') c.repository='other/repo'; },
    (r: ReturnType<typeof reviewFixture>) => { r.claims.push(r.claims[0]!); },
  ]) { const changed=reviewFixture(input); mutate(changed); rejects(() => validateAiReview(changed,input)); }
  const mixed=reviewFixture(input) as unknown as { claims: Record<string,unknown>[] };
  mixed.claims[0]!.basis_ids=['I1'];
  rejects(() => validateAiReview(mixed,input));
});

test('AI review rejects inference cycles and prevents unknowns from being used as capability evidence', async () => {
  const { input } = await aiFixture();
  for(const target of ['I1','U1','absent']) {
    const changed=reviewFixture(input); const inference=changed.claims[1]!;
    if(inference.kind==='inference') inference.basis_ids=[target];
    rejects(() => validateAiReview(changed,input));
  }
  const indirect=reviewFixture(input);
  indirect.claims.push({id:'I2',kind:'inference',text:'另一推断',basis_ids:['I1'],assumptions:[]});
  const first=indirect.claims[1]!; if(first.kind==='inference') first.basis_ids=['I2'];
  rejects(() => validateAiReview(indirect,input));
  const direction=reviewFixture(input); direction.directions[0]!.basis_ids=['U1'];
  rejects(() => validateAiReview(direction,input));
});

test('AI review requires candidate coverage, typed unknown links and a valid first direction, while allowing abstention', async () => {
  const { input }=await aiFixture();
  const missing=reviewFixture(input); missing.comparisons=[]; rejects(()=>validateAiReview(missing,input));
  const wrongUnknown=reviewFixture(input); wrongUnknown.comparisons[0]!.unknown_ids=['A1']; rejects(()=>validateAiReview(wrongUnknown,input));
  const wrongFirst=reviewFixture(input); wrongFirst.recommended_first_step.direction_id='missing'; rejects(()=>validateAiReview(wrongFirst,input));
  const none=reviewFixture(input); none.directions=[]; none.recommended_first_step.direction_id=null;
  assert.equal(validateAiReview(none,input).directions.length,0);
});

test('AI review renders imported prose as text and preserves partial material status', async () => {
  const { input }=await aiFixture();
  input.content.status='partial'; input.sha256=contentHash(input.content);
  const review=reviewFixture(input); review.claims[0]!.text='<script>bad</script>\u001b[31m [x](https://evil.example)';
  const md=renderAiReview(createReviewResult(review,input),input);
  assert.doesNotMatch(md,/<script>|\u001b/u); assert.match(md,/&lt;script&gt;/u);
  assert.match(md,/部分完成/u);
});

test('AI input exports partial searches with description provenance when a README is unavailable', async () => {
  const fake=fakeGitHub({readmeStatus:404}),client=new GitHubSearch(fake.fetcher);
  const report=await discover(planSearch('a markdown notes tool'),client,5);
  const input=createAiInput(report,client.captures);
  assert.equal(input.content.status,'partial');assert.equal(input.content.sources.length,1);
  assert.equal(input.content.candidates[0]!.readme_status,'unavailable');
  assert.equal(input.content.sources[0]!.kind,'description');
  assert.equal(input.content.sources[0]!.response_sha256,client.captures[0]!.sha256);
});

test('AI comparisons cannot attribute another repository capability without an own-source basis', async () => {
  const {input}=await aiFixture();
  const second='sample/second-notes';const original=input.content.candidates[0]!;
  input.content.candidates.push({...original,repository:second,url:`https://github.com/${second}`});
  input.content.sources.push(...input.content.sources.map(source=>({...source,id:source.id.replace('R1','R2'),repository:second,url:source.url.replace(original.repository,second)})));
  input.sha256=contentHash(input.content);
  const review=reviewFixture(input);
  review.comparisons.push({repository:second,basis_ids:['I1'],assessment:'第二个项目有这项能力。',unknown_ids:['U1']});
  rejects(()=>validateAiReview(review,input));
  review.claims.push({id:'A2',kind:'author_statement',repository:second,text:'第二个项目的作者描述。',evidence:[{source_id:'R2-D',start_line:1,end_line:1}]});
  review.comparisons[1]!.basis_ids=['A2'];
  assert.equal(validateAiReview(review,input).comparisons.length,2);
});

test('near-limit AI packets serialize within the exact import byte limit instead of exceeding it through pretty printing', async () => {
  const {input}=await aiFixture();const candidate=input.content.candidates[0]!,source=input.content.sources[1]!;
  const text='"'.repeat(1048576);
  input.content.candidates=Array.from({length:4},(_,i)=>({...candidate,repository:`sample/boundary-${i}`,url:`https://github.com/sample/boundary-${i}`,description:null}));
  input.content.sources=input.content.candidates.map((c,i)=>({...source,id:`R${i+1}-R`,repository:c.repository,url:c.url+'/blob/main/README.md',text,text_sha256:sha256Text(text),line_count:1}));
  const excess=Buffer.byteLength(JSON.stringify(input))-(AI_INPUT_MAX_BYTES-1);
  const first=input.content.sources[0]!;first.text=first.text.slice(Math.ceil(excess/2));first.text_sha256=sha256Text(first.text);
  input.sha256=contentHash(input.content);
  const serialized=serializeAiInput(validateAiInput(input));
  assert.ok(Buffer.byteLength(serialized)<=AI_INPUT_MAX_BYTES);
  assert.ok(Buffer.byteLength(JSON.stringify(input,null,2)+'\n')>AI_INPUT_MAX_BYTES);
  assert.equal(validateAiInput(JSON.parse(serialized)).sha256,input.sha256);
});
