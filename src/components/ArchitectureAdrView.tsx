import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Landmark,
} from 'lucide-react';

interface ArchitectureAdrViewProps {
  ddlSnippet: string;
  adrs: Array<{
    id: string;
    title: string;
    status: string;
    context: string;
    decision: string;
    consequence: string;
  }>;
}

const PROBLEMS_SOLVED = [
  {
    title: '01. Stops Confidential Files From Leaking',
    problem:
      'Normal AI search tools keep separate search copies that lag behind when someone leaves a team, letting unauthorized users briefly see private audit or compliance files.',
    solution:
      'Privacy Guard checks your live permissions at the exact moment you ask—never trusting an outdated search index or stale saved answer.',
  },
  {
    title: '02. Blocks Time-Travel Access Tricks',
    problem:
      'If a former auditor asks "what did the 2023 audit say?", a careless system might check whether they had permission back in 2023 instead of whether they have permission today.',
    solution:
      'LexGate checks who you are allowed to be right now, while checking which laws were active on the historical date you picked.',
  },
  {
    title: '03. Prevents Outdated Laws & Scrambled Tables',
    problem:
      'Financial laws get amended over decades, and standard PDF readers mash multi-column capital ratio tables into unreadable text that causes AI models to guess wrong numbers.',
    solution:
      'Secure History Tracker matches exact active date ranges, while Smart Table Reader keeps rows aligned and locks blurry pages in Safety Hold.',
  },
  {
    title: '04. Never Hints That Secret Documents Exist',
    problem:
      'Even a message saying "You do not have permission to view the Audit Report" confirms to an outsider that a secret audit report exists.',
    solution:
      'Safe Refusal uses the exact same neutral refusal wording and matched response timing whether a file is restricted or does not exist at all.',
  },
];

const AI_STEPS = [
  {
    step: 'Step 1',
    name: 'Privacy Guard',
    detail: 'Checks your live access clearances right now and skips any outdated saved answers.',
  },
  {
    step: 'Step 2',
    name: 'Secure History Tracker',
    detail: 'Filters the library down to only rule versions officially in force on your chosen date.',
  },
  {
    step: 'Step 3',
    name: 'Smart Search & Tables',
    detail: 'Finds relevant passages and reads full financial tables without scrambling columns.',
  },
  {
    step: 'Step 4',
    name: 'Gemini AI (Approved Text Only)',
    detail: 'Reads only your approved sections—treated strictly as reference data, never hidden commands.',
  },
  {
    step: 'Step 5',
    name: 'Word-for-Word Fact Check',
    detail: 'Verifies every quote and number against the original page before showing you an answer.',
  },
];

const CORE_PROTECTIONS = [
  {
    name: 'Privacy Guard',
    benefit: 'Blocked documents never reach the AI, your screen, or saved answer logs.',
    how: 'Checks your active permissions at the current time on every single request.',
  },
  {
    name: 'Secure History Tracker',
    benefit: 'Answers always reflect the exact law in force on the historical date you choose.',
    how: 'Tracks non-overlapping start and end dates for every regulatory version back to 1966.',
  },
  {
    name: 'Safe Refusal',
    benefit: 'Authorized refusals never reveal that confidential files exist.',
    how: 'Returns uniform neutral wording with matched timing for restricted and missing topics.',
  },
  {
    name: 'Safety Hold',
    benefit: 'The AI never guesses numbers from blurry scans or broken tables.',
    how: 'Automatically isolates unreadable pages into a tamper-proof log for human review.',
  },
];

interface LocalDevStep {
  id: string;
  step: string;
  title: string;
  summary: string;
  bullets?: string[];
  code?: string;
  note?: string;
}

