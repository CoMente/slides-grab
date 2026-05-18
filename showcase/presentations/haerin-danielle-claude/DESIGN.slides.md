---
version: alpha
name: Claude Editorial (Slide-Flavored)
description: Warm cream + coral editorial mood from Claude.com, retargeted for 16:9 single-frame slides — no nav, no clickable CTAs, no marketing footers.
derived-from: ./DESIGN.md
medium: slides-16x9
colors:
  canvas: "#faf9f5"
  surface-card: "#efe9de"
  surface-dark: "#181715"
  surface-dark-soft: "#1f1e1b"
  surface-dark-elevated: "#252320"
  ink: "#141413"
  ink-muted: "#3d3b37"
  ink-subtle: "#6b6657"
  primary-coral: "#cc785c"
  primary-coral-strong: "#a9583e"
  accent-teal: "#5db8a6"
  accent-amber: "#e8a55a"
---

## Overview
A warm, literary editorial atmosphere — cream canvas, a single coral accent, slab-serif italics for emphasis. Each slide reads like one page of a long-form magazine column, not one section of a landing page. The dark navy surface appears only as a content motif (transcript card, code mockup), never as a full slide unless it's the closing thesis.

## Background
- Default canvas: tinted cream `#faf9f5` (warm, never pure white)
- Section-divider canvas: cream `#faf9f5` with a single 280pt soft-cream `#efe9de` corner shape; no full-bleed gradient
- Closing canvas: warm-dark `#181715` (one slide only)
- Cards on canvas: cream-card `#efe9de` with 12-14pt radius, no shadow

## Colors
| Role | Label | Hex |
|---|---|---|
| Canvas | Tinted cream | #faf9f5 |
| Surface card | Cream card | #efe9de |
| Surface dark | Warm black | #181715 |
| Surface dark elevated | Warm slate | #252320 |
| Ink | Near-black | #141413 |
| Ink muted | Warm gray | #3d3b37 |
| Ink subtle | Tan gray | #6b6657 |
| Primary | Coral | #cc785c |
| Primary strong | Deep coral | #a9583e |
| Accent | Teal (sparingly) | #5db8a6 |
| Accent | Amber (sparingly) | #e8a55a |

## Typography
- **Display**: Cormorant Garamond (Tiempos/Copernicus substitute), weight 400, italic for accent words. Negative letter-spacing (-0.6 to -1.2pt) on display sizes.
- **Body / labels**: Inter (StyreneB substitute), weight 400 for body, 500 for labels.
- **Mono**: JetBrains Mono — used only for eyebrows, page numbers, transcript fixtures, and small ID stamps. Uppercase with +0.4–1.5pt positive tracking.
- Slide-relevant size ladder (smaller than the website spec because slides are 405pt tall, not a 1080+ tall scroll):
  - Cover headline: 48–52pt (NOT 64pt — too tall for a 405pt slide)
  - Section headline: 28–34pt
  - Subhead / lede: 18–22pt italic serif
  - Body: 11–13pt
  - Eyebrow / mono: 10pt with 1.5pt letter-spacing
  - Page number stamp: 9–10pt mono

## Slide Layouts

### Cover
- Single oversized italic-serif headline left-aligned, max 3 lines, max-width ~520pt
- One subhead line below, italic serif, muted ink
- A single small pull-quote card on the right (cream-card surface), optional
- Footer strip: brand wordmark left, page number right — one line, hairline divider above
- NO top-nav, NO "Read the issue" button row, NO illustration card with CTA

### Section divider
- Eyebrow line at top (mono, uppercase)
- A short italic-serif headline (max 12 words) centered or left-aligned with whitespace dominance
- A single coral italic accent word inside the headline
- Single page-number stamp bottom-right

### Content
- 50/50 or 60/40 split: copy left, single supporting visual right (pull quote, member card, transcript mockup, single image)
- Eyebrow at top, h2 italic-serif headline, lede paragraph, optional 3-item bullet list (use `—` em-dash markers, not pink dots)
- Right side: ONE thing — a quote card, a small dark mockup, or a stat — never a grid of 3+ items
- Hairline footer strip with attribution + page number

### Statistic
- One oversized italic-serif number anchored top-left (96–110pt)
- Coral color for the number, deep cream surface card behind it
- Short italic caption below (1 line, max ~16 words)
- Optional right-side card with 3 supporting bullets in mono — kept slim

### Closing
- Warm-dark canvas (`#181715`) — the ONLY slide that inverts
- Centered italic-serif thesis line, max 3 lines, with one coral italic phrase and one strike-through phrase for editorial voice
- Below: a single small footer band (≤ 4 short columns, each ≤ 3 lines) acting as deck colophon — brand, sources, style file, page number
- NO CTA button, NO "Read next issue →" affordance (slides have no clicks)

## Signature Motifs
- **Anthropic spike-mark**: inline 14pt SVG asterisk-like glyph at slide eyebrow strip
- **Coral italic accent word**: exactly one word per headline, in `#cc785c` italic serif
- **Hairline divider strip**: 1px `#d8d1c0` on cream, `#252320` on dark — never a thick rule
- **Mono eyebrow with positive tracking**: every slide gets one 10pt mono uppercase line at top with section number + section name
- **Page-number stamp**: bottom-right corner, mono 9–10pt, format `01 / 06`
- **Transcript-card motif** (content slides only): dark navy mockup with mono lines, color-coded speakers — reusable but not on every slide

## Avoid
- Top-nav bars, sticky headers, menu rows ("Members · On stage · Off stage")
- Clickable CTA buttons or anything that looks like one (coral pill labeled "Begin reading", "Read the issue", "Try Claude") — convert to plain kicker text or remove
- Multi-column footer-bands with sitemap-style link lists — replace with a single thin strip
- Pricing tier grids (the source DESIGN.md has them; slides MUST NOT)
- Connector tile grids (logo grids)
- 3-up CTA stacks (primary + secondary + tertiary button rows)
- Atmospheric multi-stop gradients across the full slide canvas
- Hover, focus, active, pressed, disabled state styling (slides are static)
- Generic 3-up icon + blurb feature grids — Claude's source DESIGN.md has them, but they read as marketing on a slide; prefer pull quotes or per-item rows

## Source mapping (for traceability)
- `top-nav` → eyebrow strip + page number, no menu
- `hero-band` (h1 + dual CTA + illustration card) → Cover layout (h1 + sub + small pull-quote card, no CTA row)
- `button-primary` "Try Claude" / "Begin reading" → dropped; verb becomes plain kicker text when needed
- `feature-card 3-up grid` → kept ONLY when each card is a substantive content unit (track, member, source) — never generic feature blurbs
- `product-mockup-card-dark` (code editor screenshot) → kept as content motif (transcript card on slide 05), never page-dominant
- `pricing tier grid` → dropped entirely
- `connector tile grid` → dropped entirely
- `footer-band` (4-column legal/sitemap) → single thin footer strip with deck colophon
- Hover / focus / pressed / disabled states → all dropped
- Anthropic spike-mark → kept as small inline-SVG motif
- Cream + coral pairing → preserved unchanged (this IS the brand voice)
- Slab-serif italic accent on a single word → preserved as the deck's primary emphasis tool
