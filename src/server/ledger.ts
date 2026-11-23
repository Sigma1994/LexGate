import crypto from 'node:crypto';
import { STOPWORDS, chunkDocumentPages, tokenize, type PageInput } from './chunker.ts';
import {
  MAX_EPOCH_SENTINEL_TS,
  SEED_ACL_GRANTS,
  SEED_CHUNKS,
  SEED_DOCUMENTS,
  SEED_MEMBERSHIPS,
  SEED_PRINCIPALS,
  SEED_QUARANTINE,
  SEED_VERSIONS,
} from './corpus.ts';
import type {
  DocumentChunk,
  DocumentFirstPagePreview,
  DocumentVersion,
  GroupId,
  GroupMembership,
  LedgerSnapshot,
  OutboxEntry,
  Principal,
  QdrantPoint,
  QuarantineRecord,
  QueryLogEntry,
  QueryResponse,
  RegulatoryDocument,
} from '../shared/types.ts';

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function isoToUnixSec(iso: string | null): number {
  if (iso === null) return MAX_EPOCH_SENTINEL_TS;
  return Math.floor(new Date(iso).getTime() / 1000);
}

const SYNONYM_CLUSTERS: string[][] = [
  ['capital adequacy', 'tier 1', 'core capital', 'trwa', 'solvency', 'd-sib', 'surcharge', 'banking act', 'cap 488', 'staggered'],
  ['liquidity', 'lcr', 'deposit', 'haircut', 'stress', 'bsd-l1', 'contingency'],
  ['central bank of kenya', 'cap 491', 'authorized capital', 'shillings'],
  ['oag', 'nostro', 'suspense', 'variance', 'shortfall', 'reconciled', 'insider lending', 'net open position'],
  ['data protection', 'odpc', 'data breach', '72 hours', 'cross-border', 'pii', 'dpia'],
  ['cyber', 'cybersecurity', 'cyber incident', 'rto', 'rpo', 'ai governance', 'machine learning', 'artificial intelligence', 'human-in-the-loop'],
  ['aml', 'cft', 'ctr', 'str', 'frc', 'vasp', 'virtual asset', 'travel rule', 'pep', 'money laundering'],
  ['ifrs 9', 'ecl', 'expected credit loss', 'dpd', 'days past due', 'npl', 'stage 1', 'stage 2', 'stage 3', 'coverage'],
];

function expandTerms(text: string): Set<string> {
  const tokens = tokenize(text);
  const tokenSet = new Set(tokens);
  const expanded = new Set(tokens);
  const joined = ` ${tokens.join(' ')} `;
  for (const cluster of SYNONYM_CLUSTERS) {
    const matched = cluster.some((kw) =>
      kw.includes(' ') ? joined.includes(` ${kw} `) : tokenSet.has(kw)
    );
    if (matched) {
      for (const kw of cluster) {
        for (const sub of kw.split(/\s+/)) {
          expanded.add(sub);
        }
      }
    }
  }
  return expanded;
}

export class RegulatoryLedger {
  public principals: Principal[] = [];
  public memberships: GroupMembership[] = [];
  public documents: RegulatoryDocument[] = [];
  public versions: DocumentVersion[] = [];
  public aclGrants: Array<{ doc_id: string; group_id: GroupId }> = [];
  public chunks: DocumentChunk[] = [];
  public quarantine: QuarantineRecord[] = [];
  public outbox: OutboxEntry[] = [];
  public qdrantPoints: Map<string, QdrantPoint> = new Map();
  public queryLog: QueryLogEntry[] = [];
  public semanticCache: Map<string, QueryResponse> = new Map();
  public corpusEpoch = 1;
  public indexWorkerPaused = false;
  private nextOutboxId = 1;

  constructor(options?: { empty?: boolean }) {
    this.reset(options);
  }

  public reset(options?: { empty?: boolean }): void {
    const empty = Boolean(options?.empty);
    this.principals = structuredClone(SEED_PRINCIPALS);
    this.memberships = structuredClone(SEED_MEMBERSHIPS);
    this.documents = empty ? [] : structuredClone(SEED_DOCUMENTS);
    this.versions = empty ? [] : structuredClone(SEED_VERSIONS);
    this.aclGrants = empty ? [] : structuredClone(SEED_ACL_GRANTS);
    this.chunks = empty ? [] : structuredClone(SEED_CHUNKS);
    this.quarantine = empty ? [] : structuredClone(SEED_QUARANTINE);
    this.outbox = [];
    this.qdrantPoints = new Map();
    this.queryLog = [];
    this.semanticCache = new Map();
    this.corpusEpoch = empty ? this.corpusEpoch + 1 : 1;
    this.indexWorkerPaused = false;
    this.nextOutboxId = 1;

    // Initial Qdrant projection sync (child chunks ONLY)
    for (const chunk of this.chunks) {
      if (chunk.chunk_tier !== 'child') continue;
      const point = this.buildQdrantPoint(chunk);
      if (point) {
        this.qdrantPoints.set(chunk.chunk_id, point);
      }
    }
  }

