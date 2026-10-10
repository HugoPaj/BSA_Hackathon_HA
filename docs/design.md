# Design system: Swissquote look and feel

Findings from swissquote.com (October 2026) and the app screenshot we were given, plus how we modernise them with AlignUI (section 9). The values below come straight from the site's own CSS design tokens (prefix `--cws--`), so they are exact, not eyeballed.

Reference screenshot: [assets/swissquote-reference.png](assets/swissquote-reference.png)

## 1. The style in one paragraph

Clean, white, confident. Lots of white space, one loud accent colour used sparingly, and huge **bold uppercase headlines** in near-black with a tight line height. Body text is calm sentence case in charcoal. Surfaces are flat white or very light grey with soft rounded corners and almost no borders. Orange is reserved for calls to action, active states, icons, and the occasional full orange hero block. Green and red appear only for financial gains and losses.

## 2. Colour

### Brand orange (primary)

| Token | Hex | Use |
|---|---|---|
| primary-50 | `#FFEBEB` | Icon chip backgrounds, active tint |
| primary-100 | `#FDCCC0` | Active container (light mode) |
| primary-300 | `#FC9178` | Hover on dark surfaces |
| **primary-500** | **`#FA5B35`** | **Brand colour.** Buttons, links, active nav, icons, hero blocks |
| primary-600 | `#E45330` | Button hover / pressed |
| primary-700 | `#B24126` | Text on light orange tints if contrast needed |
| primary-900 | `#692616` | Dark mode tint backgrounds |

Full scale: 50 `#FFEBEB` · 100 `#FDCCC0` · 200 `#FDB4A2` · 300 `#FC9178` · 400 `#FB7C5D` · 500 `#FA5B35` · 600 `#E45330` · 700 `#B24126` · 800 `#8A321D` · 900 `#692616`

Note: white text on `#FA5B35` is about 3.2:1 contrast, and on `#E45330` about 3.8:1. That passes for large or bold text only, which is how Swissquote uses it on buttons. For small white text on an orange background, use `#B24126` (about 5.7:1).

### Neutrals

| Token | Hex | Use |
|---|---|---|
| **sq-black** | **`#323232`** | **All headings and body text.** Swissquote's "black" is this charcoal, not pure black |
| white | `#FFFFFF` | Page background, cards |
| grey-50 | `#FAFAFA` | Feature-card background |
| grey-100 | `#F9FAFB` | Subtle section background |
| grey-200 | `#F3F4F6` | Tertiary borders, dividers |
| grey-300 | `#E5E7EB` | Default borders (header rule, outline buttons) |
| grey-400 | `#98A2B3` | Disabled text and icons |
| grey-500 | `#475467` | Secondary text, captions |
| blue-50 | `#F0F4FA` | Secondary container. The cool grey-blue app background and the phishing banner |

### Status and finance

| Token | Hex | Use |
|---|---|---|
| green-500 | `#00875A` | Success, positive performance ("+1.65 CHF ▲ 1.18%") |
| green-50 | `#E6F4EF` | Success background |
| red-500 | `#E10F00` | Error, negative performance |
| yellow-400 | `#F8C24E` | Warning |
| yellow-50 | `#FFFAF0` | Warning background |
| blue-500 | `#3B82F6` | Info |
| blue-600 | `#2563EB` | Focus ring |

The site defines a dark theme with the same token names (e.g. text flips to white, surfaces to `#323232` / grey-900, orange tints to primary-800/900). Light mode is the default everywhere public.

## 3. Typography

**Font:** `SwissquoteCT` on the site. The site also loads GT America and GT Sectra for special pages, but SwissquoteCT is the workhorse. Fallback: `Arial, sans-serif`.

**Weights used:** 400 regular, 500 medium, 700 bold. All three are in `assets/fonts/`, taken from the WOFF2 files swissquote.com serves:

| File | Weight |
|---|---|
| `swissquote-ct-regular.woff2` | 400 |
| `swissquote-ct-medium.woff2` | 500 |
| `swissquote-ct-bold.woff2` | 700 |
| `SVN-Swissquote-Regular.otf` | 400, the file we were given. Same design plus Vietnamese glyphs. Not needed if we use the WOFF2 set. |

Coverage: full Latin including German and French accents, `€`, and curly quotes. Arrows (`→`) and triangles (`▲`) are missing in all files, so draw those as SVG icons rather than text characters.

