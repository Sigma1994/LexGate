export type GroupId = 'public' | 'compliance_officer' | 'internal_audit';
export type ExecutionMode = 'airgapped_local' | 'hosted_api';
export type QuarantineReasonCode =
  | 'LOW_OCR_CONFIDENCE'
  | 'JAGGED_TABLE_COLUMNS'
  | 'MISSING_PAGE_ANCHOR'
  | 'EMPTY_TABLE_HEADER'
  | 'INVALID_NUMERIC_OR_DATE';

export interface Principal {
  principal_id: string;
  external_sub: string;
  display_name: string;
  role_label: string;
  is_active: boolean;
  created_at: string;
}

export interface GroupMembership {
  principal_id: string;
  group_id: GroupId;
  valid_from: string;
  valid_to: string | null;
}

export interface RegulatoryDocument {
  doc_id: string;
  title: string;
  citation_code: string;
  source_url: string;
  license: string;
  sensitivity: GroupId;
  created_at: string;
}

export interface DocumentVersion {
  version_id: string;
  doc_id: string;
  version_label: string;
  effective_from: string;
  effective_to: string | null;
  supersedes_version_id: string | null;
  content_hash: string;
}

export interface DocumentChunk {
  chunk_id: string;
  version_id: string;
  parent_chunk_id: string | null;
  chunk_tier: 'parent' | 'child';
  kind: 'text' | 'table';
  page_number: number;
  ocr_confidence: number;
  text_content: string;
  token_count: number;
  keywords: string[];
}

export interface QdrantPoint {
  chunk_id: string;
  doc_id: string;
  version_id: string;
  allowed_groups: GroupId[];
  effective_from_ts: number;
  effective_to_ts: number;
  text_content: string;
  keywords: string[];
}

export interface OutboxEntry {
  outbox_id: number;
  chunk_id: string;
  doc_id: string;
  op_type: 'upsert' | 'payload_sync' | 'delete';
  payload_hash: string;
  created_at: string;
  processed_at: string | null;
}

