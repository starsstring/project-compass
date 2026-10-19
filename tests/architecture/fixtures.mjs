// Synthetic contract fixtures only; no real user, product or model result.
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
export const json = value => JSON.stringify(canonical(value));
export const at = '2026-10-18T08:00:00.000Z';
export function makeSource(source_id = 'source_01', content = '合成测试资料：模拟工具提供 Markdown 导出。') {
  return { source_id, url: 'https://example.com/compass-fixture', title: '合成资料，不是竞品证据',
    locator: 'fixture paragraph 1', collected_at: at, source_type: 'author_claim',
    independence_group: 'synthetic_author', capture_status: 'captured', content_scope: 'excerpt',
    content_text: content, content_sha256: hash(content), retrieval_note: '测试内构造，没有访问网页。' };
}
export function makeReport(idea_id = 'idea_fixture', revision_id = 'rev_01', parent_revision_id = null) {
  const idea = { original_text: '合成练习：是否开发一个报告工具？', target_user: '合成用户群',
    problem: '练习来源更正与建议修订，不证明用户需求。', constraints: ['离线', '无模型费用'] };
  return { schema_version: '1.0', idea_id, revision_id, parent_revision_id, created_at: at,
    provenance: { kind: 'fixture', producer: 'Compass synthetic architecture fixture',
      run_id: null, model: null, prompt_sha256: null, input_sha256: hash(json(idea)) },
    idea, sources: [makeSource()],
    claims: [{ claim_id: 'claim_01', kind: 'source_statement',
      text: '合成资料声称模拟工具已经提供 Markdown 导出。',
      evidence: [{ source_id: 'source_01', relation: 'support' }],
      review_status: 'unreviewed', review_note: '仅供测试，未做语义审核。' }],
    alternatives: [{ alternative_id: 'alternative_01', title: '先验证需求', change: '暂不开发完整平台',
      tradeoffs: ['会推迟实现'], assumptions: ['也许现成流程足够'], validation_action: '比较一条真实使用流程。' }],
    assessment: { recommendation: 'investigate', reason: '合成案例不能证明需求。', claim_ids: ['claim_01'],
      alternative_id: 'alternative_01', unknowns: ['真实使用收益'],
      conditions: ['demand', 'feasibility'].map(key => ({ key, state: 'unknown', reason: '尚未验证', claim_ids: [] })),
      next_action: '先取得真实案例，再决定是否实现。' },
    scorecard: null, change: { kind: parent_revision_id ? 'interpretation_change' : 'initial',
      reason: parent_revision_id ? '测试用后继版本；完整应用还必须校验确有内容变化。' : '合成初始输入。',
      changed_claim_ids: parent_revision_id ? [] : ['claim_01'],
      changed_source_ids: parent_revision_id ? [] : ['source_01'] } };
}
export function makeDecision(idea_id = 'idea_fixture', report_revision_id = 'rev_01', decision_id = 'decision_01', supersedes_decision_id = null) {
  return { schema_version: '1.0', idea_id, decision_id, report_revision_id, supersedes_decision_id,
    decided_at: at, actor: { kind: 'human', id: 'synthetic_test_actor' }, choice: 'pause',
    reason: '纯测试决定，不代表用户实际选择。' };
}
