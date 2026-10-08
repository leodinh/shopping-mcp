export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (name === "DATABASE_URL") {
      throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
    }
    throw new Error(`${name} is required`);
  }
  return value;
}

export function databaseUrl() {
  return requiredEnv("DATABASE_URL");
}

export function sessionSecret() {
  return requiredEnv("SESSION_SECRET");
}

export function credentialsKey() {
  return requiredEnv("CREDENTIALS_KEY");
}

// Normal development: http://localhost:3000 (web) and :3001 (API). Cookies are host-scoped and
// ignore ports, so both share the session with no cookie domain. External MCP and production-like
// testing point these at sibling HTTPS subdomains and set COOKIE_DOMAIN to their parent domain.
export function webOrigin() {
  return process.env.WEB_ORIGIN ?? "http://localhost:3000";
}

export function apiOrigin() {
  return process.env.API_ORIGIN ?? "http://localhost:3001";
}

/** Parent domain for cross-subdomain session cookies; unset on localhost. */
export function cookieDomain() {
  return process.env.COOKIE_DOMAIN || undefined;
}

/** Google sign-in credentials; Google sign-in is off unless both are set. */
export function googleOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** Resend API key for sign-in emails; unset means links are printed to the console instead. */
export function resendApiKey() {
  return process.env.RESEND_API_KEY || undefined;
}

/** Sender for sign-in emails. Resend's test sender only delivers to the Resend account's own email. */
export function emailFrom() {
  return process.env.EMAIL_FROM || "Shopping with Agent <onboarding@resend.dev>";
}

export function betterAuthSecret() {
  return requiredEnv("BETTER_AUTH_SECRET");
}

/** Canonical MCP resource URL: the audience every MCP access token must carry. */
export function mcpResource() {
  return `${apiOrigin()}/api/mcp`;
}

export function apiPort() {
  const port = Number(process.env.API_PORT ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function listenHost() {
  return "127.0.0.1";
}

export function shopifyApiKey() {
  return process.env.SHOPIFY_API_KEY ?? "";
}

export function shopifyApiSecret() {
  return process.env.SHOPIFY_API_SECRET ?? "";
}

export function shopifyScopes() {
  return process.env.SHOPIFY_SCOPES ?? "read_products";
}

export function shopifyRedirectUri() {
  return process.env.SHOPIFY_REDIRECT_URI ?? "";
}

export function sellerDashboardUrl() {
  return `${webOrigin()}/seller`;
}
