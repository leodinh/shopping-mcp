---
target: the UI (homepage)
total_score: 19
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 3
target_identity: "file:/Users/tuandinh/dev/personal-project/shopping-mcp/src/app/page.tsx"
target_fingerprint: "sha256:7ac8d6179c2cd052b2b97362efd9d4477b4030a5a72663dae144e5d86d421832"
target_path: /Users/tuandinh/dev/personal-project/shopping-mcp/src/app/page.tsx
timestamp: 2026-09-14T17-29-41Z
slug: src-app-page-tsx
---
Method: dual-agent (A: 02fa6186-907b-4446-8c9e-2b21262346f6 · B: 09aee7c6-be7d-44f5-b146-f73dcd87687c)

Target: `src/app/page.tsx` (homepage, Persuade) plus related surfaces `/docs`, `/seller`, `/privacy`.

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | “Connect Your AI Assistant →” downloads JSON with no confirmation; `/seller` title stays “Shopping with Agent”; header Docs has no current-route state |
| 2 | Match System / Real World | 2 | “Connect” is a file download; “Powered by MCP” / “speaks MCP” unexplained |
| 3 | User Control and Freedom | 2 | No undo after download; seller DB error “Try again →” goes home; connected dashboard has no disconnect |
| 4 | Consistency and Standards | 2 | Homepage “Connect Your AI Assistant →” vs Docs “Download MCP config →” vs filename `shopping-mcp.json` |
| 5 | Error Prevention | 2 | Domain field is `required` only; no `.myshopify.com` guard; OAuth starts with no permissions preview |
| 6 | Recognition Rather Than Recall | 2 | After silent download, user must remember Docs steps; no named assistants (Claude / ChatGPT / Cursor) |
| 7 | Flexibility and Efficiency | n/a | Persuade homepage: no repeated expert task to accelerate |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained paper/ink; two equal H2s compete; card muted text fails contrast |
| 9 | Error Recovery | 2 | “Could not start Shopify connection.” names no fix; “Sync failed” hides `lastError`; DB copy is developer-facing |
| 10 | Help and Documentation | 2 | Docs is a 3-step pamphlet; zero help beside Connect Shopify |
| **Total** | | **19/36** | **Acceptable** |

#### Design Specificity Verdict

**LLM assessment:** Visually authored, product-interchangeable. Paper `#f4f3ef`, ink rules, Sora, uppercase kickers, square buttons, and the footer hatch are a point of view (quiet stationery / receipt), not default AI-SaaS. The product is not in the picture: the cart-bot mark is flattened with `brightness-0`; the name “Shopping with Agent” never appears on screen; “Shopping, meet AI.” plus two beige cards could be invoicing or CRM unchanged. `/seller` is the same landing template with a form dropped in.

**Deterministic scan:** CLI `impeccable detect` on the TSX sources was clean (exit 0, `[]`). Live `detect.js` (computed CSS/DOM) disagreed, as expected: homepage 5× `low-contrast` (4.2:1, `#6f6f6c` on `#ecebe6` card), 1× `cramped-padding` on `a.btn-audience-secondary`, plus `cream-palette` and `repeating-stripes-gradient` on `body`. Docs also flagged `kicker-above-heading` and cramped padding on the download button. Seller: cream + stripes only.

False positives / world conflicts: `cream-palette` and `repeating-stripes-gradient` are this product’s paper/hatch identity, not leftover slop. `kicker-above-heading` is the same kicker system. Overlay re-scan self-hits (`dark-glow`, `text-occlusion`) are ignored. The contrast misses are real; CLI missed them because they live in CSS, not markup.

**Visual overlays:** Injection succeeded on `/`, `/docs`, and `/seller` from live-server port 8400; overlays painted. The assessment tab was not presented as a [Human] foreground tab, and the overlay server was stopped after capture. No reliable persistent overlay in your view. Fallback: console + CLI findings above. `/privacy` was not injected.

#### Overall Impression

Tasteful stationery without a product. Craft is ahead of task clarity. The single biggest opportunity: stop lying about “Connect” — one path should be a real flow, the other a quieter alternative, with the cart-bot and the name actually on the page.

