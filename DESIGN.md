---
name: Shopping with Agent
description: After-hours laptop-glow chat — watch an assistant shop, then download shopping-mcp.json.
colors:
  cart-bot-green: "#3d6b4f"
  lit-cart-bot: "#4a8260"
  soft-moss: "#8fbf9a"
  deep-leaf-bubble: "#2a3d31"
  after-hours-ground: "#121212"
  message-charcoal: "#1e1e1e"
  outer-void: "#0a0a0a"
  warm-ink: "#f4f4f0"
  sage-whisper: "#b7c4b8"
  moss-divider: "#2a332c"
  clay-alert: "#e8b4a2"
typography:
  headline:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
  intro:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xl: "0.75rem"
  "2xl": "1rem"
spacing:
  thread-gap: "1rem"
  page-x: "1.25rem"
  page-x-sm: "2rem"
  control-y: "2.75rem"
  composer-y: "3rem"
  content-max: "36rem"
  shell-max: "48rem"
components:
  button-primary:
    backgroundColor: "{colors.cart-bot-green}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
    padding: "0 1.5rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.lit-cart-bot}"
    textColor: "{colors.warm-ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
    padding: "0 1.5rem"
    height: "2.75rem"
  button-composer:
    backgroundColor: "{colors.cart-bot-green}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
    padding: "0 1rem"
    height: "3rem"
    width: "100%"
  field:
    backgroundColor: "{colors.message-charcoal}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
    padding: "0 0.75rem"
    height: "2.75rem"
  bubble-user:
    backgroundColor: "{colors.deep-leaf-bubble}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.2xl}"
    padding: "0.75rem 1rem"
  bubble-agent:
    backgroundColor: "{colors.message-charcoal}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.2xl}"
    padding: "0.75rem 1rem"
  compare-card:
    backgroundColor: "{colors.after-hours-ground}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
    padding: "0.75rem"
---

# Design System: Shopping with Agent

## Overview

**Creative North Star: "After-Hours Transcript"**

The product UI is a single dark chat column — like a laptop left open after midnight. Ground is near-black, talk happens in rounded bubbles, and the only vivid green is the cart-bot accent that lights the room. The homepage *is* the conversation: a seeded transcript of an assistant shopping, then a sticky composer that downloads `shopping-mcp.json` so the visitor’s assistant can do the same. It refuses a split-audience two-card hero; merchants and docs live on secondary routes with the same talk type and quiet chrome.

Density stays conversational: one narrow content column, hairline moss dividers for header/footer/composer, tonal bubble surfaces instead of card grids. Motion is a short stagger-enter on thread children when reduced motion is off. Mono appears only for the config filename and occasional CLI hints — never for body talk.

**Key Characteristics:**
- Full-viewport chat shell with inset cart-bot glow on after-hours ground
- Rounded message bubbles (user deep-leaf, agent charcoal) plus in-thread compare stacks
- Sticky bottom composer as the primary CTA surface
- Atkinson Hyperlegible for all talk; ui-monospace reserved for `shopping-mcp.json`
- Cart-bot green for actions and focus; clay only for errors and disabled connection states

## Colors

A nocturnal laptop palette: warm near-white ink on near-black ground, one moss-green accent family, and a single clay alert.

### Primary
- **Cart-Bot Green** (`#3d6b4f`): Primary actions, borders on filled buttons, selection highlight, scrollbar thumb, and the shell’s inset glow source.
- **Lit Cart-Bot** (`#4a8260`): Hover lift for primary and composer buttons.
- **Soft Moss** (`#8fbf9a`): Focus outline and positive “in stock / connected” status.
- **Deep Leaf Bubble** (`#2a3d31`): User message bubble fill — darker, cooler green than the action accent.

### Neutral
- **After-Hours Ground** (`#121212`): App shell and thread paper; compare-card faces sit on this ground inside agent bubbles.
- **Message Charcoal** (`#1e1e1e`): Agent bubbles, fields, and secondary hover fills.
- **Outer Void** (`#0a0a0a`): Body backdrop outside the max-width shell.
- **Warm Ink** (`#f4f4f0`): Headings, bubble copy, button labels, caret, and selected text.
- **Sage Whisper** (`#b7c4b8`): Default body and muted meta; placeholders and step lists.
- **Moss Divider** (`#2a332c`): Hairline borders for header, footer, composer, fields, and status rows.

### Secondary
- **Clay Alert** (`#e8b4a2`): Sold-out / disabled / sync-error / form-status text only — never decorative.

### Named Rules
**The One Glow Rule.** Cart-bot green is the only chromatic accent for actions and atmosphere; clay is reserved for failure and disabled connection. Soft moss marks focus and healthy status, not marketing chrome.

**The Bubble Ink Rule.** Talk always uses warm ink on charcoal or deep-leaf; never put primary green fills behind long reading copy.

## Typography

**Display Font:** Atkinson Hyperlegible (with ui-sans-serif)
**Body Font:** Atkinson Hyperlegible (with ui-sans-serif)
**Label/Mono Font:** ui-monospace stack (SFMono / Menlo / Monaco / Consolas)

**Character:** Hyperlegible talk type for every conversational surface. Mono is a filename badge, not a second personality.