const LOCAL_DEV_STEPS: LocalDevStep[] = [
  {
    id: 'step-1',
    step: 'Step 1',
    title: 'Install Required Tools on Windows 10',
    summary: 'Install these four tools before opening the project in PyCharm:',
    bullets: [
      'Docker Desktop for Windows (keep "Use WSL 2 instead of Hyper-V" checked; launch Docker Desktop and wait for "Engine running").',
      'Node.js v20 LTS or v22 LTS from nodejs.org (keep "Add to PATH" checked).',
      'Git for Windows from git-scm.com.',
      'Python 3.10–3.12 from python.org with "Add python.exe to PATH" checked (optional; only needed for local PDF ingestion in Step 9).',
    ],
  },
  {
    id: 'step-2a',
    step: 'Step 2A',
    title: 'Configure Git on Windows 10 (First Time Only)',
    summary: 'Open PowerShell or PyCharm Terminal (Alt + F12) and set your Git identity and Windows line endings:',
    code: `git --version
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
git config --global core.autocrlf true`,
    note: 'Setting core.autocrlf true prevents false line-ending diffs between Windows (CRLF) and Linux containers (LF).',
  },
  {
    id: 'step-2b',
    step: 'Step 2B',
    title: 'Clone From Your Git Repository (First Time)',
    summary:
      'In PyCharm: File -> New -> Project from Version Control (or "Get from VCS" on the Welcome screen), choose Git, paste your repository URL, set Directory (e.g. C:\\Projects\\lexgate), and click Clone. Use GitHub OAuth or a Personal Access Token (PAT) if private. Or clone from terminal:',
    code: `mkdir C:\\Projects -Force
cd C:\\Projects
git clone https://github.com/<your-username>/<your-repo>.git lexgate
cd lexgate
git remote -v
git branch -a`,
    note: 'After cloning via terminal, open C:\\Projects\\lexgate in PyCharm via File -> Open... PyCharm Windows PowerShell 5.1 does not support "&&" chaining—run commands one line at a time.',
  },
  {
    id: 'step-2c',
    step: 'Step 2C',
    title: 'Pull Latest Updates From Git (Existing Clone)',
    summary:
      'In PyCharm press Ctrl + T (Git -> Pull...) or run the commands below in PyCharm Terminal (Alt + F12). If you have local uncommitted edits, stash them first:',
    code: `git status
git fetch origin
git pull origin main`,
    note: '.gitignore ignores .env* (while keeping .env.example tracked) and node_modules/, so git pull will never overwrite your local .env. Re-run npm install whenever package.json changes.',
  },
  {
    id: 'step-3',
    step: 'Step 3',
    title: 'Create & Verify the .env File',
    summary:
      'Copy .env.example to .env (PowerShell: Copy-Item .env.example .env | CMD: copy .env.example .env) and confirm these settings—leaving QDRANT_API_KEY empty for local Docker Qdrant:',
    code: `LLM_PROVIDER=auto
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBED_MODEL=nomic-embed-text
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=lexgate_policies
QDRANT_API_KEY=
REDIS_URL=redis://localhost:6379
REDIS_TTL_SECONDS=3600
GEMINI_API_KEY=MY_GEMINI_API_KEY`,
    note: 'LLM_PROVIDER=auto uses local Ollama (llama3.1:8b) automatically whenever http://localhost:11434 is reachable (0 outbound bytes). GEMINI_API_KEY is optional locally.',
  },
  {
    id: 'step-4',
    step: 'Step 4',
    title: 'Start Qdrant, PostgreSQL 17, Redis & Ollama via Docker',
    summary:
      'Ensure Docker Desktop is running, then start all four services in docker-compose.yml (Qdrant on 6333/6334, PostgreSQL 17 on 5432, Redis on 6379, Ollama on 11434):',
    code: `docker compose up -d
docker compose ps`,
    note: 'If the native Windows Ollama tray app is already running on port 11434, Quit it from the system tray so lexgate_ollama can bind cleanly (or keep it and pull models directly in Windows Ollama).',
  },
  {
    id: 'step-5',
    step: 'Step 5',
    title: 'Pull Default Ollama LLM & Embedding Models',
    summary:
      'Download llama3.1:8b (~4.9 GB chat/synthesis) and nomic-embed-text (~274 MB 768-dim embeddings) into the lexgate_ollama container (run one line at a time in Windows PowerShell):',
    code: `docker exec lexgate_ollama ollama pull llama3.1:8b
docker exec lexgate_ollama ollama pull nomic-embed-text
docker exec lexgate_ollama ollama list`,
  },
  {
    id: 'step-6',
    step: 'Step 6',
    title: 'Verify Local Services Are Reachable on Windows',
    summary: 'Confirm Qdrant, Ollama, and Redis respond locally before launching Node:',
    code: `Invoke-RestMethod http://localhost:6333/collections
Invoke-RestMethod http://localhost:11434/api/tags
docker exec lexgate_redis redis-cli ping`,
  },
  {
    id: 'step-7',
    step: 'Step 7',
    title: 'Install Node Dependencies & Start the App',
    summary:
      'Install packages and launch the Express + Vite server on port 3000 (you can also save npm run dev as a PyCharm Run Configuration):',
    code: `npm install
npm run dev`,
    note: 'Wait for "LexGate server listening on http://0.0.0.0:3000", then open http://localhost:3000 in your browser.',
  },
  {
    id: 'step-8',
    step: 'Step 8',
    title: 'Verify Connections in the Web UI',
    summary: 'Confirm live wiring inside LexGate once http://localhost:3000 loads:',
    bullets: [
      'Open "Ask Questions" and inspect "Connected LLMs, Vector Databases & Fallback Diagnostic Log": Ollama LLM, Qdrant Vector DB, and Redis Cache should all read Connected.',
      'Run a question and check the "Tools Used" strip: it should show ollama/llama3.1:8b, Live Qdrant HTTP (lexgate_policies), and Ollama nomic-embed-text (768d).',
      'Run the exact same question again: Stage 1 should report HIT (Live Redis).',
      'Visit http://localhost:6333/dashboard to inspect the lexgate_policies vector collection in Qdrant.',
    ],
  },
  {
    id: 'step-9',
    step: 'Step 9',
    title: 'Optional: PyCharm Python Interpreter & Batch PDF Ingestion',
    summary:
      'Create a .venv interpreter in PyCharm (Settings -> Project -> Python Interpreter -> Add Local Interpreter -> Virtualenv), put .pdf files in ./pdfs, keep npm run dev running, and ingest via PyMuPDF or Unstructured:',
    code: `.venv\\Scripts\\Activate.ps1
pip install -r scripts/requirements-ingest.txt
python scripts/ingest_pdfs.py --dir ./pdfs --parser pymupdf --sensitivity compliance_officer --effective-from 2026-01-01`,
    note: 'To embed purely on CPU using sentence-transformers/all-MiniLM-L6-v2 (384 dims) directly into Qdrant: append --mode direct-qdrant --collection lexgate_minilm_384.',
  },
  {
    id: 'step-10',
    step: 'Step 10',
    title: 'Stopping, Restarting & Windows 10 Troubleshooting',
    summary: 'Daily workflow and quick fixes for common Windows 10 issues:',
    code: `docker compose stop
docker compose start`,
    bullets: [
      'Stop Node with Ctrl + C; docker compose stop preserves pulled Ollama models and Qdrant volumes.',
      'Port conflict check on Windows: run netstat -ano | findstr :11434 (or :6333, :6379, :5432, :3000) to locate conflicting local services.',
      'If PowerShell blocks .venv activation: run Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned once.',
      'On CPU-only laptops under 16 GB RAM, switch OLLAMA_MODEL=llama3.2:3b in .env and pull llama3.2:3b for faster responses.',
    ],
  },
];