#### What's Working

- Paper / ink / hatch is a real visual world. The footer hatch reads as packing tape or a receipt.
- Two-path kickers (FOR STORE OWNERS / FOR SHOPPERS) and Docs’ numbered list are clear chunks. Primary vs secondary CTA is considered.
- Basic a11y bones: labeled Shopify domain, logo `aria-label`, live region, `aria-busy`, 44px-class targets, `:focus-visible`.

#### Priority Issues

**[P1] “Connect Your AI Assistant →” is a lied affordance.**
- **Why it matters:** Arrow = navigation; “Connect” = a flow. The control is `<a download>` to `/mcp.json`. Jordan thinks they connected; they have a JSON file and a silent page.
- **Fix:** Download language, show the filename, and a 3-step “now add this to Claude / ChatGPT / Cursor” panel — or start a real connect flow.
- **Suggested command:** `/impeccable clarify`

**[P1] Shopify connect has no reassurance.**
- **Why it matters:** Highest-stakes moment is a headline, a domain field, and a button. No redirect warning, scopes, or “local app / session cookie.” Privacy says do not use real customer data; the primary CTA asks merchants to connect anyway.
- **Fix:** Put authorize-on-Shopify + local-session copy on the form. Link Privacy beside the button. Resolve the product contradiction.
- **Suggested command:** `/impeccable harden`

**[P1] Dual-audience Persuade with no product.**
- **Why it matters:** Equal cards split the decision. On ~390px the shopper card sits below the fold, so Connect Shopify wins by accident. No wordmark; MCP is a footnote.
- **Fix:** Commit a primary audience, demote the other path, show the cart-bot in color with “Shopping with Agent,” and explain MCP in one plain sentence.
- **Suggested command:** `/impeccable distill`

**[P2] `/seller` is a landing page, not Operate.**
- **Why it matters:** Display headline over a tiny form; header still only Docs. Connected board has stats and no verbs (disconnect, retry, last error).
- **Fix:** Seller chrome, page title, “next: Shopify authorize,” verbs on the connected board.
- **Suggested command:** `/impeccable layout`

**[P2] Card body text fails contrast.**
- **Why it matters:** Detector measured 4.2:1 for muted copy and kickers on `#ecebe6` cards (need 4.5:1). LLM review only flagged kickers as “on the edge”; live scan proves the miss.
- **Fix:** Darken `--color-muted` on card, or use heading color for card body.
- **Suggested command:** `/impeccable audit`

#### Persona Red Flags

**Jordan (First-Timer):** Two “Connect”s, unexplained MCP, silent JSON download, Docs step 2 assumes they know “custom MCP server.” Icon-only header: no product name to trust.

**Casey (Distracted Mobile):** First viewport is hero + store-owner card; shopper CTA below the fold. Silent download leaves no proof it worked. Docs is top-right, not in the thumb zone.

**Riley (Stress Tester):** Empty domain = native `required` only. Privacy vs primary CTA contradiction. Same asset, two labels. Sync failed swallows `lastError`. DB failure sends Try again home.

#### Minor Observations

- Header Docs / footer Privacy never get an active style.
- Logo `alt=""` is fine if decorative; `brightness-0` kills the robot face.
- Placeholder `your-store.myshopify.com` is even lighter than muted.
- Homepage CTA has an arrow; seller button drops it.
- AudienceCard without `note` still plants hidden “Powered by MCP” for alignment.
- Contact is GitHub issues.
- Connected “Last synced” is a sliced ISO string + “UTC.”
- Button `disabled:cursor-wait` treats every disabled as pending.
- Detector `cramped-padding` on audience buttons (0px vertical padding vs 16px type).

#### Questions to Consider

- If Privacy is true, why is Connect Shopify the filled primary CTA?
- What if the homepage picked one audience and demoted the other to a text link?
- What if Connect Your AI Assistant opened the Docs steps on the page instead of throwing `shopping-mcp.json` at the OS?
- The mark is already a cart-bot — why hide it, and why is there no wordmark?
- What would `/seller` look like if it were a tool (steps, authorize, disconnect) instead of another poster with a field?
