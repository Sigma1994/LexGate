import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { GoldenSmokeQuestion, SmokeEvalVariantRow } from '../shared/types.ts';

interface AblationEvalViewProps {
  benchmarkDistribution: Array<{
    category: string;
    total: number;
    dev: number;
    test: number;
    target: string;
  }>;
  smokeQuestions: GoldenSmokeQuestion[];
}

const FULL_IMPROVEMENT_STEPS = [
  {
    variant: 'Step A · Exact Word Search',
    change: 'Basic text reader',
    hypothesis: 'Finds exact section numbers and legal terms',
  },
  {
    variant: 'Step B · Meaning Search',
    change: 'Basic text reader',
    hypothesis: 'Finds rules phrased in everyday words instead of legal terms',
  },
  {
    variant: 'Step C · Combined Search',
    change: 'Exact words + meaning together',
    hypothesis: 'Catches both exact law numbers and plain-language questions',
  },
  {
    variant: 'Step D · + Smart Result Ordering',
    change: 'Re-scores top 50 matches',
    hypothesis: 'Brings the single most relevant page to the very top',
  },
  {
    variant: 'Step E · + Full Section Reading',
    change: 'Expands matches to full legal sections',
    hypothesis: 'Gives the AI complete clauses so answers are never cut off',
  },
  {
    variant: 'Step F · + Smart Table Reader',
    change: 'Structured tables + repeated headers',
    hypothesis: 'Major accuracy boost on multi-column financial ratio tables',
  },
  {
    variant: 'Step G · + Question Rephrasing',
    change: 'Adds legal synonyms (optional)',
    hypothesis: 'Checks if extra search variations are worth the added wait time',
  },
];

export const AblationEvalView: React.FC<AblationEvalViewProps> = ({
  benchmarkDistribution,
  smokeQuestions,
}) => {
  const [smokeResults, setSmokeResults] = useState<{
    ran_at: string;
    question_count: number;
    variants: SmokeEvalVariantRow[];
  } | null>(null);
  const [runningSmoke, setRunningSmoke] = useState(false);

  const runSmoke = async () => {
    setRunningSmoke(true);
    try {
      const res = await fetch('/api/eval/smoke', { method: 'POST' });
      const data = await res.json();
      setSmokeResults(data);
    } finally {
      setRunningSmoke(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* Dark Executive Benchmark Header */}
      <section className="surface-dark rounded-xl p-6 text-white space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-medium text-blue-300 mb-1">Benchmark &amp; Quality Testing</div>
            <h1 className="text-xl font-semibold text-white">
              Accuracy &amp; Safety Scorecard (300 Expert Questions)
            </h1>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">
              We verify answer quality and safe refusals across 300 human-checked regulatory questions: 90 are used to tune settings, and 210 stay locked away for an honest final exam.
            </p>
          </div>
          <button
            type="button"
            disabled={runningSmoke}
            onClick={() => void runSmoke()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 shadow-sm whitespace-nowrap shrink-0"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {runningSmoke ? 'Running Quick Test...' : 'Run Quick Accuracy Check'}
          </button>
        </div>

        {/* Visual 30 / 70 Split Bar */}
        <div className="space-y-2 pt-2 border-t border-slate-700/70">
          <div className="flex items-center justify-between text-xs font-mono text-slate-300">
            <span>Practice &amp; Tuning Set · 90 questions (30%)</span>
            <span className="text-blue-300 font-semibold">Locked Final Exam · 210 questions (70%)</span>
          </div>
          <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-800">
            <div className="bg-slate-400 h-full" style={{ width: '30%' }} />
            <div className="bg-blue-500 h-full" style={{ width: '70%' }} />
          </div>
        </div>
      </section>

      {/* Question Breakdown Table */}
      <section className="saas-surface rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">Question Mix Across the Library</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Question Type</th>
                <th className="py-2.5 px-4 font-semibold text-right">Total</th>
                <th className="py-2.5 px-4 font-semibold text-right">Practice (30%)</th>
                <th className="py-2.5 px-4 font-semibold text-right">Final Exam (70%)</th>
                <th className="py-2.5 px-4 font-semibold">What It Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {benchmarkDistribution.map((row) => (
                <tr key={row.category} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-950">{row.category}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">{row.total}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">{row.dev}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-950 font-semibold">{row.test}</td>
                  <td className="py-3 px-4 text-slate-600">{row.target}</td>
                </tr>
              ))}
              <tr className="bg-slate-100/90 font-semibold">
                <td className="py-3 px-4 text-slate-950">Total Questions</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-950">300</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">90</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-950">210</td>
                <td className="py-3 px-4 text-slate-700">Tested with strict statistical confidence ranges</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Live Quick Check Results */}
      {smokeResults && (
        <section className="saas-surface rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-950">
              Live Quick Check ({smokeResults.question_count} Sample Questions)
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Ran at {smokeResults.ran_at.slice(11, 19)}Z
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Search Approach</th>
                  <th className="py-2.5 px-4 font-semibold">Found Right Page</th>
                  <th className="py-2.5 px-4 font-semibold">Top-Result Ranking</th>
                  <th className="py-2.5 px-4 font-semibold">Safe Refusal Score</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Average Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 font-mono tabular-nums bg-white">
                {smokeResults.variants.map((v) => (
                  <tr key={v.variant}>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-950">
                      {v.variant}. {v.label}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600" style={{ width: `${Math.round(v.recall_at_10 * 100)}%` }} />
                        </div>
                        <span className="text-slate-900">{(v.recall_at_10 * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-800" style={{ width: `${Math.round(v.mrr * 100)}%` }} />
                        </div>
                        <span className="text-slate-900">{Math.round(v.mrr * 100)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-600" style={{ width: `${Math.round(v.abstention_f1 * 100)}%` }} />
                        </div>
                        <span className="text-emerald-700 font-semibold">{(v.abstention_f1 * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">{v.avg_latency_ms.toFixed(2)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-slate-600">
            Tested live on {smokeQuestions.length} real questions spanning 1968 laws, 2019 vs. 2023 capital tables, compliance memos, and unauthorized audit checks.
          </div>
        </section>
      )}

      {/* Step-by-Step Upgrade Scorecard */}
      <section className="saas-surface rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            How Each Improvement Is Tested (Full 210-Question Exam)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            We test one improvement at a time so we know exactly what helps. No scores are guessed in advance—entries show <span className="font-semibold text-slate-800">Pending</span> until the full 210-question exam runs on the complete library.
          </p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Improvement Step</th>
                <th className="py-2.5 px-4 font-semibold">What It Does For You</th>
                <th className="py-2.5 px-3 font-semibold text-right">Right Page</th>
                <th className="py-2.5 px-3 font-semibold text-right">Accuracy</th>
                <th className="py-2.5 px-3 font-semibold text-right">Exact Quotes</th>
                <th className="py-2.5 px-3 font-semibold text-right">Safe Refusal</th>
                <th className="py-2.5 px-4 font-semibold text-right">Speed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {FULL_IMPROVEMENT_STEPS.map((r) => (
                <tr key={r.variant} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-950">{r.variant}</div>
                    <div className="text-[11px] text-slate-500">{r.change}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{r.hypothesis}</td>
                  <td className="py-3 px-3 text-right text-slate-400">Pending</td>
                  <td className="py-3 px-3 text-right text-slate-400">Pending</td>
                  <td className="py-3 px-3 text-right text-slate-400">Pending</td>
                  <td className="py-3 px-3 text-right text-slate-400">Pending</td>
                  <td className="py-3 px-4 text-right text-slate-400">Pending</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
