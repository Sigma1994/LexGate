import type { GroupId, QdrantPoint } from '../shared/types.ts';
import { OLLAMA_EMBED_DIMS, embedTextWithOllamaOrFallback } from './ollamaClient.ts';

export interface QdrantProbeResult {
  mode: 'live_http' | 'embedded_memory';
  url: string;
  collection: string;
  collections: string[];
  reachable: boolean;
  live_points: number | null;
  note: string;
  error_reason: string | null;
  checked_at: string;
  latency_ms: number;
}

function describeQdrantError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; address?: string; port?: number } }).cause;
  if (cause?.code) {
    const target = cause.address && cause.port ? ` (${cause.address}:${cause.port})` : '';
    return `${cause.code}${target}: ${err.message}`;
  }
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return 'Connection timed out after 700ms';
  }
  return err.message;
}

function getQdrantConfig(): { url: string; collection: string; apiKey?: string } {
  const rawUrl = (process.env.QDRANT_URL?.trim() || 'http://localhost:6333').replace(/\/+$/, '');
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('QDRANT_URL must use http or https.');
  }
  const collection = process.env.QDRANT_COLLECTION?.trim() || 'lexgate_policies';
  const rawApiKey = (process.env.QDRANT_API_KEY ?? '').trim();
  const apiKey =
    !rawApiKey || rawApiKey === '""' || rawApiKey === "''" ? undefined : rawApiKey;
  return { url: parsed.toString().replace(/\/+$/, ''), collection, apiKey };
}

function qdrantHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['api-key'] = apiKey;
  }
  return headers;
}

let cachedQdrantProbe: { at: number; result: QdrantProbeResult } | null = null;

export async function probeQdrant(forceRefresh = false): Promise<QdrantProbeResult> {
  if (!forceRefresh && cachedQdrantProbe && Date.now() - cachedQdrantProbe.at < 8_000) {
    return cachedQdrantProbe.result;
  }
  const { url, collection, apiKey } = getQdrantConfig();
  const t0 = performance.now();
  const checkedAt = new Date().toISOString();
  let errorReason: string | null = null;

  try {
    const listRes = await fetch(`${url}/collections`, {
      headers: qdrantHeaders(apiKey),
      signal: AbortSignal.timeout(700),
    });

    if (!listRes.ok) {
      errorReason = `GET ${url}/collections returned HTTP ${listRes.status} ${listRes.statusText}${
        listRes.status === 401 || listRes.status === 403 ? ' (check QDRANT_API_KEY)' : ''
      }`.trim();
    } else {
      const listPayload = (await listRes.json()) as {
        result?: { collections?: Array<{ name: string }> };
      };
      const collections = (listPayload.result?.collections ?? []).map((c) => c.name);

      const colRes = await fetch(`${url}/collections/${encodeURIComponent(collection)}`, {
        headers: qdrantHeaders(apiKey),
        signal: AbortSignal.timeout(700),
      });
      const latencyMs = Math.max(1, Math.round(performance.now() - t0));

      if (colRes.ok) {
        const payload = (await colRes.json()) as { result?: { points_count?: number } };
        const ok: QdrantProbeResult = {
          mode: 'live_http',
          url,
          collection,
          collections,
          reachable: true,
          live_points: payload.result?.points_count ?? 0,
          note: `Connected to live Qdrant collection '${collection}'.`,
          error_reason: null,
          checked_at: checkedAt,
          latency_ms: latencyMs,
        };
        cachedQdrantProbe = { at: Date.now(), result: ok };
        return ok;
      }

      if (colRes.status === 404) {
        const ready: QdrantProbeResult = {
          mode: 'live_http',
          url,
          collection,
          collections,
          reachable: true,
          live_points: 0,
          note: `Connected to Qdrant at ${url}; collection '${collection}' ready to initialize.`,
          error_reason: null,
          checked_at: checkedAt,
          latency_ms: latencyMs,
        };
        cachedQdrantProbe = { at: Date.now(), result: ready };
        return ready;
      }

      errorReason = `GET ${url}/collections/${collection} returned HTTP ${colRes.status} ${colRes.statusText}`.trim();
    }
  } catch (err) {
    errorReason = `Failed to reach ${url}/collections — ${describeQdrantError(err)}`;
  }

  const latencyMs = Math.max(1, Math.round(performance.now() - t0));
  const fallback: QdrantProbeResult = {
    mode: 'embedded_memory',
    url,
    collection,
    collections: [],
    reachable: false,
    live_points: null,
    note: `Using embedded vector index fallback (${url} unreachable).`,
    error_reason: errorReason,
    checked_at: checkedAt,
    latency_ms: latencyMs,
  };
  cachedQdrantProbe = { at: Date.now(), result: fallback };
  return fallback;
}

export async function ensureQdrantCollection(vectorSize = OLLAMA_EMBED_DIMS): Promise<boolean> {
  const { url, collection, apiKey } = getQdrantConfig();
  try {
    const check = await fetch(`${url}/collections/${encodeURIComponent(collection)}`, {
      headers: qdrantHeaders(apiKey),
      signal: AbortSignal.timeout(1000),
    });
    if (check.ok) return true;
    if (check.status !== 404) return false;

    const create = await fetch(`${url}/collections/${encodeURIComponent(collection)}`, {
      method: 'PUT',
      headers: qdrantHeaders(apiKey),
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: 'Cosine' },
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!create.ok) return false;

    // Create payload indexes for fast ACL + bitemporal pre-filtering
    const indexes: Array<{ field_name: string; field_schema: string }> = [
      { field_name: 'allowed_groups', field_schema: 'keyword' },
      { field_name: 'effective_from_ts', field_schema: 'integer' },
      { field_name: 'effective_to_ts', field_schema: 'integer' },
      { field_name: 'doc_id', field_schema: 'keyword' },
    ];
    for (const idx of indexes) {
      await fetch(`${url}/collections/${encodeURIComponent(collection)}/index`, {
        method: 'PUT',
        headers: qdrantHeaders(apiKey),
        body: JSON.stringify(idx),
        signal: AbortSignal.timeout(1500),
      }).catch(() => undefined);
    }

    cachedQdrantProbe = null;
    return true;
  } catch {
    return false;
  }
}