  public deleteDocument(docId: string): { deleted: boolean; deletedChunkIds: string[] } {
    const docIdx = this.documents.findIndex((d) => d.doc_id === docId);
    if (docIdx === -1) {
      return { deleted: false, deletedChunkIds: [] };
    }
    this.documents.splice(docIdx, 1);

    const versionIds = new Set(
      this.versions.filter((v) => v.doc_id === docId).map((v) => v.version_id)
    );
    this.versions = this.versions.filter((v) => v.doc_id !== docId);
    this.aclGrants = this.aclGrants.filter((g) => g.doc_id !== docId);

    const deletedChunkIds = this.chunks
      .filter((c) => versionIds.has(c.version_id) && c.chunk_tier === 'child')
      .map((c) => c.chunk_id);

    this.chunks = this.chunks.filter((c) => !versionIds.has(c.version_id));
    this.quarantine = this.quarantine.filter((q) => q.doc_id !== docId);
    this.outbox = this.outbox.filter((o) => o.doc_id !== docId);
    for (const cid of deletedChunkIds) {
      this.qdrantPoints.delete(cid);
    }
    this.semanticCache.clear();
    this.corpusEpoch += 1;
    return { deleted: true, deletedChunkIds };
  }

  public bulkDeleteDocuments(docIds: string[]): {
    deletedCount: number;
    deletedChunkIds: string[];
  } {
    const allDeletedChunkIds: string[] = [];
    let deletedCount = 0;
    for (const id of docIds) {
      const outcome = this.deleteDocument(id);
      if (outcome.deleted) {
        deletedCount += 1;
        allDeletedChunkIds.push(...outcome.deletedChunkIds);
      }
    }
    return { deletedCount, deletedChunkIds: allDeletedChunkIds };
  }

  public reprocessDocuments(docIds: string[]): {
    reprocessedCount: number;
    removedChunkIds: string[];
    upsertedPoints: QdrantPoint[];
  } {
    const targetIds = new Set(docIds);
    const nowIso = new Date().toISOString();
    const removedChunkIds: string[] = [];
    const upsertedPoints: QdrantPoint[] = [];
    let reprocessedCount = 0;

    for (const doc of this.documents) {
      if (!targetIds.has(doc.doc_id)) continue;
      const docVersions = this.versions.filter((v) => v.doc_id === doc.doc_id);
      if (docVersions.length === 0) continue;

      reprocessedCount += 1;
      const runId = crypto.randomUUID();

      for (const ver of docVersions) {
        const existingParents = this.chunks
          .filter((c) => c.version_id === ver.version_id && c.chunk_tier === 'parent')
          .sort((a, b) => a.page_number - b.page_number);
        const existingChildren = this.chunks.filter(
          (c) => c.version_id === ver.version_id && c.chunk_tier === 'child'
        );

        for (const ch of existingChildren) {
          removedChunkIds.push(ch.chunk_id);
          this.qdrantPoints.delete(ch.chunk_id);
        }

        const pageMap = new Map<number, string[]>();
        for (const p of existingParents) {
          const list = pageMap.get(p.page_number) ?? [];
          list.push(p.text_content);
          pageMap.set(p.page_number, list);
        }
        const pagesToRechunk: PageInput[] = Array.from(pageMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([page_number, texts]) => ({
            page_number,
            text: texts.join('\n\n'),
          }));

        if (pagesToRechunk.length === 0) continue;

        this.chunks = this.chunks.filter((c) => c.version_id !== ver.version_id);

        const chunked = chunkDocumentPages({
          doc_id: doc.doc_id,
          doc_title: doc.title,
          version_id: ver.version_id,
          citation_code: doc.citation_code,
          pages: pagesToRechunk,
          run_id: runId,
          now_iso: nowIso,
          ocr_confidence: existingParents[0]?.ocr_confidence ?? 0.99,
          first_parent_id:
            ver.version_id === '33333333-3333-4333-8333-333333333301'
              ? '44444444-4444-4444-8444-444444444401'
              : undefined,
        });

        for (const pChunk of chunked.parentChunks) {
          this.addChunk(pChunk);
        }
        const payloadHash = this.computePayloadHash(doc.doc_id, ver);
        for (const cChunk of chunked.childChunks) {
          const added = this.addChunk(cChunk);
          if (added.ok) {
            this.outbox.push({
              outbox_id: this.nextOutboxId++,
              chunk_id: cChunk.chunk_id,
              doc_id: doc.doc_id,
              op_type: 'upsert',
              payload_hash: payloadHash,
              created_at: nowIso,
              processed_at: this.indexWorkerPaused ? null : nowIso,
            });
            const pt = this.buildQdrantPoint(cChunk);
            if (pt) {
              if (!this.indexWorkerPaused) {
                this.qdrantPoints.set(cChunk.chunk_id, pt);
              }
              upsertedPoints.push(pt);
            }
          }
        }
      }
    }

    if (reprocessedCount > 0) {
      this.semanticCache.clear();
      this.corpusEpoch += 1;
    }

    return { reprocessedCount, removedChunkIds, upsertedPoints };
  }

  public clone(): RegulatoryLedger {
    const copy = new RegulatoryLedger();
    copy.principals = structuredClone(this.principals);
    copy.memberships = structuredClone(this.memberships);
    copy.documents = structuredClone(this.documents);
    copy.versions = structuredClone(this.versions);
    copy.aclGrants = structuredClone(this.aclGrants);
    copy.chunks = structuredClone(this.chunks);
    copy.quarantine = structuredClone(this.quarantine);
    copy.outbox = structuredClone(this.outbox);
    copy.qdrantPoints = new Map(structuredClone(Array.from(this.qdrantPoints.entries())));
    copy.queryLog = structuredClone(this.queryLog);
    copy.semanticCache = new Map(structuredClone(Array.from(this.semanticCache.entries())));
    copy.corpusEpoch = this.corpusEpoch;
    copy.indexWorkerPaused = this.indexWorkerPaused;
    copy.nextOutboxId = this.nextOutboxId;
    return copy;
  }

