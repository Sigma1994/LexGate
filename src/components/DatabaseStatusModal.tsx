import React, { useEffect } from 'react';
import { Database, Layers, RotateCcw, Trash2, X } from 'lucide-react';
import type { LedgerSnapshot, SystemRuntimeStatus } from '../shared/types.ts';

export interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: LedgerSnapshot;
  runtime?: SystemRuntimeStatus | null;
  corpusActionBusy?: boolean;
  onClearSamples?: () => void;
  onRestoreCorpus?: () => void;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({
  isOpen,
  onClose,
  snapshot,
  runtime = null,
  corpusActionBusy = false,
  onClearSamples,
  onRestoreCorpus,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { stats } = snapshot;
  const starterDocs = snapshot.documents.filter((d) => d.origin === 'starter');
  const userDocs = snapshot.documents.filter((d) => d.origin === 'user_upload');
  const multiVersionDocs = snapshot.documents.filter((d) => d.versions.length > 1);
  const pendingOutboxCount = snapshot.outbox.filter((o) => o.processed_at === null).length;

  const avgSectionsPerVersion =
    stats.version_count > 0 ? (stats.parent_chunk_count / stats.version_count).toFixed(1) : '0.0';
  const vectorFanoutRatio =
    stats.parent_chunk_count > 0
      ? (stats.qdrant_point_count / stats.parent_chunk_count).toFixed(2)
      : '0.00';

  const starterVectorRatio =
    stats.starter_parent_chunk_count > 0
      ? (stats.starter_vector_point_count / stats.starter_parent_chunk_count).toFixed(2)
      : '0.00';
  const userVectorRatio =
    stats.user_parent_chunk_count > 0
      ? (stats.user_vector_point_count / stats.user_parent_chunk_count).toFixed(2)
      : '0.00';

  let cohortSummaryTitle = 'Empty Library';
  let cohortSummaryDetail =
    'Zero documents are currently loaded. Drop a file in the upload area or restore the starter corpus.';
  if (stats.starter_document_count > 0 && stats.user_document_count > 0) {
    cohortSummaryTitle = 'Mixed Corpus · Starter Policies + Live User Uploads';
    cohortSummaryDetail = `Both cohorts run through the identical chunkDocumentPages() pipeline. ${stats.starter_document_count} starter statute(s) and ${stats.user_document_count} user-uploaded policy file(s) share one unified Qdrant index.`;
  } else if (stats.starter_document_count > 0) {
    cohortSummaryTitle = 'Starter Corpus Active · 0 Live User Uploads';
    cohortSummaryDetail =
      'Preloaded multi-page regulatory policies are active. Uploading your own document adds directly alongside them, or click Clear Library (My Docs Only) to work exclusively with your own files.';
  } else if (stats.user_document_count > 0) {
    cohortSummaryTitle = 'Live User Uploads Only · Starter Corpus Cleared';
    cohortSummaryDetail = `Running strictly on ${stats.user_document_count} user-uploaded policy document(s) with 0 preloaded starter records.`;
  }

  const qdrantLivePoints = runtime?.qdrant.reachable ? runtime.qdrant.live_points : null;
  const qdrantInSyncWithLedger =
    qdrantLivePoints !== null && qdrantLivePoints === stats.qdrant_point_count;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-status-modal-title"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="text-[11px] font-medium text-blue-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Live Ledger &amp; Vector Store Architecture
            </div>
            <h2 id="db-status-modal-title" className="text-lg font-semibold text-white mt-0.5">
              Database Status &amp; Count Logic
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              {cohortSummaryTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Database Status modal"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* Live Runtime & Cohort State Strip */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <p className="text-slate-800 leading-relaxed">{cohortSummaryDetail}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-200 text-[11px]">
              <div>
                <div className="text-slate-500">Vector Backend</div>
                <div
                  className={`mt-0.5 font-semibold ${
                    runtime?.qdrant.reachable ? 'text-emerald-700' : 'text-blue-700'
                  }`}
                >
                  {runtime?.qdrant.reachable
                    ? `Live Qdrant HTTP (${runtime.qdrant.collection})`
                    : 'Embedded Vector Index'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Qdrant Live Points</div>
                <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-950">
                  {qdrantLivePoints !== null
                    ? `${qdrantLivePoints} (${qdrantInSyncWithLedger ? 'Matches ledger' : `Ledger ${stats.qdrant_point_count}`})`
                    : `${stats.qdrant_point_count} (Embedded)`}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Corpus Epoch</div>
                <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-950">
                  Epoch {snapshot.corpus_epoch} · {snapshot.cache_entries_count} cached
                </div>
              </div>
              <div>
                <div className="text-slate-500">Index Outbox Queue</div>
                <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-950">
                  {pendingOutboxCount} pending · {snapshot.index_worker_paused ? 'Paused' : 'Auto-sync'}
                </div>
              </div>
            </div>
          </div>

          {/* Graphical Data Pipeline Diagram */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-950">
                Graphical Data Pipeline: Upload → Full Sections → Qdrant Vector Points
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-slate-600">
                Unified pipeline for Starter Corpus &amp; Live User Data ({vectorFanoutRatio}x vector fan-out)
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto">
              <svg
                viewBox="0 0 820 258"
                className="w-full min-w-[660px] h-auto block"
                role="img"
                aria-label="LexGate data pipeline diagram showing Starter Corpus and Live User Uploads passing through Document Upload and Safety Hold, Segmentation into Full Sections, and Vectorization into Qdrant Vector Points"
              >
                <defs>
                  <marker
                    id="lex-arrow-slate"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
                  </marker>
                  <marker
                    id="lex-arrow-blue"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#1d4ed8" />
                  </marker>
                  <marker
                    id="lex-arrow-amber"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#b45309" />
                  </marker>
                  <marker
                    id="lex-arrow-emerald"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#047857" />
                  </marker>
                </defs>

                {/* STAGE 1A: Starter Corpus Source */}
                <g transform="translate(10, 16)">
                  <rect
                    width="158"
                    height="72"
                    rx="8"
                    fill="#ffffff"
                    stroke="#cbd5e1"
                    strokeWidth="1.2"
                  />
                  <rect width="158" height="22" rx="8" fill="#0f172a" />
                  <rect y="14" width="158" height="8" fill="#0f172a" />
                  <text x="10" y="15" fontSize="10" fontWeight="600" fill="#f8fafc">
                    Starter Corpus (Boot)
                  </text>
                  <text x="10" y="38" fontSize="10" fontWeight="600" fill="#0f172a">
                    {stats.starter_document_count} docs · {stats.starter_version_count} versions
                  </text>
                  <text x="10" y="53" fontSize="9.5" fill="#475569">
                    SEED_VERSION_PAGES
                  </text>
                  <text x="10" y="65" fontSize="9" fill="#64748b">
                    LOAD_STARTER_CORPUS
                  </text>
                </g>

                {/* STAGE 1B: Live User Uploads Source */}
                <g transform="translate(10, 108)">
                  <rect
                    width="158"
                    height="72"
                    rx="8"
                    fill="#eff6ff"
                    stroke="#93c5fd"
                    strokeWidth="1.2"
                  />
                  <rect width="158" height="22" rx="8" fill="#1d4ed8" />
                  <rect y="14" width="158" height="8" fill="#1d4ed8" />
                  <text x="10" y="15" fontSize="10" fontWeight="600" fill="#ffffff">
                    Live User Uploads
                  </text>
                  <text x="10" y="38" fontSize="10" fontWeight="600" fill="#1e3a8a">
                    {stats.user_document_count} docs · {stats.user_version_count} versions
                  </text>
                  <text x="10" y="53" fontSize="9.5" fill="#1e40af">
                    PDF, DOCX, CSV, HTML, TXT
                  </text>
                  <text x="10" y="65" fontSize="9" fill="#3b82f6">
                    Dropzone or ingest_pdfs.py
                  </text>
                </g>

                {/* Converging Arrows into Upload / Parser */}
                <path
                  d="M 168 52 C 194 52, 192 88, 214 92"
                  fill="none"
                  stroke="#475569"
                  strokeWidth="1.6"
                  markerEnd="url(#lex-arrow-slate)"
                />
                <path
                  d="M 168 144 C 194 144, 192 108, 214 104"
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="1.6"
                  markerEnd="url(#lex-arrow-blue)"
                />

                {/* STAGE 2: Document Upload, Extraction & Validation */}
                <g transform="translate(218, 36)">
                  <rect
                    width="162"
                    height="124"
                    rx="8"
                    fill="#ffffff"
                    stroke="#94a3b8"
                    strokeWidth="1.3"
                  />
                  <rect width="162" height="24" rx="8" fill="#1e293b" />
                  <rect y="16" width="162" height="8" fill="#1e293b" />
                  <text x="10" y="16" fontSize="10.5" fontWeight="600" fill="#ffffff">
                    1. Upload &amp; Validation
                  </text>
                  <text x="10" y="42" fontSize="10" fontWeight="600" fill="#0f172a">
                    {stats.document_count} Policy Docs
                  </text>
                  <text x="10" y="57" fontSize="10" fontWeight="600" fill="#0f172a">
                    {stats.version_count} Rule Versions
                  </text>
                  <line x1="10" y1="67" x2="152" y2="67" stroke="#e2e8f0" strokeWidth="1" />
                  <text x="10" y="81" fontSize="9.5" fill="#475569">
                    • Physical page numbers
                  </text>
                  <text x="10" y="95" fontSize="9.5" fill="#475569">
                    • Bitemporal [from, to) GIST
                  </text>
                  <text x="10" y="109" fontSize="9.5" fill="#475569">
                    • Table &amp; OCR integrity check
                  </text>
                </g>

                {/* Branch down to Safety Hold */}
                <path
                  d="M 299 160 L 299 190"
                  fill="none"
                  stroke="#b45309"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  markerEnd="url(#lex-arrow-amber)"
                />
                <g transform="translate(206, 194)">
                  <rect
                    width="186"
                    height="52"
                    rx="8"
                    fill="#fffbeb"
                    stroke="#f59e0b"
                    strokeWidth="1.2"
                  />
                  <text x="12" y="19" fontSize="10" fontWeight="700" fill="#92400e">
                    Safety Hold ({stats.quarantine_count} quarantined)
                  </text>
                  <text x="12" y="34" fontSize="9" fill="#78350f">
                    Jagged tables / blurry scans blocked
                  </text>
                  <text x="12" y="45" fontSize="9" fill="#92400e">
                    Never indexed into Qdrant
                  </text>
                </g>

                {/* Arrow Stage 2 -> Stage 3 */}
                <path
                  d="M 380 98 L 424 98"
                  fill="none"
                  stroke="#475569"
                  strokeWidth="1.7"
                  markerEnd="url(#lex-arrow-slate)"
                />
                <text x="386" y="90" fontSize="8.5" fontWeight="600" fill="#475569">
                  Clean pages
                </text>

                {/* STAGE 3: Segmentation into Full Sections (Parent) */}
                <g transform="translate(428, 30)">
                  <rect
                    width="174"
                    height="136"
                    rx="8"
                    fill="#ffffff"
                    stroke="#94a3b8"
                    strokeWidth="1.3"
                  />
                  <rect width="174" height="24" rx="8" fill="#0f172a" />
                  <rect y="16" width="174" height="8" fill="#0f172a" />
                  <text x="10" y="16" fontSize="10.5" fontWeight="600" fill="#ffffff">
                    2. Parent Segmentation
                  </text>

                  {/* Stacked section blocks visual */}
                  <rect x="10" y="34" width="154" height="18" rx="3" fill="#f1f5f9" stroke="#cbd5e1" />
                  <text x="16" y="46" fontSize="9" fontWeight="600" fill="#0f172a">
                    Section A · ~1,100 chars (pg N)
                  </text>
                  <rect x="10" y="56" width="154" height="18" rx="3" fill="#f1f5f9" stroke="#cbd5e1" />
                  <text x="16" y="68" fontSize="9" fontWeight="600" fill="#0f172a">
                    Section B · Full table kept whole
                  </text>

                  <text x="10" y="92" fontSize="10.5" fontWeight="700" fill="#0f172a">
                    {stats.parent_chunk_count} Full Sections (Parent)
                  </text>
                  <text x="10" y="107" fontSize="9" fill="#475569">
                    Stored in PostgreSQL / Ledger
                  </text>
                  <text x="10" y="120" fontSize="9" fill="#475569">
                    Sent to LLM for exact citations
                  </text>
                  <text x="10" y="131" fontSize="8.5" fill="#64748b">
                    Avg {avgSectionsPerVersion} sections per rule version
                  </text>
                </g>

                {/* Fan-out arrows Stage 3 -> Stage 4 */}
                <path
                  d="M 602 74 C 624 74, 622 58, 642 58"
                  fill="none"
                  stroke="#047857"
                  strokeWidth="1.5"
                  markerEnd="url(#lex-arrow-emerald)"
                />
                <path
                  d="M 602 98 L 642 98"
                  fill="none"
                  stroke="#047857"
                  strokeWidth="1.5"
                  markerEnd="url(#lex-arrow-emerald)"
                />
                <path
                  d="M 602 122 C 624 122, 622 138, 642 138"
                  fill="none"
                  stroke="#047857"
                  strokeWidth="1.5"
                  markerEnd="url(#lex-arrow-emerald)"
                />
                <text x="605" y="154" fontSize="8.5" fontWeight="600" fill="#047857">
                  {vectorFanoutRatio}x split
                </text>

                {/* STAGE 4: Vectorization into Qdrant Points (Child) */}
                <g transform="translate(646, 22)">
                  <rect
                    width="164"
                    height="152"
                    rx="8"
                    fill="#ecfdf5"
                    stroke="#10b981"
                    strokeWidth="1.4"
                  />
                  <rect width="164" height="24" rx="8" fill="#065f46" />
                  <rect y="16" width="164" height="8" fill="#065f46" />
                  <text x="10" y="16" fontSize="10.5" fontWeight="600" fill="#ffffff">
                    3. Qdrant Vectorization
                  </text>

                  {/* Child vector mini-pills */}
                  <rect x="10" y="33" width="144" height="16" rx="3" fill="#ffffff" stroke="#a7f3d0" />
                  <text x="15" y="44" fontSize="8.5" fill="#065f46">
                    Child 1 · Sentence ≤ 340 chars
                  </text>
                  <rect x="10" y="53" width="144" height="16" rx="3" fill="#ffffff" stroke="#a7f3d0" />
                  <text x="15" y="64" fontSize="8.5" fill="#065f46">
                    Child 2 · Table 2 rows + headers
                  </text>
                  <rect x="10" y="73" width="144" height="16" rx="3" fill="#ffffff" stroke="#a7f3d0" />
                  <text x="15" y="84" fontSize="8.5" fill="#065f46">
                    Child N · 768d Cosine + BM25
                  </text>

                  <text x="10" y="108" fontSize="11" fontWeight="700" fill="#064e3b">
                    {stats.qdrant_point_count} Vector Points
                  </text>
                  <text x="10" y="122" fontSize="9" fill="#047857">
                    with_payload=false · RLS checked
                  </text>
                  <text x="10" y="135" fontSize="9" fill="#047857">
                    {runtime?.qdrant.reachable ? 'Live Qdrant HTTP' : 'Embedded Vector Index'}
                  </text>
                  <text x="10" y="146" fontSize="8.5" fill="#065f46">
                    {stats.starter_vector_point_count} starter · {stats.user_vector_point_count} uploaded
                  </text>
                </g>

                {/* Footer Pipeline Note inside SVG */}
                <g transform="translate(428, 194)">
                  <rect
                    width="382"
                    height="52"
                    rx="8"
                    fill="#ffffff"
                    stroke="#cbd5e1"
                    strokeWidth="1.1"
                  />
                  <text x="12" y="19" fontSize="10" fontWeight="600" fill="#0f172a">
                    Query-Time Retrieval Flow (Zero Privilege Drift)
                  </text>
                  <text x="12" y="34" fontSize="9" fill="#475569">
                    Qdrant returns Child point IDs → PostgreSQL RLS filters ACLs at now()
                  </text>
                  <text x="12" y="45" fontSize="9" fill="#475569">
                    → Expands back to Parent Full Section → Verifies word-for-word citations
                  </text>
                </g>
              </svg>
            </div>

            {/* Proportional Starter vs Live User Data Bar */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-slate-900">
                  Current Vector Index Composition (Starter Corpus vs. Live User Data)
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  {stats.starter_vector_point_count} starter (
                  {stats.qdrant_point_count > 0
                    ? Math.round((stats.starter_vector_point_count / stats.qdrant_point_count) * 100)
                    : 0}
                  %) · {stats.user_vector_point_count} live uploaded (
                  {stats.qdrant_point_count > 0
                    ? Math.round((stats.user_vector_point_count / stats.qdrant_point_count) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                {stats.qdrant_point_count > 0 ? (
                  <>
                    <div
                      style={{
                        width: `${(stats.starter_vector_point_count / stats.qdrant_point_count) * 100}%`,
                      }}
                      className="bg-slate-900 h-full transition-all"
                      title={`Starter Corpus: ${stats.starter_vector_point_count} Qdrant vectors`}
                    />
                    <div
                      style={{
                        width: `${(stats.user_vector_point_count / stats.qdrant_point_count) * 100}%`,
                      }}
                      className="bg-blue-600 h-full transition-all"
                      title={`Live User Uploads: ${stats.user_vector_point_count} Qdrant vectors`}
                    />
                  </>
                ) : (
                  <div className="w-full h-full bg-slate-200" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-900 inline-block" />
                  Starter Corpus (preloaded reference policies via <span className="font-mono">LOAD_STARTER_CORPUS</span>)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                  Live User Data (uploaded files via browser or CLI, indexed identically)
                </span>
              </div>
            </div>
          </div>

          {/* Live Cohort Breakdown Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-950 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-700" />
                Live Count Breakdown: Starter Corpus vs. Live User Uploads
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-slate-600">
                100% shared chunkDocumentPages() math
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-100">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Metric</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Starter Corpus</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Live User Uploads</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Active Total</th>
                    <th className="py-2.5 px-4 font-semibold">Storage Layer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-950">Policy Documents</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {stats.starter_document_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700 font-semibold">
                      {stats.user_document_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-950">
                      {stats.document_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      reg.documents + acl_grants
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-950">Rule Versions</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {stats.starter_version_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700 font-semibold">
                      {stats.user_version_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-950">
                      {stats.version_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      reg.document_versions [from, to)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-950">Full Sections (Parent)</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {stats.starter_parent_chunk_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700 font-semibold">
                      {stats.user_parent_chunk_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-950">
                      {stats.parent_chunk_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      reg.document_chunks (parent)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-950">Qdrant Vector Points</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {stats.starter_vector_point_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700 font-semibold">
                      {stats.user_vector_point_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {stats.qdrant_point_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      Qdrant 768d child vectors (with_payload=false)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-950">Safety Hold Items</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {stats.starter_quarantine_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-blue-700 font-semibold">
                      {stats.user_quarantine_count}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-amber-700">
                      {stats.quarantine_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      reg.ingestion_quarantine (append-only)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4 Dynamic Metric Logic Cards */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-950">
              How Each Metric Is Calculated Dynamically
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-slate-200 rounded-lg bg-white space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">01. Policy Documents</span>
                  <span className="font-mono tabular-nums text-slate-700 font-semibold">
                    {stats.document_count} active
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  One canonical parent record per statute, circular, or uploaded file, carrying its base citation code and sensitivity ACL (<span className="font-mono">public</span>, <span className="font-mono">compliance_officer</span>, or <span className="font-mono">internal_audit</span>). Currently includes{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {stats.starter_document_count}
                  </span>{' '}
                  starter document{stats.starter_document_count === 1 ? '' : 's'} and{' '}
                  <span className="font-mono tabular-nums font-semibold text-blue-700">
                    {stats.user_document_count}
                  </span>{' '}
                  live upload{stats.user_document_count === 1 ? '' : 's'}.
                </p>
              </div>

              <div className="p-4 border border-slate-200 rounded-lg bg-white space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">02. Rule Versions</span>
                  <span className="font-mono tabular-nums text-slate-700 font-semibold">
                    {stats.version_count} active
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Bitemporal effective-date windows <span className="font-mono">[effective_from, effective_to)</span> with GIST non-overlapping constraints so historical questions never leak newer amendments.{' '}
                  {multiVersionDocs.length > 0 ? (
                    <>
                      Multi-version policies currently account for the{' '}
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        +{stats.version_count - stats.document_count}
                      </span>{' '}
                      extra version{stats.version_count - stats.document_count === 1 ? '' : 's'}:{' '}
                      <span className="font-medium text-slate-900">
                        {multiVersionDocs
                          .map((d) => `${d.citation_code} (${d.versions.length} versions)`)
                          .join(', ')}
                      </span>
                      .
                    </>
                  ) : (
                    <>
                      Each active document currently holds 1 version ({stats.version_count} total).
                    </>
                  )}
                </p>
              </div>

              <div className="p-4 border border-slate-200 rounded-lg bg-white space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">03. Full Sections (Parent)</span>
                  <span className="font-mono tabular-nums text-slate-700 font-semibold">
                    {stats.parent_chunk_count} sections ({avgSectionsPerVersion}/ver)
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Generated by <span className="font-mono">chunkDocumentPages()</span> per physical page. Same-page paragraphs group up to ~1,100 characters while preserving exact <span className="font-mono">page_number</span> and complete Markdown tables so the LLM receives full context. Parent sections stay in the relational ledger and are never embedded directly as Qdrant vectors.
                </p>
              </div>

              <div className="p-4 border border-slate-200 rounded-lg bg-white space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">04. Qdrant Vector Points (Child)</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                    {stats.qdrant_point_count} vectors ({vectorFanoutRatio}x)
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Focused 768-dim Cosine retrieval points pointing back to a Parent section. Prose over 340 chars splits by sentence, and Markdown tables over 2 rows split into 2-row slices with repeated column headers. Starter fan-out:{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {starterVectorRatio}x
                  </span>{' '}
                  · Live upload fan-out:{' '}
                  <span className="font-mono tabular-nums font-semibold text-blue-700">
                    {userVectorRatio}x
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>

          {/* Starter Corpus vs Live User Uploads Architectural Comparison */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200">
              <h3 className="text-xs font-semibold text-slate-950">
                Starter Corpus vs. Live User Uploads — How They Differ &amp; Align
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-900">
                  <tr>
                    <th className="py-2 px-4 font-semibold">Dimension</th>
                    <th className="py-2 px-4 font-semibold">Starter Corpus</th>
                    <th className="py-2 px-4 font-semibold">Live User Uploads</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-900">Ingestion Source</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      Multi-page definitions in <span className="font-mono">src/server/corpus.ts</span> (<span className="font-mono">SEED_VERSION_PAGES</span>) loaded on boot when <span className="font-mono">LOAD_STARTER_CORPUS=true</span>.
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      Browser dropzone (<span className="font-mono">.pdf, .docx, .csv, .html, .json, .rtf, .md, .txt</span>) or CLI <span className="font-mono">scripts/ingest_pdfs.py</span>.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-900">Chunking &amp; Safety Hold</td>
                    <td className="py-2.5 px-4 text-slate-600" colSpan={2}>
                      <strong>Identical pipeline:</strong> Both pass through <span className="font-mono">chunkDocumentPages()</span> for physical <span className="font-mono">page_number</span> tracking, sentence splitting, header-repeating table slicing, and jagged-table Safety Hold checks.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-900">Control &amp; Removal</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      Set <span className="font-mono">LOAD_STARTER_CORPUS=false</span> in <span className="font-mono">.env</span>, or use <strong>Clear Library (My Docs Only)</strong> / <strong>Restore Starter Corpus</strong>.
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      Each uploaded policy receives a fresh UUID, writes directly to Qdrant &amp; Redis epoch cache, and can be deleted individually via <strong>Remove</strong>.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-900">Active Documents Now</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">
                      {starterDocs.length} doc(s) · {stats.starter_parent_chunk_count} sections · {stats.starter_vector_point_count} vectors
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-blue-800 font-semibold">
                      {userDocs.length} doc(s) · {stats.user_parent_chunk_count} sections · {stats.user_vector_point_count} vectors
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {onClearSamples && snapshot.documents.length > 0 && (
              <button
                type="button"
                disabled={corpusActionBusy}
                onClick={onClearSamples}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-rose-50 hover:text-rose-700 border border-slate-300 rounded-md transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Library (My Docs Only)
              </button>
            )}
            {onRestoreCorpus && (
              <button
                type="button"
                disabled={corpusActionBusy}
                onClick={onRestoreCorpus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-800 bg-white hover:bg-blue-50 border border-blue-300 rounded-md transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore Starter Corpus
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
