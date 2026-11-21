import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  ExecutionMode,
  LedgerSnapshot,
  QueryResponse,
  SystemRuntimeStatus,
} from '../shared/types.ts';

interface QueryConsoleProps {
  snapshot: LedgerSnapshot;
  runtime: SystemRuntimeStatus | null;
  onSnapshotUpdate: (snap: LedgerSnapshot) => void;
  onRefreshRuntime?: () => Promise<void>;
}

const PRINCIPAL_AVATARS: Record<string, string> = {
  '11111111-1111-4111-8111-111111111101': '/src/assets/images/avatar_wanjiku_1795217049394.jpg',
  '11111111-1111-4111-8111-111111111102': '/src/assets/images/avatar_kamau_1795217048650.jpg',
  '11111111-1111-4111-8111-111111111103': '/src/assets/images/avatar_amina_1795217048639.jpg',
  '11111111-1111-4111-8111-111111111104': '/src/assets/images/avatar_brian_1795217048727.jpg',
};

const AS_OF_PRESETS = [
  { label: '1968 Rules', value: '1968-06-01' },
  { label: '2019 Rules', value: '2019-06-01' },
  { label: 'Today (2026)', value: '2026-11-20' },
];

const PROBE_SCENARIOS = [
  {
    label: 'Current Bank Capital Requirement',
    meta: 'Public Reader · Today (2026)',
    principalId: '11111111-1111-4111-8111-111111111101',
    asOf: '2026-11-20',
    query: 'What is the total D-SIB capital requirement for Total Capital to TRWA under CBK/PG/03?',
  },
  {
    label: '1968 Original Central Bank Rule',
    meta: 'Public Reader · Rule Date 1968',
    principalId: '11111111-1111-4111-8111-111111111101',
    asOf: '1968-06-01',
    query: 'What was the authorized capital of the Central Bank of Kenya under Cap. 491?',
  },
  {
    label: '2019 Capital Buffer Rule (Past Version)',
    meta: 'Public Reader · Rule Date 2019',
    principalId: '11111111-1111-4111-8111-111111111101',
    asOf: '2019-06-01',
    query: 'What is the Total Capital / TRWA requirement including the conservation buffer under CBK/PG/03?',
  },
  {
    label: 'Restricted Liquidity Escalation Rule',
    meta: 'Compliance Officer · Circular 11/2024',
    principalId: '11111111-1111-4111-8111-111111111102',
    asOf: '2026-11-20',
    query: 'What is the escalation threshold and reporting frequency for the Statutory Liquidity Ratio in Circular 11/2024?',
  },
  {
    label: '2025 Banking Act Core Capital Schedule',
    meta: 'Public Reader · Banking Amendment Act 2025',
    principalId: '11111111-1111-4111-8111-111111111101',
    asOf: '2026-11-20',
    query: 'What is the minimum core capital required by 31 December 2026 and 31 December 2029 under the Banking Amendment Act 2025?',
  },
  {
    label: '2026 Cyber Incident & AI Governance',
    meta: 'Compliance Officer · CBK/PG/18/2026',
    principalId: '11111111-1111-4111-8111-111111111102',
    asOf: '2026-11-20',
    query: 'Within how many hours must a major cyber incident be reported and what human-in-the-loop rule applies to AI credit decisions under CBK/PG/18/2026?',
  },
  {
    label: 'Safety Test: Former Auditor Using Old Date',
    meta: 'Access Removed in 2025 · Must Refuse',
    principalId: '11111111-1111-4111-8111-111111111104',
    asOf: '2023-06-01',
    query: 'What was the nostro suspense and reserve buffer shortfall finding in OAG Special Audit?',
  },
  {
    label: 'Safety Test: Public User Asking Private Audit',
    meta: 'Public Reader · Must Refuse Safely',
    principalId: '11111111-1111-4111-8111-111111111101',
    asOf: '2026-11-20',
    query: 'What was the KES 412.6 million nostro suspense finding in the OAG Special Audit Report?',
  },
];

const GROUP_LABELS: Record<string, string> = {
  public: 'Public Laws',
  compliance_officer: 'Compliance Memos',
  internal_audit: 'Private Audits',
};

