// Offline research prototype: validates references and renders prepared records.
// It does not retrieve sources, judge truth, generate advice, or run an LLM.
import assert from 'node:assert/strict';

export function validatePacket(packet) {
  const sourceIds = new Set();
  for (const source of packet.sources) {
    assert.ok(!sourceIds.has(source.id), 'Duplicate source');
    assert.equal(new URL(source.url).protocol, 'https:', 'Only HTTPS reference links');
    assert.ok(source.locator && source.independence_group && source.evidence_kind, 'Source provenance required');
    sourceIds.add(source.id);
  }
  const caseIds = new Set();
  for (const item of packet.cases) {
    assert.match(item.id, /^C\d+$/, 'Safe case ID required');
    assert.ok(!caseIds.has(item.id), 'Duplicate case'); caseIds.add(item.id);
    assert.ok(item.question && item.unknowns.length && item.alternatives.length, 'Question, unknowns and alternatives required');
    const claimIds = new Set();
    for (const claim of item.claims) {
      assert.ok(!claimIds.has(claim.id), 'Duplicate claim'); claimIds.add(claim.id);
      assert.ok(['source_statement', 'inference', 'hypothesis'].includes(claim.kind), 'Explicit claim kind required');
      if (claim.kind === 'source_statement') assert.ok(claim.source_ids.length, 'Source statement needs citation');
      for (const id of claim.source_ids) assert.ok(sourceIds.has(id), `Unknown source ${id}`);
    }
    assert.ok(item.revisions.length, 'Decision history required');
    const revisionIds = new Set();
    const introducedSources = new Set();
    item.revisions.forEach((revision, i) => {
      assert.ok(!revisionIds.has(revision.id), 'Duplicate revision'); revisionIds.add(revision.id);
      assert.equal(revision.supersedes, i ? item.revisions[i - 1].id : null, 'Revisions must form an ordered chain');
      assert.ok(revision.reason?.trim() && revision.next_action?.trim(), 'Reason and next action required');
      assert.ok(['reconstructed_demonstration', 'analyst_recommendation'].includes(revision.status), 'Examples must not impersonate user decisions');
      for (const id of revision.new_source_ids) {
        assert.ok(sourceIds.has(id), `Unknown revision source ${id}`);
        assert.ok(!introducedSources.has(id), `Previously introduced source is not new: ${id}`);
        introducedSources.add(id);
      }
      if (i && revision.decision !== item.revisions[i - 1].decision) {
        assert.ok(revision.new_source_ids.length || revision.design_change?.trim(), 'Changed recommendation requires evidence or a concrete design change');
      }
    });
    assert.equal(item.score, null, 'These examples have insufficient evidence for a total score');
  }
  return true;
}

const safe = value => String(value).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]))
  .replace(/([\\`*_{}\[\]()#!|])/g, '\\$1').replace(/\r?\n/g, ' ');

export function renderCard(packet, item) {
  validatePacket(packet);
  const labels = { source_statement: '来源陈述', inference: '分析推断', hypothesis: '待验证假设',
    reconstructed_demonstration: '演示重建', analyst_recommendation: '分析建议',
    author_claim: '作者声称', official_documentation: '官方文档' };
  const current = item.revisions.at(-1);
  const used = new Set([...item.claims.flatMap(x => x.source_ids), ...item.revisions.flatMap(x => x.new_source_ids)]);
  const lines = [`# ${safe(item.id)} · ${safe(item.title)}`, '',
    `核查日期：${safe(packet.checked_on)}。人工准备的研究示例；不是独立盲评结果。`, '',
    `**要决定的事**：${safe(item.question)}`, '', `**当前建议**：${safe(current.decision)}`, '',
    `**判断依据与边界**：${safe(current.reason)}`, '', '**主张与证据**', '',
    ...item.claims.map(x => `- ${safe(x.id)} [${labels[x.kind]}] ${safe(x.text)} 来源：${x.source_ids.map(safe).join(', ') || '暂无；不得当事实'}`), '',
    '**备选路线**', '', ...item.alternatives.map(x => `- ${safe(x)}`), '',
    '**还不知道什么**', '', ...item.unknowns.map(x => `- ${safe(x)}`), '',
    `**总分**：未给分。${safe(item.confidence)}。`, '',
    `**下一动作**：${safe(current.next_action)}`, '', '**修订记录**', '',
    ...item.revisions.map(x => `- ${safe(x.id)} ← ${safe(x.supersedes ?? '初始')} [${labels[x.status]}]：${safe(x.decision)} 原因：${safe(x.reason)} 新证据：${x.new_source_ids.map(safe).join(', ') || '无'}`), '',
    '**来源**', '', ...packet.sources.filter(x => used.has(x.id)).map(x => `- [${safe(x.id)}](${new URL(x.url).href.replace(/[()]/g, encodeURIComponent)}) · ${safe(x.locator)} · ${labels[x.evidence_kind] ?? safe(x.evidence_kind)} · ${safe(x.summary)}`), ''];
  return lines.join('\n');
}
