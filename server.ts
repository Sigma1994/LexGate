import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  ADRS,
  DDL_REFERENCE_SNIPPET,
  EXTRACTION_EXHIBIT,
  GOLDEN_BENCHMARK_DISTRIBUTION,
  SMOKE_EVAL_QUESTIONS,
} from './src/server/corpus.ts';
import type { PageInput } from './src/server/chunker.ts';
import { processUploadedDocumentBuffer } from './src/server/documentProcessor.ts';
import { RegulatoryLedger } from './src/server/ledger.ts';
import { embedTextWithOllamaOrFallback, probeOllama } from './src/server/ollamaClient.ts';
import {
  RAG_SYSTEM_INSTRUCTION,
  buildPermissionSafeCacheKey,
  hasConfiguredGeminiKey,
  runFiveStageQuery,
} from './src/server/pipeline.ts';
import {
  clearQdrantCollectionPoints,
  deletePointsFromQdrant,
  probeQdrant,
  syncAclPayloadInQdrant,
  upsertPointsToQdrant,
} from './src/server/qdrantClient.ts';
import {
  flushLexGateRedisKeys,
  hasCachedKeyInRedis,
  probeRedis,
} from './src/server/redisClient.ts';
import { runDevSmokeEval, runVerificationSuite } from './src/server/verifier.ts';
import type {
  ExecutionMode,
  GroupId,
  PipelineInspectResponse,
  ServiceConnectionLog,
  SystemRuntimeStatus,
  UploadDocumentResult,
} from './src/shared/types.ts';

const PORT = 3000;
const VALID_GROUPS: GroupId[] = ['public', 'compliance_officer', 'internal_audit'];
const VALID_MODES: ExecutionMode[] = ['airgapped_local', 'hosted_api'];
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

