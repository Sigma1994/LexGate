import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { safeFetchJson } from '../lib/safeFetchJson.ts';
import type { GroupId, LedgerSnapshot, VerificationSuiteResponse } from '../shared/types.ts';

interface SecurityRlsViewProps {
  snapshot: LedgerSnapshot;
  verification: VerificationSuiteResponse | null;
  isVerifying: boolean;
  onSnapshotUpdate: (snap: LedgerSnapshot) => void;
  onRunVerification: () => void;
  onJumpToConsole: () => void;
}

const GROUPS: Array<{ id: GroupId; label: string }> = [
  { id: 'public', label: 'Public' },
  { id: 'compliance_officer', label: 'Compliance' },
  { id: 'internal_audit', label: 'Internal Audit' },
];

export const SecurityRlsView: React.FC<SecurityRlsViewProps> = ({
  snapshot,
  verification,
  isVerifying,
  onSnapshotUpdate,
  onRunVerification,
  onJumpToConsole,
}) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [suiteFilter, setSuiteFilter] = useState<'all' | 'db-test' | 'security' | 'oracle'>('all');
  const [showPlannerSample, setShowPlannerSample] = useState<boolean>(false);

  const postAdmin = async (url: string, body: Record<string, unknown>, note: string) => {
    setBusyAction(url);
    try {
      const { data } = await safeFetchJson<{ snapshot?: LedgerSnapshot }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (data.snapshot) {
        onSnapshotUpdate(data.snapshot);
      }
      setStatusNote(note);
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Admin action failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const filteredTests = useMemo(() => {
    if (!verification) return [];
    if (suiteFilter === 'all') return verification.results;
    return verification.results.filter((r) => r.category === suiteFilter);
  }, [verification, suiteFilter]);

  const pendingOutboxCount = snapshot.outbox.filter((o) => o.processed_at === null).length;

  return (
    <div className="space-y-7">
      {/* Dark Executive Header & Live Status Ledger */}
      <section className="surface-dark rounded-xl overflow-hidden text-white">
        <div className="p-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/70">
          <div className="max-w-2xl">
            <div className="text-xs font-medium text-blue-300 mb-1">Access Control &amp; Sync Protection</div>
            <h1 className="text-xl font-semibold text-white">
              Privacy Guard &amp; Instant Access Removal
            </h1>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">
              Control who can read each document. Even if background search updates fall behind, Privacy Guard blocks removed users immediately so no restricted file ever leaks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void postAdmin(
                  '/api/admin/worker',
                  { paused: !snapshot.index_worker_paused },
                  snapshot.index_worker_paused
                    ? 'Background search sync resumed — search now reflects every permission change.'
                    : 'Background search sync paused — test removing access below and watch Privacy Guard block unauthorized readers immediately.'
                )
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                snapshot.index_worker_paused
                  ? 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-amber-300'
                  : 'bg-slate-800/90 text-white border-slate-600 hover:bg-slate-700'
              }`}
            >
              {snapshot.index_worker_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {snapshot.index_worker_paused ? 'Resume Background Sync' : 'Pause Background Sync'}
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void postAdmin('/api/admin/reconcile', {}, 'Search copy caught up and now matches Privacy Guard permissions.')
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-100 bg-slate-800/90 border border-slate-600 rounded-lg hover:bg-slate-700 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Catch Up Search Now
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void postAdmin('/api/admin/reset', {}, 'Default permissions and sample records restored.')
              }
              className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900/70 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-white whitespace-nowrap"
            >
              Reset Defaults
            </button>
          </div>
        </div>

        {/* 4-column Ledger Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-700/70 bg-slate-950/35">
          <div className="px-6 py-4">
            <div className="text-[11px] font-medium text-slate-400">Active Protection Version</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              v{snapshot.corpus_epoch}
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-[11px] font-medium text-slate-400">Background Search Sync</div>
            <div className={`mt-1 text-2xl font-semibold ${snapshot.index_worker_paused ? 'text-amber-400' : 'text-emerald-400'}`}>
              {snapshot.index_worker_paused ? 'Paused' : 'Active'}
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-[11px] font-medium text-slate-400">Waiting Updates</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              {pendingOutboxCount}
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-[11px] font-medium text-slate-400">Saved Answers</div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              {snapshot.cache_entries_count}
            </div>
          </div>
        </div>
      </section>

      {/* Document Access Matrix & Update Queue */}
      <section className="saas-surface rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-blue-50/80 border border-blue-200/80 rounded-lg text-xs">
          <div className="text-slate-800">
            <strong className="text-slate-950">Try This Instant-Block Test:</strong>{' '}
            1. Click <strong>Pause Background Sync</strong> above &rarr; 2. Remove <strong>Compliance</strong> from Circular 11/2024 &rarr; 3. Ask a liquidity question as Kamau; Privacy Guard blocks him immediately.
          </div>
          <button
            type="button"
            onClick={onJumpToConsole}
            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
          >
            Test in Ask Questions <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {statusNote && (
          <div className="text-xs text-slate-900 bg-slate-100 border border-slate-300/80 rounded-lg px-4 py-2.5">
            {statusNote}
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Document</th>
                <th className="py-3 px-4 font-semibold">Who Can Read It (Click to Change)</th>
                <th className="py-3 px-4 font-semibold">Search Copy</th>
                <th className="py-3 px-4 font-semibold">Protection Status</th>
                <th className="py-3 px-4 font-semibold text-right">Simulate Sync Delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {snapshot.documents.map((doc) => (
                <tr key={doc.doc_id} className="hover:bg-slate-50/90 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-950">{doc.title}</div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                      {doc.citation_code}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {GROUPS.map((grp) => {
                        const granted = doc.postgres_acl_groups.includes(grp.id);
                        return (
                          <button
                            key={grp.id}
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() =>
                              void postAdmin(
                                '/api/admin/acl',
                                {
                                  doc_id: doc.doc_id,
                                  group_id: grp.id,
                                  action: granted ? 'revoke' : 'grant',
                                },
                                `${granted ? 'Removed' : 'Granted'} ${grp.label} access on ${doc.citation_code}; old saved answers cleared immediately.`
                              )
                            }
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                              granted
                                ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                                : 'bg-slate-50 text-slate-600 border-slate-300 hover:text-slate-950 hover:border-slate-400'
                            }`}
                          >
                            {granted ? '✓ ' : '+ '}
                            {grp.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-[11px] text-slate-600">
                    {doc.qdrant_acl_groups.length > 0
                      ? doc.qdrant_acl_groups.map((g) => GROUPS.find((x) => x.id === g)?.label ?? g).join(', ')
                      : 'None'}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {doc.acl_in_sync ? (
                      <span className="text-emerald-700 font-semibold">Synced</span>
                    ) : (
                      <span className="text-amber-700 font-semibold">Search Behind (Privacy Guard Protects)</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void postAdmin(
                          '/api/admin/inject-drift',
                          { doc_id: doc.doc_id },
                          `Simulated an outdated search copy for ${doc.citation_code}. Privacy Guard still blocks unauthorized readers.`
                        )
                      }
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-800 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-md whitespace-nowrap transition-colors"
                    >
                      Simulate Outdated Search
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Permission Update Queue */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-950">Permission Update Queue</h2>
            <span className="text-xs text-slate-500">
              Records every access change so background search catches up safely without dropping updates
            </span>
          </div>
          {snapshot.outbox.length === 0 ? (
            <div className="p-4 text-xs text-slate-600 border border-slate-200 rounded-lg bg-slate-100/70">
              No updates queued yet. Click any access button above to watch changes flow through the queue.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">#</th>
                    <th className="py-2.5 px-4 font-semibold">Page ID</th>
                    <th className="py-2.5 px-4 font-semibold">Update</th>
                    <th className="py-2.5 px-4 font-semibold">Check Code</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Completed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {snapshot.outbox.map((row) => (
                    <tr key={row.outbox_id}>
                      <td className="py-2 px-4 tabular-nums text-slate-950">{row.outbox_id}</td>
                      <td className="py-2 px-4 text-slate-600">...{row.chunk_id.slice(-8)}</td>
                      <td className="py-2 px-4 text-slate-800">{row.op_type}</td>
                      <td className="py-2 px-4 text-slate-600">{row.payload_hash}</td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        {row.processed_at ? (
                          <span className="text-emerald-700">{row.processed_at.slice(11, 19)}Z</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">WAITING</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Automated Safety Checks */}
      <section className="saas-surface rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-950">Automated Safety Checks</h2>
            <p className="mt-1 text-xs text-slate-600">
              Runs 10 live tests confirming blocked accounts stay locked out, former staff cannot use past dates to read removed files, and refusal speed never leaks hidden document names.
            </p>
          </div>
          <button
            type="button"
            disabled={isVerifying}
            onClick={onRunVerification}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 shadow-sm whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {isVerifying ? 'Running 10 Checks...' : 'Run All 10 Safety Checks'}
          </button>
        </div>

        {verification ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200/70">
              <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg">
                {(
                  [
                    { id: 'all', label: `All (${verification.total})` },
                    { id: 'db-test', label: 'Permission Rules' },
                    { id: 'security', label: 'Leak Prevention' },
                    { id: 'oracle', label: 'Safe Refusal Timing' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSuiteFilter(cat.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      suiteFilter === cat.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-700">
                <span>
                  <strong className={verification.passed_count === verification.total ? 'text-emerald-700' : 'text-rose-700'}>
                    {verification.passed_count}/{verification.total}
                  </strong>{' '}
                  passed
                </span>
                <span>{verification.ran_at.slice(11, 19)}Z</span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Safety Check</th>
                    <th className="py-2.5 px-4 font-semibold">What It Guarantees</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Time</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 bg-white">
                  {filteredTests.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-950">{t.name}</td>
                      <td className="py-3 px-4 text-slate-700">
                        <div>{t.assertion_summary}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500">{t.details}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {t.duration_ms.toFixed(2)} ms
                      </td>
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                        {t.passed ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <Check className="w-3.5 h-3.5" /> PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                            <X className="w-3.5 h-3.5" /> FAIL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPlannerSample((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-800 transition-colors"
              >
                {showPlannerSample ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                For Engineers: Fast Index Speed Verification
              </button>
              {showPlannerSample && (
                <pre className="mt-2.5 p-4 bg-[#091120] text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {verification.explain_plan_sample.join('\n')}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-600 border border-dashed border-slate-300 rounded-lg bg-slate-100/70">
            Click <strong>Run Safety Checks</strong> in the top bar to execute all 10 privacy and access-control tests.
          </div>
        )}
      </section>
    </div>
  );
};
