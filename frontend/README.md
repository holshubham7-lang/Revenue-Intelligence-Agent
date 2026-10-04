# Revenue Intelligence — Marketing Site

Public home page for **Revenue Intelligence**, a SaaS product by
StratVeda Technologies Pvt. Ltd. Built with Next.js (App Router),
TypeScript, Tailwind CSS v4, and framer-motion.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:3000)
npm run dev
```

That's it — no environment variables are required for the marketing site.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack + hot reload |
| `npm run build` | Production build (Turbopack) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (flat config) — note `next lint` was removed in Next 16 |

Requires **Node.js 20.9+** (developed against 24.x) and **TypeScript 5.1+**.

---

## Project structure

```
app/
  layout.tsx          Root layout: fonts, metadata, OG tags, favicon,
                      theme-init script, skip link
  page.tsx            Home page — composes the sections (Server Component)
  globals.css         Design tokens, dark theme, motion, base layer
  signin/             Placeholder routes
  signup/
  pricing/
  privacy-policy/
  terms/
  refund-policy/

components/
  Header.tsx          Sticky translucent bar, mobile menu (client)
  Hero.tsx            Above-the-fold copy + CTAs (server)
  HeroMockup.tsx      Decorative dashboard, HTML + inline SVG (server)
  WhatYouGet.tsx      Six capability cards (server)
  HowItWorks.tsx      Four-step timeline (server)
  CTASection.tsx      Gradient CTA band (server)
  Footer.tsx          Four columns + credit bar (server)
  PlaceholderPage.tsx Shared shell for placeholder routes (server)

  ui/
    Button.tsx        4 variants × 3 sizes, one button system
    Container.tsx     Page-width wrapper
    Icon.tsx          String key → Lucide icon
    Logo.tsx          Inline-SVG brand mark + wordmark
    PaymentIcons.tsx  Visa / Mastercard / PayPal + RuPay / UPI chips
    Reveal.tsx        Scroll reveal, reduced-motion aware (client)
    SectionHeading.tsx  Shared eyebrow → h2 → intro block
    ThemeToggle.tsx   Stateless light/dark toggle (client)

lib/
  content.ts          ALL page copy — edit this, not the components
  utils.ts            `cn()` class joiner
