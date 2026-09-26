# Brand Guide — StratVeda OS Revenue Intelligence Agent

> **Owner:** Product & Design
> **Last updated:** September 2026
> **Applies to:** marketing site, dashboard, documentation, and all product surfaces.

This guide defines how the **Revenue Intelligence Agent** product under the **StratVeda OS** brand is presented. It is the single source of truth for naming, color, typography, spacing, and voice. When in doubt, match the shipped design tokens in `frontend/app/globals.css`.

---

## 1. Brand Fundamentals

### 1.1 Identity

| Element | Value |
| --- | --- |
| Corporate brand | **StratVeda OS** |
| Product name | **Revenue Intelligence Agent** |
| Short name (in-app) | **Revenue Agent** |
| Product domain | `https://revops.stratvedatech.com` |
| Corporate domain | `https://www.stratvedatech.com` |
| Tagline | "Revenue Intelligence for growing businesses" |
| Hero headline | "Discover Hidden Revenue Leaks Before They Cost You Growth" |

### 1.2 Referencing the brand

- **First mention** on any surface: "StratVeda OS Revenue Intelligence Agent."
- **Subsequent mentions** (marketing): "Revenue Intelligence Agent."
- **In-app / dashboard UI:** "Revenue Agent" is acceptable and preferred in tight spaces.
- Never abbreviate to "RIA," "RevAgent," or reference by only "StratVeda" without product context.
- Never call the product "RevOps" alone — RevOps is the domain the product operates in, not the product name.

### 1.3 Product promise

Measure revenue impact, prioritize high-ROI opportunities, and get a clear
**30-day action plan** backed by the customer's own data. The product maps a
company's funnel, spots drop-offs and wiring gaps, and surfaces the revenue
impact of each one.

---

## 2. Logo & Wordmark

### 2.1 Logo lockup

The logo is the StratVeda mark loaded from `https://www.stratvedatech.com/logo.png`.

| Placement | Presentation |
| --- | --- |
| Light background | Logo + wordmark: **StratVeda** (bold, `ink`) + **OS** (semibold, `brand-700`) |
| Dark background | Logo + wordmark: **StratVeda** (bold, white) + **OS** (semibold, `brand-200`) |
| Logo size | 44 × 44 px (`size-11`) |

- Always keep the mark to the left of the wordmark with a `2.5` gap unit between them.
- Do not stretch, recolor, rotate, or place the logo on busy backgrounds.
- Maintain a clear space at least equal to the logo height on all sides.

### 2.2 Avatar / agent icon

The in-product "Revenue Agent" avatar is a `size-10` rounded square using a
`brand-500 → brand-700` diagonal gradient with the white **spark** icon centered.

---

## 3. Color System

All colors are canonical Tailwind v4 theme tokens defined in
`frontend/app/globals.css`. Use tokens, never hardcoded hex, in code.

### 3.1 Primary — Brand Green (deep enterprise green)

| Token | Hex | Usage |
| --- | --- | --- |
| `brand-50` | `#F2F7F4` | Pale washes, badge backgrounds, section gradients |
| `brand-100` | `#E3EFE8` | Soft icon chips, hover borders, hairline accents |
| `brand-200` | `#C6DFD0` | Faint borders, glow gradients |
| `brand-300` | `#9CC7AF` | Disabled/emphasized borders |
| `brand-400` | `#68A584` | Gradient end tones |
| `brand-500` | `#488A66` | Gradient start tones (avatar, bars) |
| `brand-600` | `#34744E` | **Primary action color** (buttons, links, focus, progress) |
| `brand-700` | `#2B6040` | Button hover, gradient headlines, "OS" wordmark |
| `brand-800` | `#244F36` | Button active, eyebrow text |
| `brand-900` | `#1E412D` | Headline gradient start |
| `brand-950` | `#102619` | Reserved for dark surfaces |

### 3.2 Neutral — Light enterprise surface palette

| Token | Hex | Usage |
| --- | --- | --- |
| `surface` | `#FFFFFF` | Page background, cards, inputs |
| `surface-muted` | `#F8FAFC` | Subtle wells, track backgrounds |
| `surface-soft` | `#F5F8FC` | Card inner panels |
| `ink` | `#0F172A` | Headings, primary text, body copy on light |
| `ink-muted` | `#475569` | Secondary body copy |
| `ink-faint` | `#64748B` | Captions, timestamps, metadata |
| `line` | `#E2E8F0` | Borders, dividers, strokes |
| `line-strong` | `#CBD5E1` | Hover / emphasized borders |

### 3.3 Validation / destructive

