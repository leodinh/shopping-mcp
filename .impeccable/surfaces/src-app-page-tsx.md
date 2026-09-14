---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/layout.tsx","src/app/_components/header.tsx","src/app/_components/footer.tsx","src/app/docs/page.tsx","src/app/privacy/page.tsx","src/app/(seller)/seller/page.tsx","src/app/(seller)/_components/store-connection.tsx"]
---

# Homepage

Mode: Persuade. Primary target: `src/app/page.tsx`. Related: layout, header, footer, docs, privacy, seller.

Audience: shopper with an AI assistant. Job: add Shopping MCP so the assistant can search and compare. Proof: a labeled-synthetic thread that demonstrates compare, then an honest config download. Constraints: preserve `public/logo.png`; no fabricated customers, checkout, or “connected” state; merchants are a quiet secondary path.

## Direction contract

THESIS: The homepage is the conversation — watch an assistant shop, then download `shopping-mcp.json` so yours can. Refuses the split-audience two-card hero.

OWN-WORLD: After-hours laptop glow. Ground `#121212`, bubbles `#1e1e1e`, ink `#f4f4f0`, cart-bot green `#3d6b4f`. Rounded message bubbles, in-thread compare cards, sticky composer. Atkinson Hyperlegible for talk; ui-monospace only for the config filename.

STORY: Visitor believes shopping happens in their assistant via MCP. They download the config, see three next steps, and can reach store-owner connect without it competing for the hero.

FIRST VIEWPORT: Chrome with color cart-bot + wordmark “Shopping with Agent”. A thread: user asks for a commuting backpack; assistant answers with three labeled-synthetic compared products; sticky composer is “Download MCP config” (`shopping-mcp.json`) plus the three steps. No fake Connected. Store owners live in the header as a text link.

FORM: Chat Transcript (grounded list #1), seed `6f5de332`, IMPECCABLE’S PICK. Signature interaction: messages enter in reading order; the composer is the only download control.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
