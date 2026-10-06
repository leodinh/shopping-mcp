import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { apiUrl } from "@/lib/api/origin";

// The session cookie lives on the parent domain, so the API host's Better Auth sees it.
// oauthProviderClient carries the signed OAuth query through sign-in, so an MCP client's
// authorization resumes after the magic link.
export const authClient = createAuthClient({
  baseURL: apiUrl("/api/auth"),
  plugins: [magicLinkClient(), oauthProviderClient()],
  fetchOptions: { credentials: "include" },
});