export const QueryConsole: React.FC<QueryConsoleProps> = ({
  snapshot,
  runtime,
  onSnapshotUpdate,
  onRefreshRuntime,
}) => {
  const defaultLocalOllama = Boolean(
    runtime?.llm_provider_setting === 'ollama' ||
      (runtime?.llm_provider_setting === 'auto' && runtime?.ollama.available)
  );
  const [principalId, setPrincipalId] = useState<string>(snapshot.principals[0]?.principal_id ?? '');
  const [asOfDate, setAsOfDate] = useState<string>('2026-11-20');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    defaultLocalOllama ? 'airgapped_local' : 'hosted_api'
  );
  const [userPickedMode, setUserPickedMode] = useState<boolean>(false);
  const [bypassCache, setBypassCache] = useState<boolean>(false);
  const [queryText, setQueryText] = useState<string>(PROBE_SCENARIOS[0].query);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [selectedStage, setSelectedStage] = useState<number>(3);
  const [expandedEvidence, setExpandedEvidence] = useState<boolean>(false);
  const [showConnectionLogs, setShowConnectionLogs] = useState<boolean>(false);
  const [refreshingRuntime, setRefreshingRuntime] = useState<boolean>(false);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!userPickedMode && runtime) {
      const preferLocal =
        runtime.llm_provider_setting === 'ollama' ||
        (runtime.llm_provider_setting === 'auto' && runtime.ollama.available);
      setExecutionMode(preferLocal ? 'airgapped_local' : 'hosted_api');
    }
  }, [runtime, userPickedMode]);

  const selectedPrincipal = snapshot.principals.find((p) => p.principal_id === principalId);
  const avatarSrc = selectedPrincipal ? PRINCIPAL_AVATARS[selectedPrincipal.principal_id] : undefined;
  const showPhoto = Boolean(avatarSrc && selectedPrincipal && !failedAvatars[selectedPrincipal.principal_id]);

  const executeQuery = async (override?: {
    principalId?: string;
    asOf?: string;
    query?: string;
  }) => {
    const pid = override?.principalId ?? principalId;
    const asOf = override?.asOf ?? asOfDate;
    const q = override?.query ?? queryText;
    if (!q.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          principal_id: pid,
          as_of: `${asOf}T00:00:00Z`,
          query: q,
          execution_mode: executionMode,
          bypass_cache: bypassCache,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Could not run this question.');
        return;
      }
      setResponse(data.result);
      if (data.result?.trace?.stage3?.dropped_by_rls_count > 0) {
        setSelectedStage(3);
      } else {
        setSelectedStage(5);
      }
      if (data.snapshot) {
        onSnapshotUpdate(data.snapshot);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeQuery();
  };

  return (
    <div className="space-y-6">
      {/* Top Executive Session Context Banner */}
      <section className="surface-dark rounded-xl p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/80 shrink-0 flex items-center justify-center">
              {showPhoto && selectedPrincipal ? (
                <img
                  src={avatarSrc}
                  alt={selectedPrincipal.display_name}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedAvatars((prev) => ({
                      ...prev,
                      [selectedPrincipal.principal_id]: true,
                    }))
                  }
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <UserX className="w-6 h-6 text-rose-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-blue-300">Active Reader Profile</div>
              <h1 className="text-xl font-semibold text-white truncate">
                {selectedPrincipal?.display_name ?? 'Select a User'}
              </h1>
              <div className="mt-0.5 text-xs text-slate-300 truncate">
                {selectedPrincipal?.role_label}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-700/70 lg:pl-7 shrink-0">
            <div>
              <div className="text-[11px] text-slate-400">Account Access</div>
              <div className={`mt-1 text-sm font-semibold ${selectedPrincipal?.is_active ? 'text-emerald-400' : 'text-rose-400'}`}>
                {selectedPrincipal?.is_active ? 'Active' : 'Blocked'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Rule Date</div>
              <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-white inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                {asOfDate}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Default AI Model</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {executionMode === 'airgapped_local'
                  ? `Ollama (${runtime?.ollama.chat_model ?? 'llama3.1:8b'})`
                  : runtime?.ollama.available && !runtime?.gemini_configured
                    ? `Ollama (${runtime.ollama.chat_model})`
                    : 'Gemini (gemini-4-hydrogen)'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Vector &amp; Cache Stack</div>
              <div className="mt-1 text-xs font-mono font-medium text-slate-200 leading-snug">
                {runtime?.qdrant.reachable ? (
                  <span className="text-emerald-300">Qdrant HTTP</span>
                ) : (
                  <span className="text-amber-300">Preview Vector Index</span>
                )}
                <span className="text-slate-500"> · </span>
                {runtime?.redis?.reachable ? (
                  <span className="text-emerald-300">Live Redis</span>
                ) : (
                  <span className="text-slate-300">Memory Cache</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connected LLMs, Vector Databases & Fallback Diagnostic Log */}
      {runtime && (
        <section className="saas-surface rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-w-0 text-xs">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">Running LLMs Connected</div>
                <div className="mt-0.5 font-semibold text-slate-950 truncate">
                  {runtime.ollama.available
                    ? `Ollama (${runtime.ollama.installed_models.join(', ') || runtime.ollama.chat_model})`
                    : `Cloud Gemini (${runtime.gemini_model})`}
                </div>
                <div className="text-[11px] text-slate-600 truncate font-mono">
                  {runtime.ollama.available
                    ? `Active at ${runtime.ollama.url}`
                    : `Ollama fallback: ${runtime.ollama.error_reason ?? 'unreachable'}`}
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">Vector Databases Connected</div>
                <div className="mt-0.5 font-semibold text-slate-950 truncate">
                  {runtime.qdrant.reachable
                    ? `Live Qdrant (${runtime.qdrant.collections.join(', ') || runtime.qdrant.collection} · ${runtime.qdrant.live_points ?? 0} pts)`
                    : 'Embedded Vector Index (Fallback Active)'}
                </div>
                <div className="text-[11px] text-slate-600 truncate font-mono">
                  {runtime.qdrant.reachable
                    ? `Active at ${runtime.qdrant.url}`
                    : `Qdrant fallback: ${runtime.qdrant.error_reason ?? 'unreachable'}`}
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium">Semantic Cache Connected</div>
                <div className="mt-0.5 font-semibold text-slate-950 truncate">
                  {runtime.redis.reachable
                    ? `Live Redis (${runtime.redis.live_keys ?? 0} keys)`
                    : 'In-Memory Epoch Map (Fallback Active)'}
                </div>
                <div className="text-[11px] text-slate-600 truncate font-mono">
                  {runtime.redis.reachable
                    ? `Active at ${runtime.redis.url}`
                    : `Redis fallback: ${runtime.redis.error_reason ?? 'unreachable'}`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onRefreshRuntime && (
                <button
                  type="button"
                  disabled={refreshingRuntime}
                  onClick={async () => {
                    setRefreshingRuntime(true);
                    try {
                      await onRefreshRuntime();
                    } finally {
                      setRefreshingRuntime(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshingRuntime ? 'animate-spin' : ''}`} />
                  {refreshingRuntime ? 'Checking...' : 'Re-check'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowConnectionLogs((prev) => !prev)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors whitespace-nowrap"
              >
                {showConnectionLogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {showConnectionLogs ? 'Hide Diagnostic Log' : 'Connection & Fallback Log'}
              </button>
            </div>
          </div>

          {showConnectionLogs && (
            <div className="border-t border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-100">
                  <tr>
                    <th className="py-2 px-4 font-semibold">Service</th>
                    <th className="py-2 px-4 font-semibold">Configured Endpoint</th>
                    <th className="py-2 px-4 font-semibold">Connection State</th>
                    <th className="py-2 px-4 font-semibold">Active Target / Models</th>
                    <th className="py-2 px-4 font-semibold">Why Fallback Happened / Probe Log</th>
                    <th className="py-2 px-4 font-semibold text-right">Probe Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {runtime.connection_logs.map((log) => (
                    <tr key={log.service}>
                      <td className="py-2.5 px-4 font-semibold text-slate-950 whitespace-nowrap">{log.service}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-700">{log.endpoint}</td>
                      <td className="py-2.5 px-4 font-semibold whitespace-nowrap">
                        {log.status === 'connected' ? (
                          <span className="text-emerald-700">Connected</span>
                        ) : log.status === 'fallback' ? (
                          <span className="text-amber-700">Using Fallback</span>
                        ) : (
                          <span className="text-slate-500">Not Configured</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">
                        <div className="font-medium">{log.active_target}</div>
                        <div className="text-[11px] text-slate-500">{log.details}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-700">
                        {log.error_reason ? (
                          <span className="text-rose-800">{log.error_reason}</span>
                        ) : (
                          <span className="text-emerald-700">Healthy connection — no fallback needed</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                        {log.latency_ms} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Setup Rail */}
        <aside className="lg:col-span-4 saas-surface rounded-xl overflow-hidden">
          <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
            <h2 className="text-sm font-semibold">Who Is Asking &amp; For What Date</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Answers automatically adjust to this person&rsquo;s current permissions and your selected date.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* 1. User Picker */}
            <div className="space-y-2">
              <label htmlFor="principal-select" className="block text-xs font-semibold text-slate-800">
                1. Switch Reader Account
              </label>
              <select
                id="principal-select"
                value={principalId}
                onChange={(e) => setPrincipalId(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15"
              >
                {snapshot.principals.map((p) => (
                  <option key={p.principal_id} value={p.principal_id}>
                    {p.display_name} — {p.role_label}
                  </option>
                ))}
              </select>

              {selectedPrincipal && (
                <div className="pt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 shrink-0">Cleared To Read</span>
                    <span className="text-slate-950 font-medium text-right">
                      {selectedPrincipal.active_groups_now.length > 0
                        ? selectedPrincipal.active_groups_now.map((g) => GROUP_LABELS[g] ?? g).join(' · ')
                        : 'Nothing (All Blocked)'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Rule Effective Date */}
            <div className="space-y-2 pt-4 border-t border-slate-200/70">
              <label htmlFor="as-of-date" className="block text-xs font-semibold text-slate-800">
                2. Rule Date (Secure History Tracker)
              </label>
              <p className="text-[11px] text-slate-500">
                See rules exactly as they applied on this historical date.
              </p>
              <input
                id="as-of-date"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full px-3 py-2 text-[13px] font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg text-slate-950 focus:bg-white focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15"
              />
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                {AS_OF_PRESETS.map((preset) => {
                  const active = asOfDate === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setAsOfDate(preset.value)}
                      className={`px-2 py-1.5 text-[11px] font-medium rounded-md border text-center transition-colors truncate ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-100/80 text-slate-700 border-slate-200 hover:bg-slate-200/70 hover:text-slate-950'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. AI Privacy Mode */}
            <div className="space-y-2 pt-4 border-t border-slate-200/70">
              <span className="block text-xs font-semibold text-slate-800">3. Where the AI Runs</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/75 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setUserPickedMode(true);
                    setExecutionMode('hosted_api');
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    executionMode === 'hosted_api'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Cloud Gemini AI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserPickedMode(true);
                    setExecutionMode('airgapped_local');
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    executionMode === 'airgapped_local'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Local Ollama
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {executionMode === 'hosted_api'
                  ? 'Only approved text goes to Gemini AI (or Local Ollama automatically when cloned locally).'
                  : `Routes to local Ollama (${runtime?.ollama.chat_model ?? 'llama3.1:8b'}) with 0 bytes sent outside your network.`}
              </p>
              <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bypassCache}
                  onChange={(e) => setBypassCache(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                />
                <span>Always run a fresh check (skip saved answers)</span>
              </label>
            </div>

            {/* Example Questions */}
            <div className="space-y-2 pt-4 border-t border-slate-200/70">
              <span className="block text-xs font-semibold text-slate-800">Try an Example Question</span>
              <div className="divide-y divide-slate-200/80 border border-slate-200 rounded-lg overflow-hidden">
                {PROBE_SCENARIOS.map((sc) => (
                  <button
                    key={sc.label}
                    type="button"
                    onClick={() => {
                      setPrincipalId(sc.principalId);
                      setAsOfDate(sc.asOf);
                      setQueryText(sc.query);
                      void executeQuery({
                        principalId: sc.principalId,
                        asOf: sc.asOf,
                        query: sc.query,
                      });
                    }}
                    className="w-full text-left px-3.5 py-2.5 bg-slate-50/70 hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-2 group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-blue-800 transition-colors truncate">
                        {sc.label}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{sc.meta}</div>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700 shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Q&A Panel */}
        <section className="lg:col-span-8 space-y-6">
          <div className="saas-surface rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-100/90 border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Ask a Banking or Compliance Question
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Uses only documents cleared for{' '}
                  <strong className="text-slate-900">{selectedPrincipal?.display_name}</strong> and rules active on{' '}
                  <span className="font-mono font-medium text-slate-900">{asOfDate}</span>.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <label htmlFor="regulatory-query" className="sr-only">
                Regulatory Question
              </label>
              <textarea
                id="regulatory-query"
                rows={3}
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void executeQuery();
                  }
                }}
                placeholder="Example: What is the minimum capital ratio for commercial banks?"
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-950 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 transition-all"
              />
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  Every quote and number is checked word-for-word against original pages · <span className="font-mono text-slate-700">⌘ + Enter</span>
                </span>
                <button
                  type="submit"
                  disabled={loading || !queryText.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 shadow-sm transition-colors whitespace-nowrap shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  {loading ? 'Checking Rules...' : 'Get Verified Answer'}
                  <CornerDownLeft className="w-3 h-3 opacity-80" />
                </button>
              </div>
            </form>

            {errorMsg && (
              <div className="mx-6 mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold">Could Not Complete Question</div>
                  <p className="mt-0.5 text-xs text-rose-800">{errorMsg}</p>
                </div>
              </div>
            )}
          </div>

          {!response && !loading && (
            <div className="saas-surface-subtle rounded-xl p-10 text-center space-y-2.5">
              <div className="text-sm font-semibold text-slate-950">See Privacy Guard &amp; History Tracking in Action</div>
              <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                Pick any example question on the left—or type your own above—to watch LexGate check permissions, block unauthorized files, verify dates, and prove every quote word-for-word.
              </p>
            </div>
          )}

          {response && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="saas-surface rounded-xl overflow-hidden"
            >
              {/* Outcome Header Band */}
              <div
                className={`px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b ${
                  response.abstained
                    ? 'bg-amber-50/80 border-amber-200/80'
                    : 'bg-emerald-50/75 border-emerald-200/80'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {response.abstained ? (
                    <Lock className="w-4 h-4 text-amber-800" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-emerald-800" />
                  )}
                  <span className={`text-sm font-semibold ${response.abstained ? 'text-amber-950' : 'text-emerald-950'}`}>
                    {response.abstained ? 'Safe Refusal (No Approved Answer Available)' : 'Verified Answer'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 font-mono tabular-nums">
                  {response.latency_ms} ms · {response.trace.stage1.cache_hit ? 'saved answer' : 'fresh run'}
                </div>
              </div>

              {/* Execution Provenance Strip: Shows exact AI Model, Vector DB, Embeddings, and Cache used */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                <div className="min-w-0">
                  <div className="text-slate-500 font-medium">AI Model Used</div>
                  <div className="font-mono font-semibold text-slate-950 truncate">
                    {response.trace.stage5.model_used
                      ? response.trace.stage5.model_used
                      : 'Not called (blocked before AI)'}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-slate-500 font-medium">Vector Search Engine</div>
                  <div className="font-mono font-semibold text-slate-950 truncate tabular-nums">
                    {response.trace.stage2.vector_backend === 'live_qdrant_http'
                      ? `Live Qdrant (${response.trace.stage2.live_qdrant_hits} hits)`
                      : `Preview Vector Index (${response.trace.stage2.candidate_count} hits)`}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-slate-500 font-medium">Query Embeddings</div>
                  <div className="font-mono font-semibold text-slate-950 truncate">
                    {response.trace.stage2.embedding_model}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-slate-500 font-medium">Cache &amp; Ledger</div>
                  <div className="font-mono font-semibold text-slate-950 truncate">
                    {response.trace.stage1.cache_backend === 'live_redis' ? 'Live Redis' : 'Memory Cache'} ·{' '}
                    {response.trace.stage1.cache_hit ? 'HIT' : 'MISS'}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Answer Body */}
                <div className="text-[15.5px] leading-[1.7] text-slate-950 font-normal">
                  {response.answer}
                </div>

                {response.abstained && response.abstention_reason && (
                  <div className="text-xs text-slate-700 bg-slate-100/90 border border-slate-200 rounded-lg px-4 py-3">
                    <span className="font-semibold text-slate-900">
                      Why LexGate refused (hidden from regular users so restricted files stay secret):{' '}
                    </span>
                    {response.abstention_reason}
                  </div>
                )}

                {/* Verified Source Quotes on Warm Archival Parchment */}
                {response.citations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-800">
                      Verified Source Quotes ({response.citations.length}{' '}
                      {response.citations.length === 1 ? 'exact match' : 'exact matches'})
                    </h3>
                    <div className="divide-y divide-[#e6dfd0] surface-ivory rounded-lg overflow-hidden">
                      {response.citations.map((cit, idx) => (
                        <div key={`${cit.doc_title}-${idx}`} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-slate-950">
                              {cit.doc_title} · <span className="font-normal text-slate-700">{cit.version_label}</span>
                            </span>
                            <span className="font-mono tabular-nums text-slate-600 shrink-0">
                              Page {cit.page_number}
                            </span>
                          </div>
                          <blockquote className="text-xs font-mono text-slate-800 leading-relaxed">
                            “{cit.quoted_span}”
                          </blockquote>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5-Step Audit Stepper */}
                <div className="space-y-4 pt-4 border-t border-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-800">What LexGate Did For You (Click any step)</h3>
                    <span className="text-[11px] text-slate-500">
                      Privacy log: your question wording is never saved in plain text
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      {
                        num: 1,
                        title: '1. Checked Access',
                        metric: response.trace.stage1.short_circuited
                          ? 'Blocked'
                          : `${response.trace.stage1.active_groups_at_now.length} role(s)`,
                        tone: response.trace.stage1.short_circuited ? 'warn' : 'ok',
                      },
                      {
                        num: 2,
                        title: '2. Searched Pages',
                        metric: `${response.trace.stage2.candidate_count} matches`,
                        tone: 'neutral',
                      },
                      {
                        num: 3,
                        title: '3. Privacy Guard',
                        metric:
                          response.trace.stage3.dropped_by_rls_count > 0
                            ? `${response.trace.stage3.dropped_by_rls_count} blocked`
                            : `${response.trace.stage3.surviving_count} approved`,
                        tone: response.trace.stage3.dropped_by_rls_count > 0 ? 'danger' : 'ok',
                      },
                      {
                        num: 4,
                        title: '4. Read Sections',
                        metric: `${response.trace.stage4.expanded_parents.length} section(s)`,
                        tone: response.trace.stage4.threshold_passed ? 'ok' : 'warn',
                      },
                      {
                        num: 5,
                        title: '5. Checked Quotes',
                        metric:
                          response.trace.stage5.tier1_citation_valid && response.trace.stage5.tier2_entailment_valid
                            ? 'Verified'
                            : 'Refused',
                        tone:
                          response.trace.stage5.tier1_citation_valid && response.trace.stage5.tier2_entailment_valid
                            ? 'ok'
                            : 'warn',
                      },
                    ].map((st) => {
                      const isSel = selectedStage === st.num;
                      const metricColor =
                        st.tone === 'ok'
                          ? 'text-emerald-700'
                          : st.tone === 'danger'
                            ? 'text-rose-700'
                            : st.tone === 'warn'
                              ? 'text-amber-700'
                              : 'text-slate-700';
                      return (
                        <button
                          key={st.num}
                          type="button"
                          onClick={() => setSelectedStage(st.num)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            isSel
                              ? 'bg-[#0d172b] border-[#0d172b] text-white shadow-sm'
                              : 'bg-slate-100/80 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-900'
                          }`}
                        >
                          <div className={`text-[11px] font-medium ${isSel ? 'text-blue-300' : 'text-slate-600'}`}>
                            {st.title}
                          </div>
                          <div className={`mt-1 text-xs font-mono font-semibold tabular-nums ${isSel ? 'text-white' : metricColor}`}>
                            {st.metric}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Step Benefit-Oriented Explanation */}
                  <div className="p-4 bg-slate-100/80 border border-slate-200/90 rounded-lg text-xs space-y-1.5">
                    {selectedStage === 1 && (
                      <div className="space-y-1 text-slate-700">
                        <div>
                          <strong>Privacy Guard</strong> verified what this person is cleared to read <strong>right now</strong>, preventing former staff from using an older date to reopen revoked documents.
                        </div>
                        <div className="font-mono text-[11px] text-slate-600">
                          Active clearances: [
                          {response.trace.stage1.active_groups_at_now.map((g) => GROUP_LABELS[g] ?? g).join(', ') || 'None'}
                          ] · Protection version: v{response.trace.stage1.corpus_epoch}
                        </div>
                      </div>
                    )}
                    {selectedStage === 2 && (
                      <div className="space-y-1 text-slate-700">
                        <div>
                          <strong>Smart Document Search</strong> ran via{' '}
                          <span className="font-mono font-semibold text-slate-950">
                            {response.trace.stage2.vector_backend === 'live_qdrant_http'
                              ? `Live Qdrant HTTP (${response.trace.stage2.qdrant_url} · ${response.trace.stage2.qdrant_collection})`
                              : 'Embedded Vector Index Fallback (Qdrant container not detected on localhost:6333)'}
                          </span>{' '}
                          with <span className="font-mono">with_payload: false</span> and rule date{' '}
                          <span className="font-mono">{asOfDate}</span>.
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 tabular-nums">
                          Embedding: {response.trace.stage2.embedding_model} · Live Qdrant hits: {response.trace.stage2.live_qdrant_hits} · Combined RRF candidates: {response.trace.stage2.candidate_count}
                        </div>
                      </div>
                    )}
                    {selectedStage === 3 && (
                      <div className="space-y-1.5 text-slate-700">
                        <div>
                          <strong>Privacy Guard</strong> &amp; <strong>Secure History Tracker</strong> double-checked every candidate against live permissions and exact rule dates before any text was opened.
                        </div>
                        {response.trace.stage3.dropped_reasons.length > 0 ? (
                          <div className="pt-1 space-y-1 text-rose-800 text-[11px]">
                            {response.trace.stage3.dropped_reasons.map((d) => (
                              <div key={d.chunk_id}>• {d.reason}</div>
                            ))}
                          </div>
                        ) : (
                          <div className="font-mono text-[11px] text-emerald-700">
                            All matching pages passed live permission and rule-date checks.
                          </div>
                        )}
                      </div>
                    )}
                    {selectedStage === 4 && (
                      <div className="text-slate-700">
                        Expanded the best matches into {response.trace.stage4.expanded_parents.length} complete regulatory section(s) so financial tables and legal conditions are read in full rather than cut off mid-sentence.
                      </div>
                    )}
                    {selectedStage === 5 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                        <div className="inline-flex items-center gap-1.5 font-medium text-slate-950">
                          {response.trace.stage5.tier1_citation_valid && response.trace.stage5.tier2_entailment_valid && (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          )}
                          {response.trace.stage5.verification_notes}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600">
                          {response.trace.stage5.execution_mode === 'airgapped_local'
                            ? `Local AI (${response.trace.stage5.model_used ?? 'ollama'}): 0 bytes sent outside your network`
                            : `${response.trace.stage5.outbound_bytes} bytes of approved text sent to ${response.trace.stage5.model_used ?? 'Gemini AI'}`}
                        </div>
                      </div>
                    )}
                  </div>

                  {response.trace.stage4.expanded_parents.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedEvidence((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-800 transition-colors"
                      >
                        {expandedEvidence ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        View Approved Source Text &amp; Privacy Log
                      </button>
                      {expandedEvidence && (
                        <div className="mt-3 space-y-3">
                          {response.trace.stage4.expanded_parents.map((p) => (
                            <div key={p.chunk_id} className="p-3.5 surface-ivory rounded-lg text-xs space-y-1.5">
                              <div className="font-semibold text-slate-950">
                                {p.doc_title} · {p.version_label} · Page {p.page_number}
                              </div>
                              <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed">
                                {p.text_content}
                              </pre>
                            </div>
                          ))}
                          <div className="p-3.5 bg-[#091120] text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
                            Privacy Audit Record (question scrambled, never stored in plain text): {JSON.stringify(response.query_log_entry)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
};
