---
version: alpha
name: Starbucks (Slide-Flavored)
description: Warm-cream café canvas with four-tier Starbucks green system, retargeted for 16:9 single-frame slides — no nav, no pill CTAs, no Rewards Frap floating button.
derived-from: ./DESIGN.md
medium: slides-16x9
colors:
  canvas: "#f2f0eb"
  ceramic: "#edebe9"
  surface-white: "#ffffff"
  starbucks-green: "#006241"
  green-accent: "#00754A"
  house-green: "#1E3932"
  green-uplift: "#2b5148"
  green-light: "#d4e9e2"
  gold: "#cba258"
  gold-light: "#dfc49d"
  ink: "rgba(0,0,0,0.87)"
  ink-muted: "rgba(0,0,0,0.6)"
  ink-subtle: "rgba(0,0,0,0.45)"
---

## Overview
A warm Starbucks café atmosphere on slides — neutral-cream canvas (`#f2f0eb`), a confident Starbucks-green band as the anchor color, and a single gold accent for "ceremony" moments. Each slide reads like one piece of in-store signage: legible, friendly, never shouting. The deck alternates cream and house-green surfaces so the eye paces through the deck like espresso bookends around a bright body.

## Background
- Default canvas: warm cream `#f2f0eb` (never pure white)
- Card/quote surface: ceramic `#edebe9` or white `#ffffff` with 12pt rounded corners
- Feature-band slide (section divider, closing): house-green `#1E3932` full-bleed with white text + gold accent
- Section rhythm across the 6-slide deck: cream → cream → cream-with-green-card → green band → cream → green-band closing

## Colors
| Role | Label | Hex |
|---|---|---|
| Canvas | Warm cream | #f2f0eb |
| Ceramic | Cream-soft | #edebe9 |
| Surface | White | #ffffff |
| Primary | Starbucks Green | #006241 |
| Accent fill | Green Accent | #00754A |
| Feature band | House Green | #1E3932 |
| Mint wash | Green Light | #d4e9e2 |
| Ceremony | Gold | #cba258 |
| Ceremony soft | Gold Light | #dfc49d |
| Ink | Near-black (warm) | rgba(0,0,0,0.87) |
| Ink muted | Warm slate | rgba(0,0,0,0.6) |

## Typography
- **Primary**: Inter (SoDoSans substitute), weight 400 for body, 500–600 for h1/h2/eyebrows
- **Display**: Inter at heavy weights (600–700), tight `-0.4pt` letter-spacing (slide-scale equivalent of website `-0.16px`)
- **Mono / metadata**: JetBrains Mono — used for eyebrows + page-number stamp + run-time IDs only
- **Script accent (single use)**: Kalam handwritten — used ONLY for the deck's signature "cup-name" handwritten motif on the cover (their names in cup-name style), nowhere else. Mimics the Starbucks Careers handwritten cup signature.
- Slide-relevant size ladder:
  - Cover headline (display): 56–64pt, weight 600, `-1.5pt` tracking
  - Section h2: 28–34pt, weight 600
  - Card title: 18–22pt, weight 600
  - Body: 12–14pt, weight 400
  - Eyebrow / mono: 10–11pt mono with `+1.5pt` positive tracking, uppercase
  - Page-number stamp: 10pt mono
  - Handwritten cup-name motif: Kalam 30–40pt, color Starbucks Green

## Slide Layouts

### Cover
- Cream `#f2f0eb` canvas
- Top: small inline-SVG Starbucks-style siren-disc mark + a mono eyebrow line
- Center: oversized Inter display headline + sub italic line
- One handwritten "cup-name" Kalam accent (e.g. `Hanni` `Danielle` like two cup signatures, in Starbucks Green)
- Optional: single small photo card on the right (12pt radius, white or ceramic surface, hairline border)
- Footer strip: brand wordmark left, page number right — one line, hairline divider above
- NO top-nav, NO pill CTA, NO floating Frap

### Section divider / Feature band
- House-green `#1E3932` full-bleed
- White display headline left, gold accent on one keyword
- Right side: optional photo or quote in a small white-on-green card
- Subtle gold underline strip 1.5pt
- Page number stamp bottom-right in gold

