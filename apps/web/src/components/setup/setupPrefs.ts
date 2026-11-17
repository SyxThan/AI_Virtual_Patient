/**
 * Setup choices remembered between visits (role and mode only). Consent is never
 * stored: the learner ticks it again for every session (Hard Rule 6).
 * Pure helpers so `node --test` can check them without a browser.
 */

export type Role = "student" | "resident" | "practitioner";
export type Mode = "guided" | "exam";

export const ROLES: readonly Role[] = ["student", "resident", "practitioner"];
export const MODES: readonly Mode[] = ["guided", "exam"];

export const PREFS_KEY = "avp_setup_prefs_v1";

export type SetupPrefs = { role: Role; mode: Mode };

export const DEFAULT_PREFS: SetupPrefs = { role: "student", mode: "guided" };

/** Parses a stored value; anything unknown or malformed falls back field by field. */
export function parsePrefs(raw: string | null | undefined): SetupPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return DEFAULT_PREFS;
    const o = v as Record<string, unknown>;
    return {
      role: ROLES.includes(o.role as Role) ? (o.role as Role) : DEFAULT_PREFS.role,
      mode: MODES.includes(o.mode as Mode) ? (o.mode as Mode) : DEFAULT_PREFS.mode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Serialises only role and mode, whatever else the caller passes. */
export function serializePrefs(p: SetupPrefs): string {
  return JSON.stringify({ role: p.role, mode: p.mode });
}

/** Reads the stored choices; storage may be missing or throw (private mode, blocked cookies). */
export function loadPrefs(): SetupPrefs {
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: SetupPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, serializePrefs(p));
  } catch {
    // Not remembering is fine.
  }
}

/* Tiny external store so React reads the stored choices without a setState-in-effect. */
const listeners = new Set<() => void>();
let current: SetupPrefs | null = null;

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Client snapshot (stable object until the next change). The server snapshot is DEFAULT_PREFS. */
export function getPrefsSnapshot(): SetupPrefs {
  current ??= loadPrefs();
  return current;
}

export function updatePrefs(patch: Partial<SetupPrefs>): void {
  current = { ...getPrefsSnapshot(), ...patch };
  savePrefs(current);
  listeners.forEach((fn) => fn());
}

/** Enter starts the session only when focus is not on something Enter already acts on. */
export function enterStartsSession(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target || !target.tagName) return true;
  if (target.isContentEditable) return false;
  return !["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(target.tagName.toUpperCase());
}
