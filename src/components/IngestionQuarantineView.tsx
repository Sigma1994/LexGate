import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  FilePlus2,
  FileText,
  Search,
  ShieldBan,
  Upload,
  X,
} from 'lucide-react';
import { safeFetchJson } from '../lib/safeFetchJson.ts';
import type {
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

  const filteredDocuments = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return snapshot.documents.filter((doc) => {
      if (tierFilter !== 'all' && doc.sensitivity !== tierFilter) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.citation_code.toLowerCase().includes(q) ||
        doc.versions.some((v) => v.version_label.toLowerCase().includes(q))
      );
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

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      if (selectedFile && rawText.trim().length === 0) {
        const form = new FormData();
        form.append('file', selectedFile);
        form.append('title', title);
        form.append('citation_code', citationCode);
        form.append('sensitivity', sensitivity);
        form.append('effective_from', `${effectiveFrom}T00:00:00Z`);
        if (versionLabel.trim()) form.append('version_label', versionLabel.trim());

        const { data } = await safeFetchJson<{
          upload: UploadDocumentResult;
          snapshot?: LedgerSnapshot;
        }>('/api/admin/upload-file', {
          method: 'POST',
          body: form,
        });
        setUploadResult(data.upload);
        setSelectedFile(null);
        setPreviewNote(null);
        if (data.snapshot) {
          onSnapshotUpdate(data.snapshot);
        }
      } else {
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
        setUploadResult(data.upload);
        setSelectedFile(null);
        setPreviewNote(null);
        if (data.snapshot) {
          onSnapshotUpdate(data.snapshot);
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
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
              Browse the full 1966–2026 banking &amp; compliance library or drop in any <strong>PDF, Word (.docx), CSV/TSV, HTML, JSON, RTF, Markdown, or TXT</strong> document—LexGate converts it automatically for Qdrant and checks every table.
            </p>
          </div>
          <div className="text-xs text-right">
            <div className="text-slate-400">Vector Store Target</div>
            <div className={`font-semibold mt-0.5 ${runtime?.qdrant.reachable ? 'text-emerald-400' : 'text-blue-300'}`}>
              {runtime?.qdrant.reachable
                ? `Live Qdrant (${runtime.qdrant.collection})`
                : 'Embedded Vector Index (Auto-Qdrant on Local Clone)'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-slate-700/70">
          <div>
            <div className="text-[11px] text-slate-400">Policy Documents</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-white">
              {snapshot.stats.document_count}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Rule Versions</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-white">
              {snapshot.stats.version_count}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Full Sections (Parent)</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-white">
              {snapshot.stats.parent_chunk_count}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Qdrant Vector Points</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-emerald-400">
              {snapshot.stats.qdrant_point_count}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Safety Hold Items</div>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-amber-300">
              {snapshot.stats.quarantine_count}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Simple Multi-Format Upload -> Auto-Process -> Qdrant */}
      <section className="saas-surface rounded-xl overflow-hidden">
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

      {/* 3. Full Searchable Policy Library Catalog */}
      <section className="saas-surface rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Active Regulatory &amp; Policy Catalog ({filteredDocuments.length} of {snapshot.documents.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Covers 1966–2026 statutes, Banking Amendment Act 2025, ODPC Data Protection, CBK Cyber &amp; AI Governance 2026, AML/VASP, IFRS 9, and Internal Audit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by title or code..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-700"
              />
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
                <th className="py-2.5 px-4 font-semibold">Effective Timeline(s)</th>
                <th className="py-2.5 px-4 font-semibold">Qdrant Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredDocuments.map((doc) => (
                <tr key={doc.doc_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-950">{doc.title}</td>
                  <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">{doc.citation_code}</td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    {SENSITIVITY_LABELS[doc.sensitivity]}
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
                </tr>
              ))}
            </tbody>
          </table>
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
            {snapshot.quarantine.map((q) => (
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
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
