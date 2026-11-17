import { MODEL_URL } from "./avatarContract";

/**
 * One download per model URL (mother_child.glb for HFMD, `/models/<caseId>.glb`
 * for an avp-case-scene/1 case), shared for the page's lifetime.
 *
 * This module must NOT import three.js: ClinicStage (in the main chunk) calls
 * `prefetchModelBytes()` on mount so the model downloads while the three.js
 * chunk is still loading. StrictMode remounts and later scenes reuse the same
 * promise instead of downloading again.
 */

export type LoadProgress = (fraction: number) => void;

type Entry = { promise: Promise<ArrayBuffer> | null; listeners: Set<LoadProgress>; last: number };
const entries = new Map<string, Entry>();

function entry(url: string): Entry {
  let e = entries.get(url);
  if (!e) {
    e = { promise: null, listeners: new Set(), last: 0 };
    entries.set(url, e);
  }
  return e;
}

function emit(e: Entry, fraction: number) {
  e.last = fraction;
  e.listeners.forEach((fn) => fn(fraction));
}

async function download(url: string, e: Entry): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    emit(e, 1);
    return buf;
  }
  // Stream so the loading bar moves; content-length may be the compressed size,
  // so it only drives the bar, never the buffer size.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    emit(e, Math.min(0.99, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  emit(e, 1);
  return out.buffer;
}

/** Start (or join) the single download of `url`. A failure clears the cache so a remount retries. */
export function prefetchModelBytes(url: string = MODEL_URL): Promise<ArrayBuffer> {
  const e = entry(url);
  if (!e.promise) {
    e.promise = download(url, e).catch((err: unknown) => {
      e.promise = null;
      emit(e, 0);
      throw err;
    });
  }
  return e.promise;
}

/** Subscribe to download progress (0..1) of `url`. Returns an unsubscribe function. */
export function onModelProgress(fn: LoadProgress, url: string = MODEL_URL): () => void {
  const e = entry(url);
  e.listeners.add(fn);
  fn(e.last);
  return () => {
    e.listeners.delete(fn);
  };
}