### Content (cream + green-card combo)
- 50/50 or 60/40 split: copy left on cream canvas, supporting card right (white or house-green)
- Eyebrow at top (mono uppercase), h2 in Starbucks Green, body in dark ink
- Card uses 12pt radius + hairline `rgba(0,0,0,0.08)` divider; soft `0.14` alpha shadow allowed (whisper-soft per spec)
- Optional gold "ceremony" pill ONLY when slide is genuinely celebratory (e.g. milestone)

### Statistic
- One oversized number in House Green or Starbucks Green (96–110pt, weight 600)
- Short caption beneath in `rgba(0,0,0,0.87)` ink
- Optional small mint-wash `#d4e9e2` accent shape behind the number for warmth

### Closing
- House-green `#1E3932` full-bleed (matches Starbucks footer ceremony surface)
- Centered Inter display thesis line in white, one gold-colored italic accent
- Below: small footer band — 1-2 lines max, white-on-green, gold accent for one phrase
- NO Frap floating CTA, NO "Sign up for Rewards" buttons

## Signature Motifs
- **Siren-disc**: small inline SVG of a circular Starbucks-style mark (green ring, simplified) at slide eyebrow strip — single 14pt graphic, not a full logo recreation
- **Handwritten cup-name (Kalam)**: each member's name appears once on the cover in handwritten green script, mimicking the Starbucks "cup-name" Careers touch — slide-only equivalent of the Careers page motif
- **Gold ceremony underline**: 1.5pt gold rule under one milestone number per deck (max one slide)
- **Green band rhythm**: cream slides → one house-green section divider → cream → closing in house-green
- **Mono eyebrow with positive tracking**: every slide gets one 10–11pt mono uppercase line at top with section number + section name
- **Hairline dividers**: 1px `rgba(0,0,0,0.08)` on cream, `rgba(255,255,255,0.18)` on house-green — never thick rules
- **Whisper shadow** on cards: `0 2pt 12pt rgba(0,0,0,0.06)` allowed, nothing heavier

## Avoid
- Top-nav bars, sticky headers, store-locator menu rows
- Pill CTA buttons ("Sign in", "Join Rewards", "Order now") — slides are static, kill all click affordances
- Floating Frap (`56px` circular order CTA bottom-right) — this is the Starbucks website's signature widget but has no slide meaning
- "Cup name" Kalam script for body copy — single decorative use ONLY (cover)
- Gift-card photographic tiles grid — slides aren't a merchandise page
- Multi-column legal/sitemap footer-bands
- Gradient banners — Starbucks doesn't use atmospheric gradients; keep solid green
- Saturated non-brand colors (blue, red, orange) — palette is restricted to greens + gold + cream
- Hover, focus, active, pressed, disabled states (slides are static)
- Heavy box shadows — keep at whisper-soft `0.06–0.14` alpha
- Multi-shade green chrome on a single slide — pick ONE green per slide, max two

## Source mapping (for traceability)
- `top-nav` → mono eyebrow strip + small siren-disc mark
- `pill-button-primary` ("Explore Menu", "Sign in") → dropped; verb appears as plain inline text if needed
- `floating-frap-cta` (56px green circular order button) → dropped entirely
- `hero-band` with image-left/copy-right + dual CTA → Cover layout (copy + cup-name handwritten + optional small photo card, NO CTA row)
- `feature-band` (full-bleed house-green section) → kept as Section divider / Closing layout
- `gift-card-tile grid` (photographic merchandise cards) → dropped; replaced by member portrait card on content slides
- `rewards-page Lander serif headlines` → dropped (slide deck is too short for a separate type voice)
- `Careers Kalam cup-name script` → kept as single signature motif on cover
- `whisper card shadow 0.14 alpha` → preserved
- `12pt card radius` + `50px pill button radius` → cards 12pt kept; pills dropped (no buttons)
- Gold reserved for Rewards-status → preserved meaning: gold appears once per deck, on a milestone moment
- Four-tier green system (Starbucks/Accent/House/Uplift) → simplified to two: Starbucks Green (#006241) for h1 on cream, House Green (#1E3932) for feature-band fill