| Token | Hex | Usage |
| --- | --- | --- |
| `danger-50` | `#FEF2F2` | Error backgrounds |
| `danger-100` | `#FEE2E2` | Error icon chips |
| `danger-300` | `#FCA5A5` | Faint destructive borders |
| `danger-400` | `#F87171` | Destructive icon color |
| `danger-600` | `#DC2626` | Destructive text and actions |
| `danger-700` | `#B91C1C` | Destructive hover/pressed |

### 3.4 Usage rules

- **Primary brand color:** `brand-600`. Use for the single primary CTA per view, key links, active states, and the brand selection highlight.
- **Neutrals carry the interface.** Green is the accent, never the background of large content areas. Large green fields are only acceptable as `brand-50` washes or gradients.
- **Gradient headline** (marketing): `brand-700 → brand-600 → brand-400` applied to the emphasized phrase only.
- **Focus rings:** 3px solid `brand-600` with a 3px offset.
- **Text selection:** `color-mix(in srgb, var(--color-brand-600) 22%, white)`.

---

## 4. Typography

### 4.1 Typefaces

| Role | Font | Notes |
| --- | --- | --- |
| Primary UI + marketing | **Google Sans** | Loaded from Google Fonts; weights 400–700 |
| Fallback | **Inter** | Via `next/font` as `--font-inter`; substituted when Google Sans is unavailable |
| System stack | UI sans-serif, system-ui, `-apple-system`, Segoe UI, Roboto, Helvetica Neue, Arial | Never rely on a single family |

