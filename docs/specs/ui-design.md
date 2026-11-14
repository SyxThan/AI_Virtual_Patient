# UI design system: "Bento Clinical" (Slice 15)

Agent-facing spec for the web redesign. The human chose direction C (bento grid) on 2026-11-14. Tokens live in `apps/web/src/app/globals.css` (`@theme`); primitives in `apps/web/src/components/ui/`. No new npm dependencies: Tailwind v4 utilities and these primitives only.

## Palette (all text pairs >= 4.5:1, checked)
| Token (Tailwind class stem) | Hex | Use |
|---|---|---|
| `canvas` | #EEF3F2 | page background (mineral grey-green) |
| `surface` | #FFFFFF | cards, header, light tiles |
| `ink` / `ink-muted` | #10231F / #4A5E59 | text; dark hero tile background (`ink`) |
| `ink-inverse-muted` | #B8CCC7 | secondary text on `ink` |
| `line` / `line-strong` | #D5E0DD / #A9BBB6 | borders, control outlines |
| `primary` / `primary-strong` / `primary-soft` | #0A6E69 / #07524E / #D5EFEB | the one action color (clinical teal), hover, tint |
| `info` / `info-soft` | #1F5FBF / #E2ECFA | information, "sky" tiles |
| `mint-soft` + `mint-ink` | #DCF2E6 + #14532D | calm tiles, success-like tiles |
| `sand-soft` + `sand-ink` | #F5EDDC + #6B4A12 | warm tiles (pediatric context) |
| `danger(-soft)` | #B42318 / #FDECEA | red flags and destructive actions ONLY |
| `warning(-soft)` | #9A4A06 / #FCF1E3 | partial, pending, time running out |
| `success(-soft)` | #116B3D / #DCF2E6 | met criteria, saved |

Rules: one `primary` call to action per view. Red never decorates. Status is never color-only (text or icon too). Radii carry hierarchy: `rounded-tile` (28px) frames a screen region, `rounded-card` (16px) holds content, `rounded-control` (12px) for inputs and buttons, `rounded-full` for pills and the header.

## Type
Be Vietnam Pro (built for Vietnamese diacritics) via `next/font/google` in `app/layout.tsx`, weights 400–800, one family. Scale: page title `text-2xl sm:text-3xl font-bold tracking-tight`; landing hero up to `text-5xl sm:text-6xl font-extrabold tracking-tight`; tile title `text-xl font-bold`; body `text-base`; caption `text-sm text-ink-muted`. Numbers (vitals, timer, scores) add `tabular`. Sentence case; no all-caps eyebrow labels, no `·`-joined meta strings, no `→` on buttons (frontend-design skill).

## Primitives (`components/ui/`)
- `Button` / `buttonClass({variant, size, pill})`: variants `primary | secondary | ghost | danger | inverse` (inverse = on `ink` tiles); sizes `sm` (dense only) `md` `lg` (md/lg >= 44px). Use `buttonClass` on `<Link>`.
- `Tile` (`tone`: `surface | ink | primary | mint | sky | sand`, `compact`, `as`) + `TILE_MUTED[tone]` for secondary text. A bento grid is `grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (or 6/12) with `col-span-*`/`row-span-*`; it collapses to one column on phones.
- `Card` (`as`, `padded`), `Badge` (`tone`: `neutral | primary | info | success | warning | danger`).
- `PageShell` (`title`, `description`, `actions`, `width: narrow | default | wide`): renders the page's single `<main id="main">`.
- Existing: `Modal`, `useFocusTrap`, `FOCUS_RING` / `FOCUS_RING_DARK` (now teal), `SignedInLink`.

## Quality floor (every page)
Phone width 360px with 16px gutters and no horizontal scroll; visible focus; `prefers-reduced-motion` respected (global rule in globals.css); axe: no serious/critical issues; strings in `messages/vi.json`; practice-feedback wording only (ADR-0010: no "chứng chỉ/chứng nhận/certificate"); no invented clinical numbers: placeholders show `—`, values come from the API.

## Out of scope for Slice 15
The 3D avatar scene (`components/avatar/AvatarScene.tsx`, `AnatomyColliders.ts`, `LipSyncController.ts`) stays as it is; the human rebuilds it later. Pages only restyle the frame around `AvatarCanvas`.
