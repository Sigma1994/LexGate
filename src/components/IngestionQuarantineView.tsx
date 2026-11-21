import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  Search,
  ShieldBan,
  Upload,
} from 'lucide-react';
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

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
    }
    if (!citationCode.trim()) {
      setCitationCode(`UPLOAD/${new Date().getFullYear()}`);
    }
    e.target.value = '';
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await fetch('/api/admin/upload-document', {
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
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? 'Could not upload policy document.');
        return;
      }
      setUploadResult(data.upload);
      if (data.snapshot) {
        onSnapshotUpdate(data.snapshot);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const testImmutability = async (quarantineId: string, op: 'UPDATE' | 'DELETE') => {
    const res = await fetch('/api/admin/quarantine-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarantine_id: quarantineId, op }),
    });
    const data = await res.json();
    setQuarantineTestResult(data.error ?? 'Blocked.');
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
              Browse the full 1966–2026 banking &amp; compliance library or upload new policy documents directly into Qdrant with automatic table validation and permission tagging.
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

      {/* 2. Direct Upload Policy Document to Qdrant */}
      <section className="saas-surface rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-blue-400" />
              Direct Upload Policy Document to Qdrant
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Validates tables, creates parent/child sections, generates 768-dim embeddings, and indexes immediately into Qdrant.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
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

        <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
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
                placeholder="e.g., CBK Green Finance Risk Directive (2026)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label htmlFor="upload-citation" className="block text-xs font-semibold text-slate-800">
                Citation / Circular Code
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
                Access Level
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

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="upload-text" className="block text-xs font-semibold text-slate-800">
                Policy Content (Separate sections with a blank line; Markdown tables supported)
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer transition-colors">
                <Upload className="w-3 h-3" />
                <span>Import .txt / .md / .csv File</span>
                <input
                  type="file"
                  accept=".txt,.md,.csv,.markdown"
                  onChange={(e) => void handleFileLoad(e)}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              id="upload-text"
              rows={5}
              required
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste regulatory text or Markdown tables here, or import a .txt / .md file..."
              className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[11px] text-slate-500">
              Any table with mismatched column counts is automatically caught and placed in Safety Hold below.
            </span>
            <button
              type="submit"
              disabled={uploading || !title.trim() || !citationCode.trim() || rawText.trim().length < 20}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Indexing Into Qdrant...' : 'Index Policy Into Qdrant'}
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
                </div>
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