  private getVersion(versionId: string): DocumentVersion | undefined {
    return this.versions.find((v) => v.version_id === versionId);
  }

  public getDocAclGroups(docId: string): GroupId[] {
    return this.aclGrants
      .filter((g) => g.doc_id === docId)
      .map((g) => g.group_id)
      .sort();
  }

  private computePayloadHash(docId: string, version: DocumentVersion): string {
    const groups = this.getDocAclGroups(docId);
    return sha256(
      JSON.stringify({
        groups,
        effective_from: version.effective_from,
        effective_to: version.effective_to,
      })
    ).slice(0, 16);
  }

  private buildQdrantPoint(chunk: DocumentChunk): QdrantPoint | null {
    if (chunk.chunk_tier !== 'child') return null;
    const version = this.getVersion(chunk.version_id);
    if (!version) return null;
    const allowed_groups = this.getDocAclGroups(version.doc_id);
    return {
      chunk_id: chunk.chunk_id,
      doc_id: version.doc_id,
      version_id: version.version_id,
      allowed_groups,
      effective_from_ts: isoToUnixSec(version.effective_from),
      effective_to_ts: isoToUnixSec(version.effective_to),
      text_content: chunk.text_content,
      keywords: chunk.keywords,
    };
  }

  // Mirrors app.current_principal_groups() — strictly at now(), checking principals.is_active
  public currentPrincipalGroups(principalId: string | null | undefined, nowMs = Date.now()): GroupId[] {
    if (!principalId || principalId.trim() === '') return [];
    const principal = this.principals.find((p) => p.principal_id === principalId);
    if (!principal || !principal.is_active) return [];

    const groups = new Set<GroupId>();
    for (const m of this.memberships) {
      if (m.principal_id !== principalId) continue;
      const fromMs = new Date(m.valid_from).getTime();
      const toMs = m.valid_to === null ? Infinity : new Date(m.valid_to).getTime();
      if (fromMs <= nowMs && toMs > nowMs) {
        groups.add(m.group_id);
      }
    }
    return Array.from(groups).sort();
  }

  // Mirrors app.can_read(p_doc_id) — strictly at now(), NEVER user-supplied as_of
  public canRead(principalId: string | null | undefined, docId: string, nowMs = Date.now()): boolean {
    const activeGroups = this.currentPrincipalGroups(principalId, nowMs);
    if (activeGroups.length === 0) return false;
    const docGroups = this.getDocAclGroups(docId);
    return docGroups.some((g) => activeGroups.includes(g));
  }

  // Mirrors half-open [effective_from, effective_to) with NULL = open-ended active law
  public isVersionEffective(version: DocumentVersion, asOfMs: number): boolean {
    const fromMs = new Date(version.effective_from).getTime();
    const toMs = version.effective_to === null ? Infinity : new Date(version.effective_to).getTime();
    return fromMs <= asOfMs && toMs > asOfMs;
  }

  // Declarative GIST overlap check for document_versions
  public addDocumentVersion(newVer: DocumentVersion): { ok: boolean; error?: string } {
    const newFrom = new Date(newVer.effective_from).getTime();
    const newTo = newVer.effective_to === null ? Infinity : new Date(newVer.effective_to).getTime();
    if (newTo <= newFrom) {
      return { ok: false, error: '23514: new row violates check constraint "chk_version_range"' };
    }
    for (const existing of this.versions) {
      if (existing.doc_id !== newVer.doc_id) continue;
      const exFrom = new Date(existing.effective_from).getTime();
      const exTo = existing.effective_to === null ? Infinity : new Date(existing.effective_to).getTime();
      if (newFrom < exTo && newTo > exFrom) {
        return {
          ok: false,
          error: '23P01: conflicting key value violates exclusion constraint "excl_version_overlap"',
        };
      }
    }
    this.versions.push(newVer);
    this.corpusEpoch += 1;
    return { ok: true };
  }

  // Declarative composite FK check (version_id, parent_chunk_id)
  public addChunk(chunk: DocumentChunk): { ok: boolean; error?: string } {
    if (chunk.chunk_tier === 'child') {
      if (!chunk.parent_chunk_id) {
        return { ok: false, error: '23514: violates check constraint "chk_tier_parent_consistency"' };
      }
      const parent = this.chunks.find(
        (c) => c.chunk_id === chunk.parent_chunk_id && c.version_id === chunk.version_id
      );
      if (!parent) {
        return {
          ok: false,
          error:
            '23503: insert on table "chunks" violates foreign key constraint "fk_chunks_same_version_parent"',
        };
      }
    }
    this.chunks.push(chunk);
    return { ok: true };
  }

