/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { Command } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AblationEvalView } from './components/AblationEvalView.tsx';
import { AiMlProcessView } from './components/AiMlProcessView.tsx';
import { ArchitectureAdrView } from './components/ArchitectureAdrView.tsx';
import { CommandPalette, TAB_LABELS, type PaletteAction } from './components/CommandPalette.tsx';
import { IngestionQuarantineView } from './components/IngestionQuarantineView.tsx';
import { QueryConsole } from './components/QueryConsole.tsx';
import { SecurityRlsView } from './components/SecurityRlsView.tsx';
import { TopBar, type WorkspaceTab } from './components/TopBar.tsx';
import type {
  GoldenSmokeQuestion,
  LedgerSnapshot,
  SystemRuntimeStatus,
  VerificationSuiteResponse,
} from './shared/types.ts';

interface ExhibitsPayload {
  extraction: {
    document_title: string;
    pypdf_garbled: string;
    docling_structured: string;
  };
  adrs: Array<{
    id: string;
    title: string;
    status: string;
    context: string;
    decision: string;
    consequence: string;
  }>;
  ddl: string;
  benchmark_distribution: Array<{
    category: string;
    total: number;
    dev: number;
    test: number;
    target: string;
  }>;
  smoke_questions: GoldenSmokeQuestion[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('console');
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntimeStatus | null>(null);
  const [exhibits, setExhibits] = useState<ExhibitsPayload | null>(null);
  const [verification, setVerification] = useState<VerificationSuiteResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const loadSnapshot = async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/snapshot');
      if (!res.ok) {
        throw new Error(`Failed to load snapshot (${res.status})`);
      }
      const data = await res.json();
      setSnapshot(data.snapshot);
      if (data.runtime) setRuntime(data.runtime);
      setExhibits(data.exhibits);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach backend server.');
    }
  };

  const refreshRuntime = async () => {
    const res = await fetch('/api/system/status?refresh=1');
    if (res.ok) {
      const data = (await res.json()) as SystemRuntimeStatus;
      setRuntime(data);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleRunVerification = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch('/api/tests/run', { method: 'POST' });
      const data = await res.json();
      setVerification(data);
      setActiveTab('security');
    } finally {
      setIsVerifying(false);
    }
  };

  const paletteActions: PaletteAction[] = useMemo(() => {
    const navActions: PaletteAction[] = (Object.keys(TAB_LABELS) as WorkspaceTab[]).map((tab) => ({
      id: `nav-${tab}`,
      section: 'Screens',
      label: `Open ${TAB_LABELS[tab]}`,
      run: () => setActiveTab(tab),
    }));

    return [
      ...navActions,
      {
        id: 'act-verify',
        section: 'Safety Checks',
        label: 'Run All Safety Guarantees',
        hint: '10 checks',
        run: () => void handleRunVerification(),
      },
      {
        id: 'act-toggle-worker',
        section: 'Background Sync',
        label: snapshot?.index_worker_paused ? 'Resume Background Search Sync' : 'Pause Background Search Sync',
        hint: snapshot?.index_worker_paused ? 'Paused' : 'Active',
        run: async () => {
          const res = await fetch('/api/admin/worker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paused: !snapshot?.index_worker_paused }),
          });
          const data = await res.json();
          if (data.snapshot) setSnapshot(data.snapshot);
        },
      },
      {
        id: 'act-reconcile',
        section: 'Background Sync',
        label: 'Catch Up Search Copy Now',
        run: async () => {
          const res = await fetch('/api/admin/reconcile', { method: 'POST' });
          const data = await res.json();
          if (data.snapshot) setSnapshot(data.snapshot);
        },
      },
      {
        id: 'act-reset',
        section: 'Demo Data',
        label: 'Restore Default Permissions',
        run: async () => {
          const res = await fetch('/api/admin/reset', { method: 'POST' });
          const data = await res.json();
          if (data.snapshot) setSnapshot(data.snapshot);
        },
      },
    ];
  }, [snapshot?.index_worker_paused]);

  return (
    <div className="min-h-screen flex flex-col text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRunVerification={() => void handleRunVerification()}
        isVerifying={isVerifying}
      />

      {/* Contextual Breadcrumb & Quick Actions Bar */}
      <div className="border-b border-slate-300/70 bg-[#dce4ee]/85 backdrop-blur-sm">
        <div className="max-w-[1320px] mx-auto px-6 h-10 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-600 truncate">
            <span className="font-semibold text-slate-800">LexGate Regulatory Assistant</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-950 font-semibold">{TAB_LABELS[activeTab]}</span>
            {snapshot && (
              <>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span className="hidden sm:inline text-[11px] text-slate-600">
                  Background sync {snapshot.index_worker_paused ? 'paused' : 'active'}
                  {verification ? ` · ${verification.passed_count}/${verification.total} safety checks passed` : ''}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-2 px-2.5 py-1 text-[11px] font-medium text-slate-800 bg-white/90 border border-slate-300/90 rounded-md hover:bg-white hover:border-slate-400 hover:text-slate-950 transition-colors shrink-0 shadow-2xs"
          >
            <Command className="w-3 h-3 text-slate-500" />
            <span>Quick Menu</span>
            <kbd className="font-mono text-[10px] text-slate-500">⌘K</kbd>
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-[1320px] w-full mx-auto px-6 py-7">
        {loadError ? (
          <div className="saas-surface rounded-xl p-6 text-sm text-rose-900 space-y-3 border-rose-200">
            <div className="font-semibold">Could Not Connect to Server</div>
            <p className="text-xs text-rose-700">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadSnapshot()}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-950 rounded-lg hover:bg-slate-800"
            >
              Try Again
            </button>
          </div>
        ) : !snapshot || !exhibits ? (
          <div className="saas-surface rounded-xl p-8 space-y-4">
            <div className="h-5 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
            <div className="h-48 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'console' && (
                <QueryConsole
                  snapshot={snapshot}
                  runtime={runtime}
                  onSnapshotUpdate={setSnapshot}
                  onRefreshRuntime={refreshRuntime}
                />
              )}
              {activeTab === 'security' && (
                <SecurityRlsView
                  snapshot={snapshot}
                  verification={verification}
                  isVerifying={isVerifying}
                  onSnapshotUpdate={setSnapshot}
                  onRunVerification={() => void handleRunVerification()}
                  onJumpToConsole={() => setActiveTab('console')}
                />
              )}
              {activeTab === 'ingestion' && (
                <IngestionQuarantineView
                  snapshot={snapshot}
                  runtime={runtime}
                  extractionExhibit={exhibits.extraction}
                  onSnapshotUpdate={setSnapshot}
                  onJumpToConsole={() => setActiveTab('console')}
                />
              )}
              {activeTab === 'aiml' && (
                <AiMlProcessView
                  snapshot={snapshot}
                  runtime={runtime}
                  onRefreshRuntime={refreshRuntime}
                  onJumpToConsole={() => setActiveTab('console')}
                  onJumpToLibrary={() => setActiveTab('ingestion')}
                />
              )}
              {activeTab === 'ablation' && (
                <AblationEvalView
                  benchmarkDistribution={exhibits.benchmark_distribution}
                  smokeQuestions={exhibits.smoke_questions}
                />
              )}
              {activeTab === 'architecture' && (
                <ArchitectureAdrView ddlSnippet={exhibits.ddl} adrs={exhibits.adrs} />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
    </div>
  );
}
