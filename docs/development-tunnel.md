# Development tunnel

Use `localhost` for everyday development. The tunnel exists so that things outside your machine can reach the local API over HTTPS: ChatGPT and Claude connecting to the MCP server, Google and Shopify redirects, and Shopify webhooks. Don't treat it as the main development URL.

## Hosts

| Host                             | Forwards to                           |
| -------------------------------- | ------------------------------------- |
| `shopping-app-dev.leodev.online` | `http://127.0.0.1:3000` (web)         |
| `shopping-api-dev.leodev.online` | `http://127.0.0.1:3001` (API and MCP) |

Production uses `shopping-app.leodev.online` and `shopping-api.leodev.online`. The app and API are sibling subdomains, so the session cookie is shared through `COOKIE_DOMAIN=leodev.online`.

## Cloudflare setup (one time)

1. **Create the tunnel.** In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel and install `cloudflared` on your machine as a service with the token shown. It then runs in the background.
2. **Add the public hostnames** from the table above. The service type is **HTTP**, not HTTPS: Cloudflare terminates TLS, and the local servers speak plain HTTP. HTTPS here produces `tls: first record does not look like a TLS handshake` in the `cloudflared` logs.
3. **Bypass the cache for both dev hostnames.** By default Cloudflare caches `.js` and gives it a 4-hour browser TTL. Next's dev server reuses chunk file names, so browsers keep running old code after edits. In the zone's Caching → Cache Rules, create a rule matching hostname `shopping-app-dev.leodev.online` **or** `shopping-api-dev.leodev.online`, with **Cache eligibility: Bypass cache** and **Browser TTL: Bypass cache**. Check it with:

   ```sh
   curl -sI "https://shopping-app-dev.leodev.online/_next/static/chunks/<any-chunk>.js" | grep -i -E "cf-cache-status|cache-control"
   ```

   It should show no `max-age=14400`; `cf-cache-status` should be `BYPASS` or `DYNAMIC`. After adding the rule, hard-reload once (Cmd+Shift+R) to drop copies the browser already cached.

`apps/web/next.config.ts` already allows `*.leodev.online` as a dev origin, so hot reload works through the tunnel.

## Running

Start the dev servers with the tunnel origins (see [authentication.md](authentication.md#local-vs-tunnel-profile)):

```sh
API_ORIGIN=https://shopping-api-dev.leodev.online \
WEB_ORIGIN=https://shopping-app-dev.leodev.online \
NEXT_PUBLIC_API_ORIGIN=https://shopping-api-dev.leodev.online \
COOKIE_DOMAIN=leodev.online \
pnpm dev
```

Then open `https://shopping-app-dev.leodev.online`, and add `https://shopping-api-dev.leodev.online/api/mcp` to the assistant as a custom MCP server (or download `/mcp.json` from that host).

Also register the tunnel's callback URLs where providers need them:

- Google: `https://shopping-api-dev.leodev.online/api/auth/callback/google`
- Shopify: `https://shopping-api-dev.leodev.online/api/connections/shopify/callback` as `SHOPIFY_REDIRECT_URI` and in the app's allowed redirect URLs. Shopify webhooks only deliver to HTTPS.