### Hierarchy
- **Headline** (700, 1.75rem, 1.15, −0.02em): Page titles on docs, privacy, and seller routes.
- **Title** (700, 1.1875rem at `sm+`; `text-sm` on small): Header wordmark “Shopping with Agent.”
- **Intro** (400, 1.0625rem, 1.6): Supporting paragraph under page headlines.
- **Body** (400, 1rem, 1.6): Bubble copy, list steps in ink, button labels (medium weight on buttons).
- **Label** (700 for nav/labels, 400 for meta; 0.8125rem, 1.4): Nav links, field labels, captions, composer steps.
- **Mono** (400, 0.8125rem, tight tracking): The literal filename `shopping-mcp.json` and rare CLI snippets such as `npm run sync`.

### Named Rules
**The Talk Face Rule.** Atkinson Hyperlegible carries all human-readable UI. Do not introduce a second display family.

**The Mono Filename Rule.** `font-mono` appears for config/CLI identifiers only — never for headlines, nav, or bubble prose.

## Layout

A single chat column inside a centered shell: outer body on outer void; shell `max-width: 48rem` (`max-w-3xl`), full `h-dvh`, flex column with sticky header and footer chrome. Content and thread constrain to `max-width: 36rem` (`max-w-xl`). Horizontal padding is `1.25rem` (`px-5`), stepping to `2rem` (`sm:px-8`). Thread children stack with `1rem` gap; bubbles cap at `min(75%, 36rem)`. Header `min-height` 3.5rem / 4rem at `sm`; footer and composer use matching horizontal padding and hairline top/bottom borders. The homepage composer is `sticky bottom-0` above the footer, full-width CTA then mono filename then numbered steps.

## Elevation & Depth

Depth is mostly tonal and atmospheric, not a shadow stack. The shell carries an inset cart-bot glow (`inset 0 0 120px 40px rgb(61 107 79 / 0.14)`). Surfaces stack as ground → charcoal bubbles → paper compare faces. Chrome (header, footer, composer) stays flat with moss dividers. In-thread product compares use a localized dark offset shadow and slight overlap/rotation — treat that as signature transcript decoration, not a reusable elevation token for page chrome.

### Named Rules
**The Glow-Not-Card Rule.** Prefer inset green glow and tonal bubble fills for depth. Do not put drop shadows on the shell, header, footer, or composer.

## Shapes

Two radii define the form language: gently curved controls at `0.75rem` (`rounded-xl`) for buttons, fields, and compare faces; softer talk capsules at `1rem` (`rounded-2xl`) for message bubbles. Borders are 1px moss divider (or primary on filled buttons). No pills, no sharp rectangles, no floating glass panels.

## Components

### Buttons
Filled, calm, full-contrast ink on cart-bot green. Shape is `0.75rem` radius; primary and secondary share `min-height: 2.75rem` and `px-6`; composer is full-width `min-height: 3rem` with `px-4`.

- **Primary (`btn`):** Cart-bot fill + border, warm ink, medium weight; hover lit cart-bot; disabled wait cursor at 60% opacity.
- **Secondary (`btn-secondary`):** Transparent with moss border; hover fills message charcoal.
- **Composer (`btn-composer`):** Same green family as primary, full width, snug leading — the sticky download CTA.

### Cards / Containers
No general card system. Compare faces inside agent bubbles are paper-ground tiles (`rounded-xl`, `px-3 py-3`) stacked with slight negative margin and ±1° rotation on trailing items. Status on seller uses a hairline-divided definition list, not cards.

### Inputs / Fields
- **Style:** Message charcoal fill, moss border, `0.75rem` radius, warm ink, sage placeholder, `min-height: 2.75rem`, `px-3`.
- **Focus:** Global `outline: 2px solid soft-moss` with `2px` offset (`:focus-visible`).
- **Labels:** Label size, bold, warm ink, stacked above the field with a small gap.

### Navigation
Header: logo mark + bold wordmark left; label-size bold sage links right that warm to ink on hover. Footer: same link treatment, right-aligned. No underline on nav; inline content links use underline with primary decoration and `underline-offset: 4px`.

### Message Bubbles (signature)
- **User:** Deep-leaf fill, right-aligned (`ml-auto`), `rounded-2xl`, `px-4 py-3`.
- **Agent:** Message charcoal, left-aligned (`mr-auto`), same padding/radius; may nest compare stacks and label captions.
- **Thread motion:** Children animate `translateY(0.4rem)` → none over 0.5s `cubic-bezier(0.16, 1, 0.3, 1)` with 0.12s / 0.24s stagger when motion is allowed.

### Sticky Composer (signature)
Paper ground, moss top border, sticky bottom inside the shell. Stack: composer button → mono filename → decimal steps in sage label type. This is the homepage’s only primary call to action.

## Do's and Don'ts

### Do:
- **Do** keep shopper surfaces as one conversation column with bubbles and a sticky composer download.
- **Do** use Atkinson Hyperlegible for talk and reserve mono for `shopping-mcp.json` (and rare CLI).
- **Do** use cart-bot green for primary actions, focus glow, and the shell inset atmosphere.
- **Do** keep content at `max-w-xl` inside a `max-w-3xl` glowing shell on outer void.

### Don't:
- **Don't** ship a split-audience two-card hero or merchant-first homepage.
- **Don't** introduce a second display typeface or use mono for conversational copy.
- **Don't** spread clay alert or soft moss as decorative accents; clay is failure/disabled only.
- **Don't** reuse drop shadows on chrome — keep elevation tonal + inset glow outside the in-thread compare stack.