**Scale (from the site's tokens):**

| Role | Weight | Mobile | Tablet ≥768 | Desktop ≥1220 | Line height | Case |
|---|---|---|---|---|---|---|
| H1 display | 700 | 40px | 80px | very large | 1.0 | UPPERCASE |
| H2 | 700 | 40px | 64px | 64px | 1.0 | UPPERCASE |
| H3 | 700 | 24px | 40px | 40px | 1.0 | UPPERCASE or sentence |
| H4 | 500 | 20px | 24px | 24px | 1.3 | Sentence case |
| Lead paragraph | 500 | 16px | 20px | 20px | 1.5 | Sentence case |
| Body | 400 | 16px | 18px | 18px | 1.5 | Sentence case |
| Caption | 400 | 12px | 14px | 14px | 1.5 | Sentence case |
| Button | 500 | 16px | 16–20px | 16–20px | 1.2 | Sentence case ("Open your account") |
| Top nav | 500–700 | 15–16px | | | | UPPERCASE ("PRIVATE", "PARTNERS") |

**Headline style is the signature.** Short, punchy, uppercase, bold, line height 1.0, no extra letter spacing: "THE BANK. DIFFERENTLY.", "THE GOLD STANDARD OF TRADING PLATFORMS". Headlines are either charcoal on white, orange on white, or white on an orange block.

**Inside the app, there are no shouting headlines.** The mobile app screenshot uses sentence case throughout, with the big number as the hero: "Total value / 55'050.01 CHF".

**Number formatting:** Swiss style with an apostrophe as thousands separator and the currency after: `55'051.67 CHF`. Use `Intl.NumberFormat('de-CH')`.

## 4. Spacing, layout and shape

**Spacing:** 2px base unit, used almost always in multiples of 8. Common values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128px. Sections are separated by very generous space (96–160px on desktop).

**Grid:** max content width **1220px**. 12 columns on desktop, 8 on tablet (≥768px), 4 on mobile. Gutter 32px desktop, 16px mobile.

**Breakpoints:** 768px (tablet), 1220px (desktop), 1440px (large).

**Corner radius:**

| Token | Value | Use |
|---|---|---|
| xs | 4px | Tags, small chips |
| **md** | **8px** | **Buttons, inputs, small cards** (most used on the site) |
| **xl** | **12px** | **Cards, image tiles, app cards** |
| 2xl | 16px | Large panels, hero blocks, footer card |
| full / 2em | pill | Pagination arrows, segmented controls ("1W 1M 6M 1Y All") |

**Shadows:** soft, tinted with charcoal, used sparingly. Cards are usually flat (grey-50 background, no border, no shadow).

| Token | Value |
|---|---|
| s | `0 4px 8px -2px #3232321a, 0 2px 4px -2px #3232320f` |
| m | `0 12px 16px -4px #32323214, 0 4px 6px -2px #32323208` |
| l | `0 20px 24px -4px #10182814, 0 8px 8px -4px #10182808` |
| xl | `0 24px 48px -12px #3232322e` |

**Borders:** 1px `#E5E7EB` for header rules and outline buttons. Otherwise, avoid borders and separate with background colour and space.

**Glass:** the site uses blur backgrounds (`backdrop-filter: blur(8–12px)` over `#FFFFFF66`) for overlays on photos.

## 5. Components

**Header.** White, 1px bottom rule. Logo left (orange rounded-square mark + "Swissquote" wordmark in charcoal). Uppercase primary nav centred, active item in orange. Right side: **Login** (outline button, orange border and text) and **Sign up** (filled orange). Second row with sentence-case sub-nav (Trade, Invest, Bank…) and a bordered "Markets" pill.

**Buttons.**
- Primary: `#FA5B35` fill, white medium text, radius 8px, about 40–48px tall, padding 12px 16px. Hover `#E45330`.
- Secondary (on white): white fill, orange 1px border, orange text.
- Inverse (on orange blocks): white fill, orange text. ("Open your account" in the reference screenshot.)
- Text link CTA: orange medium text with a chevron: "Discover ›".
- Icon button: 36px circle or rounded square. Active carousel arrow is filled orange with a white chevron; inactive is light grey.

**Feature cards.** grey-50 background, radius 12px, no border, padding 20–24px. Top-left icon chip: 36px square, radius 8px, primary-50 background, orange line icon. Then an H4-style title (medium, charcoal) and 2–3 lines of body text.

**Hero, two variants.**
1. Orange block (`#FA5B35`, radius 16px) with a giant white uppercase headline, a white lead line, and a white inverse button. A device mockup overlaps the block's edge.
2. White page with an orange uppercase headline, a filled orange button, and a product image sitting on an orange circle.

**App screens (from the reference screenshot).** This is the closest model for our wallet UI.
- Background: very light cool grey (`#F0F4FA` / `#F3F4F6`).
- Top: centred label "Total value" and a large medium-weight number with "CHF" smaller and lighter.
- White cards, radius 12px, no visible border, with a small grey label, the value in bold charcoal, and a chevron top-right ("Assets ›", "Crypto ›", "Cash ›", "Buying power ›") in a 2×2 grid.
- Account card with "Trading 2162953", the balance, a red Swiss-cross badge, green performance lines, and a blue line chart with a soft gradient fill.
- Segmented time filter as a pill with the active segment white on grey.
- Quick actions: dark charcoal circles with white icons, label underneath ("Open orders", "Transactions", "Add money").
- Bottom tab bar: Home, Trade, Bank, Plan. Active tab orange with a filled icon, others charcoal.

**Notice banner.** blue-50 background, radius 12px, small charcoal text, orange underlined link, close × on the right. Used for the phishing warning, which is a good fit for our security messages too.

**Footer.** Large rounded card (radius 16px) with a photo background, white uppercase link headings, social icons. Then a small "Designed with passion in Switzerland" line with a Swiss flag, and legal text in small grey.

**Swiss cues.** The red Swiss-cross badge appears in the language picker, next to CHF balances, and in the footer. It signals "Swiss bank". Use it lightly.

## 6. Motion

Subtle and short. Elements fade in and rise slightly when they scroll into view (`fade-in-up` with a 80px translate on the site; use 16–24px in an app). Easing is plain `ease-out`. The site respects `prefers-reduced-motion`, so we should too.

## 7. Voice

- Headlines: short, bold claims, often with a full stop. "THE BANK. DIFFERENTLY."
- Subtitles: one plain sentence explaining the benefit.
- Buttons: verb first, sentence case. "Open your account", "Discover".
- Security copy is direct and calm: "Beware of ongoing fraud campaigns… Never share personal information."

## 8. Applying it to our wallet

Our web app should look like a new section of Swissquote's app, not a crypto app. In practice:

- Use the **app-screen** style for the wallet itself: cool grey background, white 12px-radius cards, big balance number, charcoal quick-action circles, orange only for the primary action.
- Use the **marketing** style (uppercase headline, orange hero block) only for the landing or onboarding screen, "OPEN YOUR SELF-CUSTODY WALLET".
- Show amounts Swiss style: `1'250.00 USDC`, with a CHF equivalent underneath.
- Green and red only for money moving in or out. Security states use the status colours: green for "Protected", yellow for "Recovery pending", red for "Blocked".
- Put security notices in the blue-50 banner style, recovery countdowns in the yellow-50 style.
- Avoid crypto-app clichés: no neon gradients, no dark mode by default, no hex addresses as headings. Shorten addresses (`0x72…A91`) and show them in a small monospace caption.

### Starter CSS variables

```css
@font-face {
  font-family: "SwissquoteCT";
  src: url("/fonts/swissquote-ct-regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "SwissquoteCT";
  src: url("/fonts/swissquote-ct-medium.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "SwissquoteCT";
  src: url("/fonts/swissquote-ct-bold.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
}

:root {
  /* brand */
  --sq-orange: #FA5B35;
  --sq-orange-hover: #E45330;
  --sq-orange-50: #FFEBEB;
  --sq-orange-100: #FDCCC0;

  /* neutrals */
  --sq-ink: #323232;
  --sq-ink-2: #475467;
  --sq-ink-3: #98A2B3;
  --sq-bg: #FFFFFF;
  --sq-bg-app: #F0F4FA;
  --sq-surface: #FFFFFF;
  --sq-surface-2: #FAFAFA;
  --sq-border: #E5E7EB;
  --sq-divider: #F3F4F6;

  /* status */
  --sq-success: #00875A;  --sq-success-bg: #E6F4EF;
  --sq-error:   #E10F00;  --sq-error-bg:   #FFEEEE;
  --sq-warning: #F8C24E;  --sq-warning-bg: #FFFAF0;
  --sq-info:    #3B82F6;  --sq-info-bg:    #F0F4FA;
  --sq-focus:   #2563EB;

  /* type */
  --sq-font: "SwissquoteCT", Arial, sans-serif;

  /* shape */
  --sq-radius-sm: 4px;
  --sq-radius-md: 8px;
  --sq-radius-lg: 12px;
  --sq-radius-xl: 16px;
  --sq-radius-pill: 999px;

  /* elevation */
  --sq-shadow-s: 0 4px 8px -2px #3232321a, 0 2px 4px -2px #3232320f;
  --sq-shadow-m: 0 12px 16px -4px #32323214, 0 4px 6px -2px #32323208;

  /* layout */
  --sq-max-width: 1220px;
}

body { font-family: var(--sq-font); color: var(--sq-ink); }
h1, h2 { font-weight: 700; line-height: 1; text-transform: uppercase; }
```

### Licensing note

The Swissquote font files are proprietary. The WOFF2 files were downloaded from swissquote.com's public site assets. That is fine for a hackathon prototype presented to Swissquote, but keep the repository private or exclude the font files before publishing anything publicly.

## 9. Modernising with AlignUI

**Decision:** we build the wallet with [AlignUI](https://alignui.com/)'s free React components, re-themed with Swissquote's font and colours. Swissquote's brand stays recognisable. AlignUI brings softer surfaces, hairline borders, layered shadows, a refined type scale, focus rings and well-built accessible components.

Visual preview of the merged style: [style-tile.html](style-tile.html). It shows tokens, components, and three wallet screens: home, transfer review, and recovery pending.

### What AlignUI is

- **Free tier:** about 50 open-source components (MIT): Button, Fancy Button, Input, Select, Modal, Drawer, Badge, Status Badge, Alert, Notification, Toast, Tooltip, Segmented Control, Switch, Steppers, Progress, Tabs, Table, Digit Input (OTP), Command Menu and more. Copy-paste source, not an npm package, so we own and edit the code.
- **Built on:** React, Tailwind CSS, Radix UI primitives, `tailwind-variants`, `tailwind-merge`, and the Remix Icon set (`@remixicon/react`).
- **Pro tier (paid):** extra blocks and industry templates, including Finance & Banking and Crypto. Not needed. The free components cover everything in our demo.
- **Sources:** docs at `alignui.com/docs/v1.2`, the CLI at `github.com/alignui/cli`, and the starter at `github.com/alignui/alignui-nextjs-typescript-starter`.

### Setup path

Verified on 2026-10-10 with a throwaway production build: **Next.js 16.4, React 19.3, Tailwind CSS 4.3.3, tailwind-variants 3.3, tailwind-merge 3.7**, with AlignUI's Button, Fancy Button, Badge, Modal and Compact Button. Build and TypeScript checks pass, and the components render with the right colours, corners, shadows and type scale.

1. `npx create-next-app@latest` with TypeScript, Tailwind and the App Router. Next.js 16.4 wires Tailwind in through the `@tailwindcss/turbopack` loader in `next.config.ts`.
2. Run `npx @alignui/cli@latest tailwind`. Choose **Orange** primary, **Slate** neutral, **hex** format, no prefix, CSS-only configuration. It writes about 1,000 lines of tokens into `app/globals.css` and installs the latest Tailwind. It overwrites `globals.css`, so run it first.
3. **Delete the `postcss.config.mjs` the CLI adds,** and uninstall `@tailwindcss/postcss`. Next.js 16's Turbopack loader already processes Tailwind. Tested: the CSS output is identical without it.
4. **Delete the `@media (prefers-color-scheme: dark)` block** in `globals.css`. Otherwise the wallet turns dark whenever the visitor's system is in dark mode. AlignUI's `.dark` class stays available if we want a toggle later.
5. Override the primary, warning and text tokens with the values below. Note that choosing Orange makes the CLI set **both** `primary-*` and `warning-*` to orange. The warning override is required.
6. Replace the `font-family: Inter…` line in the body styles with SwissquoteCT (section 3), and set `--font-sans` to it.
7. `npm install @remixicon/react tailwind-variants tailwind-merge clsx` plus the Radix packages each component needs. Add the `tv`, `polymorphic` and `recursive-clone-children` utilities from the docs.
8. Write `utils/cn.ts` for Tailwind v4. The starter repo's version imports from a v3 `tailwind.config.ts` and breaks. The v4 version lists AlignUI's text styles inline (`title-h1…h6`, `label-xl…2xs`, `paragraph-xl…xs`, `subheading-md…2xs`, `doc-label`, `doc-paragraph`) in an `extendTailwindMerge` font-size class group.
9. Copy components in from the docs as we need them. Some import others; for example Modal needs Compact Button.

Do not use the public starter repo. It is still on Next.js 14 and Tailwind v3.

### Token mapping

AlignUI components reference semantic tokens. We keep AlignUI's names and swap in Swissquote's values.

| AlignUI token | AlignUI default | Our value | Why |
|---|---|---|---|
| `primary-base` | blue-500 | `#FA5B35` | Swissquote brand |
| `primary-darker` | blue-700 | `#E45330` | Button hover |
| `primary-dark` | blue-800 | `#B24126` | Orange text on light tints, passes contrast |
| `primary-alpha-24 / 16 / 10` | blue alpha | `#FA5B35` at 24%, 16%, 10% | Lighter buttons, tints, focus ring |
| `text-strong-950`, `bg-strong-950`, `stroke-strong-950` | slate-950 `#0E121B` | `#323232` | Swissquote's charcoal |
| `text-sub-600` | slate-600 | `#525866` (keep) | Secondary text |
| `text-soft-400` | slate-400 | `#99A0AE` (keep) | Captions |
| `stroke-soft-200`, `bg-soft-200` | slate-200 | `#E1E4EA` (keep) | Hairlines |
| `bg-weak-50` | slate-50 | `#F5F7FA` (keep) | App background, close to Swissquote's `#F0F4FA` |
| `warning-*` | **orange** | **yellow**: base `#E0A938`, dark `#9E6F23`, light `#FDE39B`, lighter `#FFFAF0` | Orange must only mean "brand action" |
| `success-*` | green | base `#00875A`, lighter `#E6F4EF` | Swissquote's gain colour |
| `error-*` | red | base `#E10F00`, lighter `#FFEEEE` | Swissquote's loss and error colour |
| `information-*` | blue | base `#3B82F6`, lighter `#F0F4FA` | Matches Swissquote's notice banner |

```css
@theme {
  --font-sans: "SwissquoteCT", Arial, sans-serif;

  --color-primary-base: #FA5B35;
  --color-primary-darker: #E45330;
  --color-primary-dark: #B24126;
  --color-primary-alpha-24: #FA5B353d;
  --color-primary-alpha-16: #FA5B3529;
  --color-primary-alpha-10: #FA5B351a;

  --color-text-strong-950: #323232;
  --color-bg-strong-950: #323232;
  --color-stroke-strong-950: #323232;

  --color-warning-dark: #9E6F23;
  --color-warning-base: #E0A938;
  --color-warning-light: #FDE39B;
  --color-warning-lighter: #FFFAF0;

  --color-success-base: #00875A;
  --color-success-lighter: #E6F4EF;
  --color-error-base: #E10F00;
  --color-error-lighter: #FFEEEE;
}
```

The exact variable names depend on what the CLI generates. Match the names in the generated `globals.css` and replace only the values.

### What we keep from Swissquote, what we take from AlignUI

| Element | Rule |
|---|---|
| Font | SwissquoteCT, all three weights |
| Type scale | AlignUI's: `title-h1…h6` (500 weight), `label-*` (500), `paragraph-*` (400), `subheading-*` (500, uppercase, tracked). Swissquote's bold uppercase display style only on the landing hero and onboarding |
| Colour | Swissquote values on AlignUI token names, as above |
| Corners | AlignUI: buttons and inputs 10px, cards 16px, sheets and modals 20px, hero blocks 24px |
| Surfaces | AlignUI: white cards with a 1px hairline ring and the layered `custom-md` shadow on a `bg-weak-50` background |
| Buttons | AlignUI Button and Fancy Button. Fancy Button only for the single most important action on a screen, such as "Confirm with passkey" |
| Icons | Remix Icon, line style by default, fill style for active tabs and badges |
| Swiss cues | Swiss number format and the small red Swiss flag next to CHF amounts |

### Wallet-specific component choices

| Need | AlignUI component |
|---|---|
| Passkey confirmation | Fancy Button, primary |
| Transfer review | Drawer on mobile, Modal on desktop |
| Gas sponsored, protected, pending, blocked | Badge, with lighter variants in primary, success, warning and error |
| dApp allowlist status | Status Badge |
| Security notices, simulation result | Alert |
| Recovery progress | Vertical Stepper and Progress Bar |
| Recovery code from Swissquote liveness (mock) | Digit Input |
| Bank-assisted recovery setting | Switch |
| Chart time range | Segmented Control |
| Activity list | Table on desktop, list of cards on mobile |
| Transaction sent, recovery cancelled | Toast |
