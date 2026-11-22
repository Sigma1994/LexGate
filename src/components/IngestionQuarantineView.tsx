import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FilePlus2,
  FileText,
  Info,
  Loader2,
  RotateCcw,
  Search,
  ShieldBan,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { postFormDataWithProgress, safeFetchJson } from '../lib/safeFetchJson.ts';
import { DatabaseStatusModal } from './DatabaseStatusModal.tsx';
import { DocumentHistoryViz, matchesPolicyDocumentSearch } from './DocumentHistoryViz.tsx';
import type {
  DocumentFirstPagePreview,
  GroupId,
  LedgerSnapshot,
  QuarantineReasonCode,
  SystemRuntimeStatus,
  UploadDocumentResult,
} from '../shared/types.ts';

interface IngestionQuarantineViewProps {
  snapshot: LedgerSnapshot;
  runtime: SystemRuntimeStatus | null;
  extractionExhibit: {
    document_title: string;
    pypdf_garbled: string;
    docling_structured: string;
  };
  onSnapshotUpdate: (snap: LedgerSnapshot) => void;
  onJumpToConsole: () => void;
}

const REASON_LABELS: Record<QuarantineReasonCode, string> = {
  LOW_OCR_CONFIDENCE: 'Blurry Scan',
  JAGGED_TABLE_COLUMNS: 'Broken Table Columns',
  MISSING_PAGE_ANCHOR: 'Missing Page Number',
  EMPTY_TABLE_HEADER: 'Missing Column Titles',
  INVALID_NUMERIC_OR_DATE: 'Unreadable Number or Date',
};

const SENSITIVITY_LABELS: Record<GroupId, string> = {
  public: 'Public Laws (Everyone)',
  compliance_officer: 'Compliance Memos',
  internal_audit: 'Private Internal Audits',
};

const SAMPLE_CLEAN_POLICY = {
  title: 'CBK Climate-Related & Green Finance Risk Directive (2026)',
  citation_code: 'CBK/GREEN/2026/04',
  sensitivity: 'compliance_officer' as GroupId,
  effective_from: '2026-07-01',
  version_label: 'CBK/GREEN/2026/04 (July 2026)',
  raw_text: `Section 2.1 Green Portfolio Disclosure & Stress Testing (CBK/GREEN/2026/04): Tier-1 and Tier-2 commercial banks must submit annual climate transition stress tests covering agricultural, energy, and commercial real-estate loan books by 31 March each year.

Section 3.4 Green Lending Targets & Capital Incentives:
| Portfolio Category | Reporting Threshold | Supervisory Review Cadence |
|---|---|---|
| Sustainable & Green Bond Assets | >= 5.0% of total corporate loan book | Semi-annual to CBK Bank Supervision |
| High-Emission Sector Exposure | >= KES 2.5 billion single-sector book | Quarterly concentration stress test |
| Climate Scenario Capital Add-On | Severe physical-risk stress shortfall | Mandatory Pillar 2 board remediation plan |`,
};

const SAMPLE_BROKEN_TABLE_POLICY = {
  title: 'Draft Merchant Acquiring Fee Schedule (Incomplete Table Test)',
  citation_code: 'CBK/PAY/2026/DRAFT',
  sensitivity: 'public' as GroupId,
  effective_from: '2026-09-01',
  version_label: 'Draft 2026',
  raw_text: `Section 1.2 Merchant Acquiring Settlement Rules: Card and mobile-money acquiring banks must settle domestic merchant balances within T+1 business days.

| Payment Rail | Settlement SLA | Maximum Interchange Cap |
|---|---|---|
| Domestic Debit Card | T+1 business day | 0.75% |
| Cross-Border Card | T+2 business days |`,
};

