---
name: Shopping with Agent
description: Itemized receipt. One monospace face on white, black ink, thin black rules.
colors:
  paper: "#ffffff"
  ink: "#000000"
  ink-hover: "#262626"
  muted: "#666666"
  wash: "#f4f4f4"
typography:
  headline:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
  body:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "\"tnum\""
  intro:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.06em"
  wordmark:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  none: "0px"
spacing:
  gutter: "20px"
  gutter-wide: "32px"
  slip-pad: "24px"
  slip-pad-wide: "40px"
  control: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  button-link:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "48px"
  field-label:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  slip:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "{spacing.slip-pad}"
  menu-item-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "10px 16px"
---

# Design System: Shopping with Agent

## Overview

**Creative North Star: "The Itemized Receipt"**

Shopping with Agent prints like a till receipt. Every surface is white paper with black ink: one monospace face (IBM Plex Mono), thin 1px black rules, sharp rectangular fields borrowed from monochrome checkout forms. Rank comes from weight and capitals, not from size; the whole ramp spans only 12px to 18px.

Content is organized with receipt grammar. Account facts read as itemized lines (LABEL, then a dotted leader, then a right-aligned value). Stores are numbered lines (01, 02) with a bracketed status word in a fixed-width column. Sections are separated by dashed "tear" rules. Pages that hold a task (login, consent, profile) sit on a slip: a white panel with a 1px black edge.

Motion has one authored moment. The slip prints in, store lines feed in after it, status words stamp. Everything else is a 150ms state change.

**Key Characteristics:**
- One face, one ink, one paper. Gray is only for secondary text and the hover wash.
- 1px black borders everywhere; square corners everywhere; no shadows.
- Uppercase, tracked labels (0.06em) for every label, heading, button, and status word.
- Dotted leaders, numbered lines, bracketed status, dashed tear rules.
- Tabular numerals globally, so values and counts align like a till printout.

## Colors

Strict monochrome: paper, ink, and one gray. Color never carries meaning by itself.

### Primary
- **Till Ink** (ink): All text, every border and rule, the primary button fill, focus outline, text selection background, and caret. It is the only ink.
- **Pressed Ink** (ink-hover): Primary button hover only. A barely-lifted black so the press reads without a second color.

### Neutral
- **Receipt White** (paper): The single surface for page, slip, fields, menus, and secondary buttons. Nothing sits on a tinted panel.
- **Faded Print** (muted): Secondary text, term labels in itemized lines, placeholders, dotted leaders, line numbers, non-connected status words, footer links. Contrast 5.74:1 on white.
- **Hover Wash** (wash): Hover and keyboard-focus fill for outlined buttons, menu items, and store rows (store rows use it at 60%). Never a resting surface.

### Named Rules
**The One Ink Rule.** Text, rules, borders, and the primary fill are all the same black. Hierarchy never comes from a second hue.

**The No-Signal-Color Rule.** Errors, statuses, and confirmations use words, brackets, and weight, never red, green, or amber. An invalid field gets the same 1px inner ring as focus, plus an ink-colored message.

## Typography

**Display Font:** none
**Body Font:** IBM Plex Mono (with ui-monospace, SFMono-Regular, Menlo, monospace)
**Label/Mono Font:** the same face; `--font-sans` and `--font-mono` both resolve to `--font-receipt`.

**Character:** A single typewriter-grade mono face loaded at 400/500/600/700, so a line reads as printed output and every column aligns.

### Hierarchy
- **Headline** (700, 1.125rem, 1.3, caps): The page title on each slip or page (LOGIN, PROFILE, WHAT WE STORE.). The only step above body.
- **Body** (400, 0.9375rem, 1.6): Values in itemized lines, chat lines, field input, list items. Store names use body at 600 in caps.
- **Intro** (400, 0.9375rem, 1.7, muted): The standfirst under a page headline on docs and privacy. Same size as body, looser leading.
- **Label** (500, 0.75rem, 1.45, caps, 0.06em): Field labels, buttons, menu items, status words, section headings (at 600), term labels (400, muted), helper and error text.
- **Wordmark** (600, 0.8125rem, caps): "Shopping with Agent" in the header only.

### Named Rules
**The Weight-Not-Size Rule.** Rank is set with weight (400/500/600/700) and capitals. New surfaces add no new font sizes; a heading inside a slip is label size at 600, not a bigger number.

**The Tabular Rule.** Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on html). Counts are zero-padded to two digits (01, 02; "··" while loading).

## Layout

Single column, centered. Horizontal gutters are 20px, widening to 32px from the `sm` breakpoint (640px). The shell is a full-height column: a header (56px, 64px from `sm`) with a 1px bottom rule, the page, then a footer (48px) with a 1px top rule and right-aligned links.

Measures by surface: login and consent slips are 28rem wide; the profile slip is 42rem; the home conversation is 48rem; docs and privacy are 36rem. Task slips sit on 48px vertical page padding and pad 24px inside (40px from `sm`). Login and consent center the slip in the viewport; profile top-aligns it so a long store list can scroll.

Vertical rhythm inside a slip: headline, then 32px to the first section, 10px between itemized lines, 32px around each tear rule. Every interactive control is at least 48px tall.

