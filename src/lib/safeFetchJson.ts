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

export function postFormDataWithProgress<T = unknown>(
  url: string,
  formData: FormData,
  onProgress?: (pct: number, phase: 'uploading' | 'vectorizing') => void
): Promise<{ ok: boolean; status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(55, Math.max(10, Math.round((event.loaded / event.total) * 55)));
        onProgress(pct, 'uploading');
      } else {
        onProgress(35, 'uploading');
      }
    };

    xhr.upload.onloadend = () => {
      onProgress?.(76, 'vectorizing');
    };

    xhr.onload = () => {
      const raw = xhr.responseText ?? '';
      const trimmed = raw.trim();
      const looksLikeHtml =
        trimmed.startsWith('<!doctype') ||
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<html');

      if (looksLikeHtml) {
        reject(
          new Error(
            `The server proxy returned an HTML page instead of JSON (HTTP ${xhr.status}). Wait a moment and try again.`
          )
        );
        return;
      }

      let parsed: unknown;
      try {
        parsed = trimmed ? JSON.parse(trimmed) : {};
      } catch {
        reject(
          new Error(
            `Invalid server response (HTTP ${xhr.status}): ${trimmed.slice(0, 140) || 'empty body'}`
          )
        );
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const errMessage =
          typeof (parsed as { error?: unknown })?.error === 'string'
            ? (parsed as { error: string }).error
            : `Request failed (HTTP ${xhr.status})`;
        reject(new Error(errMessage));
        return;
      }

      resolve({ ok: true, status: xhr.status, data: parsed as T });
    };

    xhr.onerror = () => reject(new Error('Network error while uploading file.'));
    xhr.onabort = () => reject(new Error('File upload was cancelled.'));
    xhr.send(formData);
  });
}
