import type { AuthInfo } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { apiOrigin, apiPort, mcpResource } from "@shopping-mcp/config";
import { ACCOUNT_SCOPE } from "../auth/auth-options";

export { ACCOUNT_SCOPE };

/** Tools that act on a user's private data. Calling one without a valid token starts sign-in. */
export const PROTECTED_TOOLS = new Set(["get_account"]);

let keys: JWTVerifyGetKey | undefined;

export function resourceMetadataUrl() {
  return `${apiOrigin()}/.well-known/oauth-protected-resource/api/mcp`;
}

/**
 * Verifies a Better Auth access token for this MCP server: signature (JWKS), issuer, audience
 * bound to the MCP resource, and expiry. The token's `sub` is the user; tool arguments never are.
 */
export async function verifyMcpToken(token: string | undefined): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  // The authorization server runs in this same process: read its keys over loopback rather than
  // through public DNS and the tunnel back to ourselves.
  keys ??= createRemoteJWKSet(
    new URL(process.env.AUTH_JWKS_URL ?? `http://127.0.0.1:${apiPort()}/api/auth/jwks`),
  );
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: `${apiOrigin()}/api/auth`,
      audience: mcpResource(),
    });
    if (!payload.sub) return undefined;
    return {
      token,
      clientId: String(payload.azp ?? payload.client_id ?? ""),
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
      expiresAt: payload.exp,
      extra: { userId: payload.sub },
    };
  } catch (error) {
    // Bad tokens are routine; failing to load the signing keys is not, and would otherwise
    // look like every user being signed out.
    if (!(error instanceof errors.JOSEError) || error instanceof errors.JWKSTimeout) {
      console.error("MCP token verification could not run", error);
    }
    return undefined;
  }
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(header)?.[1];
}

export function userIdFrom(authInfo: AuthInfo | undefined) {
  const userId = authInfo?.extra?.userId;
  return typeof userId === "string" ? userId : undefined;
}

export function wwwAuthenticate(error?: "invalid_token") {
  const parts = [`resource_metadata="${resourceMetadataUrl()}"`, `scope="${ACCOUNT_SCOPE}"`];
  if (error) parts.push(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}

/** True when a JSON-RPC message (or batch) calls a protected tool. */
export function callsProtectedTool(message: unknown): boolean {
  if (Array.isArray(message)) return message.some(callsProtectedTool);
  if (!message || typeof message !== "object") return false;
  const { method, params } = message as { method?: unknown; params?: { name?: unknown } };
  return method === "tools/call" && PROTECTED_TOOLS.has(String(params?.name));
}

/**
 * Claude (and spec-following clients) only start sign-in on an HTTP 401 with a
 * `WWW-Authenticate` challenge, so a protected tool call without a valid token is
 * answered here, before the MCP server runs; a `200` tool error would never prompt.
 */
export async function signInChallenge(request: Request): Promise<Response | undefined> {
  const message: unknown = await request
    .clone()
    .json()
    .catch(() => undefined);
  if (!callsProtectedTool(message)) return undefined;
  const token = bearerToken(request);
  if (await verifyMcpToken(token)) return undefined;
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Sign in required" } },
    {
      status: 401,
      headers: { "WWW-Authenticate": wwwAuthenticate(token ? "invalid_token" : undefined) },
    },
  );
}
