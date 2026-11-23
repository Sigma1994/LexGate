import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { RegulatoryLedger } from './ledger.ts';
import { getOllamaModels, probeOllama } from './ollamaClient.ts';
import { hasConfiguredGeminiKey } from './pipeline.ts';

const GEMINI_SUMMARY_MODEL = 'gemini-4-hydrogen';
const GEMINI_SUMMARY_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const SUMMARY_SYSTEM_INSTRUCTION = `You are a regulatory policy editor for a financial compliance workbench.
Summarize the provided policy document in 2 to 3 concise, clear plain-text sentences.
Highlight its scope, key quantitative limits/obligations, and deadlines or affected institutions.
Output only the 2-3 sentence plain-text summary—no markdown headings, no bullet points, and no preamble.`;

interface CachedSummaryEntry {
  text: string;
  model: string;
  generated_at: string;
}

const summaryCacheByHash = new Map<string, CachedSummaryEntry>();

function getGeminiSummaryClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Start local Ollama or configure GEMINI_API_KEY to generate AI summaries.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getOllamaBaseUrl(): string {
  return (process.env.OLLAMA_URL?.trim() || 'http://localhost:11434').replace(/\/+$/, '');
}

async function generateSummaryWithOllama(prompt: string): Promise<{ text: string; model: string }> {
  const url = getOllamaBaseUrl();
  const { chatModel } = getOllamaModels();
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chatModel,
      stream: false,
      options: { temperature: 0.1 },
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Local Ollama (${chatModel}) returned HTTP ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const text = (data.message?.content ?? '').trim().replace(/\s+/g, ' ');
  if (!text) {
    throw new Error(`Local Ollama (${chatModel}) returned an empty summary.`);
  }
  return { text, model: `ollama/${chatModel}` };
}

function isTransientUpstreamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    lower.includes('high demand') ||
    lower.includes('timeout')
  );
}

async function generateSummaryWithGemini(prompt: string): Promise<{ text: string; model: string }> {
  const ai = getGeminiSummaryClient();

  const callModel = async (modelName: string) =>
    ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
        ...(modelName === GEMINI_SUMMARY_MODEL
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    });

  let modelUsed = GEMINI_SUMMARY_MODEL;
  let response;
  try {
    response = await callModel(GEMINI_SUMMARY_MODEL);
  } catch (firstErr) {
    if (!isTransientUpstreamError(firstErr)) {
      throw firstErr;
    }
    await new Promise((r) => setTimeout(r, 600));
    modelUsed = GEMINI_SUMMARY_FALLBACK_MODEL;
    try {
      response = await callModel(GEMINI_SUMMARY_FALLBACK_MODEL);
    } catch (secondErr) {
      if (!isTransientUpstreamError(secondErr)) {
        throw secondErr;
      }
      await new Promise((r) => setTimeout(r, 1400));
      modelUsed = GEMINI_SUMMARY_MODEL;
      try {
        response = await callModel(GEMINI_SUMMARY_MODEL);
      } catch (thirdErr) {
        if (!isTransientUpstreamError(thirdErr)) {
          throw thirdErr;
        }
        await new Promise((r) => setTimeout(r, 2000));
        modelUsed = GEMINI_SUMMARY_FALLBACK_MODEL;
        response = await callModel(GEMINI_SUMMARY_FALLBACK_MODEL);
      }
    }
  }

  const text = (response.text ?? '').trim().replace(/\s+/g, ' ');
  if (!text) {
    throw new Error(`${modelUsed} returned an empty summary.`);
  }
  return { text, model: modelUsed };
}

export async function ensureLedgerDocumentSummary(
  ledger: RegulatoryLedger,
  docId: string,
  options?: { force?: boolean }
): Promise<{
  ok: boolean;
  summary?: string;
  model?: string;
  generated_at?: string;
  error?: string;
}> {
  const ctx = ledger.getDocumentSummaryContext(docId);
  if (!ctx) {
    return { ok: false, error: 'Document not found.' };
  }

  if (!options?.force && ctx.doc.ai_summary) {
    return {
      ok: true,
      summary: ctx.doc.ai_summary,
      model: ctx.doc.ai_summary_model ?? undefined,
      generated_at: ctx.doc.ai_summary_generated_at ?? undefined,
    };
  }

  if (!options?.force && ctx.contentHash) {
    const cached = summaryCacheByHash.get(ctx.contentHash);
    if (cached) {
      ledger.setDocumentSummary(docId, cached);
      return {
        ok: true,
        summary: cached.text,
        model: cached.model,
        generated_at: cached.generated_at,
      };
    }
  }

  if (!ctx.excerpt.trim()) {
    const msg = 'No clean indexed text available to summarize (check Safety Hold).';
    ledger.setDocumentSummary(docId, { error: msg });
    return { ok: false, error: msg };
  }

  const prompt = `Document Title: ${ctx.doc.title}
Citation Code: ${ctx.doc.citation_code}
Version: ${ctx.versionLabel}

Policy Excerpt:
${ctx.excerpt}`;

  try {
    const providerPref = (process.env.LLM_PROVIDER ?? 'auto').trim().toLowerCase();
    const ollamaStatus = await probeOllama();
    const geminiReady = hasConfiguredGeminiKey();
    const useOllama =
      providerPref === 'ollama' ||
      (providerPref === 'auto' && ollamaStatus.available && !geminiReady);

    let generated: { text: string; model: string };
    if (useOllama) {
      if (!ollamaStatus.available) {
        throw new Error(`Local Ollama is unreachable at ${ollamaStatus.url}.`);
      }
      generated = await generateSummaryWithOllama(prompt);
    } else {
      generated = await generateSummaryWithGemini(prompt);
    }

    const generatedAt = new Date().toISOString();
    const entry: CachedSummaryEntry = {
      text: generated.text,
      model: generated.model,
      generated_at: generatedAt,
    };
    if (ctx.contentHash) {
      summaryCacheByHash.set(ctx.contentHash, entry);
    }
    ledger.setDocumentSummary(docId, entry);

    return {
      ok: true,
      summary: entry.text,
      model: entry.model,
      generated_at: entry.generated_at,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to generate AI summary.';
    ledger.setDocumentSummary(docId, { error: message });
    return { ok: false, error: message };
  }
}
