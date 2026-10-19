import type { ReportRevision, HumanDecision, ContractResult } from '../../../src/domain/contracts/index.js';

// Compiled by tsc, not executed as tests. Expected failures catch type drift.
type Recommendation = ReportRevision['assessment']['recommendation'];
const recommendation: Recommendation = 'investigate';
// @ts-expect-error not a contract enum member
const badRecommendation: Recommendation = 'publish';
// @ts-expect-error the schema version is a literal, not arbitrary string
const badVersion: HumanDecision['schema_version'] = '2.0';
// @ts-expect-error actor is human only
const badActor: HumanDecision['actor']['kind'] = 'model';
function consume(result: ContractResult<ReportRevision>): string {
  if (result.ok) return result.value.revision_id;
  return result.error.code;
}
void [recommendation, badRecommendation, badVersion, badActor, consume];
