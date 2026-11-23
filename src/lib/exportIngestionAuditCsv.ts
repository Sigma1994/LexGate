import type {
  LedgerSnapshot,
  SystemRuntimeStatus,
} from '../shared/types.ts';

export interface UploadBatchItemRecord {
  filename: string;
  title: string;
  citation_code: string;
  status: 'queued' | 'uploading' | 'vectorizing' | 'done' | 'failed';
  sections_created: number;
  vectors_indexed: number;
  quarantined_count: number;
  embedding_source?: string;
  qdrant_target?: string;
  error?: string;
}

export interface UploadBatchRecord {
  batch_id: string;
  batch_number: number;
  label: string;
  status: 'uploading' | 'vectorizing' | 'success' | 'failed';
  progress: number;
  detail: string;
  started_at: string;
  completed_at: string | null;
  file_count: number;
  succeeded_count: number;
  failed_count: number;
  sections_created: number;
  vectors_indexed: number;
  quarantined_count: number;
  qdrant_target: string;
  embedding_source: string;
  items: UploadBatchItemRecord[];
}

const CSV_HEADERS = [
  'record_type',
  'timestamp',
  'batch_id',
  'doc_id',
  'version_id',
  'title_or_label',
  'citation_code',
  'origin',
  'sensitivity',
  'status',
  'effective_from',
  'effective_to',
  'pages_count',
  'parent_sections',
  'qdrant_vectors',
  'quarantined_blocks',
  'acl_in_sync',
  'vector_target',
  'embedding_source',
  'detail_or_reason',
] as const;

type CsvCell = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Prevent spreadsheet formula injection when opened in Excel / Sheets
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildIngestionAuditCsv(params: {
  snapshot: LedgerSnapshot;
  runtime: SystemRuntimeStatus | null;
  uploadBatches: UploadBatchRecord[];
}): { csv: string; rowCount: number; filename: string } {
  const { snapshot, runtime, uploadBatches } = params;
  const rows: CsvCell[][] = [];
  const defaultVectorTarget = runtime?.qdrant.reachable
    ? `Live Qdrant (${runtime.qdrant.collection})`
    : 'Embedded Vector Index';
  const defaultEmbeddingSource = runtime?.ollama.available
    ? `Ollama (${runtime.ollama.embed_model})`
    : 'Deterministic 768-dim fallback';

  // 1. Batch processing & vectorization history (most recent first)
  for (const batch of uploadBatches) {
    rows.push([
      'BATCH_RUN',
      batch.completed_at ?? batch.started_at,
      `#${batch.batch_number} (${batch.batch_id})`,
      '',
      '',
      batch.label,
      '',
      'live_batch',
      '',
      batch.status,
      batch.started_at,
      batch.completed_at ?? '',
      '',
      batch.sections_created,
      batch.vectors_indexed,
      batch.quarantined_count,
      '',
      batch.qdrant_target || defaultVectorTarget,
      batch.embedding_source || defaultEmbeddingSource,
      `${batch.detail} (${batch.succeeded_count}/${batch.file_count} succeeded, ${batch.failed_count} failed, ${batch.progress}%)`,
    ]);

    for (const item of batch.items) {
      rows.push([
        'BATCH_FILE',
        batch.completed_at ?? batch.started_at,
        `#${batch.batch_number} (${batch.batch_id})`,
        '',
        '',
        `${item.filename} — ${item.title}`,
        item.citation_code,
        'live_batch',
        '',
        item.status,
        '',
        '',
        '',
        item.sections_created,
        item.vectors_indexed,
        item.quarantined_count,
        '',
        item.qdrant_target || batch.qdrant_target || defaultVectorTarget,
        item.embedding_source || batch.embedding_source || defaultEmbeddingSource,
        item.error ? `Error: ${item.error}` : 'Processed cleanly',
      ]);
    }
  }

  // 2. Policy Document & Rule Version ingestion logs
  const sortedDocs = [...snapshot.documents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const doc of sortedDocs) {
    for (const ver of doc.versions) {
      rows.push([
        'INGESTED_DOCUMENT_VERSION',
        doc.created_at,
        '',
        doc.doc_id,
        ver.version_id,
        `${doc.title} (${ver.version_label})`,
        doc.citation_code,
        doc.origin,
        doc.sensitivity,
        ver.effective_to && new Date(ver.effective_to).getTime() <= Date.now()
          ? 'superseded'
          : 'active_or_scheduled',
        ver.effective_from,
        ver.effective_to ?? 'Present',
        ver.pages_count,
        ver.parent_section_count,
        ver.vector_point_count,
        doc.quarantine_count,
        doc.acl_in_sync,
        defaultVectorTarget,
        defaultEmbeddingSource,
        `Postgres ACL=[${doc.postgres_acl_groups.join('|')}] · Qdrant ACL=[${doc.qdrant_acl_groups.join('|')}]`,
      ]);
    }
  }

  // 3. Safety Hold quarantine records
  for (const q of snapshot.quarantine) {
    rows.push([
      'SAFETY_HOLD_QUARANTINE',
      q.created_at,
      '',
      q.doc_id,
      '',
      q.doc_title,
      '',
      snapshot.documents.find((d) => d.doc_id === q.doc_id)?.origin ?? 'unknown',
      '',
      'quarantined',
      '',
      '',
      q.page_number ?? '',
      0,
      0,
      1,
      false,
      'Quarantine Hold (Excluded from Qdrant)',
      'N/A',
      `Reason=${q.reason_code}; OCR=${(q.ocr_confidence * 100).toFixed(0)}%; ID=${q.quarantine_id}`,
    ]);
  }

  // 4. Outbox ACL / Vector Sync events
  for (const evt of snapshot.outbox) {
    rows.push([
      'OUTBOX_SYNC_EVENT',
      evt.processed_at ?? evt.created_at,
      '',
      evt.doc_id,
      '',
      `Outbox #${evt.outbox_id} (${evt.op_type})`,
      '',
      'system_outbox',
      '',
      evt.processed_at ? 'processed' : 'pending',
      evt.created_at,
      evt.processed_at ?? '',
      '',
      '',
      '',
      '',
      '',
      defaultVectorTarget,
      '',
      `chunk_id=${evt.chunk_id}; payload_hash=${evt.payload_hash}`,
    ]);
  }

  const headerLine = CSV_HEADERS.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  const csv = `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    csv,
    rowCount: rows.length,
    filename: `lexgate-ingestion-audit-${stamp}.csv`,
  };
}