export const ArchitectureAdrView: React.FC<ArchitectureAdrViewProps> = ({ ddlSnippet }) => {
  const [copied, setCopied] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [showLocalSetup, setShowLocalSetup] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ddlSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleCopyStep = async (stepId: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedStepId(stepId);
    setTimeout(() => {
      setCopiedStepId((prev) => (prev === stepId ? null : prev));
    }, 1800);
  };

  return (
    <div className="space-y-7">
      {/* 1. Split Architectural Hero: What LexGate Is */}
      <section className="surface-dark rounded-xl overflow-hidden text-white">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-7 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="text-xs font-medium text-blue-300">About LexGate</div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                Private, Verified Answers for Regulated Finance
              </h1>
              <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed max-w-2xl">
                <strong>LexGate</strong> is a privacy-first regulatory research assistant built for banking, compliance, and audit teams. Ask plain-English questions about complex financial laws, capital rules, and internal memos—and receive clear answers backed by exact, word-for-word quotes and page numbers.
              </p>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                Unlike a standard AI chatbot, LexGate guarantees two things on every question: you only receive answers from documents you are cleared to read <strong>today</strong>, and every rule matches the exact historical date you asked about.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-5 border-t border-slate-700/70">
              <div>
                <div className="text-[11px] text-slate-400">Rule History</div>
                <div className="mt-0.5 text-sm font-semibold text-white tabular-nums">1966 – 2026</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Access Checks</div>
                <div className="mt-0.5 text-sm font-semibold text-emerald-400">Before AI Runs</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Quote Accuracy</div>
                <div className="mt-0.5 text-sm font-semibold text-white">Word-for-Word</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] bg-slate-900">
            {!imgError ? (
              <img
                src="/src/assets/images/about_lexgate_vault_1795217048791.jpg"
                alt="LexGate regulatory law archive and precision security vault"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 to-blue-950 text-slate-300 gap-3">
                <Landmark className="w-8 h-8 text-blue-300" />
                <span className="text-xs font-medium">LexGate Regulatory Archive</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#091120]/80 via-[#091120]/20 to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* 2. What Problem It Solves */}
      <section className="saas-surface rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">What Problem It Solves</h2>
          <p className="mt-1 text-xs text-slate-600">
            Standard AI assistants fail in regulated finance because they leak restricted documents, mix up old and new laws, and misread dense financial tables. LexGate solves four real-world risks:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROBLEMS_SOLVED.map((item) => (
            <div key={item.title} className="p-5 rounded-lg border border-slate-200 bg-slate-50/90 space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-900">The risk:</strong> {item.problem}
              </p>
              <p className="text-xs text-slate-800 leading-relaxed pt-1 border-t border-slate-200/80">
                <strong className="text-blue-800">What LexGate does for you:</strong> {item.solution}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. How It Implements AI Safely */}
      <section className="surface-dark rounded-xl p-6 text-white space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-white">
            How LexGate Implements AI Safely
          </h2>
          <p className="mt-1 text-sm text-slate-300 max-w-4xl leading-relaxed">
            Security and date checks always happen <strong>before</strong> AI is ever called. Google Gemini (<span className="font-mono text-xs text-blue-300">gemini-4-hydrogen</span>) only sees text you are already authorized to read, and every answer it writes must pass an automated quote and number check before appearing on your screen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch">
          {AI_STEPS.map((node, i) => (
            <div key={node.step} className="relative flex items-center gap-2">
              <div className="flex-1 h-full p-4 rounded-lg border border-slate-700/80 bg-slate-900/75 space-y-1.5">
                <div className="text-[11px] font-mono text-blue-300 font-semibold">{node.step}</div>
                <div className="text-xs font-semibold text-white">{node.name}</div>
                <div className="text-[11px] text-slate-300 leading-relaxed">{node.detail}</div>
              </div>
              {i < AI_STEPS.length - 1 && (
                <ArrowRight className="hidden md:block w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
            </div>
          ))}
        </div>

        <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs text-slate-200 leading-relaxed">
          <strong className="text-white">Built-In Prompt &amp; Privacy Protection:</strong> Approved regulatory text is wrapped as untrusted reference data so hidden instructions inside documents cannot hijack the AI. Need zero external network traffic? Switch to <strong>Offline Mode</strong> in <strong>Ask Questions</strong> to keep 100% of data inside your network.
        </div>
      </section>

      {/* 4. Core Protections Summary */}
      <section className="saas-surface rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">Summary of Built-In Protections</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Feature</th>
                <th className="py-2.5 px-4 font-semibold">What It Does For You</th>
                <th className="py-2.5 px-4 font-semibold">How It Protects You</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 bg-white">
              {CORE_PROTECTIONS.map((g) => (
                <tr key={g.name} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-950 whitespace-nowrap">{g.name}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{g.benefit}</td>
                  <td className="py-3 px-4 text-slate-600">{g.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Honest Production Readiness & Large-Scale Roadmap */}
      <section className="saas-surface rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Production Readiness: Optimized Architecture Without a Remake
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Honest assessment of what is already production-shaped versus what swaps cleanly when scaling to millions of pages.
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-400">No Remake Needed</span>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            <strong>Direct answer:</strong> You do <strong>not</strong> need to rebuild LexGate. The security model, Qdrant <span className="font-mono text-xs">with_payload=false</span> isolation, bitemporal half-open date math, epoch-keyed caching, Ollama/Gemini routing, and Tier 1/2 citation verification are already structured for production. To handle hundreds of thousands of documents and thousands of concurrent banking users, swap four storage/worker adapters in place:
          </p>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-100">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Layer</th>
                  <th className="py-2.5 px-4 font-semibold">Current App Behavior</th>
                  <th className="py-2.5 px-4 font-semibold">Large-Scale Enterprise Upgrade (Drop-In)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-950">Document &amp; ACL Ledger</td>
                  <td className="py-2.5 px-4 text-slate-600">In-memory state mirroring SQL rules (fast zero-dependency preview)</td>
                  <td className="py-2.5 px-4 text-slate-900">Connect <span className="font-mono">pg</span> pool directly to <span className="font-mono">db/init.sql</span> in PostgreSQL 17 with <span className="font-mono">FORCE RLS</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-950">Vector Search &amp; Local LLM</td>
                  <td className="py-2.5 px-4 text-slate-600">Auto-connects to Qdrant + Ollama locally, embedded fallback in preview</td>
                  <td className="py-2.5 px-4 text-slate-900">Qdrant distributed cluster (quantized HNSW) + dedicated GPU Ollama / vLLM replicas</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-950">PDF / OCR Ingestion</td>
                  <td className="py-2.5 px-4 text-slate-600">Synchronous text/Markdown upload + table column validator</td>
                  <td className="py-2.5 px-4 text-slate-900">Async BullMQ / Temporal worker running Python Docling OCR pipeline into <span className="font-mono">reg.chunks</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-950">Auth &amp; Shared Cache</td>
                  <td className="py-2.5 px-4 text-slate-600">Role switcher demo + live Redis (<span className="font-mono">ioredis</span>) with preview Map fallback</td>
                  <td className="py-2.5 px-4 text-slate-900">OIDC / Entra ID JWT verification + Redis Cluster / Sentinel for multi-AZ HA</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Optional Engineer Reference & Local Setup Guide */}
      <section className="saas-surface rounded-xl p-6 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              aria-expanded={showSql}
              onClick={() => setShowSql((prev) => !prev)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 hover:text-blue-700 transition-colors text-left"
            >
              {showSql ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              For Engineers: Technical Reference (Database Schema &amp; Security Policy)
            </button>
            {showSql && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy SQL'}
              </button>
            )}
          </div>
          {showSql && (
            <pre className="p-4 bg-[#091120] text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
              {ddlSnippet}
            </pre>
          )}
        </div>

        <div className="pt-4 border-t border-slate-200/90 space-y-3">
          <button
            type="button"
            aria-expanded={showLocalSetup}
            onClick={() => setShowLocalSetup((prev) => !prev)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 hover:text-blue-700 transition-colors text-left"
          >
            {showLocalSetup ? (
              <ChevronDown className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0" />
            )}
            For Engineers: Full Local Development Guide (Git, PyCharm on Windows 10, Docker, Ollama &amp; Qdrant)
          </button>

          {showLocalSetup && (
            <div className="pt-2 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Complete start-to-finish instructions for cloning or pulling from Git in <strong>PyCharm on Windows 10</strong> and running LexGate locally with <strong>Docker (Qdrant, PostgreSQL 17, Redis, Ollama)</strong> and optional <strong>Python PDF ingestion</strong>.
              </p>

              <div className="space-y-3">
                {LOCAL_DEV_STEPS.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-lg border border-slate-200 bg-slate-50/90 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                          {item.step}
                        </span>
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-950">
                          {item.title}
                        </h3>
                      </div>
                      {item.code && (
                        <button
                          type="button"
                          onClick={() => void handleCopyStep(item.id, item.code!)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
                        >
                          {copiedStepId === item.id ? (
                            <Check className="w-3 h-3 text-emerald-700" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedStepId === item.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{item.summary}</p>

                    {item.bullets && item.bullets.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700 leading-relaxed">
                        {item.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    )}

                    {item.code && (
                      <pre className="p-3.5 bg-[#091120] text-slate-100 rounded-lg text-[11px] sm:text-xs font-mono overflow-x-auto leading-relaxed">
                        {item.code}
                      </pre>
                    )}

                    {item.note && (
                      <p className="text-[11px] text-slate-600 leading-relaxed border-t border-slate-200/70 pt-2">
                        <strong className="text-slate-800">Note:</strong> {item.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
