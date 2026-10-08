# Authentication

One sign-in serves two audiences: people using the web app (`/profile`) and AI assistants calling the MCP server for a User's private data. Both go through [Better Auth](https://www.better-auth.com), embedded in the API. There is no separate auth service.

```text
browser ──session cookie──> apps/api /api/auth/*  (Better Auth: users, sessions, OAuth server)
assistant ──Bearer JWT───> apps/api /api/mcp      (verified against Better Auth's JWKS)
apps/web  /login, /consent: the pages Better Auth sends people to
```

The `/api/auth/*` routes and `/.well-known/*` discovery documents are mounted in `apps/api/src/auth/mount.ts`. All configuration is in `apps/api/src/auth/auth-options.ts`.

## Signing in to the web app

- **Email magic link.** `/login` asks the API to send a link. It's valid for 5 minutes and signs the browser in when opened. There's no password.
- **Continue with Google**, when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Google verifies the address, so signing in with Google using an email that already signed in by link reaches the same User (account linking with `google` as a trusted provider).

Either way the result is a Better Auth **Session**: a `better-auth.session_token` cookie set by the API (`__Secure-` prefixed over HTTPS). The web app sends it with credentialed `fetch` calls to the API, and the API resolves the User with `currentUser()` (`apps/api/src/auth/current-user.ts`). Sign-out clears it.

Users own Merchants (`merchants.user_id`). Every `/api/seller` route checks that the store belongs to the signed-in User. Connecting a Shopify store authorizes the store; it never signs anyone in (see **Store connection** in `CONTEXT.md`).

## How assistants sign in (MCP OAuth)

The API is an OAuth 2.1 authorization server for its own MCP endpoint, `<API_ORIGIN>/api/mcp`.

1. **Public tools need no token.** `search_products`, `get_product`, `compare_products` and `get_checkout` work signed out. A valid token is optional.
2. **Private tools trigger sign-in.** Calling `get_account` without a valid token returns HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp", scope="account"`. Assistants such as Claude only start sign-in on that 401. A tool error in a 200 response never prompts.
3. **The client registers itself**, one of two ways:
   - **CIMD (preferred):** the client's `client_id` is a URL to its metadata document, which the server fetches and validates (`@better-auth/cimd`, MCP metadata profile). ChatGPT uses this.
   - **Dynamic Client Registration (fallback):** open, unauthenticated `POST /api/auth/oauth2/register` for clients without CIMD. MCP deprecates DCR; it stays on for compatibility.
4. **The person signs in and consents.** The client is sent to `<WEB_ORIGIN>/login` with a signed OAuth query. After the magic link or Google, `/login` resumes the authorization. `/consent` names the client, says whether its identity is verified, and lists what it asks for.
5. **Tokens.** The client receives a JWT access token (1 hour) and a rotating refresh token (30 days). Authorization codes last 10 minutes. These are Better Auth defaults.
6. **Verification.** `apps/api/src/mcp/auth.ts` checks the signature (JWKS), issuer (`<API_ORIGIN>/api/auth`), audience (`<API_ORIGIN>/api/mcp`, RFC 8707 resource) and expiry. The token's `sub` is the User; tool arguments never choose the user. Signing keys are read over loopback (`http://127.0.0.1:<API_PORT>/api/auth/jwks`), not through public DNS or the tunnel. Set `AUTH_JWKS_URL` to override this.

Scopes: there is one API scope, `account`, plus `openid`, `profile`, `email` and `offline_access`. Clients get `openid offline_access account` by default and may also request `profile` and `email`.

## Configuration

Variables live in the root `.env`; the full table is in the README's [Configuration](../README.md#configuration) section. The ones that matter for auth:

