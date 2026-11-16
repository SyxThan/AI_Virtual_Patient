import { MODEL_URL } from "./avatarContract";

/**
 * Single download of mother_child.glb, shared for the page's lifetime.
 *
 * This module must NOT import three.js: AvatarCanvas (in the main chunk) calls
 * `prefetchModelBytes()` on mount so the ~300 KB model downloads while the
 * three.js chunk is still loading. StrictMode remounts and later scenes reuse
 * the same promise instead of downloading again.
 */

export type LoadProgress = (fraction: number) => void;

let bytesPromise: Promise<ArrayBuffer> | null = null;
const listeners = new Set<LoadProgress>();
let lastFraction = 0;

function emit(fraction: number) {
  lastFraction = fraction;
  listeners.forEach((fn) => fn(fraction));
}

async function download(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    emit(1);
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
    emit(Math.min(0.99, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  emit(1);
  return out.buffer;
}

/** Start (or join) the single model download. A failure clears the cache so a remount retries. */
export function prefetchModelBytes(): Promise<ArrayBuffer> {
  if (!bytesPromise) {
    bytesPromise = download(MODEL_URL).catch((err: unknown) => {
      bytesPromise = null;
      emit(0);
      throw err;
    });
  }
  return bytesPromise;
}

/** Subscribe to download progress (0..1). Returns an unsubscribe function. */
export function onModelProgress(fn: LoadProgress): () => void {
  listeners.add(fn);
  fn(lastFraction);
  return () => {
    listeners.delete(fn);
  };
}
