import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSearch, mentionsRequirement } from '../../../src/discovery/query.js';
import { discover } from '../../../src/discovery/analyze.js';
import { renderDiscovery } from '../../../src/discovery/markdown.js';
import { GitHubSearch } from '../../../src/adapters/github/search.js';
import { createAiInput } from '../../../src/advice/input.js';
import { fakeGitHub, repository } from './fixtures.js';

test('intent follows the requested action rather than an embedded domain word', () => {
  for (const [idea, intent] of [
    ['I want to build a study notes tool', 'develop'],
    ['Find a tool to build notes', 'find_project'],
    ['I want to learn to build a debugger', 'learn'],
    ['我想开发一个学习笔记工具', 'develop'],
    ['我想学习逆向工程', 'learn'],
    ['我记得有个开源反编译工具', 'find_project'],
    ['面向开发板的串口调试工具', 'unclear'],
  ]) assert.equal(planSearch(idea!).understanding?.intent, intent, idea);
});

test('vague requests suggest clarification instead of guessing a repository', () => {
  for (const idea of ['我想逆向一切', '我想做一个很厉害的软件', '我要一个万能的工具', '一种尚未识别的全新方向']) {
    const plan = planSearch(idea);
    assert.deepEqual(plan.queries, []);
    assert.ok(plan.understanding?.clarification);
    assert.equal(plan.idea, idea);
    assert.doesNotMatch(JSON.stringify(plan), /Ghidra|NSA\/|REA\b/u);
  }
});

test('explicit queries still override ambiguity and never get expanded', () => {
  const queries = ['reverse engineering in:name', 'reverse engineering in:name'];
  const plan = planSearch('我想逆向一切', queries);
  assert.deepEqual(plan.queries, [queries[0]]);
  assert.equal(plan.method, 'explicit_query');
  assert.equal(plan.understanding?.clarification, null);
});

test('composes unfamiliar domains without naming a known project', () => {
  const plant = planSearch('我想做一个能识别植物病害的手机应用');
  assert.match(plant.queries.join(' '), /plant.*disease/u);
  assert.ok(plant.understanding?.requirements.some(item => item.key === 'mobile'));
  const pets = planSearch('校园宠物领养互助平台');
  assert.match(pets.queries.join(' '), /pet.*adoption/u);
  assert.ok(pets.understanding?.requirements.some(item => item.key === 'campus'));
});

test('uses Chinese word segmentation as an honest fallback for an unmapped domain', () => {
  const plan = planSearch('我想做一个水族箱水质监测工具');
  assert.ok(plan.queries.length);
  assert.match(plan.queries.join(' '), /水族箱|水质/u);
  assert.match(plan.warnings.join(' '), /中文分词检索/u);
  assert.ok(plan.understanding?.unmapped_terms.length);
  assert.ok(plan.terms.some(term => /\p{Script=Han}/u.test(term)));
});

test('unmapped modifiers stay visible even when a known topic matches', () => {
  const plan = planSearch('我想做一个面向潜水员的笔记工具');
  assert.equal(plan.idea, '我想做一个面向潜水员的笔记工具');
  assert.ok(plan.understanding?.unmapped_terms.some(term => /潜水/u.test(term)));
  assert.match(plan.warnings.join(' '), /尚未映射/u);
});

test('retains platform and task requirements, with a less restrictive second query', () => {
  for (const platform of ['Windows', 'Linux', 'macOS']) {
    const idea = `${platform} 桌面截图 OCR 翻译工具`;
    const plan = planSearch(idea);
    assert.equal(plan.idea, idea);assert.equal(plan.queries.length, 2);
    for (const key of [platform.toLowerCase(), 'desktop', 'ocr', 'translation']) {
      assert.ok(plan.understanding?.requirements.some(item => item.key === key), key);
    }
    assert.match(plan.queries[0]!, /ocr.*translation/u);
    assert.ok(plan.queries[0]!.includes(platform.toLowerCase()));
    assert.ok(!plan.queries[1]!.includes(platform.toLowerCase()));
  }
});

test('preserves constraint meaning across word order, without assuming a phone OS', () => {
  for (const idea of ['离线加密笔记软件', '笔记软件，需要加密并且离线', 'encrypted offline notes tool']) {
    const plan = planSearch(idea);
    assert.deepEqual(plan.understanding?.requirements.filter(item => ['offline','encryption'].includes(item.key)).map(item => item.key).sort(), ['encryption','offline']);
    assert.match(plan.queries[0]!, /offline|encryption/u);
  }
  const mobile = planSearch('植物病害手机应用');
  assert.ok(!mobile.queries.join(' ').includes('android'));
  assert.ok(!mobile.queries.join(' ').includes('ios'));
});

