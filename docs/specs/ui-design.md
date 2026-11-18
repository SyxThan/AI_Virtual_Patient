# UI design system: "Bento Clinical" v2 (Slice 15, AVP-141)

Agent-facing spec for the web design. The human chose direction C (bento grid) on 2026-11-14; v2 (2026-11-16, AVP-141) keeps the grid and the palette and adds a display face, depth and one hero stage, because the v1 pages read as plain. Tokens live in `apps/web/src/app/globals.css` (`@theme`); primitives in `apps/web/src/components/ui/`. Dependencies: Tailwind v4 utilities, these primitives, and `motion` (added on 2026-11-16 at the human's request for the landing animations, AVP-142). Nothing else.

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
- **Debrief (`/debrief/[id]`, AVP-169)**: reads top to bottom as numbered steps (`debrief/StepHeading`): 1 Tổng quan (red-flag banner listing the case's own missed critical criteria as `#crit-<id>` links, never hard-coded per case; score ring + counts; per-domain "x/y đạt" bars), 2 Phản hồi sư phạm (full width: approach and rationale left, errors / learning points / alternatives right), 3 Bảng kiểm chi tiết (filter "Cần cải thiện" by default when anything is missed, groups by rubric `domain` in interview order, misses first; each row opens its evidence quotes and the claims cited for that criterion; critical misses start open), 4 Nhận xét chung (only claims with no known criterion), then Tiếp theo with the grading versions at the bottom. No sticky elements. Pure logic in `debrief/debriefHelpers.ts` (node tests).
- **Workspace (`/session/[id]`, AVP-143)**: an app frame exactly one viewport tall with no page scroll and no site header/footer (`ChromeGate`). 56 px top bar; the 3D stage fills the rest of the width with floating controls; the right column (tabs "Trò chuyện" / "Phiếu khám", pinned input, reminder drawer) is `clamp(360px, 30vw, 460px)`, resizable and collapsible from 1280 px, 340 px fixed from 1024 px, below the stage from 768 px and a three-step bottom sheet under 768 px. Overlays that follow the model write only `transform`.
- **Mother's voice**: in the workspace and the hero, everything the mother says sits on `sand-soft`; the student on `primary`; recorded exam findings stay the sand system strip.
- Motion tokens: `animate-rise`, `animate-wave`, `animate-breathe` (globals.css), plus the landing motion system below.

## Landing motion (AVP-142)
The human asked for a landing page "in motion" on 2026-11-16 and overrode the one-autoplay rule for the landing only. Other pages keep the v2 rule (no hover motion on cards, no decorative loops).
- **Tokens** (`:root` in globals.css): `--dur-fast` 150ms (hover, press), `--dur-base` 350ms (reveals, state), `--dur-slow` 700ms (title lines), `--dur-draw` 1600ms (ECG draw); `--ease-out` cubic-bezier(0.22,1,0.36,1) for entrances, `--ease-in-out` cubic-bezier(0.65,0,0.35,1) for loops. `--color-monitor` #F2C14E: ECG trace and vitals values on dark stages only.
- **What moves:** hero title lines rise from masks (90 ms apart), lead and buttons fade in after; `EcgMonitor` draws itself then sweeps every 4 s (head dot, fading trail, halo on each R peak), +20% on start-button hover, 2 s burst on the sample red flag; the vitals below show the case's triage values (pulse wobbles 1-2 on screen, `TODO(nhóm)`); `ConversationStage` replays a 10 s exchange taken verbatim from the case (typing, speaking bars, red-flag pop) with a pause button; `FeatureArt` per feature (plays once in view, replays on hover); sections reveal once (`data-reveal` + `RevealObserver`); "Cách hoạt động" pins on desktop with a scroll-filled rail and a cross-fading preview (`StepMockups`); nav tightens after 80 px (landing only, sticky); primary buttons lift 2 px; `.link-draw` underlines redraw; big cards tilt <= 3 deg (`TiltCard`, fine pointers only).
- **Rules:** animate only transform, opacity, stroke-dashoffset, clip-path. Hidden start states live behind `html.js` (set by an inline head script) so everything shows without JavaScript. Loops carry `data-paused` from `useActive` (off screen or hidden tab) and only loop classes pause; one-shot entrances always finish. Reduced motion: no loops, no scroll or entrance motion, final states, 150 ms opacity fades only; the conversation shows in full and its pause button hides. Every animated box has its size from the first paint (CLS 0 measured). The clinical notices and device requirements never animate.
- **Shared hooks:** `hooks/useMotionPrefs.ts` (`useReducedMotion`, `useInView`, `usePageVisible`, `useActive`).

## Case library / Thư viện ca (Slice 20, AVP-146)
Approved by the Product Owner on 2026-11-17. Full design and task split: `docs/tasks.md` Slice 20. Card data comes from the case's `catalog` block (`docs/specs/case-schema.md`) through `GET /api/v1/cases`.
- **Flow:** "Bắt đầu luyện tập" (landing, header) → `/cases` "Thư viện ca bệnh" → click a card → `/setup?case=<id>`. Setup keeps the AVP-145 layout; only the case profile follows the chosen case. `/setup` without a valid `case` redirects to `/cases`.
- **Cards hide the diagnosis.** A card shows `catalog.display_complaint` (the chief complaint, verbatim from the case) and patient facts, never the disease name: that would give away the OSCE answer. Practice mode has a "Hiện tên bệnh" switch (remembered in localStorage, wrapped in try/catch); Thi thử always hides it; history and debrief show the name after the session.
- **Card content:** age, sex, who answers ("Mẹ trả lời" or "Tự trả lời"), suggested duration (only when `estimated_minutes` is set; never invented), exam type badge "3D" or "Ảnh 2D", times practised and last score when signed in. Cover image from `catalog.cover`. A `review.status = draft` case always shows a `warning` Badge "Nháp, chưa bác sĩ duyệt" with an icon, not color only (Hard rule 2).
- **Filters:** patient-group chips (`catalog.patient_group`: Tất cả, Trẻ em, Người lớn, Người cao tuổi), specialty select, "Chỉ ca chưa luyện" (signed in only, from `GET /sessions`), sort ("Gợi ý" = `catalog.order`). Filters live in the URL (`?group=child`) so links can be shared.
- **States:** loading = 6 skeleton cards with fixed sizes (no layout shift); API error = message plus "Thử lại"; no match = empty message plus "Xoá bộ lọc".
- **Layout:** bento grid of `surface` Tiles, 1 column under 640px, 2 from 640px (`sm`), 3 from 1024px (`lg`). One `primary` action per view.
- **Accessibility:** the whole card is one `<a>` (no nested interactive elements); filter chips are buttons with `aria-pressed`, reachable by keyboard; visible focus; axe 0 errors at 375px and 1440px.
- **2D exam stage** (cases with `catalog.exam_mode = "2d"`): `ClinicStage` shows an illustration of the patient with hotspots from `catalog.exam_regions` (x/y are 0..1 of the image). Each hotspot is a labelled button; clicking one calls the existing `POST /sessions/{id}/actions`, and the result card (`ExamResultCard`, number shortcuts) shows text from `exam[]` only, never LLM output. Illustrations are drawn, never real patient photos. Voice, scoring and debrief are unchanged. `3d` keeps the mother-and-child scene.

## Quality floor (every page)
Phone width 360px with 16px gutters and no horizontal scroll; visible focus; `prefers-reduced-motion` respected (global rule in globals.css, also zeroes animation delays); axe: no serious/critical issues; strings in `messages/vi.json`; practice-feedback wording only (ADR-0010: no "chứng chỉ/chứng nhận/certificate"); no invented clinical numbers: placeholders show `—`, values come from the API; no invented metrics (Hard rule 3): the landing shows no counts or percentages.

## Out of scope
The 3D avatar scene is owned by Slice 19 (AVP-140, `docs/specs/avatar-asset.md`, `avatar-3d` skill); v2 only restyled the frames around the stage; since AVP-143 the stage is `ClinicStage` inside the full-viewport workspace.