export async function upsertPointsToQdrant(points: QdrantPoint[]): Promise<{
  synced_live_qdrant: boolean;
  embedding_source: string;
}> {
  if (points.length === 0) {
    return { synced_live_qdrant: false, embedding_source: 'none' };
  }

  let embeddingSource = 'Deterministic 768-dim fallback';
  const prepared: Array<{
    id: string;
    vector: number[];
    payload: {
      chunk_id: string;
      doc_id: string;
      version_id: string;
      allowed_groups: GroupId[];
      effective_from_ts: number;
      effective_to_ts: number;
      keywords: string[];
    };
  }> = [];

  for (const pt of points) {
    const emb = await embedTextWithOllamaOrFallback(pt.text_content);
    embeddingSource = emb.source;
    prepared.push({
      id: pt.chunk_id,
      vector: emb.vector,
      payload: {
        chunk_id: pt.chunk_id,
        doc_id: pt.doc_id,
        version_id: pt.version_id,
        allowed_groups: pt.allowed_groups,
        effective_from_ts: pt.effective_from_ts,
        effective_to_ts: pt.effective_to_ts,
        keywords: pt.keywords,
      },
    });
  }

  const probe = await probeQdrant();
  if (!probe.reachable) {
    return { synced_live_qdrant: false, embedding_source: embeddingSource };
  }

  const vectorDims = prepared[0]?.vector.length ?? OLLAMA_EMBED_DIMS;
  const ensured = await ensureQdrantCollection(vectorDims);
  if (!ensured) {
    return { synced_live_qdrant: false, embedding_source: embeddingSource };
  }

  const { url, collection, apiKey } = getQdrantConfig();
  try {
    const res = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points?wait=true`, {
      method: 'PUT',
      headers: qdrantHeaders(apiKey),
      body: JSON.stringify({ points: prepared }),
      signal: AbortSignal.timeout(5000),
    });
    cachedQdrantProbe = null;
    return { synced_live_qdrant: res.ok, embedding_source: embeddingSource };
  } catch {
    return { synced_live_qdrant: false, embedding_source: embeddingSource };
  }
}

export async function syncAclPayloadInQdrant(
  chunkIds: string[],
  allowedGroups: GroupId[]
): Promise<boolean> {
  if (chunkIds.length === 0) return true;
  const probe = await probeQdrant();
  if (!probe.reachable) return false;
  const { url, collection, apiKey } = getQdrantConfig();
  try {
    const res = await fetch(
      `${url}/collections/${encodeURIComponent(collection)}/points/payload?wait=true`,
      {
        method: 'POST',
        headers: qdrantHeaders(apiKey),
        body: JSON.stringify({
          payload: { allowed_groups: allowedGroups },
          points: chunkIds,
        }),
        signal: AbortSignal.timeout(3000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function deletePointsFromQdrant(pointIds: string[]): Promise<boolean> {
  if (pointIds.length === 0) return true;
  const probe = await probeQdrant();
  if (!probe.reachable) return false;
  const { url, collection, apiKey } = getQdrantConfig();
  try {
    const res = await fetch(
      `${url}/collections/${encodeURIComponent(collection)}/points/delete?wait=true`,
      {
        method: 'POST',
        headers: qdrantHeaders(apiKey),
        body: JSON.stringify({ points: pointIds }),
        signal: AbortSignal.timeout(3000),
      }
    );
    cachedQdrantProbe = null;
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearQdrantCollectionPoints(): Promise<boolean> {
  const probe = await probeQdrant();
  if (!probe.reachable) return false;
  const { url, collection, apiKey } = getQdrantConfig();
  try {
    const res = await fetch(`${url}/collections/${encodeURIComponent(collection)}`, {
      method: 'DELETE',
      headers: qdrantHeaders(apiKey),
      signal: AbortSignal.timeout(3000),
    });
    cachedQdrantProbe = null;
    return res.ok;
  } catch {
    return false;
  }
}

export async function searchQdrantLive(
  query: string,
  allowedGroups: GroupId[],
  asOfSec: number,
  limit = 50
): Promise<{
  hits: Array<{ chunk_id: string; score: number }>;
  embedding_source: string;
} | null> {
  const probe = await probeQdrant();
  if (!probe.reachable) return null;

  const { vector, source } = await embedTextWithOllamaOrFallback(query);
  const { url, collection, apiKey } = getQdrantConfig();
  try {
    const res = await fetch(
      `${url}/collections/${encodeURIComponent(collection)}/points/search`,
      {
        method: 'POST',
        headers: qdrantHeaders(apiKey),
        body: JSON.stringify({
          vector,
          limit,
          with_payload: false,
          filter: {
            must: [
              { key: 'allowed_groups', match: { any: allowedGroups } },
              { key: 'effective_from_ts', range: { lte: asOfSec } },
              { key: 'effective_to_ts', range: { gt: asOfSec } },
            ],
          },
        }),
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: Array<{ id: string; score: number }> };
    return {
      hits: (data.result ?? []).map((r) => ({ chunk_id: String(r.id), score: r.score })),
      embedding_source: source,
    };
  } catch {
    return null;
  }
}