test('negative constraints are preserved without turning into mandatory search terms', () => {
  const plan = planSearch('我想做一个笔记软件，不需要加密，不要 Windows');
  for (const key of ['encryption','windows']) assert.equal(plan.understanding?.requirements.find(item => item.key === key)?.polarity, 'excluded');
  assert.doesNotMatch(plan.queries.join(' '), /encryption|windows/iu);
  assert.match(plan.warnings.join(' '), /否定条件/u);
  assert.doesNotMatch(planSearch('I want to build notes without encryption').queries.join(' '), /encryption|without/iu);
});

test('mixed English specifics survive a recognized Chinese task', () => {
  const plan = planSearch('有个工具能把 Android APK 反编译成接近 Java 的代码');
  for (const word of ['decompiler','android','apk','java']) assert.ok(plan.queries[0]!.includes(word));
});

test('bounded plans do not grow their search count, query size, or retain duplicates', () => {
  for (const idea of ['Linux Windows macOS Android 手机 离线 加密 桌面 OCR 翻译 笔记 截图 评测', 'pet adoption tool', '我想学习逆向工程', 'x'.repeat(2000)]) {
    const plan = planSearch(idea);
    assert.ok(plan.queries.length <= 2);
    assert.equal(new Set(plan.queries).size,plan.queries.length);
    assert.ok(plan.queries.every(query=>query.length<=200));
  }
});

test('requirement matching is word bounded and is never a support verdict', () => {
  const requirement = planSearch('Windows 截图工具').understanding!.requirements.find(item=>item.key==='windows')!;
  assert.equal(mentionsRequirement('windowsill architecture',requirement),false);
  assert.equal(mentionsRequirement('Windows is not supported',requirement),true);
  assert.equal(mentionsRequirement('ExampleAgency/project',{...requirement,terms:['example agency']}),true);
});

test('negative or planned README mentions remain unverified clues, including in AI handoff', async () => {
  const fake = fakeGitHub();
  const fetcher: typeof fetch = async (input, init) => {
    const response = await fake.fetcher(input, init);
    if(String(input).includes('/search/'))return response;
    const data=await response.json() as Record<string,unknown>;
    return Response.json({...data,content:Buffer.from('# Scope\n\nOffline is not supported. Encryption is planned.\n').toString('base64')});
  };
  const client=new GitHubSearch(fetcher);
  const report=await discover(planSearch('我想做一个离线加密笔记软件'),client);
  assert.ok(report.candidates[0]!.requirement_clues?.every(item=>item.source==='readme'));
  assert.match(renderDiscovery(report),/不能标为支持/u);
  assert.match(createAiInput(report,client.captures).content.warnings.join(' '),/离线.*加密/u);
});

test('learning requests keep course material and avoid development proposals', async () => {
  const fake=fakeGitHub({items:[{...repository(),description:'Course notes on reverse engineering'}]});
  const report=await discover(planSearch('我想学习逆向工程'),new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates.length,1);assert.equal(report.excluded.length,0);
  assert.match(report.directions[0]!.title,/学习材料/u);
});

test('finding an existing project produces identity verification rather than product work', async () => {
  const fake=fakeGitHub();
  const report=await discover(planSearch('我记得有个笔记工具'),new GitHubSearch(fake.fetcher));
  assert.match(report.directions[0]!.title,/候选身份/u);
  assert.match(report.directions[0]!.proposed_change,/不先安排开发/u);
});

test('a requirement metadata clue ranks above popularity without claiming the feature works', async () => {
  const fake=fakeGitHub({items:[{...repository('sample/generic',1,999999),description:'Notes software',topics:['notes']},
    {...repository('sample/offline',2,1),description:'Offline encrypted notes',topics:['notes']}]});
  const report=await discover(planSearch('我想做一个离线加密笔记软件'),new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates[0]!.full_name,'sample/offline');
  assert.match(report.candidates[0]!.relevance.reason,/未验证任务/u);
});