Full font-family token: `"Google Sans", var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.

### 4.2 Sizing & tone conventions

| Element | Size | Weight | Tracking |
| --- | --- | --- | --- |
| H1 (marketing hero) | `text-4xl` → `text-5xl` | Bold (700) | `-0.03em`, leading `1.08` |
| H2 (section) | `text-3xl` → `text-4xl` | Bold (700) | `-0.03em` |
| H3 (card) | `text-lg` | Semibold (600) | `-0.01em` |
| Body | `text-base` | Regular (400) | default, leading `1.6` |
| Intro paragraph | `text-lg` | Regular (400) | relaxed leading |
| Eyebrow | `text-sm` | Semibold (600) | `0.16em` uppercase |
| Badge (tiny label) | `text-[0.6875rem]` | Semibold (600) | — |
| Numeric / score | tabular-nums (`tabular` class) | Bold (700) | tight |

- Headings must use `text-wrap: balance` and `letter-spacing: -0.02em`.
- All text is antialiased; set `-webkit-font-smoothing: antialiased` and `text-rendering: optimizeLegibility`.
- Numbers intended to be aligned (scores, amounts) use `font-variant-numeric: tabular-nums`.

---

## 5. Shape, Space & Elevation

### 5.1 Radii

| Context | Radius |
| --- | --- |
| Buttons, inputs, chips, badges | `rounded-xl` (12px) |
| Cards, panels, hero mock | `rounded-2xl` (16px) |
| Small proof badges (e.g., "AI") | `rounded-full` |
| Status pills | `rounded-full` |

### 5.2 Shadows

| Context | Shadow |
| --- | --- |
| Cards (rest) | `shadow-sm` |
| Cards (hover) | `shadow-lg` + `shadow-brand-600/[0.06]`, translate `-1px` up |
| Featured hero panel | `shadow-xl shadow-ink/[0.06]` |

### 5.3 Spacing rhythm

- Base grid unit is `rem`-based Tailwind spacing (`py-16`/`py-24` sections, `p-6` cards, `gap-5` grids).
- Common vertical rhythm on marketing: `py-16 lg:py-24` for full sections, `mt-6`/`mt-9` between headline → body → CTA.
- Buttons: `md` = `h-11 px-5`; `lg` = `h-13 px-7`.

### 5.4 Interactive states

| State | Primary button | Secondary button | Ghost |
| --- | --- | --- | --- |
| Rest | `bg-brand-600 text-white` | `border-line bg-surface text-ink` | `text-ink-muted` |
| Hover | `bg-brand-700` | `border-line-strong bg-surface-muted` | `bg-surface-muted text-ink` |
| Active/pressed | `bg-brand-800` | — | — |

All transitions run `200ms` ease (color). Focus-visible always shows the 3px `brand-600` ring.

---

## 6. Iconography

- Icons are a single custom stroke set (24px viewBox, `strokeLinecap="round"`, `strokeLinejoin="round"`) rendered in `currentColor`.
- Available names are defined in `frontend/components/ui/Icon.tsx` (`spark`, `target`, `shield`, `chart`, `priority`, `trend`, `dashboard`, `settings`, and 40+ more).
- Rule: use icons to **support** meaning, never as decoration. Pair each icon with a text label where possible.
- Icon chips: `size-11` rounded-square `bg-brand-50 text-brand-700`; on hover/card-hover the chip inverts to `bg-brand-600 text-white`.

---

## 7. Voice & Tone

### 7.1 Voice

Proactive, precise, confident — a growth advisor, not a hype machine. Short sentences, plain language, zero jargon laundry lists.

**Say:**
- "Discover hidden revenue leaks before they cost you growth."
- "Measure revenue impact, prioritize high-ROI opportunities, and know exactly where to act next."
- "AI-driven assessment in minutes."

**Avoid:**
- Overused AI buzzwords ("revolutionary," "game-changing," "magic").
- Unsupported superlatives ("the best," "#1").
- Abandoning the customer perspective; write about their outcome, not our features.

### 7.2 Numbering & data presentation

- Scores render `tabular`, e.g., `68 / 100`.
- Always pair a score with context: "Better than 62% of similar businesses."
- Action items are always ranked with a priority label: **High / Medium** (chips: high = `bg-brand-50 text-brand-800`, medium = `bg-surface-muted text-ink-muted`).

---

## 8. Product Surfaces

### 8.1 Marketing site

- Sections: Hero → Features → How it works → Video intro (optional) → CTA band → Footer.
- Hero uses soft `brand` radial glows (`blur-3xl`) on `surface`; early sections sit on `brand-50` gradients that wash to `surface`.
- Primary CTA: "Start free"; secondary CTA: "See how it works."

### 8.2 Sign-in / sign-up

- Light surface form cards, `rounded-2xl` with `border-line`.
- Auth receives the same repeated brand: logo lockup, `brand-600` primary button.
- Password fields use the `eye` / `eye-off` toggle icons.

### 8.3 Dashboard

- Follows the same tokens (surface → ink → line) and the `container-site` max width of `76rem` where applicable.
- Numbers, charts, and score meters use the brand green gradient (`brand-600 → brand-400`); meter track is `surface-muted`.

---

## 9. Accessibility

- Color alone must never convey state; always pair with text or iconography.
  - Example: status pills carry a text label AND color.
- All brand-green combinations must meet WCAG 2.1 AA contrast on the surfaces they appear on. If a tint fails, darken it one token (e.g., use `brand-700` text on `brand-50`).
- Focus-visible ring: 3px `brand-600`, 3px offset on every interactive element.
- Respect `prefers-reduced-motion`: disable decorative float/pulse/flow animations and instantiate transitions only when motion is preferred.
- Clickable targets within cards should be keyboard-reachable with a visible focus state.

---

## 10. Motion

Decorative animation is optional, subtle, and always gated behind `@media (prefers-reduced-motion: no-preference)`:

| Animation | Purpose | Spec |
| --- | --- | --- |
| `message-enter` | Chat/agent replies | 300ms ease-out, fade + 10px rise |
| `thinking-ring` | Agent "thinking" indicator | 2.4s infinite pulse ring |
| `waveform` | Voice/agent audio meter | 1.2s height pulse 4→18px |
| `thinking-progress` | Multi-step assessment bar | 5.5s cubic-bezier(0.22,1,0.36,1) |
| `float-y` | Hero decorative elements | 6s gentle ±8px float |
| `signal-bar` / `flow-dash` | Live data visuals | staggered grow / 24px dash flow |

Under `prefers-reduced-motion`, all of the above are disabled via the global override block.

---

## 11. Do / Don't Quick Reference

| ✔ Do | ✘ Don't |
| --- | --- |
| Use `brand-600` for the primary CTA | Make green the dominant page background |
| Let white space and neutrals carry the layout | Add drop shadows to the logo |
| Refer to "Revenue Intelligence Agent" in full on first mention | Call the product "RIA" or "RevAgent" |
| Keep score/numeric data tabular and contextualized | Throw statistics around without context |
| Use icon + label pairs for states | Rely on color alone to show status |
| Apply the 3px brand focus ring everywhere | Ship interactive elements with no focus ring |
| Respect reduced-motion | Add new decorative animations outside the token table |

---

## 12. Implementation Map

| Design token / asset | Source of truth |
| --- | --- |
| Colors, fonts, keyframes | `frontend/app/globals.css` |
| Logo & wordmark lockup | `frontend/components/ui/Logo.tsx` |
| Buttons & states | `frontend/components/ui/Button.tsx` |
| Icon names & strokes | `frontend/components/ui/Icon.tsx` |
| Brand/payment marks | `frontend/components/ui/BrandMarks.tsx` |
| Site name, product, URLs, copy anchors | `frontend/lib/constants.ts` |
| Metadata / SEO | `frontend/lib/metadata.ts`, `app/layout.tsx` |