  // Direct Policy Document Upload -> Safety Hold Validation -> Parent/Child Chunking -> Qdrant Outbox
  public ingestPolicyDocument(input: {
    title: string;
    citation_code: string;
    sensitivity: GroupId;
    effective_from: string;
    version_label?: string;
    source_url?: string;
    raw_text: string;
    pages?: PageInput[];
  }): {
    doc_id: string;
    version_id: string;
    title: string;
    citation_code: string;
    sensitivity: GroupId;
    effective_from: string;
    parent_chunks_created: number;
    child_chunks_indexed: number;
    quarantined_count: number;
    points: QdrantPoint[];
  } {
    const parsedFrom = new Date(input.effective_from);
    if (Number.isNaN(parsedFrom.getTime())) {
      throw new Error('Invalid effective_from date.');
    }
    const effectiveFromIso = parsedFrom.toISOString();
    const nowIso = new Date().toISOString();
    const docId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    const doc: RegulatoryDocument = {
      doc_id: docId,
      title: input.title.trim(),
      citation_code: input.citation_code.trim(),
      source_url: input.source_url?.trim() || 'uploaded://policy-library',
      license: 'Uploaded Policy Document',
      sensitivity: input.sensitivity,
      created_at: nowIso,
    };
    this.documents.push(doc);

    const allowedHierarchy: GroupId[] =
      input.sensitivity === 'public'
        ? ['public', 'compliance_officer', 'internal_audit']
        : input.sensitivity === 'compliance_officer'
          ? ['compliance_officer', 'internal_audit']
          : ['internal_audit'];

    for (const grp of allowedHierarchy) {
      this.aclGrants.push({ doc_id: docId, group_id: grp });
    }

    const version: DocumentVersion = {
      version_id: versionId,
      doc_id: docId,
      version_label:
        input.version_label?.trim() ||
        `${doc.citation_code} (${effectiveFromIso.slice(0, 4)} Upload)`,
      effective_from: effectiveFromIso,
      effective_to: null,
      supersedes_version_id: null,
      content_hash: `sha256:${sha256(input.raw_text).slice(0, 16)}`,
    };
    const verAdd = this.addDocumentVersion(version);
    if (!verAdd.ok) {
      throw new Error(verAdd.error ?? 'Failed to add document version.');
    }

    let pagesToChunk: PageInput[];
    if (input.pages && input.pages.length > 0) {
      pagesToChunk = input.pages
        .map((p, idx) => ({
          page_number: Number.isFinite(p.page_number) && p.page_number > 0 ? Math.floor(p.page_number) : idx + 1,
          text: String(p.text ?? '').trim(),
        }))
        .filter((p) => p.text.length > 0);
    } else {
      const rawSections = input.raw_text
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const fallbackSections = rawSections.length > 0 ? rawSections : [input.raw_text.trim()];
      pagesToChunk = fallbackSections.map((text, idx) => ({
        page_number: idx + 1,
        text,
      }));
    }

    const chunked = chunkDocumentPages({
      doc_id: docId,
      doc_title: doc.title,
      version_id: versionId,
      citation_code: doc.citation_code,
      pages: pagesToChunk,
      run_id: runId,
      now_iso: nowIso,
      ocr_confidence: 0.99,
    });

    for (const qRec of chunked.quarantined) {
      this.quarantine.push(qRec);
    }
    for (const parentChunk of chunked.parentChunks) {
      this.addChunk(parentChunk);
    }

    let childCount = 0;
    const createdPoints: QdrantPoint[] = [];
    const payloadHash = this.computePayloadHash(docId, version);

    for (const childChunk of chunked.childChunks) {
      const added = this.addChunk(childChunk);
      if (added.ok) {
        childCount += 1;
        this.outbox.push({
          outbox_id: this.nextOutboxId++,
          chunk_id: childChunk.chunk_id,
          doc_id: docId,
          op_type: 'upsert',
          payload_hash: payloadHash,
          created_at: nowIso,
          processed_at: this.indexWorkerPaused ? null : nowIso,
        });
        const pt = this.buildQdrantPoint(childChunk);
        if (pt) {
          if (!this.indexWorkerPaused) {
            this.qdrantPoints.set(childChunk.chunk_id, pt);
          }
          createdPoints.push(pt);
        }
      }
    }

    this.corpusEpoch += 1;

    return {
      doc_id: docId,
      version_id: versionId,
      title: doc.title,
      citation_code: doc.citation_code,
      sensitivity: doc.sensitivity,
      effective_from: effectiveFromIso,
      parent_chunks_created: chunked.parentChunks.length,
      child_chunks_indexed: childCount,
      quarantined_count: chunked.quarantined.length,
      points: createdPoints,
    };
  }

  // Simulates REVOKE UPDATE, DELETE + trigger on reg.quarantine
  public attemptQuarantineMutation(_quarantineId: string, op: 'UPDATE' | 'DELETE'): { ok: false; error: string } {
    return {
      ok: false,
      error: `42501: permission denied for table quarantine (${op} blocked by privilege revocation and append-only trigger)`,
    };
  }