test('the main task outranks incidental platform/encryption terms from a different product',async()=>{
  const fake=fakeGitHub({items:[{...repository('sample/chat',1),description:'An encrypted Linux chat app',topics:['linux','encrypted']},
    {...repository('sample/bookmarks',2),description:'A bookmark manager',topics:['bookmarks']}]});
  const report=await discover(planSearch('我想做一个 Linux 加密书签管理工具'),new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates[0]!.full_name,'sample/bookmarks');
  assert.ok(report.candidates[0]!.requirement_clues?.some(item=>item.source===null));
});

test('a broader vocabulary alternative is retained rather than repeating the narrow primary word',()=>{
  const plan=planSearch('Find an offline decompiler');
  assert.match(plan.queries[0]!,/decompiler.*offline/u);
  assert.equal(plan.queries[1],'reverse engineering');
});

test('a main-task phrase still outranks a scattering of the same words',async()=>{
  const fake=fakeGitHub({items:[{...repository('sample/driver',1),description:'A manager driver for a password token',topics:[]},
    {...repository('sample/manager',2),description:'A password manager',topics:[]}]});
  const report=await discover(planSearch('我想做一个 Linux 密码工具'),new GitHubSearch(fake.fetcher));
  assert.equal(report.candidates[0]!.full_name,'sample/manager');
});

test('unknown Chinese tasks survive English qualifiers and single-character segmentation', () => {
  for (const platform of ['macOS', 'Linux', 'Windows']) {
    const idea = `想找一个能在 ${platform} 上运行的音频降噪工具`;
    const plan = planSearch(idea);
    assert.equal(plan.idea, idea);
    assert.ok(plan.queries.length);
    assert.ok(plan.queries.every(query => query.includes('音频降噪')));
    assert.ok(plan.queries[0]!.includes(platform.toLowerCase()));
    assert.ok(plan.understanding?.unmapped_terms.includes('音频降噪'));
    assert.match(plan.warnings.join(' '), /不保证覆盖英文/u);
  }
});

test('platforms and generic words alone require a concrete task', () => {
  for (const idea of ['想找一个支持 Windows 的工具', 'Find an offline Linux tool', 'macOS software']) {
    const plan = planSearch(idea);
    assert.deepEqual(plan.queries, [], idea);
    assert.ok(plan.understanding?.clarification);
    assert.ok(plan.understanding?.requirements.length);
  }
  assert.match(planSearch('Find a Linux waveform analyzer').queries[0]!, /waveform analyzer/u);
  assert.match(planSearch('OCR 翻译工具').queries[0]!, /ocr.*translation/u);
});

test('no-network phrasing is a required offline condition, not an excluded feature', () => {
  for (const phrase of ['不需要联网', '无需网络', '不用连接互联网', '不需联网']) {
    const plan = planSearch(`我想开发一个${phrase}的家庭药品到期提醒工具`);
    const offline = plan.understanding?.requirements.find(item => item.key === 'offline');
    assert.equal(offline?.polarity, 'required', phrase);
    assert.equal(offline?.source, phrase);
    assert.match(plan.queries[0]!, /offline/u);
    assert.ok(plan.queries.every(query => query.includes('家庭药品到期提醒')));
  }
  assert.equal(planSearch('不需要离线的笔记工具').understanding?.requirements.find(item => item.key === 'offline')?.polarity, 'excluded');
});

test('fallback retains the task tail and clarifies instead of silently truncating long queries', () => {
  const plan = planSearch('我想开发一个家庭药品分类存储数量统计到期提醒工具');
  assert.ok(plan.queries.every(query => query.includes('到期提醒')));
  assert.ok(plan.queries.length);
  const long = planSearch('我想开发一个' + '家庭药品分类存储数量统计'.repeat(20) + '到期提醒工具');
  assert.deepEqual(long.queries, []);
  assert.match(long.understanding?.clarification ?? '', /缩短/u);
  assert.ok(long.idea.endsWith('到期提醒工具'));
});

test('explicit lack of direction clarifies while a concrete uncertain choice can still search', () => {
  for (const idea of ['我现在还不确定做什么项目', '不知道开发什么工具', '还没想好做什么项目', 'I do not know what to build']) {
    assert.deepEqual(planSearch(idea).queries, [], idea);
  }
  assert.ok(planSearch('我不确定选择什么笔记工具').queries.length);
  assert.deepEqual(planSearch('我现在还不确定做什么项目', ['custom topic']).queries, ['custom topic']);
});
