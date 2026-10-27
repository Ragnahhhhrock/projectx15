# Project X-15 — Design System & Style Guide

Tokens live in `src/styles/tokens.css` (source of truth). Components in `src/style.css`. Brand assets in `brand/` render to `public/` with `npm run brand`.

## Principles

1. **Instrument, not decoration.** Every pixel should read like a 1960s flight-test instrument or data sheet: monospaced numbers, thin rules, no gradients on UI chrome.
2. **Black sky, one flame.** Near-black surfaces, phosphor green for data, and a single orange (the XLR99 flame) reserved for the primary action and the engine. Never use orange for decoration.
3. **Numbers first.** Telemetry is tabular, right-aligned, and never reflows.
4. **Authentic over flashy.** Period-correct terms (NB-52, XLR99, NASA-1), real figures, no sci-fi invention.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--x15-space-black` | `#05070a` | Page background, sky above 300,000 ft |
| `--x15-stratosphere` | `#0c1726` | Sky gradient mid, panels over sky |
| `--x15-limb` | `#3d8bd9` | Earth's limb glow, rare accent |
| `--x15-inconel` / `-2` | `#16191c` / `#22272b` | Surfaces, aircraft skin |
| `--x15-phosphor` | `#9be38a` | Data, readouts, links, nominal |
| `--x15-ink` | `#e9f3e4` | Primary text on dark |
| `--x15-ink-dim` | `#8fa08a` | Labels, secondary text |
| `--x15-xlr99` | `#ff6a1a` | Primary action, engine, kicker text |
| `--x15-xlr99-hot` | `#ffb36b` | Hover, focus ring, flame core |
| `--x15-caution` | `#ffb020` | Caution lamp |
| `--x15-warning` | `#ff3b30` | Warning lamp, crash |
| `--x15-lakebed` | `#d9c7a3` | Rogers Dry Lake, terrain accents |
| `--x15-paper` | `#f2ede1` | Briefing / print theme background |

Themes: **Black Sky** (default) and **Paper** (`data-theme="paper"`, for briefings, docs, print). Use semantic tokens (`--bg`, `--text`, `--data`, `--action`), not raw palette, in components.

Contrast: ink on space-black 17:1; dim ink 6.7:1; phosphor 12:1; on-orange text (`#160800`) 7:1. Never put orange text on phosphor or vice versa.

## Typography

IBM Plex (SIL OFL), self-hosted via `@fontsource`.

| Role | Font | Use |
| --- | --- | --- |
| Display | IBM Plex Sans Condensed 700, uppercase | Titles, section heads, buttons, labels (tracked +12%) |
| Body | IBM Plex Sans 400/600 | Paragraphs, briefings, menus |
| Data | IBM Plex Mono 400/500/600 | HUD, telemetry, controls, code. Always `tabular-nums` |

Scale (1.25): 11 · 12 · 13 · 16 · 20 · 25 · 31 · 39 · 49 · 61 · hero `clamp(48px, 9vw, 112px)`. Line height 1.05 for display, 1.25 for headings, 1.55 for body. Uppercase only for display, labels and lamps.

## Space, shape, motion

- Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 (`--space-1…9`).
- Radius: 2px (bezels, buttons, tags), 6px (panels), 10px (large cards). No pill shapes.
- Borders: 1px at 25% phosphor for panels, 50% for controls. Shadows only on floating panels.
- Motion: 120/200/400ms, `cubic-bezier(0.2, 0.7, 0.2, 1)`. State changes only; no looping animation on HUD. All motion zeroed under `prefers-reduced-motion`.

## Components

| Class | Purpose |
| --- | --- |
| `.x-panel` | Translucent instrument panel (HUD, help, menus) |
| `.x-label` | Uppercase tracked caption for a value |
| `.x-display` | Condensed uppercase heading |
| `.x-readout` | Mono, phosphor, tabular numeric value |
| `.x-btn`, `.x-btn--primary` | Outline button; primary is solid XLR99 orange with glow on hover |
| `.x-lamp--nominal / --caution / --warning` | Annunciator lamps; colour is never the only signal (always include text) |

HUD rule: label left in dim, value right in phosphor, one row per quantity. Caution/warning values switch colour **and** add a lamp with text.

## Voice

Short, declarative, period-accurate. "Release", "Ignition", "Burnout", "Apex". Present tense, imperative for controls. Units follow the original cockpit: feet, knots, Mach, psf, lbf. Tagline: *Drop from the B-52. Light the XLR99. Ride it to the edge of space.*

## Brand mark

`brand/mark.svg`: the X-15 in climb over the Earth's limb on a space-black tile. Use at ≥16px; keep clear space of 1/8 the tile width. Don't recolour the flame, rotate the aircraft past 30°, or place on light backgrounds without the tile.

## Metadata and share images

| Asset | Size | Where |
| --- | --- | --- |
| `public/og-image.png` | 1200×630 | `og:image` |
| `public/twitter-card.png` | 1200×600 | `twitter:image` (`summary_large_image`) |
| `public/apple-touch-icon.png` | 180×180 | iOS home screen |
| `public/icon-192.png`, `icon-512.png` | 192, 512 | Web manifest |
| `public/favicon.svg`, `favicon-32.png` | vector, 32 | Browser tab |

Edit `brand/og.html` or `brand/mark.svg`, then run `npm run brand` (needs Python Playwright + Chromium). Absolute `https://projectx15.com/...` URLs are used in tags because crawlers require them. After deploy, validate with the X Card Validator, Facebook Sharing Debugger and LinkedIn Post Inspector (they cache aggressively; append `?v=2` to image URLs to bust).
