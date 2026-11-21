export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(input, init);
  const raw = await res.text();

  const trimmed = raw.trim();
  const looksLikeHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html');

  if (looksLikeHtml) {
    throw new Error(
      `The server proxy returned an HTML page instead of JSON (HTTP ${res.status}). Wait a moment and try again.`
    );
  }

  let parsed: unknown;
  try {
    parsed = trimmed ? JSON.parse(trimmed) : {};
  } catch {
    throw new Error(
      `Invalid server response (HTTP ${res.status}): ${trimmed.slice(0, 140) || 'empty body'}`
    );
  }

  if (!res.ok) {
    const errMessage =
      typeof (parsed as { error?: unknown })?.error === 'string'
        ? (parsed as { error: string }).error
        : `Request failed (HTTP ${res.status})`;
    throw new Error(errMessage);
  }

  return { ok: res.ok, status: res.status, data: parsed as T };
}