  // Transactional ACL mutation + corpus_epoch increment + partial-unique index outbox enqueue
  public mutateAclGrant(
    docId: string,
    groupId: GroupId,
    action: 'grant' | 'revoke'
  ): { changed: boolean; corpus_epoch: number; enqueued: number } {
    const existsIdx = this.aclGrants.findIndex((g) => g.doc_id === docId && g.group_id === groupId);
    let changed = false;

    if (action === 'grant' && existsIdx === -1) {
      this.aclGrants.push({ doc_id: docId, group_id: groupId });
      changed = true;
    } else if (action === 'revoke' && existsIdx !== -1) {
      this.aclGrants.splice(existsIdx, 1);
      changed = true;
    }

    if (!changed) {
      return { changed: false, corpus_epoch: this.corpusEpoch, enqueued: 0 };
    }

    // Increment corpus_epoch atomically inside the transaction
    this.corpusEpoch += 1;

    // Enqueue payload_sync rows ONLY for child chunks (mirrors partial unique index WHERE processed_at IS NULL)
    let enqueued = 0;
    const docVersions = this.versions.filter((v) => v.doc_id === docId);
    for (const ver of docVersions) {
      const payloadHash = this.computePayloadHash(docId, ver);
      const childChunks = this.chunks.filter(
        (c) => c.version_id === ver.version_id && c.chunk_tier === 'child'
      );
      for (const ch of childChunks) {
        const alreadyPending = this.outbox.some(
          (o) => o.chunk_id === ch.chunk_id && o.payload_hash === payloadHash && o.processed_at === null
        );
        if (!alreadyPending) {
          this.outbox.push({
            outbox_id: this.nextOutboxId++,
            chunk_id: ch.chunk_id,
            doc_id: docId,
            op_type: 'payload_sync',
            payload_hash: payloadHash,
            created_at: new Date().toISOString(),
            processed_at: null,
          });
          enqueued += 1;
        }
      }
    }

    if (!this.indexWorkerPaused) {
      this.processOutbox();
    }

    return { changed: true, corpus_epoch: this.corpusEpoch, enqueued };
  }

  public processOutbox(): number {
    let processed = 0;
    const nowIso = new Date().toISOString();
    for (const item of this.outbox) {
      if (item.processed_at !== null) continue;
      const chunk = this.chunks.find((c) => c.chunk_id === item.chunk_id);
      if (chunk) {
        const point = this.buildQdrantPoint(chunk);
        if (point) {
          this.qdrantPoints.set(chunk.chunk_id, point);
        }
      }
      item.processed_at = nowIso;
      processed += 1;
    }
    return processed;
  }

  public injectQdrantDrift(docId: string, staleGroups: GroupId[]): number {
    let modified = 0;
    for (const [id, point] of this.qdrantPoints.entries()) {
      if (point.doc_id === docId) {
        this.qdrantPoints.set(id, { ...point, allowed_groups: [...staleGroups] });
        modified += 1;
      }
    }
    return modified;
  }

  public reconcileDrift(): { drifted_chunks: number; healed_chunks: number } {
    let drifted = 0;
    for (const [chunkId, point] of this.qdrantPoints.entries()) {
      const expectedGroups = this.getDocAclGroups(point.doc_id);
      const actualGroups = [...point.allowed_groups].sort();
      if (JSON.stringify(expectedGroups) !== JSON.stringify(actualGroups)) {
        drifted += 1;
        const chunk = this.chunks.find((c) => c.chunk_id === chunkId);
        if (chunk) {
          const ver = this.getVersion(chunk.version_id);
          if (ver) {
            const payloadHash = this.computePayloadHash(point.doc_id, ver);
            const alreadyPending = this.outbox.some(
              (o) => o.chunk_id === chunkId && o.payload_hash === payloadHash && o.processed_at === null
            );
            if (!alreadyPending) {
              this.outbox.push({
                outbox_id: this.nextOutboxId++,
                chunk_id: chunkId,
                doc_id: point.doc_id,
                op_type: 'payload_sync',
                payload_hash: payloadHash,
                created_at: new Date().toISOString(),
                processed_at: null,
              });
            }
          }
        }
      }
    }
    const healed = this.processOutbox();
    return { drifted_chunks: drifted, healed_chunks: healed };
  }

