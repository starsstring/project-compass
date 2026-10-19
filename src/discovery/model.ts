export interface SearchPlan {
  idea: string;
  queries: string[];
  terms: string[];
  method: 'explicit_query' | 'keyword_rules';
  warnings: string[];
}

export interface Repository {
  id: number;
  full_name: string;
  url: string;
  description: string | null;
  topics: string[];
  language: string | null;
  license: string | null;
  stars: number;
  pushed_at: string;
  matched_queries: string[];
}

export interface ApiCapture {
  url: string;
  fetched_at: string;
  status: number;
  remaining: string | null;
  reset: string | null;
  retry_after: string | null;
  sha256: string;
  body: string;
}

export interface Candidate extends Repository {
  analysis: CandidateAnalysis;
  relevance: { level: '较强文本关联' | '部分文本关联' | '待人工核查'; matched_terms: string[]; reason: string };
  readme: {
    status: 'captured' | 'unavailable';
    url: string | null;
    blob_sha: string | null;
    content_sha256: string | null;
    author_excerpt: string | null;
    note: string;
  };
  unknowns: string[];
}

export interface Evidence {
  id: string;
  source: 'description' | 'readme';
  url: string;
  locator: string;
  text: string;
  text_sha256: string;
}
export interface Capability {
  key: string;
  label: string;
  state: 'author_mentioned' | 'author_limited' | 'not_established';
  evidence_ids: string[];
}
export interface CandidateAnalysis {
  summary: string;
  role: string;
  capabilities: Capability[];
  evidence: Evidence[];
  limitations: { text: string; evidence_id: string }[];
}
export interface Direction {
  title: string;
  hypothesis: string;
  basis: string[];
  evidence: { repository: string; evidence_id: string; url: string; capability: string }[];
  already_available: string;
  proposed_change: string;
  validation: string;
  stop_if: string;
}

export interface DiscoveryReport {
  format: 'compass-discovery-v1.1';
  mode: 'live' | 'replay';
  created_at: string;
  plan: SearchPlan;
  status: 'complete' | 'partial';
  searches: { query: string; total_count: number | null; incomplete: boolean; error: string | null }[];
  candidates: Candidate[];
  excluded: { name: string; url: string; reason: string }[];
  directions: Direction[];
  warnings: string[];
  requests: Omit<ApiCapture, 'body'>[];
}

export class DiscoveryError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NETWORK' | 'RATE_LIMIT' | 'GITHUB' | 'BAD_RESPONSE' | 'OUTPUT', message: string) {
    super(message);
  }
}
