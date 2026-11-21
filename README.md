# LexGate Regulatory Assistant

Privacy-first, bitemporal regulatory document Q&A workbench combining **Qdrant** hybrid vector retrieval, **PostgreSQL 17** Row-Level Security semantics, **Redis** O(1) epoch-keyed caching, **Ollama** local LLM synthesis, and **word-for-word citation verification**.

## Quick Start (Local Development with Ollama, Qdrant & Redis)

When cloned locally, LexGate connects automatically to **Ollama (`http://localhost:11434`)**, **Qdrant (`http://localhost:6333`)**, and **Redis (`redis://localhost:6379`)** with zero code tweaks.

### 1. Start Qdrant, PostgreSQL 17, Redis, and Ollama

```bash
docker compose up -d
```

### 2. Pull the Default Local LLM & Embedding Models

```bash
docker exec -it lexgate_ollama ollama pull llama3.1:8b && docker exec -it lexgate_ollama ollama pull nomic-embed-text
```

### 3. Configure `.env` and Start the App

Put those 7 lines in `.env` (or `cp .env.example .env`):

```env
LLM_PROVIDER=auto
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBED_MODEL=nomic-embed-text
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=lexgate_policies
QDRANT_API_KEY=
```

*(Optional local Redis settings already included in `.env.example`: `REDIS_URL=redis://localhost:6379` and `REDIS_TTL_SECONDS=3600`.)*

Then run:

```bash
npm install && npm run dev
```

Open `http://localhost:3000`.

- On startup, LexGate detects Qdrant at `http://localhost:6333`, creates the `lexgate_policies` 768-dim Cosine collection with payload indexes (`allowed_groups`, `effective_from_ts`, `effective_to_ts`, `doc_id`), and syncs all policy chunks automatically.
- Redis caches permission-scoped responses under `lexgate:ep{corpus_epoch}:grp_{group_hash}:asof_{date}:q_{query_hash}` so any permission revocation invalidates stale cached answers in O(1).
- All uploads in **Policy Library** write directly into Qdrant + the ledger, and **Ask Questions** routes to local **Ollama (`llama3.1:8b`)** by default with `0` outbound bytes.
- In cloud preview environments where localhost containers are unavailable, `LLM_PROVIDER=auto` seamlessly uses the embedded vector index, in-memory epoch cache, and server-side Gemini (`GEMINI_API_KEY`).

## Key Capabilities

- **Rich 2025–2026 Regulatory Corpus:** Covers Central Bank of Kenya Act (Cap. 491, 1966–2012), Capital Adequacy (CBK/PG/03), Liquidity Circular 11/2024, OAG Audit Report, Banking (Amendment) Act 2025, ODPC Financial Data Protection 2025, CBK Cyber Resilience & AI Governance 2026, AML/CFT & VASP Travel Rule 2026, IFRS 9 Credit Loss 2026, and Internal Audit FX/Insider Lending 2026.
- **Direct Policy Upload to Qdrant:** Paste text or upload `.txt`/`.md`/`.csv` policies directly in **Policy Library**, validate tables automatically (Safety Hold quarantine for jagged tables), generate 768-dim embeddings, and upsert into Qdrant immediately.
- **AI & ML Process Crash Course & Inspector:** Step-by-step student AI engineer walkthrough covering parsing, parent-child chunking, 768-dim Cosine embeddings, BM25 + Dense RRF fusion, `with_payload=false` security, O(1) epoch-keyed Redis caching, RAG vs. fine-tuning, and a live interactive pipeline inspector.
- **Privacy Guard & Safety Guarantees:** 10 automated security, bitemporal boundary, drift self-healing, and indistinguishable abstention checks.

## Production Scaling Notes

The security boundaries, bitemporal range logic, outbox schema (`db/init.sql`), Qdrant `with_payload=false` pattern, Redis epoch-keyed cache, and Tier 1/2 verification are already production-shaped. Moving to multi-node enterprise scale requires swapping the in-memory ledger state in `src/server/ledger.ts` to query PostgreSQL 17 directly (`pg` pool + `db/init.sql`), moving PDF/OCR ingestion (`Docling`) to an async background worker, and wiring enterprise OIDC SSO for principal authentication—without redesigning the application architecture.
