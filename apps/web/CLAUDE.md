# Frontend rules (apps/web)

Next.js 16 App Router, React 19, Tailwind CSS v4 (CSS-first), Better Auth's React client. Before using a Next.js or Better Auth API you haven't used here, check current docs (context7): Next 16 differs from older versions.

Read first: `DESIGN.md` (visual system, its named rules are binding), `../../PRODUCT.md` (who the product is for), `../../CONTEXT.md` (domain words; use them in UI copy).

## Structure

- `src/app/<route>/page.tsx`: thin. Metadata, route config, and one feature component. No logic.
- `src/features/<area>/`: the components, hooks and API calls for one area (`account`, `profile`). Put new code here.
- `src/components/`: app chrome shared by every page (header, footer) only.
- `src/lib/`: small framework-free helpers.
- Import with the `@/` alias. Tests go in `tests/*.test.ts` and run with `node:test` (`pnpm --filter @shopping-mcp/web test`).
- Never import `@shopping-mcp/commerce`, `database`, `config`, or any `apps/*`: the web talks to the API over HTTP. A boundary test enforces this. `@shopping-mcp/contracts` is the only shared package.

## Data and auth

- Server components by default. Add `"use client"` only for state, effects, event handlers, or browser APIs.
- The API owns users and sessions. The web never reads the database or verifies cookies itself.
- Call the API with `apiUrl()` and `credentials: "include"`. Parse every response with its `@shopping-mcp/contracts` schema (see `features/profile/api.ts`); never trust the response's shape.
- Use `authClient` (`features/account/auth-client.ts`) for sign-in, sign-out and session. Don't hand-roll `/api/auth` requests.
- Keep static pages static: don't read `cookies()` or `headers()` in the root layout or in shared chrome. Auth-dependent chrome resolves on the client and hides until resolved (`data-pending` in `account-menu.tsx`) rather than showing the wrong state.
- Private pages may load their data on the server: forward the request's `Cookie` header to the API over loopback (`http://127.0.0.1:<API_PORT>`), never through `NEXT_PUBLIC_API_ORIGIN`, which goes out through the tunnel. Redirect signed-out users with `redirect("/login")`.
- Leave a protected page before signing out (`router.replace("/")`, then `signOut()`), or the page's own signed-out redirect races it.
- Navigate with `next/navigation`. Use `window.location.assign` only for absolute external URLs (OAuth providers, an MCP client's callback).
- Lint forbids calling `setState` synchronously inside an effect. Set state in the promise callback of the work the effect starts.

## Visual system

`DESIGN.md` is the spec: one monospace face, white paper, black ink, 1px rules. In code:

- Use the tokens (`paper`, `ink`, `ink-hover`, `muted`, `wash`; `text-base`, `text-label`, `text-headline`). No raw hex, no new colors, no arbitrary font sizes. A new token goes in `globals.css` `@theme` **and** `DESIGN.md` in the same change.
- Use the utilities before writing classes: `caps`, `btn`, `btn-secondary`, `btn-link`, `field`, `field-label`, `slip`, `leaders`, `tear`.
- No border radius, shadows, gradients, or blur. Hierarchy comes from weight and capitals, not size.
- State is never carried by color alone: use words (`[CONNECTED]`), weight, and dashed vs solid rules. Invalid fields get `aria-invalid`, which `field` already styles.
- Write copy in sentence case in source and let `caps` uppercase it, so screen readers and copy-paste get normal text.
- Check layouts at 1440 and 390 wide. Buttons and fields are 48px tall (`min-h-12`, built into `btn` and `field`).

## Motion

- Entrances: `animate-print` (page or slip, 320ms), `animate-feed` (list items, 280ms, stagger capped), `animate-stamp` (state swaps, 180ms). Exits: `animate-vanish` (200ms).
- Wrap a page's main box in `Slip`. Use `useLeave()` to fade it out **only after a success** that navigates away. Never animate away on failure.
- Hover and press: `duration-150 ease-out`, `active:translate-y-px` on buttons.
- Reduced motion is handled by the tokens (entrances become pure fades). New keyframes must get a reduced-motion variant in `globals.css`.
- No layout shift: reserve space for messages that appear (`min-h-5`), and keep a control's width stable across its labels.

## Forms and accessibility

- `<form noValidate>` with our own validation. Errors appear inline in the reserved line under the field, which has `role="alert"`, with `aria-invalid` and `aria-describedby` on the field. Clear the error on input.
- Pair labels and fields with `useId()`. Never use a placeholder as the label.
- While a request runs, disable its controls and change the label to a present participle ("Sending…", "Disconnecting…").
- Error copy says what happened and what to do next ("Could not send the sign-in link. Try again in a moment."). No raw API errors.
- Menus and popovers support Arrow keys, Home/End, Escape (focus returns to the trigger), Tab, and a click outside. Follow `account-menu.tsx`.
- Destructive actions confirm inline (Disconnect), not with `window.confirm`.
- Focus is always visible; don't remove outlines without a replacement.

## Done means

Run `pnpm --filter @shopping-mcp/web typecheck`, `lint` (zero warnings allowed) and `test`, and look at the change in a browser at desktop and mobile widths on `localhost:3000`, not the tunnel. If the visual system changed, update `DESIGN.md`.
