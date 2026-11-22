import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, GitCommitHorizontal, History, RotateCcw, Trash2 } from 'lucide-react';
import type { DocumentVersionWithStats, GroupId, LedgerSnapshot } from '../shared/types.ts';

export function matchesPolicyDocumentSearch(
  doc: LedgerSnapshot['documents'][number],
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (doc.title.toLowerCase().includes(q)) return true;
  if (doc.citation_code.toLowerCase().includes(q)) return true;
  if (doc.created_at.toLowerCase().includes(q)) return true;
  return doc.versions.some(
    (v) =>
      v.version_label.toLowerCase().includes(q) ||
      v.effective_from.toLowerCase().includes(q) ||
      (v.effective_to ? v.effective_to.toLowerCase().includes(q) : 'present'.includes(q))
  );
}

interface DocumentHistoryVizProps {
  snapshot: LedgerSnapshot;
  searchQuery?: string;
  corpusActionBusy: boolean;
  onRestoreCorpus: () => void;
  onDeleteDocument: (docId: string) => void;
  onJumpToUpload?: () => void;
}

const SENSITIVITY_LABELS: Record<GroupId, string> = {
  public: 'Public Laws',
  compliance_officer: 'Compliance Memos',
  internal_audit: 'Private Audits',
};

const AXIS_ANCHORS: Array<{ label: string; ts: number; pct: number }> = [
  { label: '1966', ts: Date.UTC(1966, 0, 1), pct: 0 },
  { label: '2012', ts: Date.UTC(2012, 0, 1), pct: 18 },
  { label: '2023', ts: Date.UTC(2023, 0, 1), pct: 32 },
  { label: '2024', ts: Date.UTC(2024, 0, 1), pct: 44 },
  { label: '2025', ts: Date.UTC(2025, 0, 1), pct: 58 },
  { label: '2026', ts: Date.UTC(2026, 0, 1), pct: 74 },
  { label: '2027+', ts: Date.UTC(2027, 0, 1), pct: 92 },
  { label: 'Present', ts: Date.UTC(2028, 0, 1), pct: 100 },
];

function timestampToPercent(ms: number): number {
  if (ms <= AXIS_ANCHORS[0].ts) return 0;
  const last = AXIS_ANCHORS[AXIS_ANCHORS.length - 1];
  if (ms >= last.ts) return 100;

  for (let i = 0; i < AXIS_ANCHORS.length - 1; i += 1) {
    const a = AXIS_ANCHORS[i];
    const b = AXIS_ANCHORS[i + 1];
    if (ms >= a.ts && ms <= b.ts) {
      const ratio = (ms - a.ts) / (b.ts - a.ts);
      return a.pct + ratio * (b.pct - a.pct);
    }
  }
  return 100;
}

function getVersionStatus(
  ver: DocumentVersionWithStats,
  nowMs: number
): 'superseded' | 'active' | 'scheduled' {
  const fromMs = new Date(ver.effective_from).getTime();
  const toMs = ver.effective_to ? new Date(ver.effective_to).getTime() : Infinity;
  if (toMs <= nowMs) return 'superseded';
  if (fromMs > nowMs) return 'scheduled';
  return 'active';
}

function formatDateShort(iso: string | null): string {
  if (!iso) return 'Present';
  return iso.slice(0, 10);
}