  // Stage 2: Qdrant Hybrid (BM25 + Dense Semantic RRF) with_payload=False
  public qdrantHybridSearch(
    query: string,
    principalGroups: GroupId[],
    asOfMs: number,
    mode: 'bm25' | 'dense' | 'hybrid_rrf' = 'hybrid_rrf',
    limit = 50
  ): Array<{ chunk_id: string; doc_id: string; rrf_score: number; qdrant_allowed_groups: GroupId[] }> {
    if (principalGroups.length === 0) return [];
    const asOfSec = Math.floor(asOfMs / 1000);
    const qTerms = expandTerms(query);
    const qLower = query.toLowerCase();

    const filtered: QdrantPoint[] = [];
    for (const point of this.qdrantPoints.values()) {
      const groupMatch = point.allowed_groups.some((g) => principalGroups.includes(g));
      const temporalMatch = point.effective_from_ts <= asOfSec && point.effective_to_ts > asOfSec;
      if (groupMatch && temporalMatch) {
        filtered.push(point);
      }
    }

    const bm25Scores = new Map<string, number>();
    const denseScores = new Map<string, number>();
    const rawWords = Array.from(
      new Set(tokenize(qLower).filter((w) => w.length > 2 && !STOPWORDS.has(w)))
    );

    // Document frequency across authorized temporal slice for true BM25/IDF precision
    const chunkTokenSets = new Map<string, Set<string>>();
    const df = new Map<string, number>();
    for (const p of filtered) {
      const tokSet = new Set(tokenize(p.text_content));
      chunkTokenSets.set(p.chunk_id, tokSet);
      for (const w of rawWords) {
        if (tokSet.has(w)) {
          df.set(w, (df.get(w) ?? 0) + 1);
        }
      }
    }
    const nDocs = Math.max(1, filtered.length);
    let totalIdf = 0;
    const idfMap = new Map<string, number>();
    for (const w of rawWords) {
      const idf = Math.log(1 + (nDocs + 0.5) / ((df.get(w) ?? 0) + 0.5));
      idfMap.set(w, idf);
      totalIdf += idf;
    }

    for (const p of filtered) {
      const docTokenSet = chunkTokenSets.get(p.chunk_id)!;
      let weightedMatches = 0;
      for (const w of rawWords) {
        if (docTokenSet.has(w)) weightedMatches += idfMap.get(w) ?? 1;
      }
      const bm25 = totalIdf > 0 ? weightedMatches / totalIdf : 0;
      bm25Scores.set(p.chunk_id, bm25);

      let semHits = 0;
      const docJoined = ` ${Array.from(qTerms).join(' ')} `;
      for (const kw of p.keywords) {
        if (kw.includes(' ') ? docJoined.includes(` ${kw} `) : qTerms.has(kw)) {
          semHits += 2;
        } else {
          for (const sub of kw.split(/\s+/)) {
            if (!STOPWORDS.has(sub) && qTerms.has(sub)) semHits += 0.65;
          }
        }
      }
      const dense = Math.min(1, semHits / Math.max(3, p.keywords.length * 0.6));
      denseScores.set(p.chunk_id, dense);
    }

    const rankBy = (scoreMap: Map<string, number>) => {
      return [...filtered]
        .sort((a, b) => (scoreMap.get(b.chunk_id) ?? 0) - (scoreMap.get(a.chunk_id) ?? 0))
        .map((p, idx) => ({ chunk_id: p.chunk_id, rank: idx + 1, score: scoreMap.get(p.chunk_id) ?? 0 }));
    };

    const bm25Ranked = rankBy(bm25Scores);
    const denseRanked = rankBy(denseScores);

    const results = filtered.map((p) => {
      const bRank = bm25Ranked.find((r) => r.chunk_id === p.chunk_id)!;
      const dRank = denseRanked.find((r) => r.chunk_id === p.chunk_id)!;
      let score = 0;
      if (mode === 'bm25') {
        score = bRank.score >= 0.25 ? bRank.score : 0;
      } else if (mode === 'dense') {
        score = dRank.score >= 0.35 ? dRank.score : 0;
      } else {
        const hasSignal =
          (bRank.score >= 0.22 && dRank.score >= 0.22) ||
          bRank.score >= 0.34 ||
          dRank.score >= 0.42;
        score = hasSignal ? 1 / (60 + bRank.rank) + 1 / (60 + dRank.rank) + (bRank.score + dRank.score) * 0.45 : 0;
      }
      return {
        chunk_id: p.chunk_id,
        doc_id: p.doc_id,
        rrf_score: Number(score.toFixed(4)),
        qdrant_allowed_groups: [...p.allowed_groups],
      };
    });

    return results
      .filter((r) => r.rrf_score > 0.25)
      .sort((a, b) => b.rrf_score - a.rrf_score)
      .slice(0, limit);
  }

  public inspectSearchBreakdown(
    query: string,
    principalId: string,
    asOfMs: number
  ): {
    tokens: string[];
    expanded_terms: string[];
    active_groups: GroupId[];
    as_of_sec: number;
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
    evidence_preview_xml: string;
  } {
    const tokens = tokenize(query);
    const expandedSet = expandTerms(query);
    const activeGroups = this.currentPrincipalGroups(principalId);
    const asOfSec = Math.floor(asOfMs / 1000);
    const rawWords = Array.from(
      new Set(tokens.filter((w) => w.length > 2 && !STOPWORDS.has(w)))
    );
    const docJoined = ` ${Array.from(expandedSet).join(' ')} `;

    const scored: Array<{
      chunk_id: string;
      parent_chunk_id: string | null;
      doc_title: string;
      version_label: string;
      page_number: number;
      bm25_score: number;
      dense_score: number;
      rrf_score: number;
      allowed_by_privacy_guard: boolean;
    }> = [];

    for (const point of this.qdrantPoints.values()) {
      const temporalMatch = point.effective_from_ts <= asOfSec && point.effective_to_ts > asOfSec;
      if (!temporalMatch) continue;
      const chunk = this.chunks.find((c) => c.chunk_id === point.chunk_id);
      const ver = chunk ? this.getVersion(chunk.version_id) : undefined;
      const doc = ver ? this.documents.find((d) => d.doc_id === ver.doc_id) : undefined;
      if (!chunk || !ver || !doc) continue;

      const docTokenSet = new Set(tokenize(point.text_content));
      let lexMatches = 0;
      for (const w of rawWords) {
        if (docTokenSet.has(w)) lexMatches += 1;
      }
      const bm25 = rawWords.length > 0 ? lexMatches / rawWords.length : 0;

      let semHits = 0;
      for (const kw of point.keywords) {
        if (kw.includes(' ') ? docJoined.includes(` ${kw} `) : expandedSet.has(kw)) {
          semHits += 2;
        } else {
          for (const sub of kw.split(/\s+/)) {
            if (expandedSet.has(sub)) semHits += 0.65;
          }
        }
      }
      const dense = Math.min(1, semHits / Math.max(3, point.keywords.length * 0.6));
      const allowed = this.canRead(principalId, doc.doc_id);
      const combined = bm25 * 0.5 + dense * 0.5;

      if (combined > 0.05) {
        scored.push({
          chunk_id: chunk.chunk_id,
          parent_chunk_id: chunk.parent_chunk_id,
          doc_title: doc.title,
          version_label: ver.version_label,
          page_number: chunk.page_number,
          bm25_score: Number(bm25.toFixed(3)),
          dense_score: Number(dense.toFixed(3)),
          rrf_score: Number(combined.toFixed(3)),
          allowed_by_privacy_guard: allowed,
        });
      }
    }

    scored.sort((a, b) => b.rrf_score - a.rrf_score);
    const top5 = scored.slice(0, 5);
    const allowedTop = top5.filter((x) => x.allowed_by_privacy_guard).slice(0, 2);
    const evidenceBlocks = allowedTop.map((item) => {
      const parent = this.chunks.find((c) => c.chunk_id === (item.parent_chunk_id ?? item.chunk_id));
      return `<evidence doc_title="${item.doc_title}" version="${item.version_label}" page="${item.page_number}">\n${parent?.text_content ?? ''}\n</evidence>`;
    });

    return {
      tokens,
      expanded_terms: Array.from(expandedSet),
      active_groups: activeGroups,
      as_of_sec: asOfSec,
      matched_chunks: top5.map(({ parent_chunk_id: _p, ...rest }) => rest),
      evidence_preview_xml:
        evidenceBlocks.length > 0
          ? evidenceBlocks.join('\n\n')
          : '<!-- No authorized evidence blocks available for this reader and date (LLM would receive 0 blocks and safely abstain). -->',
    };
  }

