import type { Candidate, DiscoveryReport } from '../discovery/model.js';

export interface AiSource {
  id: string;
  repository: string;
  kind: 'description' | 'readme';
  url: string;
  captured_at: string;
  response_sha256: string;
  blob_sha: string | null;
  text: string;
  text_sha256: string;
  line_count: number;
}
export interface AiInput {
  format: 'compass-ai-input-v1';
  sha256: string;
  content: {
    idea: string;
    queries: string[];
    status: DiscoveryReport['status'];
    candidates: {
      repository: string; url: string; description: string | null; language: string | null;
      license: string | null; stars: number; pushed_at: string; readme_status: Candidate['readme']['status'];
    }[];
    sources: AiSource[];
    warnings: string[];
  };
}
export interface EvidenceRef { source_id: string; start_line: number; end_line: number }
export type AiClaim =
  | { id: string; kind: 'author_statement'; repository: string; text: string; evidence: EvidenceRef[] }
  | { id: string; kind: 'inference'; text: string; basis_ids: string[]; assumptions: string[] }
  | { id: string; kind: 'unknown'; text: string; reason: string };
export interface AiReview {
  format: 'compass-ai-review-v1';
  input_sha256: string;
  claims: AiClaim[];
  comparisons: { repository: string; basis_ids: string[]; assessment: string; unknown_ids: string[] }[];
  directions: { id: string; title: string; basis_ids: string[]; condition: string; proposed_change: string;
    validation: { input: string; steps: string[]; expected_output: string }; stop_if: string }[];
  recommended_first_step: { direction_id: string | null; reason: string };
  limitations: string[];
}
export interface AiReviewResult {
  format: 'compass-ai-review-result-v1';
  imported_at: string;
  validation: { structure_and_references: 'passed'; semantic_support: 'not_checked'; generator_identity: 'not_verified' };
  input_sha256: string;
  review: AiReview;
}
