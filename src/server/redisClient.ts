import Redis from 'ioredis';
import type { QueryResponse } from '../shared/types.ts';

export interface RedisProbeResult {
  mode: 'live_redis' | 'embedded_memory';
  url: string;
  reachable: boolean;
  ttl_seconds: number;
  live_keys: number | null;
  note: string;
}

const KEY_PREFIX = 'lexgate:';

function getRedisConfig(): { url: string; ttlSeconds: number } {
  const rawUrl = process.env.REDIS_URL?.trim() || 'redis://localhost:6379';
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }
  const rawTtl = Number(process.env.REDIS_TTL_SECONDS ?? '3600');
  const ttlSeconds = Number.isFinite(rawTtl) && rawTtl >= 10 ? Math.floor(rawTtl) : 3600;
  return { url: rawUrl, ttlSeconds };
}

function redactRedisUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return 'redis://localhost:6379';
  }
}

let client: Redis | null = null;
let cachedProbe: { at: number; result: RedisProbeResult } | null = null;

function getOrCreateClient(): Redis {
  if (client) return client;
  const { url } = getRedisConfig();
  const instance = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 550,
    retryStrategy: () => null,
  });
  instance.on('error', () => {
    // Handled gracefully via probe fallback in preview/offline environments
  });
  client = instance;
  return instance;
}

async function ensureConnected(): Promise<boolean> {
  try {
    const r = getOrCreateClient();
    if (r.status === 'ready') return true;
    if (r.status === 'end' || r.status === 'close') {
      client = null;
      const fresh = getOrCreateClient();
      await fresh.connect();
      return true;
    }
    await r.connect();
    return true;
  } catch {
    if (client && client.status !== 'ready') {
      try {
        client.disconnect(false);
      } catch {
        // ignore cleanup
      }
      client = null;
    }
    return false;
  }
}

export async function probeRedis(forceRefresh = false): Promise<RedisProbeResult> {
  if (!forceRefresh && cachedProbe && Date.now() - cachedProbe.at < 8_000) {
    return cachedProbe.result;
  }

  const { url, ttlSeconds } = getRedisConfig();
  const safeUrl = redactRedisUrl(url);

  try {
    const connected = await ensureConnected();
    if (connected && client) {
      const pong = await client.ping();
      if (pong === 'PONG') {
        const keysCount = await client.dbsize();
        const ok: RedisProbeResult = {
          mode: 'live_redis',
          url: safeUrl,
          reachable: true,
          ttl_seconds: ttlSeconds,
          live_keys: keysCount,
          note: `Connected to live Redis (${keysCount} key(s), TTL ${ttlSeconds}s).`,
        };
        cachedProbe = { at: Date.now(), result: ok };
        return ok;
      }
    }
  } catch {
    // Redis offline in cloud preview
  }

  const fallback: RedisProbeResult = {
    mode: 'embedded_memory',
    url: safeUrl,
    reachable: false,
    ttl_seconds: ttlSeconds,
    live_keys: null,
    note: `Using in-process epoch Map cache in preview (auto-connects to ${safeUrl} on local clone).`,
  };
  cachedProbe = { at: Date.now(), result: fallback };
  return fallback;
}

export async function getCachedQueryFromRedis(cacheKey: string): Promise<QueryResponse | null> {
  try {
    const probe = await probeRedis();
    if (!probe.reachable || !client) return null;
    const raw = await client.get(`${KEY_PREFIX}${cacheKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as QueryResponse;
  } catch {
    return null;
  }
}

export async function setCachedQueryInRedis(
  cacheKey: string,
  value: QueryResponse
): Promise<boolean> {
  try {
    const probe = await probeRedis();
    if (!probe.reachable || !client) return false;
    await client.set(`${KEY_PREFIX}${cacheKey}`, JSON.stringify(value), 'EX', probe.ttl_seconds);
    cachedProbe = null;
    return true;
  } catch {
    return false;
  }
}

export async function hasCachedKeyInRedis(cacheKey: string): Promise<boolean> {
  try {
    const probe = await probeRedis();
    if (!probe.reachable || !client) return false;
    const exists = await client.exists(`${KEY_PREFIX}${cacheKey}`);
    return exists === 1;
  } catch {
    return false;
  }
}

export async function flushLexGateRedisKeys(): Promise<void> {
  try {
    const probe = await probeRedis();
    if (!probe.reachable || !client) return;
    const keys = await client.keys(`${KEY_PREFIX}*`);
    if (keys.length > 0) {
      await client.del(...keys);
      cachedProbe = null;
    }
  } catch {
    // Ignore when offline
  }
}
