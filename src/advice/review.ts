import type { AiInput, AiClaim, AiReview, AiReviewResult } from './model.js';
import { reviewValidator } from './schema.js';
import { invalid, validateAiInput } from './input.js';
import { escapeMarkdown } from '../discovery/markdown.js';

export function validateAiReview(value: unknown, input: AiInput): AiReview {
  validateAiInput(input);
  if (!reviewValidator(value)) return invalid('AI 分析版本或结构错误；请按 ai-review.schema.json 拆分作者陈述、推断和未知。');
  if (value.input_sha256 !== input.sha256) return invalid('AI 分析不属于这个资料包。');
  const sources = new Map(input.content.sources.map(s => [s.id, s]));
  const repositories = new Set(input.content.candidates.map(c => c.repository));
  const claims = new Map<string, AiClaim>();
  for (const claim of value.claims) {
    if (claims.has(claim.id)) return invalid('AI 声明 ID 重复。');
    claims.set(claim.id, claim);
    if (claim.kind === 'author_statement') {
      if (!repositories.has(claim.repository)) return invalid('AI 声明包含资料包以外的仓库。');
      for (const ref of claim.evidence) {
        const source = sources.get(ref.source_id);
        if (!source || source.repository !== claim.repository || ref.start_line > ref.end_line || ref.end_line > source.line_count || ref.end_line - ref.start_line >= 25) return invalid('AI 来源、仓库或行范围无效；每处引用最多 25 行。');
      }
    }
  }
  const authorsByClaim = new Map<string, ReadonlySet<string>>();
  const active = new Set<string>();
  const basis = (id: string): ReadonlySet<string> => {
    const claim = claims.get(id);
    if (!claim || claim.kind === 'unknown') return invalid('AI 依据必须指向已存在的作者陈述或推断，不能用未知证明功能。');
    if (active.has(id)) return invalid('AI 推断依据不能循环。');
    const existing = authorsByClaim.get(id);
    if (existing) return existing;
    active.add(id);
    const authors = new Set<string>();
    if (claim.kind === 'author_statement') authors.add(claim.repository);
    else for (const parent of claim.basis_ids) for (const repository of basis(parent)) authors.add(repository);
    active.delete(id); authorsByClaim.set(id, authors);
    return authors;
  };
  for (const claim of value.claims) if (claim.kind !== 'unknown') basis(claim.id);
  const comparisons = new Set<string>();
  for (const candidate of value.comparisons) {
    if (!repositories.has(candidate.repository) || comparisons.has(candidate.repository)) return invalid('AI 比较包含重复或包外仓库。');
    comparisons.add(candidate.repository); candidate.basis_ids.forEach(basis);
    if (candidate.basis_ids.length && !candidate.basis_ids.some(id => basis(id).has(candidate.repository))) return invalid('AI 候选判断不能只用其他仓库的能力作为依据。');
    if (candidate.unknown_ids.some(id => claims.get(id)?.kind !== 'unknown')) return invalid('AI 未知清单只能引用 unknown 声明。');
  }
  if (comparisons.size !== repositories.size) return invalid('AI 比较必须覆盖资料包中的全部候选。');
  const directions = new Set<string>();
  for (const direction of value.directions) {
    if (directions.has(direction.id)) return invalid('AI 方向 ID 重复。');
    directions.add(direction.id); direction.basis_ids.forEach(basis);
  }
  const first = value.recommended_first_step.direction_id;
  if (value.directions.length ? first === null || !directions.has(first) : first !== null) return invalid('AI 首步必须对应已有方向；无方向时使用 null。');
  return structuredClone(value);
}

export function createReviewResult(review: unknown, input: AiInput): AiReviewResult {
  const validated = validateAiReview(review, input);
  return { format: 'compass-ai-review-result-v1', imported_at: new Date().toISOString(), input_sha256: input.sha256,
    validation: { structure_and_references: 'passed', semantic_support: 'not_checked', generator_identity: 'not_verified' }, review: validated };
}

export function renderAiReview(result: AiReviewResult, input: AiInput): string {
  const e = escapeMarkdown;
  const sources = new Map(input.content.sources.map(s => [s.id, s]));
  const evidence = (claim: Extract<AiClaim, { kind: 'author_statement' }>) => claim.evidence.map(ref => {
    const source = sources.get(ref.source_id)!;
    const url = (source.url + (source.kind === 'readme' ? `#L${ref.start_line}-L${ref.end_line}` : ''))
      .replace(/[()\s<>]/gu, character => encodeURIComponent(character).replace(/\(/gu, '%28').replace(/\)/gu, '%29'));
    return `[${e(source.id)} L${ref.start_line}–L${ref.end_line}](${url})`;
  }).join('、');
  const lines = ['# Compass：导入的 AI 分析', '', `创意：${e(input.content.idea)}`, '',
    '校验状态：结构、资料哈希与引用检查通过；语义支持未核实，生成者身份未验证。程序没有调用模型，不代表作者陈述已安装实测。', '',
    `输入包 SHA-256：${input.sha256}。原始资料和采集时间保存在同目录 ai-input.json；链接对应的分支可能变化。`, '',
    `资料检索状态：${input.content.status === 'partial' ? '部分完成，存在缺失或失败' : '有限检索完成'}。`, '',
    ...(['author_statement', 'inference', 'unknown'] as const).flatMap(kind => [`## ${{ author_statement: '作者陈述（未实测）', inference: '推断', unknown: '未知' }[kind]}`, '',
      ...result.review.claims.filter(c => c.kind === kind).map(claim => `- **${e(claim.id)}**：${e(claim.text)}${claim.kind === 'author_statement' ? ` ${evidence(claim)}` : claim.kind === 'inference' ? ` 依据：${claim.basis_ids.map(e).join('、')}；前提：${claim.assumptions.map(e).join('、') || '未额外列出'}。` : ` 原因：${e(claim.reason)}`}`), '']),
    '## 条件适配比较（推断）', ''];
  for (const candidate of result.review.comparisons) lines.push(`### ${e(candidate.repository)}`, '', e(candidate.assessment), '',
    `依据：${candidate.basis_ids.map(e).join('、') || '无已确认能力依据'}；未知：${candidate.unknown_ids.map(e).join('、')}。`, '');
  lines.push('## 待验证方向', '');
  if (!result.review.directions.length) lines.push('没有足够依据生成方向。', '');
  for (const direction of result.review.directions) lines.push(`### ${e(direction.id)} · ${e(direction.title)}`, '', `条件：${e(direction.condition)}`, '',
    `依据：${direction.basis_ids.map(e).join('、')}。`, '', `最小动作：${e(direction.proposed_change)}`, '',
    `验证输入：${e(direction.validation.input)}`, '', ...direction.validation.steps.map((step, index) => `${index + 1}. ${e(step)}`), '',
    `预期输出：${e(direction.validation.expected_output)}`, '', `停止条件：${e(direction.stop_if)}`, '');
  lines.push('## 建议首步', '', `${e(result.review.recommended_first_step.direction_id ?? '暂无方向')}：${e(result.review.recommended_first_step.reason)}`, '',
    '## 限制', '', ...result.review.limitations.map(limit => `- ${e(limit)}`), '',
    '## 原检索提示', '', ...input.content.warnings.map(warning => `- ${e(warning)}`), '');
  return lines.join('\n');
}
