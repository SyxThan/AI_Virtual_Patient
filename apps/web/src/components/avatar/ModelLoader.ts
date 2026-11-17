import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACO_DECODER_PATH, MODEL_URL } from "./avatarContract";
import { prefetchModelBytes } from "./modelBytes";

export { onModelProgress } from "./modelBytes";

/**
 * Parses a clinic model (mother_child.glb, or an avp-case-scene/1 `<caseId>.glb`;
 * Draco, decoder self-hosted under /draco/ so the app
 * works offline and needs no third-party CDN). The bytes come from the shared
 * download in modelBytes.ts; each scene parses its own copy (cheap, ~300 KB)
 * because three.js objects can belong to one scene only.
 */

let draco: DRACOLoader | null = null;
function dracoLoader(): DRACOLoader {
  // One decoder (and its worker pool) shared by every scene for the page's lifetime.
  draco ??= new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH).setDecoderConfig({ type: "wasm" });
  return draco;
}

export async function loadClinicModel(url: string = MODEL_URL): Promise<GLTF> {
  const bytes = await prefetchModelBytes(url);
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader());
  // Parse a copy: Draco hands buffers to workers, and the cache must stay intact.
  return loader.parseAsync(bytes.slice(0), "");
}