async function getSystemRuntimeStatus(forceRefresh = false): Promise<SystemRuntimeStatus> {
  const [qdrant, ollama, redis] = await Promise.all([
    probeQdrant(forceRefresh),
    probeOllama(forceRefresh),
    probeRedis(forceRefresh),
  ]);
  const rawPref = (process.env.LLM_PROVIDER ?? 'auto').trim().toLowerCase();
  const llm_provider_setting: SystemRuntimeStatus['llm_provider_setting'] =
    rawPref === 'ollama' || rawPref === 'gemini' ? rawPref : 'auto';
  const gemini_configured = hasConfiguredGeminiKey();
  const gemini_model = 'gemini-4-hydrogen';

  let active_default_llm = `Cloud Gemini (${gemini_model})`;
  if (llm_provider_setting === 'ollama') {
    active_default_llm = ollama.available
      ? `Local Ollama (${ollama.chat_model})`
      : `Local Ollama (${ollama.chat_model} — awaiting service)`;
  } else if (llm_provider_setting === 'auto' && ollama.available) {
    active_default_llm = `Local Ollama (${ollama.chat_model})`;
  } else if (!gemini_configured && !ollama.available) {
    active_default_llm = `Awaiting Local Ollama (${ollama.chat_model}) or GEMINI_API_KEY`;
  }

  const checkedNow = new Date().toISOString();
  const connection_logs: ServiceConnectionLog[] = [
    {
      service: 'Ollama LLM',
      endpoint: ollama.url,
      status: ollama.available ? 'connected' : 'fallback',
      active_target: ollama.available
        ? `${ollama.chat_model} + ${ollama.embed_model}`
        : `Fallback -> ${gemini_configured ? `Cloud Gemini (${gemini_model})` : 'No LLM available'}`,
      details: ollama.available
        ? `Installed models: ${ollama.installed_models.join(', ') || 'none pulled yet'}`
        : `Could not connect to Ollama at ${ollama.url}.`,
      error_reason: ollama.error_reason,
      checked_at: ollama.checked_at,
      latency_ms: ollama.latency_ms,
    },
    {
      service: 'Cloud Gemini',
      endpoint: 'https://generativelanguage.googleapis.com',
      status: gemini_configured ? 'connected' : 'not_configured',
      active_target: gemini_configured ? gemini_model : 'GEMINI_API_KEY unset',
      details: gemini_configured
        ? 'API key configured on server (used in preview or when Cloud Gemini AI is selected).'
        : 'Optional in local Ollama mode; set GEMINI_API_KEY to enable cloud fallback.',
      error_reason: gemini_configured ? null : 'GEMINI_API_KEY is missing or left as MY_GEMINI_API_KEY placeholder.',
      checked_at: checkedNow,
      latency_ms: 1,
    },
    {
      service: 'Qdrant Vector DB',
      endpoint: qdrant.url,
      status: qdrant.reachable ? 'connected' : 'fallback',
      active_target: qdrant.reachable
        ? `${qdrant.collection} (${qdrant.live_points ?? 0} pts)`
        : 'Fallback -> Embedded Vector Index (768-dim in-memory)',
      details: qdrant.reachable
        ? `Collections: ${qdrant.collections.join(', ') || qdrant.collection}`
        : `Could not connect to Qdrant HTTP API at ${qdrant.url}.`,
      error_reason: qdrant.error_reason,
      checked_at: qdrant.checked_at,
      latency_ms: qdrant.latency_ms,
    },
    {
      service: 'Redis Cache',
      endpoint: redis.url,
      status: redis.reachable ? 'connected' : 'fallback',
      active_target: redis.reachable
        ? `Live Redis (${redis.live_keys ?? 0} keys)`
        : 'Fallback -> In-Memory Epoch Map',
      details: redis.reachable
        ? `TTL ${redis.ttl_seconds}s · Epoch-keyed response cache active.`
        : `Could not connect to Redis at ${redis.url}.`,
      error_reason: redis.error_reason,
      checked_at: redis.checked_at,
      latency_ms: redis.latency_ms,
    },
  ];

  return {
    qdrant,
    ollama,
    redis,
    llm_provider_setting,
    active_default_llm,
    gemini_configured,
    gemini_model,
    connection_logs,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const startEmpty = (process.env.LOAD_STARTER_CORPUS ?? 'true').trim().toLowerCase() === 'false';
  const ledger = new RegulatoryLedger({ empty: startEmpty });

  const syncAllToLiveQdrantIfReachable = async () => {
    try {
      const probe = await probeQdrant();
      if (probe.reachable) {
        await upsertPointsToQdrant(Array.from(ledger.qdrantPoints.values()));
      }
    } catch {
      // Non-fatal in preview or when Qdrant container starts after Node
    }
  };

  void syncAllToLiveQdrantIfReachable();

  app.get('/api/system/status', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      let runtime = await getSystemRuntimeStatus(force);
      if (runtime.qdrant.reachable && (runtime.qdrant.live_points ?? 0) === 0 && ledger.qdrantPoints.size > 0) {
        await syncAllToLiveQdrantIfReachable();
        runtime = await getSystemRuntimeStatus(true);
      }
      return res.json(runtime);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to read system runtime status.';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/snapshot', async (_req, res) => {
    try {
      let runtime = await getSystemRuntimeStatus();
      if (runtime.qdrant.reachable && (runtime.qdrant.live_points ?? 0) === 0 && ledger.qdrantPoints.size > 0) {
        await syncAllToLiveQdrantIfReachable();
        runtime = await getSystemRuntimeStatus(true);
      }
      return res.json({
        snapshot: ledger.getSnapshot(),
        runtime,
        exhibits: {
          extraction: EXTRACTION_EXHIBIT,
          adrs: ADRS,
          ddl: DDL_REFERENCE_SNIPPET,
          benchmark_distribution: GOLDEN_BENCHMARK_DISTRIBUTION,
          smoke_questions: SMOKE_EVAL_QUESTIONS,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load snapshot.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/query', async (req, res) => {
    try {
      const { principal_id, query, as_of, execution_mode, bypass_cache } = req.body ?? {};
      if (typeof principal_id !== 'string' || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'principal_id and non-empty query string are required.' });
      }
      let mode: ExecutionMode;
      if (VALID_MODES.includes(execution_mode)) {
        mode = execution_mode;
      } else {
        const pref = (process.env.LLM_PROVIDER ?? 'auto').trim().toLowerCase();
        const ollamaProbe = await probeOllama();
        mode =
          pref === 'ollama' || (pref === 'auto' && ollamaProbe.available)
            ? 'airgapped_local'
            : 'hosted_api';
      }
      const asOfIso = typeof as_of === 'string' && as_of.trim() ? as_of : new Date().toISOString();

      const result = await runFiveStageQuery({
        ledger,
        principalId: principal_id,
        query: query.trim(),
        asOfIso,
        executionMode: mode,
        bypassCache: Boolean(bypass_cache),
      });

      return res.json({
        result,
        snapshot: ledger.getSnapshot(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || 'Query execution failed.');
      return res.status(500).json({ error: message });
    }
  });

  const ingestAndSyncPolicy = async (params: {
    title: string;
    citation_code: string;
    sensitivity: GroupId;
    effective_from: string;
    version_label?: string;
    source_url?: string;
    raw_text: string;
    pages?: PageInput[];
    metadata?: {
      source_filename?: string;
      detected_format?: string;
      pages_extracted?: number;
      extracted_chars?: number;
      processing_summary?: string;
    };
  }) => {
    const ingested = ledger.ingestPolicyDocument({
      title: params.title,
      citation_code: params.citation_code,
      sensitivity: params.sensitivity,
      effective_from: params.effective_from,
      version_label: params.version_label,
      source_url: params.source_url,
      raw_text: params.raw_text,
      pages: params.pages,
    });

    let syncRes = {
      synced_live_qdrant: false,
      embedding_source: 'Deterministic 768-dim fallback',
    };
    if (!ledger.indexWorkerPaused && ingested.points.length > 0) {
      syncRes = await upsertPointsToQdrant(ingested.points);
    }

    const upload: UploadDocumentResult = {
      doc_id: ingested.doc_id,
      version_id: ingested.version_id,
      title: ingested.title,
      citation_code: ingested.citation_code,
      sensitivity: ingested.sensitivity,
      effective_from: ingested.effective_from,
      parent_chunks_created: ingested.parent_chunks_created,
      child_chunks_indexed: ingested.child_chunks_indexed,
      quarantined_count: ingested.quarantined_count,
      qdrant_target: syncRes.synced_live_qdrant
        ? 'Live Qdrant HTTP + Local Index'
        : 'Embedded Vector Index',
      embedding_source: syncRes.embedding_source,
      corpus_epoch: ledger.corpusEpoch,
      ...params.metadata,
    };

    const runtime = await getSystemRuntimeStatus(true);
    return {
      upload,
      snapshot: ledger.getSnapshot(),
      runtime,
    };
  };

  const runSingleFileMulter = (req: express.Request, res: express.Response): Promise<void> =>
    new Promise((resolve, reject) => {
      uploadMiddleware.single('file')(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            reject(new Error('File exceeds the 15 MB upload limit.'));
          } else {
            reject(err instanceof Error ? err : new Error('File upload parsing failed.'));
          }
          return;
        }
        resolve();
      });
    });

  app.post('/api/admin/upload-document', async (req, res) => {
    try {
      const {
        title,
        citation_code,
        sensitivity,
        effective_from,
        version_label,
        source_url,
        raw_text,
        pages,
      } = req.body ?? {};

      if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
        return res.status(400).json({ error: 'Document title must be between 3 and 200 characters.' });
      }
      if (
        typeof citation_code !== 'string' ||
        citation_code.trim().length < 2 ||
        citation_code.trim().length > 80
      ) {
        return res.status(400).json({ error: 'Citation code must be between 2 and 80 characters.' });
      }
      if (!VALID_GROUPS.includes(sensitivity)) {
        return res.status(400).json({ error: 'Valid sensitivity tier (public | compliance_officer | internal_audit) is required.' });
      }
      if (typeof effective_from !== 'string' || Number.isNaN(new Date(effective_from).getTime())) {
        return res.status(400).json({ error: 'Valid effective_from date is required.' });
      }
      if (typeof raw_text !== 'string' || raw_text.trim().length < 20 || raw_text.length > 500_000) {
        return res.status(400).json({ error: 'Policy text must be between 20 and 500,000 characters.' });
      }

      const validatedPages: PageInput[] | undefined = Array.isArray(pages)
        ? pages
            .filter(
              (p): p is { page_number: number; text: string } =>
                Boolean(p) &&
                typeof p === 'object' &&
                typeof (p as { page_number?: unknown }).page_number === 'number' &&
                typeof (p as { text?: unknown }).text === 'string'
            )
            .slice(0, 2000)
        : undefined;

      const payload = await ingestAndSyncPolicy({
        title,
        citation_code,
        sensitivity,
        effective_from,
        version_label: typeof version_label === 'string' ? version_label : undefined,
        source_url: typeof source_url === 'string' ? source_url : undefined,
        raw_text,
        pages: validatedPages,
      });
      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document upload failed.';
      return res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/preview-file', async (req, res) => {
    try {
      await runSingleFileMulter(req, res);
      if (!req.file) {
        return res.status(400).json({ error: 'Please select a file to process.' });
      }
      const processed = await processUploadedDocumentBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      return res.json({
        source_filename: req.file.originalname,
        ...processed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to parse uploaded file.';
      return res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/upload-file', async (req, res) => {
    try {
      await runSingleFileMulter(req, res);
      if (!req.file) {
        return res.status(400).json({ error: 'Please choose or drop a policy file to upload.' });
      }

      const processed = await processUploadedDocumentBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const titleInput = typeof body.title === 'string' ? body.title.trim() : '';
      const citationInput = typeof body.citation_code === 'string' ? body.citation_code.trim() : '';
      const sensitivityInput = body.sensitivity as GroupId;
      const effectiveInput = typeof body.effective_from === 'string' ? body.effective_from.trim() : '';
      const versionInput = typeof body.version_label === 'string' ? body.version_label.trim() : '';

      const title = titleInput.length >= 3 ? titleInput.slice(0, 200) : processed.suggested_title;
      const citation_code =
        citationInput.length >= 2 ? citationInput.slice(0, 80) : processed.suggested_citation;
      const sensitivity: GroupId = VALID_GROUPS.includes(sensitivityInput)
        ? sensitivityInput
        : 'compliance_officer';
      const effective_from =
        effectiveInput && !Number.isNaN(new Date(effectiveInput).getTime())
          ? effectiveInput
          : new Date().toISOString();

      const payload = await ingestAndSyncPolicy({
        title,
        citation_code,
        sensitivity,
        effective_from,
        version_label: versionInput || undefined,
        source_url: `upload://${path.basename(req.file.originalname)}`,
        raw_text: processed.raw_text,
        pages: processed.pages,
        metadata: {
          source_filename: req.file.originalname,
          detected_format: processed.detected_format,
          pages_extracted: processed.pages_extracted,
          extracted_chars: processed.extracted_chars,
          processing_summary: processed.processing_summary,
        },
      });
      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'File upload failed.';
      return res.status(400).json({ error: message });
    }
  });

  app.post('/api/pipeline/inspect', async (req, res) => {
    try {
      const { query, principal_id, as_of } = req.body ?? {};
      const q = typeof query === 'string' && query.trim() ? query.trim() : 'What is the minimum core capital required under the Banking Amendment Act 2025?';
      const pid =
        typeof principal_id === 'string' && principal_id.trim()
          ? principal_id
          : ledger.principals[0]?.principal_id ?? '';
      const asOfIso = typeof as_of === 'string' && as_of.trim() ? as_of : '2026-11-20T00:00:00Z';
      const asOfMs = new Date(asOfIso).getTime();
      if (Number.isNaN(asOfMs)) {
        return res.status(400).json({ error: 'Invalid as_of date.' });
      }

      const [breakdown, emb, redisProbe] = await Promise.all([
        Promise.resolve(ledger.inspectSearchBreakdown(q, pid, asOfMs)),
        embedTextWithOllamaOrFallback(q),
        probeRedis(),
      ]);

      const redisCacheKey = buildPermissionSafeCacheKey({
        corpusEpoch: ledger.corpusEpoch,
        activeGroups: breakdown.active_groups,
        asOfIso,
        query: q,
      });
      const inRedis = redisProbe.reachable ? await hasCachedKeyInRedis(redisCacheKey) : false;
      const inMemory = ledger.semanticCache.has(redisCacheKey);
      const redisCacheStatus: PipelineInspectResponse['redis_cache_status'] = inRedis
        ? 'HIT (Live Redis)'
        : inMemory
          ? 'HIT (In-Memory)'
          : 'MISS';

      const payload: PipelineInspectResponse = {
        query: q,
        tokens: breakdown.tokens,
        expanded_terms: breakdown.expanded_terms,
        embedding_preview: emb.vector.slice(0, 16),
        embedding_dims: emb.vector.length,
        embedding_source: emb.source,
        redis_cache_key: `lexgate:${redisCacheKey}`,
        redis_cache_status: redisCacheStatus,
        redis_backend: redisProbe.mode,
        qdrant_filter_json: {
          with_payload: false,
          filter: {
            must: [
              { key: 'allowed_groups', match: { any: breakdown.active_groups } },
              { key: 'effective_from_ts', range: { lte: breakdown.as_of_sec } },
              { key: 'effective_to_ts', range: { gt: breakdown.as_of_sec } },
            ],
          },
        },
        matched_chunks: breakdown.matched_chunks,
        llm_system_prompt: RAG_SYSTEM_INSTRUCTION,
        llm_evidence_prompt_preview: `Query as of ${asOfIso}:\n${q}\n\nAuthorized Regulatory Evidence:\n${breakdown.evidence_preview_xml}`,
      };

      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Inspection failed.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/admin/acl', async (req, res) => {
    const { doc_id, group_id, action } = req.body ?? {};
    if (
      typeof doc_id !== 'string' ||
      !VALID_GROUPS.includes(group_id) ||
      (action !== 'grant' && action !== 'revoke')
    ) {
      return res.status(400).json({ error: 'Valid doc_id, group_id, and action (grant|revoke) are required.' });
    }
    const outcome = ledger.mutateAclGrant(doc_id, group_id, action);
    if (!ledger.indexWorkerPaused && outcome.changed) {
      const chunkIds = Array.from(ledger.qdrantPoints.values())
        .filter((p) => p.doc_id === doc_id)
        .map((p) => p.chunk_id);
      void syncAclPayloadInQdrant(chunkIds, ledger.getDocAclGroups(doc_id));
    }
    return res.json({ outcome, snapshot: ledger.getSnapshot() });
  });

  app.post('/api/admin/worker', async (req, res) => {
    const { paused } = req.body ?? {};
    ledger.indexWorkerPaused = Boolean(paused);
    let processed = 0;
    if (!ledger.indexWorkerPaused) {
      processed = ledger.processOutbox();
      void syncAllToLiveQdrantIfReachable();
    }
    return res.json({ processed, snapshot: ledger.getSnapshot() });
  });

  app.post('/api/admin/process-outbox', (_req, res) => {
    const processed = ledger.processOutbox();
    void syncAllToLiveQdrantIfReachable();
    return res.json({ processed, snapshot: ledger.getSnapshot() });
  });

  app.post('/api/admin/inject-drift', (req, res) => {
    const { doc_id } = req.body ?? {};
    if (typeof doc_id !== 'string') {
      return res.status(400).json({ error: 'doc_id is required.' });
    }
    const modified = ledger.injectQdrantDrift(doc_id, ['public', 'compliance_officer', 'internal_audit']);
    return res.json({ modified, snapshot: ledger.getSnapshot() });
  });

  app.post('/api/admin/reconcile', (_req, res) => {
    const report = ledger.reconcileDrift();
    void syncAllToLiveQdrantIfReachable();
    return res.json({ report, snapshot: ledger.getSnapshot() });
  });

  app.post('/api/admin/reset', async (req, res) => {
    const empty = Boolean(req.body?.empty);
    ledger.reset({ empty });
    await clearQdrantCollectionPoints();
    if (!empty) {
      await syncAllToLiveQdrantIfReachable();
    }
    void flushLexGateRedisKeys();
    const runtime = await getSystemRuntimeStatus(true);
    return res.json({ snapshot: ledger.getSnapshot(), runtime });
  });

  app.post('/api/admin/clear-samples', async (_req, res) => {
    ledger.reset({ empty: true });
    await clearQdrantCollectionPoints();
    void flushLexGateRedisKeys();
    const runtime = await getSystemRuntimeStatus(true);
    return res.json({ snapshot: ledger.getSnapshot(), runtime });
  });

  app.get('/api/admin/documents/:docId/preview', (req, res) => {
    const { docId } = req.params;
    const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
    const preview = ledger.getDocumentFirstPagePreview(docId, versionId);
    if (!preview) {
      return res.status(404).json({ error: 'Document preview not found.' });
    }
    return res.json({ preview });
  });

  app.delete('/api/admin/documents/:docId', async (req, res) => {
    const { docId } = req.params;
    const outcome = ledger.deleteDocument(docId);
    if (!outcome.deleted) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    if (outcome.deletedChunkIds.length > 0) {
      await deletePointsFromQdrant(outcome.deletedChunkIds);
    }
    void flushLexGateRedisKeys();
    const runtime = await getSystemRuntimeStatus(true);
    return res.json({ deleted: true, snapshot: ledger.getSnapshot(), runtime });
  });

  app.post('/api/admin/quarantine-test', (req, res) => {
    const { quarantine_id, op } = req.body ?? {};
    const operation = op === 'DELETE' ? 'DELETE' : 'UPDATE';
    const outcome = ledger.attemptQuarantineMutation(String(quarantine_id ?? ''), operation);
    return res.json(outcome);
  });

  app.post('/api/tests/run', (_req, res) => {
    const suite = runVerificationSuite(ledger);
    return res.json(suite);
  });

  app.post('/api/eval/smoke', (_req, res) => {
    const smoke = runDevSmokeEval(ledger);
    return res.json(smoke);
  });

  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      const message = err instanceof Error ? err.message : 'Unexpected server error.';
      if (!res.headersSent) {
        return res.status(500).json({ error: message });
      }
    }
    return next(err);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LexGate server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
