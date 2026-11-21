import crypto from 'node:crypto';

export interface OllamaProbeResult {
  available: boolean;
  url: string;
  chat_model: string;
  embed_model: string;
  installed_models: string[];
  note: string;
}

export interface GroundedLlmCitation {
  doc_title: string;
  version_label: string;
  page_number: number;
  quoted_span: string;
}

export interface GroundedLlmOutput {
  sufficient_evidence: boolean;
  answer: string;
  citations: GroundedLlmCitation[];
}

export const OLLAMA_EMBED_DIMS = 768;

function getOllamaUrl(): string {
  const raw = (process.env.OLLAMA_URL?.trim() || 'http://localhost:11434').replace(/\/+$/, '');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('OLLAMA_URL must use http or https.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

export function getOllamaModels(): { chatModel: string; embedModel: string } {
  return {
    chatModel: (process.env.OLLAMA_MODEL ?? 'llama3.1:8b').trim() || 'llama3.1:8b',
    embedModel: (process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text').trim() || 'nomic-embed-text',
  };
}

let cachedProbe: { at: number; result: OllamaProbeResult } | null = null;

export async function probeOllama(forceRefresh = false): Promise<OllamaProbeResult> {
  if (!forceRefresh && cachedProbe && Date.now() - cachedProbe.at < 10_000) {
    return cachedProbe.result;
  }

  const url = getOllamaUrl();
  const { chatModel, embedModel } = getOllamaModels();

  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(700),
    });
    if (!res.ok) {
      const fail: OllamaProbeResult = {
        available: false,
        url,
        chat_model: chatModel,
        embed_model: embedModel,
        installed_models: [],
        note: `Ollama responded with HTTP ${res.status} at ${url}.`,
      };
      cachedProbe = { at: Date.now(), result: fail };
      return fail;
    }
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const installed = (data.models ?? []).map((m) => m.name);
    const ok: OllamaProbeResult = {
      available: true,
      url,
      chat_model: chatModel,
      embed_model: embedModel,
      installed_models: installed,
      note: `Connected to local Ollama (${installed.length} model(s) ready).`,
    };
    cachedProbe = { at: Date.now(), result: ok };
    return ok;
  } catch {
    const offline: OllamaProbeResult = {
      available: false,
      url,
      chat_model: chatModel,
      embed_model: embedModel,
      installed_models: [],
      note: `Ollama not detected at ${url} (cloud preview uses Gemini; local git clone connects to Ollama automatically).`,
    };
    cachedProbe = { at: Date.now(), result: offline };
    return offline;
  }
}

/**
 * Deterministic 768-dim L2-normalized feature-hashing vector used when Ollama
 * is not reachable (such as cloud sandbox preview) so vector search geometry
 * stays exact and consistent with nomic-embed-text 768 dimensions.
 */
export function deterministicEmbed768(text: string): number[] {
  const vec = new Float64Array(OLLAMA_EMBED_DIMS);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9.%/-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

  for (const tok of tokens) {
    const h = crypto.createHash('sha256').update(tok).digest();
    const idx1 = h.readUInt16BE(0) % OLLAMA_EMBED_DIMS;
    const idx2 = h.readUInt16BE(2) % OLLAMA_EMBED_DIMS;
    const sign1 = h[4] % 2 === 0 ? 1 : -1;
    const sign2 = h[5] % 2 === 0 ? 1 : -1;
    vec[idx1] += sign1 * 1.0;
    vec[idx2] += sign2 * 0.5;
  }

  let normSq = 0;
  for (let i = 0; i < OLLAMA_EMBED_DIMS; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  return Array.from(vec, (v) => Number((v / norm).toFixed(6)));
}

export async function embedTextWithOllamaOrFallback(
  text: string
): Promise<{ vector: number[]; source: string }> {
  const probe = await probeOllama();
  if (!probe.available) {
    return {
      vector: deterministicEmbed768(text),
      source: 'Deterministic 768-dim fallback (Ollama offline in preview)',
    };
  }

  const url = getOllamaUrl();
  const { embedModel } = getOllamaModels();
  try {
    const res = await fetch(`${url}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embedModel, input: text }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { embeddings?: number[][] };
      const vec = data.embeddings?.[0];
      if (Array.isArray(vec) && vec.length > 0) {
        return { vector: vec, source: `Ollama (${embedModel})` };
      }
    }
  } catch {
    // Fall back cleanly if embedding model has not been pulled yet
  }

  return {
    vector: deterministicEmbed768(text),
    source: `Deterministic 768-dim fallback (pull '${embedModel}' in Ollama for neural embeddings)`,
  };
}

export async function ollamaGenerateGroundedAnswer(
  systemInstruction: string,
  promptPayload: string
): Promise<GroundedLlmOutput> {
  const url = getOllamaUrl();
  const { chatModel } = getOllamaModels();

  const schema = {
    type: 'object',
    properties: {
      sufficient_evidence: { type: 'boolean' },
      answer: { type: 'string' },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doc_title: { type: 'string' },
            version_label: { type: 'string' },
            page_number: { type: 'integer' },
            quoted_span: { type: 'string' },
          },
          required: ['doc_title', 'version_label', 'page_number', 'quoted_span'],
        },
      },
    },
    required: ['sufficient_evidence', 'answer', 'citations'],
  };

  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chatModel,
      stream: false,
      format: schema,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: promptPayload },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Local Ollama (${chatModel}) returned HTTP ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const raw = (data.message?.content ?? '{}').trim();
  return JSON.parse(raw) as GroundedLlmOutput;
}