### Named Rules
**The Receipt Grammar Rule.** Key-value facts are itemized lines: a muted caps term, a dotted leader that fills the gap, and the value right-aligned. Lists of owned things are numbered lines with zero-padded indices (01, 02). Status is a bracketed caps word ([CONNECTED], [AWAITING SYNC], [SYNC FAILED], [DISCONNECTED]) in a right-hand column 15ch wide from `sm`. Numbered lines are a deliberate, user-approved part of this world, not a generic numbering habit; use them only for real ordered or itemized records.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth is a 1px black edge: the slip, the dropdown menu, product tiles, and fields are all lines on white. The dropdown sits above content by z-order and its own border, nothing else.

### Named Rules
**The Line-Not-Lift Rule.** If something needs to separate from the page, give it a 1px ink border. Never a shadow, blur, or tinted backdrop.

## Shapes

Every corner is square (0px): slips, fields, buttons, menus, product tiles, client logos. Four rule styles carry all structure:
- **Solid 1px ink:** slip edges, fields, buttons, header and footer rules, product grid cells, the OR divider.
- **Dashed 1px ink ("tear"):** between sections of a slip, under the email line in the account menu, and around the empty-stores box.
- **Dotted 1px ink-muted:** leaders inside itemized lines and separators between store lines.
- **Focus outline:** 2px ink, offset 2px, on every focusable element; fields use a 1px inner ring instead.

## Components

### Buttons
Printed, square, and loud only when black.
- **Shape:** square (0px), 1px ink border, at least 48px tall, 20px horizontal padding, label type in caps.
- **Primary:** ink fill, white text. One per slip, for the action that moves forward (EMAIL ME A SIGN-IN LINK, ALLOW, CONNECT STORE).
- **Hover / Focus:** fill and border go to Pressed Ink over 150ms; pressing nudges the button down 1px; disabled is 50% opacity with a wait cursor.
- **Secondary:** white fill, ink border and text; hover fills with Hover Wash. Used for the alternative path (CONTINUE WITH GOOGLE, DENY).
- **Link:** caps label text with a transparent underline (4px offset) that inks in on hover. Used for in-row actions (SYNC NOW, DISCONNECT), header nav, and footer links (muted there).

### Inputs / Fields
- **Style:** white, 1px ink border, square, 48px tall, 12px horizontal padding, body type. Placeholders are muted caps.
- **Label:** caps label at 500 in ink, stacked 8px above the field.
- **Focus:** native outline removed; a 1px inner ink ring doubles the border to 2px.
- **Error / Disabled:** invalid fields get the same ring; the message sits below in label type, ink, in a reserved 20px line so the form never shifts.

### Navigation
- **Header:** logo plus caps wordmark on the left; DOCS (link button) and the account control on the right, 24 to 32px apart.
- **Account menu:** LOGIN when signed out; ACCOUNT with a small stroked SVG chevron when signed in. The menu is a 224px slip that opens 12px under the trigger: email in muted label above a dashed rule, then PROFILE and LOGOUT rows (10px by 16px) that take the Hover Wash on hover and keyboard focus. Opens in 150ms with a 4px drop, closes in 100ms. While the session resolves the slot is held invisibly so the header never shifts.
- **Footer:** muted caps link buttons, right-aligned, darkening to ink on hover.

### Slip (signature)
The page's receipt: a white panel with a 1px ink edge holding one task. It prints in on arrival (opacity plus a 0.5rem rise, 320ms, cubic-bezier(0.16, 1, 0.3, 1)). When a flow is certain to navigate away (OAuth redirect, Shopify redirect), it fades out over 200ms first; a failure never animates the form away.

### Itemized Line and Store Line (signature)
- **Itemized line:** muted caps term, dotted leader, right-aligned ink value. The stores heading reuses it with the zero-padded count as its value.
- **Store line:** muted index (01) in a 2ch column, store name in caps at 600, bracketed status on the right (ink for CONNECTED, muted otherwise). Below, indented to the name: slug, then a caps meta line (SHOPIFY · N PRODUCTS · SYNCED ...), then link-button actions. Lines feed in 280ms each, staggered 60ms and capped at the fourth; a changed status re-stamps with a 180ms fade.
- **Empty state:** a dashed-bordered box with a caps line and a muted explanation.

### Login divider
Two 1px ink lines with a muted caps OR between them, separating the email form from CONTINUE WITH GOOGLE.

## Do's and Don'ts

### Do:
- **Do** put every task on a slip: white, 1px ink edge, square, 24px padding (40px from `sm`).
- **Do** write labels, headings, buttons, and status words in caps with 0.06em tracking, and set rank with weight.
- **Do** present facts as itemized lines with dotted leaders and right-aligned values, and separate slip sections with a dashed tear rule.
- **Do** show status as a bracketed caps word in a fixed right-hand column, distinguished by ink versus muted, never by hue.
- **Do** show the logo (logo.png) with `mix-blend-multiply` and `grayscale` so it prints in the same ink.
- **Do** keep reduced motion: fades stay (state remains legible), all travel (rises, drops) is removed.
- **Do** use "Shopping with Agent" in UI chrome and "Shopping MCP" for protocol, config file, and developer copy.

### Don't:
- **Don't** add a second hue, a tinted surface, or a colored status chip.
- **Don't** round a corner or add a shadow.
- **Don't** add font sizes beyond the five tokens, or a second typeface.
- **Don't** use the Hover Wash as a resting background.
- **Don't** animate a slip away before navigation is certain, or stagger more than four lines.