export const IngestionQuarantineView: React.FC<IngestionQuarantineViewProps> = ({
  snapshot,
  runtime,
  extractionExhibit,
  onSnapshotUpdate,
  onJumpToConsole,
}) => {
  const [quarantineTestResult, setQuarantineTestResult] = useState<string | null>(null);
  const [doclingMode, setDoclingMode] = useState<'rendered' | 'markdown'>('rendered');

  // Policy Library filter state
  const [searchFilter, setSearchFilter] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | GroupId>('all');

  // Direct Qdrant upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewingFile, setPreviewingFile] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [showManualText, setShowManualText] = useState(false);
  const [title, setTitle] = useState('');
  const [citationCode, setCitationCode] = useState('');
  const [sensitivity, setSensitivity] = useState<GroupId>('compliance_officer');
  const [effectiveFrom, setEffectiveFrom] = useState('2026-07-01');
  const [versionLabel, setVersionLabel] = useState('');
  const [rawText, setRawText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadDocumentResult | null>(null);
  const [corpusActionBusy, setCorpusActionBusy] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [isDbStatusOpen, setIsDbStatusOpen] = useState(false);
  const [selectedPreviewDocId, setSelectedPreviewDocId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<DocumentFirstPagePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'page' | 'vectors'>('page');
  const [uploadBatches, setUploadBatches] = useState<
    Array<{
      batch_id: string;
      batch_number: number;
      label: string;
      status: 'uploading' | 'vectorizing' | 'success' | 'failed';
      progress: number;
      detail: string;
    }>
  >([]);
  const uploadSectionRef = useRef<HTMLElement | null>(null);
  const catalogSectionRef = useRef<HTMLElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const batchCounterRef = useRef(0);

  const loadDocumentPreview = async (
    docId: string,
    versionId?: string,
    scrollToPreview = false
  ) => {
    setSelectedPreviewDocId(docId);
    setPreviewLoading(true);
    setPreviewError(null);
    if (scrollToPreview) {
      setTimeout(() => {
        previewPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
    }
    try {
      const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
      const { data } = await safeFetchJson<{ preview: DocumentFirstPagePreview }>(
        `/api/admin/documents/${encodeURIComponent(docId)}/preview${qs}`
      );
      setPreviewData(data.preview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Unable to load document preview.');
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const filteredDocuments = useMemo(() => {
    return snapshot.documents.filter((doc) => {
      if (tierFilter !== 'all' && doc.sensitivity !== tierFilter) return false;
      return matchesPolicyDocumentSearch(doc, searchFilter);
    });
  }, [snapshot.documents, searchFilter, tierFilter]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const acceptChosenFile = (file: File) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadResult(null);
    setPreviewNote(null);
    setRawText('');
    const baseTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (!title.trim() && baseTitle) {
      setTitle(baseTitle);
    }
    if (!citationCode.trim()) {
      const slug = baseTitle
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase()
        .slice(0, 12);
      setCitationCode(`DOC/${slug || 'POLICY'}/${new Date().getFullYear()}`);
    }
  };

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    acceptChosenFile(file);
    e.target.value = '';
  };

  const handlePreviewSelectedFile = async () => {
    if (!selectedFile) return;
    setPreviewingFile(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const { data } = await safeFetchJson<{
        detected_format: string;
        pages_extracted: number;
        processing_summary: string;
        raw_text: string;
        suggested_title: string;
        suggested_citation: string;
      }>('/api/admin/preview-file', {
        method: 'POST',
        body: form,
      });
      setRawText(data.raw_text);
      if (!title.trim()) setTitle(data.suggested_title);
      if (!citationCode.trim()) setCitationCode(data.suggested_citation);
      setPreviewNote(`${data.detected_format}: ${data.processing_summary}`);
      setShowManualText(true);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to preview file.');
    } finally {
      setPreviewingFile(false);
    }
  };

  const updateUploadBatch = (
    batchId: string,
    patch: Partial<{
      status: 'uploading' | 'vectorizing' | 'success' | 'failed';
      progress: number;
      detail: string;
    }>
  ) => {
    setUploadBatches((prev) =>
      prev.map((b) => (b.batch_id === batchId ? { ...b, ...patch } : b))
    );
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    const batchNumber = ++batchCounterRef.current;
    const batchId = `batch-${batchNumber}-${Date.now()}`;
    const batchLabel = selectedFile?.name || title.trim() || citationCode.trim() || 'Policy Batch';
    setUploadBatches((prev) => [
      {
        batch_id: batchId,
        batch_number: batchNumber,
        label: batchLabel,
        status: 'uploading',
        progress: 12,
        detail: 'Uploading payload...',
      },
      ...prev.slice(0, 5),
    ]);

    try {
      if (selectedFile && rawText.trim().length === 0) {
        const form = new FormData();
        form.append('file', selectedFile);
        form.append('title', title);
        form.append('citation_code', citationCode);
        form.append('sensitivity', sensitivity);
        form.append('effective_from', `${effectiveFrom}T00:00:00Z`);
        if (versionLabel.trim()) form.append('version_label', versionLabel.trim());

        const { data } = await postFormDataWithProgress<{
          upload: UploadDocumentResult;
          snapshot?: LedgerSnapshot;
        }>('/api/admin/upload-file', form, (pct, phase) => {
          updateUploadBatch(batchId, {
            status: phase,
            progress: pct,
            detail:
              phase === 'uploading'
                ? 'Uploading file to server...'
                : 'Extracting pages & vectorizing to Qdrant...',
          });
        });

        updateUploadBatch(batchId, {
          status: 'success',
          progress: 100,
          detail: `${data.upload.parent_chunks_created} sec · ${data.upload.child_chunks_indexed} vec${
            data.upload.quarantined_count > 0 ? ` · ${data.upload.quarantined_count} held` : ''
          }`,
        });
        setUploadResult(data.upload);
        setSelectedFile(null);
        setPreviewNote(null);
        if (data.snapshot) {
          onSnapshotUpdate(data.snapshot);
        }
        void loadDocumentPreview(data.upload.doc_id);
      } else {
        updateUploadBatch(batchId, {
          status: 'vectorizing',
          progress: 65,
          detail: 'Segmenting sections & vectorizing to Qdrant...',
        });
        const { data } = await safeFetchJson<{
          upload: UploadDocumentResult;
          snapshot?: LedgerSnapshot;
        }>('/api/admin/upload-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            citation_code: citationCode,
            sensitivity,
            effective_from: `${effectiveFrom}T00:00:00Z`,
            version_label: versionLabel,
            raw_text: rawText,
          }),
        });
        updateUploadBatch(batchId, {
          status: 'success',
          progress: 100,
          detail: `${data.upload.parent_chunks_created} sec · ${data.upload.child_chunks_indexed} vec${
            data.upload.quarantined_count > 0 ? ` · ${data.upload.quarantined_count} held` : ''
          }`,
        });
        setUploadResult(data.upload);
        setSelectedFile(null);
        setPreviewNote(null);
        if (data.snapshot) {
          onSnapshotUpdate(data.snapshot);
        }
        void loadDocumentPreview(data.upload.doc_id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      updateUploadBatch(batchId, {
        status: 'failed',
        progress: 100,
        detail: msg,
      });
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const testImmutability = async (quarantineId: string, op: 'UPDATE' | 'DELETE') => {
    try {
      const { data } = await safeFetchJson<{ error?: string }>('/api/admin/quarantine-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarantine_id: quarantineId, op }),
      });
      setQuarantineTestResult(data.error ?? 'Blocked.');
    } catch (err) {
      setQuarantineTestResult(err instanceof Error ? err.message : 'Blocked.');
    }
  };

  const handleClearSamples = async () => {
    setCorpusActionBusy(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const { data } = await safeFetchJson<{ snapshot?: LedgerSnapshot }>('/api/admin/clear-samples', {
        method: 'POST',
      });
      if (data.snapshot) onSnapshotUpdate(data.snapshot);
      setSelectedPreviewDocId(null);
      setPreviewData(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to clear library.');
    } finally {
      setCorpusActionBusy(false);
    }
  };

  const handleRestoreCorpus = async () => {
    setCorpusActionBusy(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const { data } = await safeFetchJson<{ snapshot?: LedgerSnapshot }>('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empty: false }),
      });
      if (data.snapshot) onSnapshotUpdate(data.snapshot);
      setSelectedPreviewDocId(null);
      setPreviewData(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to restore starter corpus.');
    } finally {
      setCorpusActionBusy(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    setDeletingDocId(docId);
    try {
      const { data } = await safeFetchJson<{ snapshot?: LedgerSnapshot }>(
        `/api/admin/documents/${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      );
      if (data.snapshot) onSnapshotUpdate(data.snapshot);
      if (selectedPreviewDocId === docId) {
        setSelectedPreviewDocId(null);
        setPreviewData(null);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to delete document.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const pypdfLines = extractionExhibit.pypdf_garbled.split('\n');

  return (
    <div className="space-y-7">
      {/* 1. Dark Library Stats Banner */}
      <section className="surface-dark rounded-xl p-6 text-white space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-medium text-blue-300">
              Policy Corpus &amp; Direct Vector Indexing
            </div>
            <h1 className="text-xl font-semibold text-white mt-0.5">
              Policy Library &amp; Direct Qdrant Upload
            </h1>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">
              Every document here — both the preloaded multi-page regulatory corpus and any <strong>PDF, Word (.docx), CSV/TSV, HTML, JSON, RTF, Markdown, or TXT</strong> file you upload — runs through the exact same page-by-page Parent/Child &amp; table-preserving Qdrant indexing pipeline.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-right">
            <div>
              <div className="text-slate-400">Vector Store Target</div>
              <div className={`font-semibold mt-0.5 ${runtime?.qdrant.reachable ? 'text-emerald-400' : 'text-blue-300'}`}>
                {runtime?.qdrant.reachable
                  ? `Live Qdrant (${runtime.qdrant.collection})`
                  : 'Embedded Vector Index (Auto-Qdrant on Local Clone)'}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDbStatusOpen(true)}
                aria-label="Open Database Status Info"
                title="View LexGate data architecture, ingestion, sectioning, and vectorization info"
                className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 border border-blue-400/50 rounded-md transition-colors whitespace-nowrap"
              >
                <Info className="w-3.5 h-3.5" />
                Database Status Info
              </button>
              {snapshot.documents.length > 0 && (
                <button
                  type="button"
                  disabled={corpusActionBusy}
                  onClick={() => void handleClearSamples()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Library (My Docs Only)
                </button>
              )}
              <button
                type="button"
                disabled={corpusActionBusy}
                onClick={() => void handleRestoreCorpus()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-blue-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                Restore Starter Corpus
              </button>
            </div>
          </div>
        </div>

        {/* Real-Time Upload & Vectorization Progress Indicator */}
        {(() => {
          const latestBatch = uploadBatches[0] ?? null;
          return (
            <div
              aria-live="polite"
              className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {!latestBatch ? (
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-white">Upload &amp; Vectorization Status:</span>
                    <span className="text-slate-400">
                      Ready — submit a file or policy text below to track live upload &amp; Qdrant batch status.
                    </span>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {latestBatch.status === 'uploading' || latestBatch.status === 'vectorizing' ? (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                      ) : latestBatch.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span
                        className={`font-semibold whitespace-nowrap ${
                          latestBatch.status === 'success'
                            ? 'text-emerald-300'
                            : latestBatch.status === 'failed'
                              ? 'text-rose-300'
                              : 'text-blue-300'
                        }`}
                      >
                        {latestBatch.status === 'success'
                          ? 'Success'
                          : latestBatch.status === 'failed'
                            ? 'Failed'
                            : latestBatch.status === 'uploading'
                              ? 'Uploading'
                              : 'Vectorizing'}
                      </span>
                      <span className="text-slate-200 font-medium truncate max-w-xs">
                        Batch #{latestBatch.batch_number}: {latestBatch.label}
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums text-[11px] truncate">
                        {latestBatch.detail} ({latestBatch.progress}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full max-w-md bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${latestBatch.progress}%` }}
                        className={`h-full transition-all duration-200 ${
                          latestBatch.status === 'failed'
                            ? 'bg-rose-500'
                            : latestBatch.status === 'success'
                              ? 'bg-emerald-500'
                              : 'bg-blue-500'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {uploadBatches.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
                  {uploadBatches.slice(0, 4).map((b) => (
                    <span
                      key={b.batch_id}
                      title={`${b.label}: ${b.detail}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                        b.status === 'success'
                          ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300'
                          : b.status === 'failed'
                            ? 'bg-rose-950/60 border-rose-700/70 text-rose-300'
                            : 'bg-blue-950/60 border-blue-700/70 text-blue-200'
                      }`}
                    >
                      <span>#{b.batch_number}</span>
                      <span>
                        {b.status === 'success'
                          ? 'Success'
                          : b.status === 'failed'
                            ? 'Failed'
                            : `${b.progress}%`}
                      </span>
                    </span>
                  ))}
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => setUploadBatches([])}
                      className="text-slate-400 hover:text-white font-sans underline underline-offset-2 ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Header Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-700/70">
          <div className="relative flex-1 min-w-[260px] max-w-xl">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Filter policy documents by title or date"
              placeholder="Search uploaded & starter policies by title, code, or date (e.g. 2026, 2025-02)..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-900/90 border border-slate-600/80 rounded-lg text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                aria-label="Clear policy search filter"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-300">
            <span>
              Showing {filteredDocuments.length} of {snapshot.documents.length} policy document
              {snapshot.documents.length === 1 ? '' : 's'}
            </span>
            {searchFilter.trim() && (
              <button
                type="button"
                onClick={() => catalogSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-sans text-[11px] font-medium text-blue-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors whitespace-nowrap"
              >
                Jump to Catalog
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-slate-700/70">
          <button
            type="button"
            onClick={() => setIsDbStatusOpen(true)}
            className="text-left p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              Policy Documents
              <Info className="w-3 h-3 text-slate-500 group-hover:text-blue-300 transition-colors" />
            </div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-white">
              {snapshot.stats.document_count}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400">
              {snapshot.stats.starter_document_count} starter · {snapshot.stats.user_document_count} uploaded
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsDbStatusOpen(true)}
            className="text-left p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              Rule Versions
              <Info className="w-3 h-3 text-slate-500 group-hover:text-blue-300 transition-colors" />
            </div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-white">
              {snapshot.stats.version_count}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400">
              {snapshot.stats.starter_version_count} starter · {snapshot.stats.user_version_count} uploaded
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsDbStatusOpen(true)}
            className="text-left p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              Full Sections (Parent)
              <Info className="w-3 h-3 text-slate-500 group-hover:text-blue-300 transition-colors" />
            </div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-white">
              {snapshot.stats.parent_chunk_count}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400">
              {snapshot.stats.starter_parent_chunk_count} starter · {snapshot.stats.user_parent_chunk_count} uploaded
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsDbStatusOpen(true)}
            className="text-left p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              Qdrant Vector Points
              <Info className="w-3 h-3 text-slate-500 group-hover:text-emerald-300 transition-colors" />
            </div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-emerald-400">
              {snapshot.stats.qdrant_point_count}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400">
              {snapshot.stats.starter_vector_point_count} starter · {snapshot.stats.user_vector_point_count} uploaded
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsDbStatusOpen(true)}
            className="text-left p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              Safety Hold Items
              <Info className="w-3 h-3 text-slate-500 group-hover:text-amber-300 transition-colors" />
            </div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-amber-300">
              {snapshot.stats.quarantine_count}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400">
              {snapshot.stats.starter_quarantine_count} starter · {snapshot.stats.user_quarantine_count} uploaded
            </div>
          </button>
        </div>
      </section>

      {/* 2. Simple Multi-Format Upload -> Auto-Process -> Qdrant */}
      <section ref={uploadSectionRef} className="saas-surface rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-blue-400" />
              Upload Policy Document (PDF, Word .docx, CSV, HTML, TXT &amp; More)
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Drop a regular document file below. LexGate extracts pages and tables, converts them into Qdrant-ready format, embeds vectors, and enables Q&amp;A immediately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setPreviewNote(null);
                setShowManualText(true);
                setTitle(SAMPLE_CLEAN_POLICY.title);
                setCitationCode(SAMPLE_CLEAN_POLICY.citation_code);
                setSensitivity(SAMPLE_CLEAN_POLICY.sensitivity);
                setEffectiveFrom(SAMPLE_CLEAN_POLICY.effective_from);
                setVersionLabel(SAMPLE_CLEAN_POLICY.version_label);
                setRawText(SAMPLE_CLEAN_POLICY.raw_text);
                setUploadError(null);
                setUploadResult(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap"
            >
              Load Sample 2026 Policy
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setPreviewNote(null);
                setShowManualText(true);
                setTitle(SAMPLE_BROKEN_TABLE_POLICY.title);
                setCitationCode(SAMPLE_BROKEN_TABLE_POLICY.citation_code);
                setSensitivity(SAMPLE_BROKEN_TABLE_POLICY.sensitivity);
                setEffectiveFrom(SAMPLE_BROKEN_TABLE_POLICY.effective_from);
                setVersionLabel(SAMPLE_BROKEN_TABLE_POLICY.version_label);
                setRawText(SAMPLE_BROKEN_TABLE_POLICY.raw_text);
                setUploadError(null);
                setUploadResult(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors whitespace-nowrap"
            >
              Load Broken Table Test
            </button>
          </div>
        </div>

        <form onSubmit={handleUploadSubmit} className="p-6 space-y-5">
          {/* Step 1: Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) acceptChosenFile(dropped);
            }}
            className={`rounded-xl border-2 border-dashed p-5 transition-colors ${
              isDraggingFile
                ? 'border-blue-600 bg-blue-50/70'
                : selectedFile
                  ? 'border-emerald-400 bg-emerald-50/40'
                  : 'border-slate-300 bg-slate-50/80 hover:border-blue-400'
            }`}
          >
            {selectedFile ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-slate-950 truncate">
                      {selectedFile.name}
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono">
                      {formatBytes(selectedFile.size)} · Ready for automatic extraction &amp; Qdrant indexing
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={previewingFile}
                    onClick={() => void handlePreviewSelectedFile()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {previewingFile ? 'Converting...' : 'Preview Extracted Text'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewNote(null);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 bg-white border border-slate-300 rounded-md transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer">
                <div className="flex items-center gap-3.5 text-center sm:text-left">
                  <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-slate-950">
                      Drag &amp; drop your policy file here, or click to browse
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      Accepts <strong>.pdf</strong>, <strong>.docx</strong> (Word), <strong>.csv</strong> / <strong>.tsv</strong>, <strong>.html</strong>, <strong>.json</strong>, <strong>.rtf</strong>, <strong>.md</strong>, and <strong>.txt</strong> (max 15 MB) — no manual formatting needed.
                    </div>
                  </div>
                </div>
                <span className="px-4 py-2 text-xs font-semibold text-blue-800 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0">
                  Choose File
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.html,.htm,.json,.rtf"
                  onChange={handleFileLoad}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Step 2: Simple Document Details */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 space-y-1">
              <label htmlFor="upload-title" className="block text-xs font-semibold text-slate-800">
                Policy Document Title
              </label>
              <input
                id="upload-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-filled from file name (or type a custom title)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label htmlFor="upload-citation" className="block text-xs font-semibold text-slate-800">
                Citation / Reference Code
              </label>
              <input
                id="upload-citation"
                type="text"
                required
                value={citationCode}
                onChange={(e) => setCitationCode(e.target.value)}
                placeholder="e.g., CBK/GREEN/2026/04"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label htmlFor="upload-sensitivity" className="block text-xs font-semibold text-slate-800">
                Who Can Read It
              </label>
              <select
                id="upload-sensitivity"
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value as GroupId)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
              >
                <option value="public">Public Laws</option>
                <option value="compliance_officer">Compliance Memos</option>
                <option value="internal_audit">Internal Audit Only</option>
              </select>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label htmlFor="upload-effective" className="block text-xs font-semibold text-slate-800">
                Effective From
              </label>
              <input
                id="upload-effective"
                type="date"
                required
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
              />
            </div>
          </div>

          {/* Optional Paste / Preview Area */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowManualText((prev) => !prev)}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2"
              >
                {showManualText
                  ? 'Hide text editor'
                  : 'Or paste / review extracted text manually (optional)'}
              </button>
              {previewNote && (
                <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
                  {previewNote}
                </span>
              )}
            </div>

            {showManualText && (
              <textarea
                id="upload-text"
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Optional: paste policy text here if you are not uploading a file, or inspect/edit converted text..."
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <span className="text-[11px] text-slate-500">
              Tables are automatically aligned and validated; broken or incomplete tables are safely held in Safety Hold below.
            </span>
            <button
              type="submit"
              disabled={
                uploading ||
                !title.trim() ||
                !citationCode.trim() ||
                (!selectedFile && rawText.trim().length < 20)
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Processing & Indexing Into Qdrant...' : 'Process & Index Into Qdrant'}
            </button>
          </div>

          {uploadError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
              <strong>Upload blocked:</strong> {uploadError}
            </div>
          )}

          {uploadResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-semibold inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Indexed “{uploadResult.title}” ({uploadResult.citation_code})
                  {uploadResult.detected_format ? ` · ${uploadResult.detected_format}` : ''}
                </div>
                {uploadResult.processing_summary && (
                  <div className="text-[11px] text-emerald-900">
                    {uploadResult.processing_summary}
                  </div>
                )}
                <div className="text-[11px] text-emerald-900 font-mono tabular-nums">
                  {uploadResult.parent_chunks_created} parent section(s) · {uploadResult.child_chunks_indexed} Qdrant vector point(s) · {uploadResult.quarantined_count} Safety Hold block(s) · Target: {uploadResult.qdrant_target} · Embeddings: {uploadResult.embedding_source}
                </div>
              </div>
              <button
                type="button"
                onClick={onJumpToConsole}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
              >
                Ask About This Policy Now
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>
      </section>

      {/* 3. Document History & Bitemporal Version Lineage Visualization */}
      <DocumentHistoryViz
        snapshot={snapshot}
        searchQuery={searchFilter}
        corpusActionBusy={corpusActionBusy}
        onRestoreCorpus={() => void handleRestoreCorpus()}
        onDeleteDocument={(docId) => void handleDeleteDocument(docId)}
        onJumpToUpload={() => uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* 4. Full Searchable Policy Library Catalog */}
      <section ref={catalogSectionRef} className="saas-surface rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Active Regulatory &amp; Policy Catalog ({filteredDocuments.length} of {snapshot.documents.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Multi-page Parent sections and focused Child Qdrant vector points generated identically for starter laws and live uploads.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by title, code, or date..."
                className="pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-700"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as 'all' | GroupId)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-700"
            >
              <option value="all">All Access Tiers</option>
              <option value="public">Public Laws</option>
              <option value="compliance_officer">Compliance Memos</option>
              <option value="internal_audit">Private Audits</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-100">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Policy Title</th>
                <th className="py-2.5 px-4 font-semibold">Code</th>
                <th className="py-2.5 px-4 font-semibold">Access Level</th>
                <th className="py-2.5 px-4 font-semibold">Indexed Content</th>
                <th className="py-2.5 px-4 font-semibold">Effective Timeline(s)</th>
                <th className="py-2.5 px-4 font-semibold">Qdrant Sync</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-xs text-slate-500">
                    {snapshot.documents.length === 0
                      ? 'Library is currently empty. Drop your own PDF, DOCX, CSV, HTML, JSON, RTF, or TXT file above to index real documents from scratch — or click "Restore Starter Corpus".'
                      : 'No policies match your current search or access tier filter.'}
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => {
                  const isPreviewSelected = selectedPreviewDocId === doc.doc_id;
                  return (
                    <tr
                      key={doc.doc_id}
                      onClick={() => void loadDocumentPreview(doc.doc_id, undefined, true)}
                      className={`cursor-pointer transition-colors ${
                        isPreviewSelected ? 'bg-blue-50/85' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-950 flex items-center gap-2">
                          <span>{doc.title}</span>
                          {isPreviewSelected && (
                            <span className="text-[10px] font-semibold text-blue-700">
                              Previewing Page 1
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          <span
                            className={
                              doc.origin === 'user_upload'
                                ? 'text-blue-700 font-semibold'
                                : 'text-slate-600'
                            }
                          >
                            {doc.origin === 'user_upload' ? 'Live User Upload' : 'Starter Corpus'}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>Indexed {doc.created_at.slice(0, 10)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">{doc.citation_code}</td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {SENSITIVITY_LABELS[doc.sensitivity]}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {doc.parent_section_count} section{doc.parent_section_count === 1 ? '' : 's'} · {doc.vector_point_count} vector{doc.vector_point_count === 1 ? '' : 's'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {doc.versions.map((v) => (
                          <div key={v.version_id}>
                            {v.version_label} ({v.effective_from.slice(0, 10)} → {v.effective_to ? v.effective_to.slice(0, 10) : 'Present'})
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-semibold">
                        {doc.acl_in_sync ? (
                          <span className="text-emerald-700">Synced</span>
                        ) : (
                          <span className="text-amber-700">Pending Sync</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void loadDocumentPreview(doc.doc_id, undefined, true);
                            }}
                            title="Preview first page of ingested content"
                            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                              isPreviewSelected
                                ? 'text-white bg-blue-700'
                                : 'text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isPreviewSelected ? 'Previewing' : 'Preview'}
                          </button>
                          <button
                            type="button"
                            disabled={deletingDocId === doc.doc_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteDocument(doc.doc_id);
                            }}
                            title="Remove document and its Qdrant vectors"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Document First-Page Preview Pane */}
        <div ref={previewPaneRef} className="border-t border-slate-200 bg-slate-50/90 p-6">
          {!selectedPreviewDocId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2.5">
                <Eye className="w-4 h-4 text-blue-700 shrink-0" />
                <span>
                  <strong>First-Page Ingestion Preview:</strong> Click any policy document row in the list above to inspect its extracted Page 1 content and verify ingestion accuracy.
                </span>
              </div>
              {filteredDocuments.length > 0 && (
                <button
                  type="button"
                  onClick={() => void loadDocumentPreview(filteredDocuments[0].doc_id)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-800 bg-white hover:bg-blue-50 border border-blue-200 rounded-md transition-colors whitespace-nowrap"
                >
                  Preview Top Document
                </button>
              )}
            </div>
          ) : previewLoading ? (
            <div className="py-6 text-center text-xs text-slate-600">
              Loading first-page preview from the ledger...
            </div>
          ) : previewError ? (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
              <strong>Preview failed:</strong> {previewError}
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              {/* Preview Header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-blue-700">First-Page Ingestion Preview</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{previewData.citation_code}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {previewData.origin === 'user_upload' ? 'Live User Upload' : 'Starter Corpus'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {previewData.preview_page_number !== null
                        ? `Page ${previewData.preview_page_number} of ${previewData.total_pages_indexed} indexed page${previewData.total_pages_indexed === 1 ? '' : 's'}`
                        : '0 indexed pages'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-950 mt-0.5">
                    {previewData.title}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {previewData.available_versions.length > 1 && (
                    <select
                      aria-label="Select rule version to preview"
                      value={previewData.version_id}
                      onChange={(e) =>
                        void loadDocumentPreview(previewData.doc_id, e.target.value)
                      }
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-blue-700"
                    >
                      {previewData.available_versions.map((v) => (
                        <option key={v.version_id} value={v.version_id}>
                          {v.version_label}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('page')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        previewTab === 'page'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:text-slate-950'
                      }`}
                    >
                      Page {previewData.preview_page_number ?? 1} Full Text ({previewData.parent_sections.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('vectors')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        previewTab === 'vectors'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:text-slate-950'
                      }`}
                    >
                      Qdrant Vector Chunks ({previewData.child_vectors.length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPreviewDocId(null);
                      setPreviewData(null);
                    }}
                    aria-label="Close document preview"
                    className="p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-300 rounded-md transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Safety Hold alert if doc has quarantined items */}
              {previewData.quarantined_items.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950">
                  <strong>Safety Hold Notice:</strong> {previewData.quarantined_items.length} block(s) from this document were quarantined (
                  {previewData.quarantined_items
                    .map((q) => `Page ${q.page_number ?? 'N/A'}: ${REASON_LABELS[q.reason_code] ?? q.reason_code}`)
                    .join(', ')}
                  ) and excluded from Qdrant indexing.
                </div>
              )}

              {/* Preview Body */}
              {previewTab === 'page' ? (
                previewData.parent_sections.length === 0 ? (
                  <div className="p-5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
                    No clean parent sections were indexed for this version (check Safety Hold above).
                  </div>
                ) : (
                  <div className="space-y-3">
                    {previewData.parent_sections.map((sec, idx) => (
                      <div
                        key={sec.chunk_id}
                        className="p-5 bg-white border border-slate-200 rounded-lg space-y-2.5 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pb-2 border-b border-slate-100">
                          <span className="font-semibold text-slate-900">
                            Page {previewData.preview_page_number} · Full Section {idx + 1} (Parent)
                          </span>
                          <span className="font-mono tabular-nums">
                            {sec.kind === 'table' ? 'Structured Table' : 'Prose'} ·{' '}
                            {sec.token_count} tokens · {(sec.ocr_confidence * 100).toFixed(0)}% OCR clarity
                          </span>
                        </div>
                        <div className="text-xs sm:text-[13px] text-slate-900 leading-relaxed whitespace-pre-wrap font-sans">
                          {sec.text_content}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : previewData.child_vectors.length === 0 ? (
                <div className="p-5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
                  No Qdrant child vectors indexed for Page {previewData.preview_page_number ?? 1}.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {previewData.child_vectors.map((vec, idx) => (
                    <div
                      key={vec.chunk_id}
                      className="p-4 bg-white border border-slate-200 rounded-lg space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pb-1.5 border-b border-slate-100">
                        <span className="font-semibold text-slate-900">
                          Vector Chunk {idx + 1} (Child)
                        </span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {vec.kind === 'table' ? 'Table Slice' : 'Prose'} · {vec.token_count} tok ·{' '}
                          <span className={vec.in_qdrant ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                            {vec.in_qdrant ? 'In Qdrant' : 'Pending'}
                          </span>
                        </span>
                      </div>
                      <pre className="text-[11px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {vec.text_content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* 4. Smart Table Reader Comparison */}
      <section className="saas-surface rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-slate-950">
              Smart Table Reader: Keeping Financial Numbers Accurate
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Example from <span className="font-medium text-slate-900">{extractionExhibit.document_title}</span>. Basic PDF readers scramble multi-column tables; LexGate preserves every row and repeats column headers automatically when large tables split.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setDoclingMode('rendered')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                doclingMode === 'rendered' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Table Preview
            </button>
            <button
              type="button"
              onClick={() => setDoclingMode('markdown')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                doclingMode === 'markdown' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Plain Format
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="rounded-xl overflow-hidden border border-rose-200/90 bg-[#fff9f9] shadow-sm flex flex-col">
            <div className="px-5 py-3 bg-rose-950 text-white flex items-center justify-between text-xs">
              <span className="font-semibold">Basic Text Reader</span>
              <span className="text-rose-200 font-medium">Columns scrambled</span>
            </div>
            <div className="p-5 font-mono text-xs text-slate-800 space-y-1.5 overflow-x-auto flex-1">
              {pypdfLines.map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-5 text-right text-rose-400 select-none tabular-nums">{i + 1}</span>
                  <span className="whitespace-pre-wrap">{line}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-emerald-200/90 bg-white shadow-sm flex flex-col">
            <div className="px-5 py-3 bg-emerald-950 text-white flex items-center justify-between text-xs">
              <span className="font-semibold">Smart Table Reader</span>
              <span className="text-emerald-200 font-medium">Rows &amp; headers kept intact</span>
            </div>
            {doclingMode === 'markdown' ? (
              <pre className="p-5 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed overflow-x-auto flex-1 bg-[#fbfdfc]">
                {extractionExhibit.docling_structured}
              </pre>
            ) : (
              <div className="p-5 space-y-4 text-xs flex-1 bg-[#fbfdfc]">
                <div>
                  <div className="text-[11px] font-medium text-slate-600 mb-1.5">
                    Part 1 — Original column headers kept intact
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-md bg-white">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900 text-slate-100">
                        <tr>
                          <th className="py-2 px-3 font-semibold">Metric</th>
                          <th className="py-2 px-3 font-semibold text-right">Min Ratio</th>
                          <th className="py-2 px-3 font-semibold text-right">Buffer</th>
                          <th className="py-2 px-3 font-semibold text-right">D-SIB</th>
                          <th className="py-2 px-3 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-900">Core Capital / TRWA</td>
                          <td className="py-2 px-3 text-right">8.0%</td>
                          <td className="py-2 px-3 text-right">2.5%</td>
                          <td className="py-2 px-3 text-right">1.5%</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-950">12.0%</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-900">Total Capital / TRWA</td>
                          <td className="py-2 px-3 text-right">12.0%</td>
                          <td className="py-2 px-3 text-right">2.5%</td>
                          <td className="py-2 px-3 text-right">1.5%</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-950">16.0%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-emerald-800 font-semibold mb-1.5">
                    Part 2 — Headers automatically repeated when a table splits
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-md bg-white">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900 text-slate-100">
                        <tr>
                          <th className="py-2 px-3 font-semibold">Metric</th>
                          <th className="py-2 px-3 font-semibold text-right">Min Ratio</th>
                          <th className="py-2 px-3 font-semibold text-right">Buffer</th>
                          <th className="py-2 px-3 font-semibold text-right">D-SIB</th>
                          <th className="py-2 px-3 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono tabular-nums">
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-900">Core Capital / Deposits</td>
                          <td className="py-2 px-3 text-right">8.0%</td>
                          <td className="py-2 px-3 text-right text-slate-400">N/A</td>
                          <td className="py-2 px-3 text-right text-slate-400">N/A</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-950">8.0%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. Safety Hold */}
      <section className="saas-surface rounded-xl overflow-hidden">
        <div className="p-6 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-950">
              Safety Hold: Never Guessing From Unclear Pages
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Blurry scans or broken tables are locked in a tamper-proof Safety Hold log for human review so the AI never guesses missing numbers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void testImmutability(snapshot.quarantine[0]?.quarantine_id ?? '', 'UPDATE')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ShieldBan className="w-3.5 h-3.5 text-rose-700" />
              Test Edit Protection
            </button>
            <button
              type="button"
              onClick={() => void testImmutability(snapshot.quarantine[0]?.quarantine_id ?? '', 'DELETE')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ShieldBan className="w-3.5 h-3.5 text-rose-700" />
              Test Delete Protection
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {quarantineTestResult && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
              <strong>Blocked as expected:</strong> {quarantineTestResult}
            </div>
          )}

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {snapshot.quarantine.length === 0 ? (
              <div className="p-6 bg-white text-center text-xs text-slate-500">
                No quarantined items currently in Safety Hold. Upload a file with broken table columns (or click “Load Broken Table Test”) to see Safety Hold catch it cleanly.
              </div>
            ) : (
              snapshot.quarantine.map((q) => (
                <div key={q.quarantine_id} className="p-5 bg-white space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-slate-950">
                      {q.doc_title} · <span className="font-mono font-normal text-slate-600">Page {q.page_number ?? 'N/A'}</span>
                    </div>
                    <div className="tabular-nums text-slate-600">
                      <span className="text-rose-700 font-semibold">
                        {REASON_LABELS[q.reason_code] ?? q.reason_code}
                      </span>{' '}
                      · Scan clarity {(q.ocr_confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <pre className="p-3.5 bg-[#091120] text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
                    {JSON.stringify(q.raw_payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <DatabaseStatusModal
        isOpen={isDbStatusOpen}
        onClose={() => setIsDbStatusOpen(false)}
        snapshot={snapshot}
        runtime={runtime}
        corpusActionBusy={corpusActionBusy}
        onClearSamples={() => void handleClearSamples()}
        onRestoreCorpus={() => void handleRestoreCorpus()}
      />
    </div>
  );
};