  public getSnapshot(nowMs = Date.now()): LedgerSnapshot {
    const starterDocIds = new Set(SEED_DOCUMENTS.map((d) => d.doc_id));

    const mappedDocuments = this.documents.map((d) => {
      const origin: 'starter' | 'user_upload' = starterDocIds.has(d.doc_id) ? 'starter' : 'user_upload';
      const pgGroups = this.getDocAclGroups(d.doc_id);
      const docVersions = this.versions
        .filter((v) => v.doc_id === d.doc_id)
        .map((v) => {
          const vChunks = this.chunks.filter((c) => c.version_id === v.version_id);
          const vParents = vChunks.filter((c) => c.chunk_tier === 'parent');
          const vChildren = vChunks.filter((c) => c.chunk_tier === 'child');
          const vPages = new Set(vChunks.map((c) => c.page_number));
          return {
            ...v,
            parent_section_count: vParents.length,
            vector_point_count: vChildren.length,
            pages_count: vPages.size,
          };
        });
      const docVersionIds = new Set(docVersions.map((v) => v.version_id));
      const parentSectionCount = this.chunks.filter(
        (c) => c.chunk_tier === 'parent' && docVersionIds.has(c.version_id)
      ).length;
      const docChildren = this.chunks.filter(
        (c) => c.chunk_tier === 'child' && docVersionIds.has(c.version_id)
      );
      const docQuarantineCount = this.quarantine.filter((q) => q.doc_id === d.doc_id).length;
      const firstChild = docChildren[0];
      const qPoint = firstChild ? this.qdrantPoints.get(firstChild.chunk_id) : undefined;
      const qGroups = qPoint ? [...qPoint.allowed_groups].sort() : [];
      return {
        ...d,
        origin,
        postgres_acl_groups: pgGroups,
        qdrant_acl_groups: qGroups,
        acl_in_sync: JSON.stringify(pgGroups) === JSON.stringify(qGroups),
        parent_section_count: parentSectionCount,
        vector_point_count: docChildren.length,
        quarantine_count: docQuarantineCount,
        versions: docVersions,
      };
    });

    const starterDocs = mappedDocuments.filter((d) => d.origin === 'starter');
    const userDocs = mappedDocuments.filter((d) => d.origin === 'user_upload');

    let starterVectorCount = 0;
    let userVectorCount = 0;
    for (const pt of this.qdrantPoints.values()) {
      if (starterDocIds.has(pt.doc_id)) {
        starterVectorCount += 1;
      } else {
        userVectorCount += 1;
      }
    }

    let starterQuarantineCount = 0;
    let userQuarantineCount = 0;
    for (const q of this.quarantine) {
      if (starterDocIds.has(q.doc_id)) {
        starterQuarantineCount += 1;
      } else {
        userQuarantineCount += 1;
      }
    }

    return {
      corpus_epoch: this.corpusEpoch,
      index_worker_paused: this.indexWorkerPaused,
      principals: this.principals.map((p) => ({
        ...p,
        active_groups_now: this.currentPrincipalGroups(p.principal_id, nowMs),
        memberships: this.memberships.filter((m) => m.principal_id === p.principal_id),
      })),
      documents: mappedDocuments,
      outbox: [...this.outbox].reverse().slice(0, 30),
      quarantine: this.quarantine,
      query_log: [...this.queryLog].reverse().slice(0, 25),
      cache_entries_count: this.semanticCache.size,
      stats: {
        document_count: this.documents.length,
        version_count: this.versions.length,
        parent_chunk_count: this.chunks.filter((c) => c.chunk_tier === 'parent').length,
        child_chunk_count: this.chunks.filter((c) => c.chunk_tier === 'child').length,
        qdrant_point_count: this.qdrantPoints.size,
        quarantine_count: this.quarantine.length,
        starter_document_count: starterDocs.length,
        starter_version_count: starterDocs.reduce((acc, d) => acc + d.versions.length, 0),
        starter_parent_chunk_count: starterDocs.reduce((acc, d) => acc + d.parent_section_count, 0),
        starter_vector_point_count: starterVectorCount,
        starter_quarantine_count: starterQuarantineCount,
        user_document_count: userDocs.length,
        user_version_count: userDocs.reduce((acc, d) => acc + d.versions.length, 0),
        user_parent_chunk_count: userDocs.reduce((acc, d) => acc + d.parent_section_count, 0),
        user_vector_point_count: userVectorCount,
        user_quarantine_count: userQuarantineCount,
      },
    };
  }