export interface QuarantineRecord {
  quarantine_id: string;
  run_id: string;
  doc_id: string;
  doc_title: string;
  page_number: number | null;
  reason_code: QuarantineReasonCode;
  ocr_confidence: number;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface QueryLogEntry {
  log_id: string;
  principal_id: string;
  as_of: string;
  query_hash: string;
  authorized_citations: Array<{ doc_title: string; version_label: string; page_number: number }>;
  abstained: boolean;
  execution_mode: ExecutionMode;
  latency_ms: number;
  created_at: string;
}

export interface StageTrace {
  stage1: {
    principal_id: string;
    is_active: boolean;
    active_groups_at_now: GroupId[];
    as_of_iso: string;
    corpus_epoch: number;
    cache_key: string;
    cache_hit: boolean;
    cache_backend?: 'live_redis' | 'embedded_memory';
    short_circuited: boolean;
  };
  stage2: {
    qdrant_filter_summary: string;
    with_payload: false;
    candidate_count: number;
    candidates: Array<{
      chunk_id: string;
      doc_id: string;
      rrf_score: number;
      qdrant_allowed_groups: GroupId[];
    }>;
  };
  stage3: {
    rls_evaluated_at_now: true;
    surviving_count: number;
    dropped_by_rls_count: number;
    dropped_reasons: Array<{
      chunk_id: string;
      doc_id: string;
      reason: string;
    }>;
  };
  stage4: {
    reranked_children: Array<{
      chunk_id: string;
      parent_chunk_id: string | null;
      doc_title: string;
      version_label: string;
      page_number: number;
      kind: 'text' | 'table';
      rerank_score: number;
    }>;
    expanded_parents: Array<{
      chunk_id: string;
      doc_title: string;
      version_label: string;
      page_number: number;
      text_content: string;
    }>;
    threshold_passed: boolean;
  };
  stage5: {
    execution_mode: ExecutionMode;
    model_used: string | null;
    outbound_bytes: number;
    tier1_citation_valid: boolean;
    tier2_entailment_valid: boolean;
    verification_notes: string;
  };
}

export interface QueryResponse {
  answer: string;
  abstained: boolean;
  abstention_reason: string | null;
  citations: Array<{
    doc_title: string;
    version_label: string;
    page_number: number;
    quoted_span: string;
  }>;
  trace: StageTrace;
  query_log_entry: QueryLogEntry;
  latency_ms: number;
}

export interface InvariantTestResult {
  id: string;
  name: string;
  category: 'db-test' | 'security' | 'oracle';
  passed: boolean;
  duration_ms: number;
  assertion_summary: string;
  details: string;
}

export interface VerificationSuiteResponse {
  ran_at: string;
  total: number;
  passed_count: number;
  results: InvariantTestResult[];
  explain_plan_sample: string[];
}

export interface GoldenSmokeQuestion {
  question_id: string;
  category: 'text' | 'table' | 'temporal' | 'unanswerable';
  question_text: string;
  as_of: string;
  principal_id: string;
  gold_version_id: string | null;
  gold_page: number | null;
  expected_abstain: boolean;
  provenance_note: string;
}

export interface SmokeEvalVariantRow {
  variant: string;
  label: string;
  recall_at_10: number;
  mrr: number;
  abstention_f1: number;
  avg_latency_ms: number;
}

export interface LedgerSnapshot {
  corpus_epoch: number;
  index_worker_paused: boolean;
  principals: Array<Principal & { active_groups_now: GroupId[]; memberships: GroupMembership[] }>;
  documents: Array<
    RegulatoryDocument & {
      postgres_acl_groups: GroupId[];
      qdrant_acl_groups: GroupId[];
      acl_in_sync: boolean;
      versions: DocumentVersion[];
    }
  >;
  outbox: OutboxEntry[];
  quarantine: QuarantineRecord[];
  query_log: QueryLogEntry[];
  cache_entries_count: number;
  stats: {
    document_count: number;
    version_count: number;
    parent_chunk_count: number;
    child_chunk_count: number;
    qdrant_point_count: number;
    quarantine_count: number;
  };
}

export interface SystemRuntimeStatus {
  qdrant: {
    mode: 'live_http' | 'embedded_memory';
    url: string;
    collection: string;
    reachable: boolean;
    live_points: number | null;
    note: string;
  };
  ollama: {
    available: boolean;
    url: string;
    chat_model: string;
    embed_model: string;
    installed_models: string[];
    note: string;
  };
  redis: {
    mode: 'live_redis' | 'embedded_memory';
    url: string;
    reachable: boolean;
    ttl_seconds: number;
    live_keys: number | null;
    note: string;
  };
  llm_provider_setting: 'auto' | 'ollama' | 'gemini';
  active_default_llm: string;
  gemini_configured: boolean;
}

export interface UploadDocumentResult {
  doc_id: string;
  version_id: string;
  title: string;
  citation_code: string;
  sensitivity: GroupId;
  effective_from: string;
  parent_chunks_created: number;
  child_chunks_indexed: number;
  quarantined_count: number;
  qdrant_target: 'Live Qdrant HTTP + Local Index' | 'Embedded Vector Index';
  embedding_source: string;
  corpus_epoch: number;
}

export interface PipelineInspectResponse {
  query: string;
  tokens: string[];
  expanded_terms: string[];
  embedding_preview: number[];
  embedding_dims: number;
  embedding_source: string;
  redis_cache_key: string;
  redis_cache_status: 'HIT (Live Redis)' | 'HIT (In-Memory)' | 'MISS';
  redis_backend: 'live_redis' | 'embedded_memory';
  qdrant_filter_json: Record<string, unknown>;
  matched_chunks: Array<{
    chunk_id: string;
    doc_title: string;
    version_label: string;
    page_number: number;
    bm25_score: number;
    dense_score: number;
    rrf_score: number;
    allowed_by_privacy_guard: boolean;
  }>;
  llm_system_prompt: string;
  llm_evidence_prompt_preview: string;
}
