# UI design system: "Bento Clinical" v2 (Slice 15, AVP-141)

Agent-facing spec for the web design. The human chose direction C (bento grid) on 2026-11-14; v2 (2026-11-16, AVP-141) keeps the grid and the palette and adds a display face, depth and one hero stage, because the v1 pages read as plain. Tokens live in `apps/web/src/app/globals.css` (`@theme`); primitives in `apps/web/src/components/ui/`. No new npm dependencies: Tailwind v4 utilities and these primitives only.

## Palette (all text pairs >= 4.5:1, checked)
| Token (Tailwind class stem) | Hex | Use |
|---|---|---|
| `canvas` | #EEF3F2 | page background (mineral grey-green); `body` adds two soft radial glows (mint, sky) at the top |
| `surface` | #FFFFFF | cards, header, light tiles |
| `ink` / `ink-deep` / `ink-muted` | #10231F / #071A18 / #4A5E59 | text; dark stage tiles use the `tile-ink` gradient (`#123A36` to `ink` to `ink-deep`) with one mint glow |
| `ink-inverse-muted` | #B8CCC7 | secondary text on `ink` |
| `line` / `line-strong` | #D5E0DD / #A9BBB6 | borders, control outlines |
| `primary` / `primary-strong` / `primary-soft` | #0A6E69 / #07524E / #D5EFEB | the one action color (clinical teal), hover, tint; `tile-primary` is its gradient |
| `glow` | #5EEAD4 | decorative only: hero glow, waveforms, the score ring. Never text on a light surface |
| `info` / `info-soft` | #1F5FBF / #E2ECFA | information, "sky" tiles |
| `mint-soft` + `mint-ink` | #DCF2E6 + #14532D | calm tiles, success-like tiles |
| `sand-soft` + `sand-ink` | #F5EDDC + #6B4A12 | warm tiles (pediatric context); the mother's speech bubbles |
| `danger(-soft)` | #B42318 / #FDECEA | red flags and destructive actions ONLY |
| `warning(-soft)` | #9A4A06 / #FCF1E3 | partial, pending, time running out |
| `success(-soft)` | #116B3D / #DCF2E6 | met criteria, saved |

Rules: one `primary` call to action per view. Red never decorates. Status is never color-only (text or icon too). Radii carry hierarchy: `rounded-tile` (28px) frames a screen region, `rounded-card` (16px) holds content, `rounded-control` (12px) for inputs and buttons, `rounded-full` for pills and the header.

Depth (v2): `surface` tiles are lifted (`ring-1 ring-line/70` + `shadow-lift`); tinted tiles stay flat; `ink` stages get `shadow-stage`. Do not add `border border-line` to a surface Tile (it already has the hairline). No other shadows.

## Type
Two families, both with the Vietnamese subset, self-hosted by `next/font/google` in `app/layout.tsx`:
- **Bricolage Grotesque** (`font-display`, variable, `opsz` + `wdth` axes): every h1/h2, tile titles, big numbers (score, metric values). Weight 700. `PAGE_TITLE` in `PageShell.tsx` is the shared h1 treatment (`text-3xl sm:text-4xl`); landing hero `text-4xl sm:text-5xl lg:text-6xl leading-[1.02]`; tile title `text-2xl`.
- **Be Vietnam Pro** (`font-sans`): everything else, 400–800. Body `text-base`; caption `text-sm text-ink-muted`.
Numbers (vitals, timer, scores) add `tabular`. Sentence case; no all-caps eyebrow labels, no `·`-joined meta strings, no `→` on buttons (frontend-design skill). Line length <= 68ch (`max-w-prose`).

## Primitives (`components/ui/`)
- `Button` / `buttonClass({variant, size, pill})`: variants `primary | secondary | ghost | danger | inverse` (inverse = on `ink` tiles); sizes `sm` (dense only) `md` `lg` (md/lg >= 44px). Use `buttonClass` on `<Link>`. Buttons sink 1px on press.
- `Tile` (`tone`: `surface | ink | primary | mint | sky | sand`, `compact`, `as`) + `TILE_MUTED[tone]` for secondary text. A bento grid is `grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (or 6/12) with `col-span-*`/`row-span-*`; it collapses to one column on phones. Tiles are `relative`, so a decorative glyph can sit in a corner (`absolute`, `aria-hidden`).
- `Card` (`as`, `padded`), `Badge` (`tone`: `neutral | primary | info | success | warning | danger`).
- `PageShell` (`title`, `description`, `actions`, `width: narrow | default | wide`) + `PAGE_TITLE`: renders the page's single `<main id="main">`.
- `shell/BrandMark`: the app mark (speech bubble with a pulse line) used by the header and footer.
- Existing: `Modal`, `useFocusTrap`, `FOCUS_RING` / `FOCUS_RING_DARK` (teal), `SignedInLink`.

## Signature pieces (v2)
- **Hero stage** (`landing/HeroTile` + `landing/ConversationStage`): the landing's one bold element. A real exchange from the HFMD case (the chief complaint, one student question, one answer consistent with the case) staged as in the workspace: mother bubbles in `sand-soft`, the student in `primary`, a hold-to-talk pill with a `glow` waveform. One orchestrated reveal on load (`animate-rise` with staggered delays); nothing moves under `prefers-reduced-motion`. Lines live in `vi.json` `landing.stage` and must stay consistent with `data/cases/case-01-hfmd.json` (Hard rule 1: nothing invented).
- **Feature glyphs** (`landing/glyphs.tsx`): drawn SVGs of each feature's own material (waveform, child's hand with vesicle dots, checklist with a quote, cited page, score line). Decorative, `currentColor`.
- **Score ring** (`debrief/ScoreSummaryCard`): the API's total inside a `glow` ring gauge (`role="progressbar"`); a missing score shows a dash and an empty ring.
- **Mother's voice**: in the workspace and the hero, everything the mother says sits on `sand-soft`; the student on `primary`; recorded exam findings stay the sand system strip.
- Motion tokens: `animate-rise`, `animate-wave`, `animate-breathe` (globals.css). Use them only for the hero reveal, live waveforms and the "answering" dot; no hover motion on cards.

## Quality floor (every page)
Phone width 360px with 16px gutters and no horizontal scroll; visible focus; `prefers-reduced-motion` respected (global rule in globals.css, also zeroes animation delays); axe: no serious/critical issues; strings in `messages/vi.json`; practice-feedback wording only (ADR-0010: no "chứng chỉ/chứng nhận/certificate"); no invented clinical numbers: placeholders show `—`, values come from the API; no invented metrics (Hard rule 3): the landing shows no counts or percentages.

## Out of scope
The 3D avatar scene is owned by Slice 19 (AVP-140, `docs/specs/avatar-asset.md`, `avatar-3d` skill); v2 only restyles the frames around `AvatarCanvas`.
