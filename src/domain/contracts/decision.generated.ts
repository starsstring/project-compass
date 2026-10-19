/* Generated from contracts/decision-v1.schema.json. Do not edit. Run npm run generate:types. */

export interface HumanDecision {
  schema_version: '1.0';
  idea_id: string;
  decision_id: string;
  report_revision_id: string;
  supersedes_decision_id: string | null;
  decided_at: string;
  actor: {
    kind: 'human';
    id: string;
  };
  choice: 'build_small' | 'use_existing' | 'contribute' | 'pause' | 'stop';
  reason: string;
}
