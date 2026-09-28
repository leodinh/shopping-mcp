---
name: Shopping with Agent
description: Specimen field on warm paper — a chat that compares products, then downloads shopping-mcp.json.
colors:
  paper: "#f4f3ef"
  ink: "#1a1a1a"
  ink-hover: "#333333"
  quiet: "#5c5b56"
  wash: "#e7e5df"
  well: "#ffffff"
typography:
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  intro:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  none: "0"
spacing:
  page-x: "1.25rem"
  page-x-sm: "2rem"
  thread-gap: "1.5rem"
  compare-gap: "2rem"
  control: "2.75rem"
  content-max: "36rem"
  thread-max: "48rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 0.75rem"
    height: "2.75rem"
  line-user:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  line-agent:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  product-image:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.none}"
    width: "100%"
---

# Design System: Shopping with Agent

## Overview

**Creative North Star: "Specimen Field"**

The UI is one warm sheet of paper. Talk, chrome, and the download sit on that sheet with no dark shell, no hairline rails, and no second color shouting for attention. Ink is the only accent: it writes the conversation, fills the primary control, and frames a catalog photo when a URL exists. The homepage stays a chat — a shopper line, an assistant answer with three products in a row, a follow-up line, then a sticky ink button that downloads `shopping-mcp.json`.

Density is conversational, not storefront. Header and footer are type on paper. Secondary routes (docs, privacy, seller) keep the same face and the same quiet column. Motion is one ease-out rise on thread children when reduced motion is off. The cart-with-agent mark stays `public/logo.png`, shown with multiply and grayscale so its black plate disappears into the paper.

**Key Characteristics:**
- Full-viewport warm paper; header, thread, sticky download, and footer share one sheet
- Unfilled transcript lines — user right-aligned and medium, agent left-aligned
- Product photos only when a URL exists: square, 1px ink frame, white well, contain
- Sticky ink control “Download MCP config” with one muted caption
- Schibsted Grotesk for talk; ui-monospace only for `shopping-mcp.json`
- Logo mark uses `mix-blend-multiply` and grayscale on paper

## Colors

A warm paper field with one ink: type, action, focus, and the only allowed stroke.

### Primary
- **Ink**: Action fills, headings, caret, selection background, focus ring, and the product-image frame. Same value as the theme’s heading, line, focus, and input aliases.
- **Ink Hover**: Primary-button hover — a step lighter than ink, still neutral.

### Neutral
- **Warm Paper**: App ground, button label on ink fills, and the sticky download strip.
- **Quiet Type**: Default body, nav, captions, placeholders, and the download caption.
- **Paper Wash**: Secondary-button hover only — a slightly deeper sheet, not a card face.
- **Image Well**: Field fill and product-image background. White so catalog photos stay opaque and uncut.

### Named Rules
**The One Ink Rule.** Ink is the only chromatic voice. Do not introduce green, moss, clay, or a second brand accent. Quiet type and paper wash stay in the warm-gray family.

**The Paper Field Rule.** Ground is paper on every route. Do not wrap the app in a darker outer void or a glowing shell.

## Typography

**Display Font:** Schibsted Grotesk (with ui-sans-serif)
**Body Font:** Schibsted Grotesk (with ui-sans-serif)
**Label/Mono Font:** ui-monospace stack (SFMono / Menlo / Monaco / Consolas)

**Character:** One grotesque for every human-readable surface. Loaded weights are 400, 500, 600, and 700; the build uses 400, 500, and 700. Mono is a filename, not a second personality.

### Hierarchy
- **Headline** (700, 1.75rem, 1.15, −0.02em): Page titles on docs, privacy, and seller.
- **Title** (500, 1rem, stepping to 1.0625rem at `sm`): Header wordmark “Shopping with Agent.”
- **Intro** (400, 1.0625rem, 1.6): Supporting paragraph under page headlines.
- **Body** (400, 1rem, 1.6; 500 on user lines, buttons, and product names): Transcript, lists, and actions.
- **Label** (400 default, 700 on field labels; 0.8125rem, 1.4): Nav, captions, status, and the download caption.
- **Mono** (400, 0.8125rem): The literal filename `shopping-mcp.json` only.

### Named Rules
**The Talk Face Rule.** Schibsted Grotesk carries all human-readable UI. Do not introduce a second display family.

**The Mono Filename Rule.** Mono appears for `shopping-mcp.json` only — never for headlines, nav, or transcript prose.

## Layout