export const DocumentHistoryViz: React.FC<DocumentHistoryVizProps> = ({
  snapshot,
  searchQuery = '',
  corpusActionBusy,
  onRestoreCorpus,
  onDeleteDocument,
  onJumpToUpload,
}) => {
  const [vizMode, setVizMode] = useState<'timeline' | 'chronology'>('timeline');
  const [originFilter, setOriginFilter] = useState<'all' | 'starter' | 'user_upload'>('all');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const nowMs = Date.now();
  const todayPct = useMemo(() => timestampToPercent(nowMs), [nowMs]);

  const filteredDocs = useMemo(() => {
    const list = snapshot.documents.filter((doc) => {
      if (originFilter !== 'all' && doc.origin !== originFilter) return false;
      return matchesPolicyDocumentSearch(doc, searchQuery);
    });
    if (vizMode === 'chronology') {
      return [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return [...list].sort((a, b) => {
      const aEarliest = Math.min(...a.versions.map((v) => new Date(v.effective_from).getTime()));
      const bEarliest = Math.min(...b.versions.map((v) => new Date(v.effective_from).getTime()));
      return aEarliest - bEarliest;
    });
  }, [snapshot.documents, originFilter, searchQuery, vizMode]);

  useEffect(() => {
    if (filteredDocs.length === 0) {
      setSelectedDocId(null);
      setSelectedVersionId(null);
      return;
    }
    const existing = filteredDocs.find((d) => d.doc_id === selectedDocId);
    if (!existing) {
      const preferred =
        filteredDocs.find((d) => d.origin === 'user_upload') ??
        filteredDocs.find((d) => d.versions.length > 1) ??
        filteredDocs[0];
      setSelectedDocId(preferred.doc_id);
      setSelectedVersionId(preferred.versions[preferred.versions.length - 1]?.version_id ?? null);
    }
  }, [filteredDocs, selectedDocId]);

  const selectedDoc = useMemo(
    () => filteredDocs.find((d) => d.doc_id === selectedDocId) ?? null,
    [filteredDocs, selectedDocId]
  );

  const selectedVersion = useMemo(() => {
    if (!selectedDoc) return null;
    return (
      selectedDoc.versions.find((v) => v.version_id === selectedVersionId) ??
      selectedDoc.versions[selectedDoc.versions.length - 1] ??
      null
    );
  }, [selectedDoc, selectedVersionId]);

  const supersededCount = useMemo(
    () =>
      snapshot.documents.reduce(
        (sum, d) => sum + d.versions.filter((v) => getVersionStatus(v, nowMs) === 'superseded').length,
        0
      ),
    [snapshot.documents, nowMs]
  );
  const activeCount = useMemo(
    () =>
      snapshot.documents.reduce(
        (sum, d) => sum + d.versions.filter((v) => getVersionStatus(v, nowMs) === 'active').length,
        0
      ),
    [snapshot.documents, nowMs]
  );
  const scheduledCount = Math.max(0, snapshot.stats.version_count - supersededCount - activeCount);

  return (
    <section className="saas-surface rounded-xl overflow-hidden">
      {/* Header Bar */}
      <div className="px-6 py-4 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-950 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-700" />
            Document History &amp; Bitemporal Version Lineage
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Visualizes statutory lifespans across{' '}
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {snapshot.stats.version_count}
            </span>{' '}
            rule version{snapshot.stats.version_count === 1 ? '' : 's'} ({activeCount} in force ·{' '}
            {supersededCount} superseded
            {scheduledCount > 0 ? ` · ${scheduledCount} scheduled` : ''}). Click any version bar or entry to inspect its lineage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Cohort Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
            <button
              type="button"
              onClick={() => setOriginFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                originFilter === 'all'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              All ({snapshot.documents.length})
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('starter')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                originFilter === 'starter'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Starter ({snapshot.stats.starter_document_count})
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('user_upload')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                originFilter === 'user_upload'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Live Uploads ({snapshot.stats.user_document_count})
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
            <button
              type="button"
              onClick={() => setVizMode('timeline')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                vizMode === 'timeline'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <GitCommitHorizontal className="w-3.5 h-3.5" />
              Effective Timeline
            </button>
            <button
              type="button"
              onClick={() => setVizMode('chronology')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                vizMode === 'chronology'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Ingestion Log
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {snapshot.documents.length === 0 ? (
        <div className="p-8 bg-white text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            No Document History to Visualize
          </div>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            The Policy Library is currently empty. Upload your own PDF, Word, CSV, HTML, or text policy document above, or restore the 10-document starter corpus to explore bitemporal version history.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onJumpToUpload && (
              <button
                type="button"
                onClick={onJumpToUpload}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
              >
                Upload a Policy Document
              </button>
            )}
            <button
              type="button"
              disabled={corpusActionBusy}
              onClick={onRestoreCorpus}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Starter Corpus
            </button>
          </div>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="p-8 bg-white text-center text-xs text-slate-500">
          No documents match the current search or cohort filter
          {searchQuery.trim() ? ` (“${searchQuery.trim()}”)` : ''}.
        </div>
      ) : (
        <div className="p-6 bg-white space-y-5">
          {vizMode === 'timeline' ? (
            <>
              {/* Legend */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600 pb-2 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-slate-900 inline-block" />
                    In Force (Starter)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-blue-700 inline-block" />
                    In Force (Live Upload)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-slate-300 border border-slate-400 inline-block" />
                    Superseded Historical Version
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-xs bg-amber-100 border border-amber-500 inline-block" />
                    Scheduled Future Effective Date
                  </span>
                </div>
                <span className="font-mono text-slate-500">
                  Piecewise scale · Era breaks preserve 1966 &amp; 2023–2027 clarity
                </span>
              </div>

              {/* Timeline Chart */}
              <div className="overflow-x-auto">
                <div className="min-w-[760px] space-y-1.5">
                  {/* Axis Header */}
                  <div className="grid grid-cols-12 gap-4 items-end pb-2 border-b border-slate-200">
                    <div className="col-span-4 text-[11px] font-semibold text-slate-700">
                      Policy &amp; Origin
                    </div>
                    <div className="col-span-8 relative h-6">
                      {AXIS_ANCHORS.map((tick) => (
                        <div
                          key={tick.label}
                          style={{ left: `${tick.pct}%` }}
                          className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
                        >
                          <span className="text-[10px] font-mono tabular-nums text-slate-500">
                            {tick.label}
                          </span>
                          <span className="w-px h-1.5 bg-slate-300 mt-0.5" />
                        </div>
                      ))}
                      <div
                        style={{ left: `${todayPct}%` }}
                        className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none"
                      >
                        <span className="text-[10px] font-mono font-semibold text-emerald-700 whitespace-nowrap">
                          Now
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Document Swimlanes */}
                  <div className="divide-y divide-slate-100">
                    {filteredDocs.map((doc) => {
                      const isDocSelected = selectedDoc?.doc_id === doc.doc_id;
                      const sortedVersions = [...doc.versions].sort(
                        (a, b) =>
                          new Date(a.effective_from).getTime() -
                          new Date(b.effective_from).getTime()
                      );

                      return (
                        <div
                          key={doc.doc_id}
                          onClick={() => {
                            setSelectedDocId(doc.doc_id);
                            setSelectedVersionId(
                              sortedVersions[sortedVersions.length - 1]?.version_id ?? null
                            );
                          }}
                          className={`grid grid-cols-12 gap-4 items-center py-2 px-2 rounded-lg cursor-pointer transition-colors ${
                            isDocSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Document Label */}
                          <div className="col-span-4 min-w-0 pr-2">
                            <div className="text-xs font-semibold text-slate-950 truncate">
                              {doc.title}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate font-mono tabular-nums">
                              <span>{doc.citation_code}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  doc.origin === 'user_upload'
                                    ? 'text-blue-700 font-semibold font-sans'
                                    : 'text-slate-600 font-sans'
                                }
                              >
                                {doc.origin === 'user_upload' ? 'Live Upload' : 'Starter'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {doc.versions.length}v / {doc.vector_point_count} vec
                              </span>
                            </div>
                          </div>

                          {/* Swimlane Track */}
                          <div className="col-span-8 relative h-9 bg-slate-50 border border-slate-200/80 rounded-md overflow-hidden">
                            {/* Grid lines */}
                            {AXIS_ANCHORS.slice(1, -1).map((tick) => (
                              <div
                                key={tick.label}
                                style={{ left: `${tick.pct}%` }}
                                className="absolute top-0 bottom-0 w-px bg-slate-200/70 pointer-events-none"
                              />
                            ))}

                            {/* Today vertical reference line */}
                            <div
                              style={{ left: `${todayPct}%` }}
                              className="absolute top-0 bottom-0 w-px bg-emerald-500/70 pointer-events-none z-10"
                            />

                            {/* Version Bars */}
                            {sortedVersions.map((ver, idx) => {
                              const startPct = timestampToPercent(
                                new Date(ver.effective_from).getTime()
                              );
                              const endPct = ver.effective_to
                                ? timestampToPercent(new Date(ver.effective_to).getTime())
                                : 100;
                              const rawWidth = Math.max(4, endPct - startPct);
                              const clampedLeft = Math.min(96, Math.max(0, startPct));
                              const clampedWidth = Math.min(100 - clampedLeft, rawWidth);
                              const status = getVersionStatus(ver, nowMs);
                              const isVerSelected = selectedVersion?.version_id === ver.version_id;

                              let barClasses =
                                doc.origin === 'user_upload'
                                  ? 'bg-blue-700 text-white hover:bg-blue-800'
                                  : 'bg-slate-900 text-white hover:bg-slate-800';
                              if (status === 'superseded') {
                                barClasses =
                                  'bg-slate-300 text-slate-900 border border-slate-400 hover:bg-slate-400/70';
                              } else if (status === 'scheduled') {
                                barClasses =
                                  'bg-amber-100 text-amber-950 border border-amber-500 hover:bg-amber-200';
                              }

                              const hasSupersessionConnector =
                                idx > 0 && sortedVersions[idx - 1]?.effective_to !== null;

                              return (
                                <React.Fragment key={ver.version_id}>
                                  {hasSupersessionConnector && (
                                    <div
                                      style={{ left: `${clampedLeft}%` }}
                                      title="Amended / Superseded transition"
                                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-900 z-20 pointer-events-none"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDocId(doc.doc_id);
                                      setSelectedVersionId(ver.version_id);
                                    }}
                                    style={{
                                      left: `${clampedLeft}%`,
                                      width: `${clampedWidth}%`,
                                    }}
                                    title={`${ver.version_label} (${formatDateShort(ver.effective_from)} → ${formatDateShort(ver.effective_to)}) · ${ver.parent_section_count} sections · ${ver.vector_point_count} vectors`}
                                    className={`absolute top-1.5 bottom-1.5 px-2 rounded-sm text-[10px] font-mono tabular-nums font-medium flex items-center justify-between gap-1 overflow-hidden transition-all z-10 ${barClasses} ${
                                      isVerSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                                    }`}
                                  >
                                    <span className="truncate">
                                      {formatDateShort(ver.effective_from).slice(0, 4)}
                                      {ver.effective_to
                                        ? `–${formatDateShort(ver.effective_to).slice(0, 4)}`
                                        : '→Now'}
                                    </span>
                                    {clampedWidth > 14 && (
                                      <span className="opacity-85 shrink-0">
                                        {ver.vector_point_count}v
                                      </span>
                                    )}
                                  </button>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Ingestion Chronology Mode */
            <div className="space-y-3">
              <div className="text-[11px] text-slate-600 pb-2 border-b border-slate-200 flex items-center justify-between">
                <span>Ordered chronologically by indexing timestamp (newest first)</span>
                <span className="font-mono tabular-nums">
                  {filteredDocs.length} record{filteredDocs.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                {filteredDocs.map((doc) => {
                  const isDocSelected = selectedDoc?.doc_id === doc.doc_id;
                  return (
                    <div
                      key={doc.doc_id}
                      onClick={() => {
                        setSelectedDocId(doc.doc_id);
                        setSelectedVersionId(
                          doc.versions[doc.versions.length - 1]?.version_id ?? null
                        );
                      }}
                      className={`relative p-3.5 rounded-lg border cursor-pointer transition-colors ${
                        isDocSelected
                          ? 'bg-blue-50/70 border-blue-300'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          doc.origin === 'user_upload' ? 'bg-blue-700' : 'bg-slate-800'
                        }`}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-950 truncate">
                            {doc.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">{doc.citation_code}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                doc.origin === 'user_upload'
                                  ? 'text-blue-700 font-semibold'
                                  : 'text-slate-700 font-medium'
                              }
                            >
                              {doc.origin === 'user_upload' ? 'Live User Upload' : 'Starter Corpus'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{SENSITIVITY_LABELS[doc.sensitivity]}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums text-[11px] text-slate-600">
                          <div>Indexed {doc.created_at.slice(0, 10)}</div>
                          <div className="text-slate-900 font-medium">
                            {doc.versions.length} ver · {doc.parent_section_count} sec ·{' '}
                            {doc.vector_point_count} vec
                            {doc.quarantine_count > 0 ? ` · ${doc.quarantine_count} held` : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Document Version Lineage Inspector */}
          {selectedDoc && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] text-slate-500">
                    Selected Policy Lineage ·{' '}
                    <span
                      className={
                        selectedDoc.origin === 'user_upload'
                          ? 'text-blue-700 font-semibold'
                          : 'text-slate-700 font-medium'
                      }
                    >
                      {selectedDoc.origin === 'user_upload' ? 'Live User Upload' : 'Starter Corpus'}
                    </span>{' '}
                    · {SENSITIVITY_LABELS[selectedDoc.sensitivity]}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-950 mt-0.5">
                    {selectedDoc.title} ({selectedDoc.citation_code})
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-600">
                  <span>
                    {selectedDoc.acl_in_sync ? 'Qdrant ACL Synced' : 'Pending Sync'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteDocument(selectedDoc.doc_id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 font-sans text-[11px] font-medium text-slate-700 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-300 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove Policy
                  </button>
                </div>
              </div>

              {/* Version Chain Strip */}
              <div className="flex flex-wrap items-center gap-2">
                {[...selectedDoc.versions]
                  .sort(
                    (a, b) =>
                      new Date(a.effective_from).getTime() - new Date(b.effective_from).getTime()
                  )
                  .map((ver, idx, arr) => {
                    const status = getVersionStatus(ver, nowMs);
                    const isActiveSel = selectedVersion?.version_id === ver.version_id;
                    return (
                      <React.Fragment key={ver.version_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedVersionId(ver.version_id)}
                          className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                            isActiveSel
                              ? 'bg-white border-blue-600 ring-1 ring-blue-600'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-semibold text-slate-950">
                            {ver.version_label}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-600">
                            {formatDateShort(ver.effective_from)} → {formatDateShort(ver.effective_to)} ·{' '}
                            <span
                              className={
                                status === 'active'
                                  ? 'text-emerald-700 font-semibold'
                                  : status === 'scheduled'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-slate-500'
                              }
                            >
                              {status === 'active'
                                ? 'In Force'
                                : status === 'scheduled'
                                  ? 'Scheduled'
                                  : 'Superseded'}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                            {ver.pages_count} page{ver.pages_count === 1 ? '' : 's'} ·{' '}
                            {ver.parent_section_count} parent section
                            {ver.parent_section_count === 1 ? '' : 's'} · {ver.vector_point_count}{' '}
                            Qdrant vector{ver.vector_point_count === 1 ? '' : 's'}
                          </div>
                        </button>
                        {idx < arr.length - 1 && (
                          <span
                            aria-label="Superseded by next version"
                            className="inline-flex items-center text-slate-400 px-0.5"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        )}
                      </React.Fragment>
                    );
                  })}
              </div>

              {selectedVersion && (
                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600">
                  <span>
                    Version ID: {selectedVersion.version_id} · Hash: {selectedVersion.content_hash}
                  </span>
                  <span>
                    Indexed: {selectedDoc.created_at.slice(0, 19).replace('T', ' ')} UTC
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