  public getDocumentFirstPagePreview(
    docId: string,
    requestedVersionId?: string
  ): DocumentFirstPagePreview | null {
    const doc = this.documents.find((d) => d.doc_id === docId);
    if (!doc) return null;

    const starterDocIds = new Set(SEED_DOCUMENTS.map((d) => d.doc_id));
    const origin: 'starter' | 'user_upload' = starterDocIds.has(doc.doc_id)
      ? 'starter'
      : 'user_upload';

    const docVersions = [...this.versions.filter((v) => v.doc_id === docId)].sort(
      (a, b) => new Date(a.effective_from).getTime() - new Date(b.effective_from).getTime()
    );
    if (docVersions.length === 0) return null;

    const activeVersion =
      (requestedVersionId
        ? docVersions.find((v) => v.version_id === requestedVersionId)
        : undefined) ?? docVersions[docVersions.length - 1];

    const versionParents = this.chunks
      .filter((c) => c.version_id === activeVersion.version_id && c.chunk_tier === 'parent')
      .sort((a, b) => a.page_number - b.page_number);

    const distinctPages = new Set(versionParents.map((c) => c.page_number));
    const firstPageNumber = versionParents.length > 0 ? versionParents[0].page_number : null;

    const firstPageParents =
      firstPageNumber === null
        ? []
        : versionParents.filter((c) => c.page_number === firstPageNumber);
    const firstPageParentIds = new Set(firstPageParents.map((p) => p.chunk_id));

    const firstPageChildren = this.chunks
      .filter(
        (c) =>
          c.version_id === activeVersion.version_id &&
          c.chunk_tier === 'child' &&
          ((c.parent_chunk_id && firstPageParentIds.has(c.parent_chunk_id)) ||
            (firstPageNumber !== null && c.page_number === firstPageNumber))
      )
      .map((c) => ({
        chunk_id: c.chunk_id,
        kind: c.kind,
        token_count: c.token_count,
        text_content: c.text_content,
        in_qdrant: this.qdrantPoints.has(c.chunk_id),
      }));

    const docQuarantined = this.quarantine
      .filter((q) => q.doc_id === doc.doc_id)
      .map((q) => ({
        quarantine_id: q.quarantine_id,
        page_number: q.page_number,
        reason_code: q.reason_code,
      }));

    return {
      doc_id: doc.doc_id,
      title: doc.title,
      citation_code: doc.citation_code,
      origin,
      sensitivity: doc.sensitivity,
      version_id: activeVersion.version_id,
      version_label: activeVersion.version_label,
      effective_from: activeVersion.effective_from,
      effective_to: activeVersion.effective_to,
      available_versions: docVersions.map((v) => ({
        version_id: v.version_id,
        version_label: v.version_label,
        effective_from: v.effective_from,
        effective_to: v.effective_to,
      })),
      total_pages_indexed: distinctPages.size,
      preview_page_number: firstPageNumber,
      parent_sections: firstPageParents.map((p) => ({
        chunk_id: p.chunk_id,
        kind: p.kind,
        ocr_confidence: p.ocr_confidence,
        token_count: p.token_count,
        text_content: p.text_content,
      })),
      child_vectors: firstPageChildren,
      quarantined_items: docQuarantined,
    };
  }

  public getDocumentSummaryContext(docId: string): {
    doc: RegulatoryDocument;
    versionLabel: string;
    contentHash: string;
    excerpt: string;
  } | null {
    const doc = this.documents.find((d) => d.doc_id === docId);
    if (!doc) return null;

    const docVersions = [...this.versions.filter((v) => v.doc_id === docId)].sort(
      (a, b) => new Date(a.effective_from).getTime() - new Date(b.effective_from).getTime()
    );
    const activeVersion = docVersions[docVersions.length - 1];
    if (!activeVersion) {
      return { doc, versionLabel: 'v1', contentHash: '', excerpt: '' };
    }

    const parents = this.chunks
      .filter((c) => c.version_id === activeVersion.version_id && c.chunk_tier === 'parent')
      .sort((a, b) => a.page_number - b.page_number);

    const excerpt = parents
      .map((p) => `[Page ${p.page_number}]\n${p.text_content}`)
      .join('\n\n')
      .slice(0, 12_000);

    return {
      doc,
      versionLabel: activeVersion.version_label,
      contentHash: activeVersion.content_hash,
      excerpt,
    };
  }

  public setDocumentSummary(
    docId: string,
    payload: { text: string; model: string; generated_at?: string } | { error: string }
  ): void {
    const doc = this.documents.find((d) => d.doc_id === docId);
    if (!doc) return;
    if ('error' in payload) {
      doc.ai_summary_error = payload.error;
    } else {
      doc.ai_summary = payload.text;
      doc.ai_summary_model = payload.model;
      doc.ai_summary_generated_at = payload.generated_at ?? new Date().toISOString();
      doc.ai_summary_error = null;
    }
  }
}