A full-viewport flex column (`h-dvh`): header, scrolling content, optional sticky download, footer. Horizontal padding is 1.25rem, stepping to 2rem at `sm`. The homepage thread and download row constrain to 48rem (`max-w-3xl`); docs, privacy, and seller constrain to 36rem (`max-w-xl`). Thread children stack with 1.5rem gap; the three-product row is one column, then three at `sm`, with 2rem gutters. Header min-height is 3.5rem / 4rem at `sm`; footer matches the 3.5rem bar. The download strip is `sticky bottom-0` on paper, no top rule: ink button, then one caption.

## Elevation & Depth

The field is flat. No drop shadows, no inset glow, no tonal bubble stack. Depth is type weight, alignment (user right, agent left), and the single 1px ink frame on a product image when a URL exists.

### Named Rules
**The Flat Field Rule.** Do not add shadows to the shell, header, footer, download strip, buttons, or fields. A product image earns a hairline frame; chrome does not.

## Shapes

Square. No corner radius on buttons, fields, lines, or image wells (`0`). The only stroke in the system is the product-image frame: 1px solid ink on a white square, `object-fit: contain`. Fields are unstroked white wells on paper. Header, footer, and the sticky download have no hairline borders.

### Named Rules
**The Unframed Chrome Rule.** Do not put hairline rules on header, footer, or the download strip. The product-image frame is the exception, and only when an image URL exists.

**The Framed Image Rule.** When a product URL exists, use the product-image well: `aspect-square`, 1px ink border, white background, `object-fit: contain`. Do not cut catalog photos out as transparent silhouettes. Omit the well entirely when there is no URL.

## Components

### Buttons
Sharp ink rectangles. Shared `min-height: 2.75rem` and horizontal padding 1.25rem. Medium weight, paper type on ink, no radius, no border.

- **Primary:** Ink fill, paper label; hover ink-hover; disabled wait cursor at 60% opacity.
- **Secondary:** Transparent, ink label; hover paper wash. Used for Disconnect.
- **Focus:** Global 2px ink outline, 2px offset.

### Cards / Containers
No card system. Compare items are a plain grid: medium ink name, quiet label spec. Seller status is a definition list — muted term, ink value — not tiles.

### Inputs / Fields
- **Style:** White well, no stroke, no radius, ink type, quiet placeholder, `min-height: 2.75rem`, horizontal padding 0.75rem.
- **Focus:** 2px ink outline, 2px offset.
- **Labels:** Label size, bold, ink, stacked above the field with a small gap.
- **Status / error:** Ink at label size — no separate alert color.

### Navigation
Header: logo mark (28px / 32px at `sm`, multiply + grayscale) plus medium ink wordmark left; quiet label links right that go ink on hover. Footer: the same link treatment, right-aligned. No underline on nav. Inline content links use medium ink, underline, decoration ink, `underline-offset: 4px`.

### Transcript Lines (signature)
Not capsules. Same paper as the page.

- **User:** Right-aligned (`ml-auto`), max `min(75%, 36rem)`, medium ink, no fill, no padding box.
- **Agent:** Left-aligned (`mr-auto`), max `min(40rem, 100%)`, regular ink.
- **Thread motion:** Children animate `translateY(0.4rem)` → none over 0.5s `cubic-bezier(0.16, 1, 0.3, 1)` with 0.12s / 0.24s stagger when motion is allowed.

### Product Image (signature)
Square well, 1px ink frame, white ground, contain. Render only when a URL exists.

### Sticky Download (signature)
Paper strip, no top border, sticky above the footer. Ink primary button “Download MCP config” beside (or above, on narrow) one quiet caption: mono `shopping-mcp.json`, then an em dash and the three setup steps in a single sentence.

## Do's and Don'ts

### Do:
- **Do** keep shopper surfaces as one paper conversation: user line, agent compare, sticky ink download.
- **Do** use Schibsted Grotesk for talk and reserve mono for `shopping-mcp.json`.
- **Do** use ink for primary actions, focus, and the product-image frame.
- **Do** show `public/logo.png` with multiply and grayscale so the black plate drops out on paper.

### Don't:
- **Don't** ship green, moss, a dark ground, or a glowing shell.
- **Don't** draw hairline chrome on header, footer, or the download strip.
- **Don't** wrap transcript lines in filled or rounded bubbles.
- **Don't** introduce a second display face or use mono for conversational copy.
- **Don't** cut product photos out as transparent silhouettes, and don’t invent a well when there is no image URL.