| Variable                                   | Notes                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                       | Required. Signs sessions and OAuth state. Generate with `openssl rand -hex 32`, separate from the other secrets.                                                       |
| `API_ORIGIN`                               | Public API origin. The issuer is `<API_ORIGIN>/api/auth` and the MCP resource is `<API_ORIGIN>/api/mcp`, so tokens issued under one origin are rejected under another. |
| `WEB_ORIGIN`                               | Where `/login` and `/consent` live; also the trusted origin for CORS and redirects.                                                                                    |
| `NEXT_PUBLIC_API_ORIGIN`                   | The API origin as the browser sees it. Must match `API_ORIGIN`'s host.                                                                                                 |
| `COOKIE_DOMAIN`                            | Unset on localhost. On sibling subdomains, set it to the parent domain (e.g. `leodev.online`) so the session cookie set by `api.` is sent from `app.`.                 |
| `RESEND_API_KEY`, `EMAIL_FROM`             | Email delivery for magic links (below).                                                                                                                                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enable Google sign-in (below).                                                                                                                                         |
| `AUTH_JWKS_URL`                            | Optional override for where the MCP endpoint fetches signing keys.                                                                                                     |

## Magic-link delivery

- **No `RESEND_API_KEY`** (local development and tests): the API prints `Magic link for <email>: <url>` to its console. Open that URL in the same browser.
- **With `RESEND_API_KEY`**: links are emailed through Resend and never logged. Use a send-only key. `EMAIL_FROM` must be on a domain verified in Resend, e.g. `Shopping with Agent <onboarding@leodev.online>`. Resend's default `onboarding@resend.dev` sender only delivers to your own Resend account email.

When sending fails, `/login` shows "Could not send the sign-in link" and the API log has Resend's reason (unverified domain, test-sender recipient, rate limit).

## Google sign-in

1. In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** of type **Web application**.
2. Add an authorized redirect URI for each API origin you run: `<API_ORIGIN>/api/auth/callback/google`, for example `http://localhost:3001/api/auth/callback/google` and `https://shopping-api-dev.leodev.online/api/auth/callback/google`.
3. Put the client ID and secret in `.env` and restart the API.

With either variable unset, the button stays on `/login` but reports that Google sign-in is unavailable.

## Local vs tunnel profile

|                                        | Local (default)                      | Tunnel (external assistants)                                      |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| Use for                                | Everyday development, UI work, tests | Testing ChatGPT/Claude against the MCP server, Shopify over HTTPS |
| `WEB_ORIGIN`                           | `http://localhost:3000`              | `https://shopping-app-dev.leodev.online`                          |
| `API_ORIGIN`, `NEXT_PUBLIC_API_ORIGIN` | `http://localhost:3001`              | `https://shopping-api-dev.leodev.online`                          |
| `COOKIE_DOMAIN`                        | unset                                | `leodev.online`                                                   |

Localhost cookies are shared across ports, so the local profile needs no cookie domain. Keep `.env` on the local profile and override for a tunnel run:

```sh
API_ORIGIN=https://shopping-api-dev.leodev.online \
WEB_ORIGIN=https://shopping-app-dev.leodev.online \
NEXT_PUBLIC_API_ORIGIN=https://shopping-api-dev.leodev.online \
COOKIE_DOMAIN=leodev.online \
pnpm dev
```

Sessions and tokens don't carry over between profiles, because the issuer and cookie domain differ. Sign in again after switching. Tunnel setup is in [development-tunnel.md](development-tunnel.md).

## Troubleshooting

- **Signed in, but `/profile` sends you back to `/login`.** The session cookie isn't reaching the API. On the tunnel, check `COOKIE_DOMAIN` and that both hosts share it. Locally, use `localhost` consistently rather than mixing `localhost` and `127.0.0.1`; cookies are per host.
- **The assistant never asks to sign in.** It only does so on the 401 from a private tool (`get_account`). Public tools succeed without a token.
- **The token is rejected after switching profiles.** The issuer and audience include `API_ORIGIN`. Reconnect the assistant.
- **Google: `redirect_uri_mismatch`.** Add `<API_ORIGIN>/api/auth/callback/google` exactly as written to the OAuth client.
- **The magic link says it expired.** Links last 5 minutes and work once. Request a new one.
