-- LexGate Regulatory Assistant — PostgreSQL 17 Production Schema
-- Enforces bitemporal non-overlapping versions, Privacy Guard FORCE RLS evaluated at now(),
-- composite parent-child chunk foreign keys, append-only quarantine audit log, and partial-unique outbox.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS reg;
CREATE SCHEMA IF NOT EXISTS app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_reader') THEN
    CREATE ROLE app_reader NOLOGIN;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reg.principals (
  principal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_sub text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role_label   text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.group_members (
  principal_id uuid NOT NULL REFERENCES reg.principals(principal_id),
  group_id     text NOT NULL CHECK (group_id IN ('public', 'compliance_officer', 'internal_audit')),
  valid_from   timestamptz NOT NULL,
  valid_to     timestamptz NULL,
  PRIMARY KEY (principal_id, group_id, valid_from),
  CONSTRAINT chk_membership_range CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE IF NOT EXISTS reg.documents (
  doc_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  citation_code text NOT NULL,
  source_url    text NOT NULL,
  license       text NOT NULL,
  sensitivity   text NOT NULL CHECK (sensitivity IN ('public', 'compliance_officer', 'internal_audit')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg.document_versions (
  version_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id                uuid NOT NULL REFERENCES reg.documents(doc_id),
  version_label         text NOT NULL,
  effective_from        timestamptz NOT NULL,
  effective_to          timestamptz NULL,
  supersedes_version_id uuid NULL REFERENCES reg.document_versions(version_id),
  content_hash          text NOT NULL,
  CONSTRAINT chk_version_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT excl_version_overlap EXCLUDE USING gist (
    doc_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE IF NOT EXISTS reg.acl_grants (
  doc_id   uuid NOT NULL REFERENCES reg.documents(doc_id),
  group_id text NOT NULL CHECK (group_id IN ('public', 'compliance_officer', 'internal_audit')),
  PRIMARY KEY (doc_id, group_id)
);

CREATE TABLE IF NOT EXISTS reg.chunks (
  chunk_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES reg.document_versions(version_id),
  parent_chunk_id uuid NULL,
  chunk_tier      text NOT NULL CHECK (chunk_tier IN ('parent', 'child')),
  kind            text NOT NULL CHECK (kind IN ('text', 'table')),
  page_number     integer NOT NULL CHECK (page_number >= 1),
  ocr_confidence  numeric(4,3) NOT NULL CHECK (ocr_confidence >= 0 AND ocr_confidence <= 1),
  text_content    text NOT NULL,
  token_count     integer NOT NULL CHECK (token_count >= 0),
  keywords        text[] NOT NULL DEFAULT '{}',
  UNIQUE (version_id, chunk_id),
  CONSTRAINT chk_tier_parent_consistency CHECK (
    (chunk_tier = 'parent' AND parent_chunk_id IS NULL) OR
    (chunk_tier = 'child' AND parent_chunk_id IS NOT NULL)
  ),
  CONSTRAINT fk_chunks_same_version_parent FOREIGN KEY (version_id, parent_chunk_id)
    REFERENCES reg.chunks(version_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_chunks_version ON reg.chunks (version_id);

CREATE TABLE IF NOT EXISTS reg.quarantine (
  quarantine_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL,
  doc_id         uuid NOT NULL REFERENCES reg.documents(doc_id),
  doc_title      text NOT NULL,
  page_number    integer NULL,
  reason_code    text NOT NULL,
  ocr_confidence numeric(4,3) NOT NULL,
  raw_payload    jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reg.prevent_quarantine_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '42501: permission denied for table quarantine (% blocked by append-only trigger)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_quarantine_append_only ON reg.quarantine;
CREATE TRIGGER trg_quarantine_append_only
  BEFORE UPDATE OR DELETE ON reg.quarantine
  FOR EACH ROW EXECUTE FUNCTION reg.prevent_quarantine_mutation();

CREATE TABLE IF NOT EXISTS reg.index_outbox (
  outbox_id    bigserial PRIMARY KEY,
  chunk_id     uuid NOT NULL REFERENCES reg.chunks(chunk_id),
  doc_id       uuid NOT NULL REFERENCES reg.documents(doc_id),
  op_type      text NOT NULL CHECK (op_type IN ('upsert', 'payload_sync', 'delete')),
  payload_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_pending_chunk_hash
  ON reg.index_outbox (chunk_id, payload_hash)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS reg.query_log (
  log_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id         uuid NOT NULL REFERENCES reg.principals(principal_id),
  as_of                timestamptz NOT NULL,
  query_hash           text NOT NULL,
  authorized_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  abstained            boolean NOT NULL,
  execution_mode       text NOT NULL,
  latency_ms           integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Privacy Guard ACL check: ALWAYS evaluated at now(), never user-supplied as_of
CREATE OR REPLACE FUNCTION app.can_read(p_doc_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, reg AS $$
  SELECT EXISTS (
    SELECT 1
    FROM reg.acl_grants ag
    JOIN reg.group_members gm ON gm.group_id = ag.group_id
    JOIN reg.principals p     ON p.principal_id = gm.principal_id
    WHERE ag.doc_id = p_doc_id
      AND p.is_active = true
      AND p.principal_id = NULLIF(current_setting('app.principal_id', true), '')::uuid
      AND gm.valid_from <= now()
      AND (gm.valid_to IS NULL OR gm.valid_to > now())
  );
$$;

ALTER TABLE reg.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reg.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE reg.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reg.document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE reg.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reg.chunks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_read_documents ON reg.documents;
CREATE POLICY p_read_documents ON reg.documents
  FOR SELECT TO app_reader USING (app.can_read(doc_id));

DROP POLICY IF EXISTS p_read_versions ON reg.document_versions;
CREATE POLICY p_read_versions ON reg.document_versions
  FOR SELECT TO app_reader USING (app.can_read(doc_id));

DROP POLICY IF EXISTS p_read_chunks ON reg.chunks;
CREATE POLICY p_read_chunks ON reg.chunks
  FOR SELECT TO app_reader USING (
    EXISTS (
      SELECT 1 FROM reg.document_versions dv
      WHERE dv.version_id = reg.chunks.version_id AND app.can_read(dv.doc_id)
    )
  );
