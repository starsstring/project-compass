import { validateHumanDecision, type HumanDecision, type ReportRevision } from './contracts/index.js';
import { validateReportContent } from './report.js';
import { DIMENSIONS, scoreRange, type Dimension, type ScoreRange } from './scoring.js';
import { failure, success, type DomainResult } from './result.js';

export interface ReportViewModel {
  idea_id: string;
  revision_id: string;
  idea: ReportRevision['idea'];
  provenance_label: string;
  provenance_verification: 'external_declaration_not_verified';
  sources: ReportRevision['sources'];
  claims: (ReportRevision['claims'][number] & { kind_label: string })[];
  alternatives: ReportRevision['alternatives'];
  assessment: ReportRevision['assessment'];
  scorecard: ReportRevision['scorecard'];
  score_summary: ScoreRange | null;
  warnings: { code: 'FIXTURE' | 'DISPUTED_RATING' | 'WITHDRAWN_RATING'; claim_id?: string; dimension?: Dimension; message: string }[];
  human_decision: { decision: HumanDecision; differs_from_recommendation: boolean; based_on_different_report: boolean } | null;
}

/** Plain data for future renderers; no HTML evaluation or model calls. */
export function createReportViewModel(input: unknown, options: { showScore?: boolean; decision?: unknown } = {}): DomainResult<ReportViewModel> {
  const validated = validateReportContent(input);
  if (!validated.ok) return validated;
  const report = structuredClone(validated.value);
  const warnings: ReportViewModel['warnings'] = [];
  const fixture = report.provenance.kind === 'fixture';
  if (fixture) warnings.push({ code: 'FIXTURE', message: '模拟/研究演示' });
  const byClaim = new Map(report.claims.map(item => [item.claim_id, item]));
  let summary: ScoreRange | null = null;
  if (report.scorecard) {
    for (const dimension of DIMENSIONS) {
      for (const id of report.scorecard.ratings[dimension].claim_ids) {
        const status = byClaim.get(id)?.review_status;
        if (status === 'disputed' || status === 'withdrawn') warnings.push({
          code: status === 'disputed' ? 'DISPUTED_RATING' : 'WITHDRAWN_RATING', claim_id: id, dimension,
          message: status === 'disputed' ? '评分依据存在争议，分值未自动调整。' : '评分引用含已撤回主张。',
        });
      }
    }
    if (options.showScore) {
      const result = scoreRange(Object.fromEntries(DIMENSIONS.map(key => [key, report.scorecard?.ratings[key].value])));
      if (!result.ok) return result;
      summary = result.value;
    }
  }
  let human: ReportViewModel['human_decision'] = null;
  if (options.decision !== undefined) {
    const checked = validateHumanDecision(options.decision);
    if (!checked.ok) return failure(checked.error.code, '/decision', 'Invalid human decision structure.');
    if (checked.value.idea_id !== report.idea_id) return failure('INVALID_REFERENCE', '/decision/idea_id', 'Decision must belong to the same idea.');
    human = { decision: structuredClone(checked.value), differs_from_recommendation: checked.value.choice !== report.assessment.recommendation,
      based_on_different_report: checked.value.report_revision_id !== report.revision_id };
  }
  const labels = { source_statement: '来源陈述（非系统认证事实）', inference: '推断（不确定）', hypothesis: '假设（未验证）' };
  return success({ idea_id: report.idea_id, revision_id: report.revision_id, idea: report.idea,
    provenance_label: fixture ? '模拟/研究演示' : report.provenance.kind === 'model' ? '外部声明：模型生成（未核实本机运行）' : '人工记录',
    provenance_verification: 'external_declaration_not_verified', sources: report.sources,
    claims: report.claims.map(claim => ({ ...claim, kind_label: labels[claim.kind] })),
    alternatives: report.alternatives, assessment: report.assessment, scorecard: report.scorecard,
    score_summary: summary, warnings, human_decision: human });
}
