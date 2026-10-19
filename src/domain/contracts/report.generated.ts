/* Generated from contracts/report-v1.schema.json. Do not edit. Run npm run generate:types. */

/**
 * Structure only. Cross-reference, hash, change-set and decision-policy validation are application responsibilities.
 */
export type ReportRevision = {
  schema_version: '1.0';
  idea_id: string;
  revision_id: string;
  parent_revision_id: string | null;
  created_at: string;
  provenance: {
    kind: 'fixture' | 'manual' | 'model';
    producer: string;
    run_id: string | null;
    model: string | null;
    prompt_sha256: string | null;
    input_sha256: string;
  };
  idea: {
    original_text: string;
    target_user: string;
    problem: string;
    /**
     * @minItems 0
     * @maxItems 20
     */
    constraints: string[];
  };
  /**
   * @minItems 0
   * @maxItems 30
   */
  sources: {
    source_id: string;
    url: string | null;
    title: string;
    locator: string;
    collected_at: string;
    source_type: 'author_claim' | 'official_documentation' | 'user_report' | 'reproduction' | 'manual_note';
    independence_group: string;
    capture_status: 'captured' | 'metadata_only' | 'unavailable';
    content_scope: 'excerpt' | 'full_text' | 'manual_note' | 'none';
    content_text: string | null;
    content_sha256: string | null;
    retrieval_note: string;
  }[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  claims: {
    claim_id: string;
    kind: 'source_statement' | 'inference' | 'hypothesis';
    text: string;
    /**
     * @minItems 0
     * @maxItems 30
     */
    evidence: {
      source_id: string;
      relation: 'support' | 'refute' | 'context';
    }[];
    review_status: 'unreviewed' | 'supported' | 'disputed' | 'withdrawn';
    review_note: string;
  }[];
  /**
   * @minItems 1
   * @maxItems 10
   */
  alternatives: {
    alternative_id: string;
    title: string;
    change: string;
    /**
     * @minItems 1
     * @maxItems 20
     */
    tradeoffs: string[];
    /**
     * @minItems 0
     * @maxItems 20
     */
    assumptions: string[];
    validation_action: string;
  }[];
  assessment: {
    recommendation: 'investigate' | 'build_small' | 'use_existing' | 'contribute' | 'pause' | 'stop';
    reason: string;
    /**
     * @minItems 0
     * @maxItems 100
     */
    claim_ids: string[];
    alternative_id: string | null;
    /**
     * @minItems 0
     * @maxItems 30
     */
    unknowns: string[];
    /**
     * @minItems 2
     * @maxItems 20
     */
    conditions: {
      key: string;
      state: 'met' | 'unmet' | 'unknown';
      reason: string;
      /**
       * @minItems 0
       * @maxItems 100
       */
      claim_ids: string[];
    }[];
    next_action: string;
  };
  scorecard: null | {
    version: 'compass-v0.3';
    ratings: {
      demand: {
        value: number | null;
        reason: string;
        /**
         * @minItems 0
         * @maxItems 100
         */
        claim_ids: string[];
      };
      gap: {
        value: number | null;
        reason: string;
        /**
         * @minItems 0
         * @maxItems 100
         */
        claim_ids: string[];
      };
      distribution: {
        value: number | null;
        reason: string;
        /**
         * @minItems 0
         * @maxItems 100
         */
        claim_ids: string[];
      };
      feasibility: {
        value: number | null;
        reason: string;
        /**
         * @minItems 0
         * @maxItems 100
         */
        claim_ids: string[];
      };
      retention: {
        value: number | null;
        reason: string;
        /**
         * @minItems 0
         * @maxItems 100
         */
        claim_ids: string[];
      };
      demo: {
        value: number | null;
        reason: string;
        /**
         * @minItems 0
         * @maxItems 100
         */
        claim_ids: string[];
      };
    };
  };
  change: {
    kind:
      'initial' | 'new_evidence' | 'evidence_correction' | 'idea_change' | 'interpretation_change' | 'review_update';
    reason: string;
    /**
     * @minItems 0
     * @maxItems 200
     */
    changed_claim_ids: string[];
    /**
     * @minItems 0
     * @maxItems 100
     */
    changed_source_ids: string[];
  };
};