```

---

## Editing the copy

**Everything a marketer is likely to change lives in `lib/content.ts`** —
headlines, nav labels, feature list, steps, footer links, contact details,
SEO strings. No component needs to be touched for a copy edit.

Icons are referenced there by **string key** (e.g. `"trending-up"`) rather than
by importing components, so `content.ts` stays a pure data module. The key is
resolved to a real icon in `components/ui/Icon.tsx`.

Company address, phone, email, and the site URL are in the `site` object at
the top of that file.

---

## Social sign-in (Google, Microsoft, LinkedIn)

Available on `/signup` and `/signin`. Authorization Code flow with PKCE, no
popup and no third-party cookie, so it behaves the same in Chrome, Edge, Firefox
and Safari — including Safari with Intelligent Tracking Prevention on.

Copy `.env.example` to `.env.local` and fill in the client id/secret for each
provider you want. Each provider is independent: one left blank disables only that
button. A provider with no credentials redirects back to `/signin` with "isn't
configured on this deployment" instead of failing at the provider.

**Callback URL** (register exactly this in each console):

```
{APP_BASE_URL}/api/auth/oauth/google/callback
{APP_BASE_URL}/api/auth/oauth/microsoft/callback
{APP_BASE_URL}/api/auth/oauth/linkedin/callback
```

Set `APP_BASE_URL` to the deployed origin, with no trailing slash. In local dev
you can omit it and the request origin is used.

### "It works for me but not for them"

Almost every instance of this is a provider-console setting. Each console also
shows a live "publishing status" / "app status" that is the usual culprit.

| Symptom | Console setting to change |
|---|---|
| Google: works only for you, others get "Access blocked: this app is currently being tested" | Consent screen → publishing status → **In production** (or add the accounts under *Test users*) |
| Microsoft: works only inside your own organisation | App registration → **Supported account types** → *Accounts in any organizational directory*, plus *Personal Microsoft accounts* for `@outlook.com` / `@hotmail.com` |
| Microsoft: everyone outside your tenant is refused the consent prompt | Do **not** request Graph permissions such as `User.Read`. Only `openid email profile` are requested, so no admin consent is needed |
| LinkedIn: 403 at the authorize step for every user | Products → **"Sign In with LinkedIn using OpenID Connect"** requires LinkedIn to approve the app; it cannot be self-serve. App must also be *Live* |

### How accounts are matched

A returning user is found by the provider's **user id**, not their email, so
changing a work email does not lose the account and two people who share a
recycled address do not collide. `identities[]` on the user document holds the
links, one per provider.

If the address already belongs to an account and the provider confirms it is
verified, the identity is linked to that account — the existing password keeps
working. If the provider does **not** vouch for the address, the attempt is
refused rather than linked, and the user is asked to sign in with their password.
That refusal is deliberate: linking an unverified address would let anyone who
can create an unverified account at the provider walk into an existing account.

`revops.users` also keeps the v1.0 `authProvider`/`providerId` fields populated.
A unique index on that pair has existed since v1.0, and Mongo indexes an absent
field as `null`, so a social account written without `providerId` collides with
every other social account from the same provider. Populating it is what keeps
the second user of a provider from failing with `E11000`.

### Testing

```bash
npm run test          # unit + Mongo-backed account-linking tests
npm run typecheck
npm run lint
```

The account-linking tests run against a scratch `revops_oauth_test` database and
clean up after themselves; they never touch development data.

---

## Design system

Tokens are defined in `app/globals.css`. Tailwind v4 is CSS-first, so
`@theme inline` is used instead of a `tailwind.config.js` — the CSS variables
below it are what generate the utilities (`bg-bg-elevated`, `text-ink-muted`,
`rounded-card`, `shadow-glow`, …).

| Token group | Purpose |
|---|---|
| `--bg`, `--bg-elevated`, `--bg-muted`, `--bg-inset` | Surface layers |
| `--ink`, `--ink-muted`, `--ink-subtle` | Text (all ≥ 4.5:1) |
| `--line`, `--line-strong` | Borders and dividers |
| `--brand*` | Primary blue `#1E40AF` |
| `--accent*` | Amber `#D97706` — highlights only, never body text |
| `--positive` / `--negative` | Status |
| `--radius-card/-tile/-control/-pill` | 16 / 12 / 10 / full |
| `--shadow-xs` … `--shadow-glow` | Soft, low-spread elevation |

**Dark mode** is class-based: the `.dark` selector block redefines the same
variable names, so every utility follows automatically. A blocking script in
`layout.tsx` applies the stored (or OS) theme *before first paint* — no flash.

**Typography** is a three-stack system, all self-hosted by `next/font` at
build time (no runtime request to Google, no layout shift):

- **Space Grotesk** — headings
- **Inter** — body
- **JetBrains Mono** — data, labels, KPI figures

**Spacing** follows an 8px rhythm; `section-y` is the shared vertical rhythm
utility for every section.

---

## Accessibility

- Semantic landmarks: `header` / `nav` / `main` / `section` / `footer`
- Skip-to-content link, visible on focus
- Visible `:focus-visible` rings everywhere — never removed
- Mobile menu traps focus, closes on `Esc`, and returns focus to the button
  that opened it; the page behind it cannot scroll
- `aria-expanded` / `aria-controls` on the hamburger
- Touch targets are ≥ 44px (`min-h-11` on every button)
- `prefers-reduced-motion` disables the float, the entrance animations, and
  smooth scrolling; the theme toggle is CSS-driven so it needs no JS state
- Decorative SVG (logo, chart, gradient glow) is `aria-hidden`; meaningful
  icons are `aria-hidden` because adjacent text already carries the meaning
- Payment marks expose an accessible name via `sr-only` text

## Performance

- Server Components by default — client JS is limited to the header, theme
  toggle, and reveal wrapper
- The hero mockup is server-rendered HTML + inline SVG with a CSS keyframe, so
  the animation costs no main-thread work
- All three fonts are self-hosted and preloaded with `display: swap`
- Every route is statically prerendered (`next build` reports all 8 as `○ Static`)

---

## Placeholder routes

`/signin`, `/signup`, `/pricing`, `/privacy-policy`, `/terms`, and
`/refund-policy` render a shared "coming soon" shell. Each already exports its
own `metadata`, so SEO tags are correct from day one.
