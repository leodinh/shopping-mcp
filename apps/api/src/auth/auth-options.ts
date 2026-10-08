import type { BetterAuthOptions } from "better-auth";
import { jwt, magicLink } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import {
  apiOrigin,
  betterAuthSecret,
  cookieDomain,
  mcpResource,
  webOrigin,
} from "@shopping-mcp/config";
import { sendMagicLinkEmail } from "./magic-link-email";

/** The one API scope for now; per-feature scopes come with the features that need them. */
export const ACCOUNT_SCOPE = "account";

/**
 * Everything but the database. Kept separate so the Better Auth CLI can generate the Drizzle
 * schema from the same plugin list without loading our database client.
 */
export function authOptions() {
  return {
    baseURL: apiOrigin(),
    basePath: "/api/auth",
    secret: betterAuthSecret(),
    trustedOrigins: [webOrigin()],
    advanced: {
      // Sibling subdomains (app.*, api.*) share the session cookie via their parent domain.
      crossSubDomainCookies: { enabled: cookieDomain() !== undefined, domain: cookieDomain() },
      database: { generateId: "uuid" },
    },
    plugins: [
      jwt(),
      magicLink({ sendMagicLink: ({ email, url }) => sendMagicLinkEmail({ email, url }) }),
      mcp({
        resource: mcpResource(),
        loginPage: `${webOrigin()}/login`,
        consentPage: `${webOrigin()}/consent`,
        scopes: ["openid", "profile", "email", "offline_access", ACCOUNT_SCOPE],
        clientRegistrationDefaultScopes: ["openid", "offline_access", ACCOUNT_SCOPE],
        clientRegistrationAllowedScopes: ["profile", "email"],
        // DCR stays on as a fallback for clients without CIMD; MCP deprecates it.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  } satisfies BetterAuthOptions;
}
