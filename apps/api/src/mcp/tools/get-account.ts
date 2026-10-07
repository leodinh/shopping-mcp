import { z } from "zod";
import type { AuthInfo, CallToolResult } from "@modelcontextprotocol/server";
import { getAccount } from "@shopping-mcp/commerce/auth";
import { listStoresForUser } from "@shopping-mcp/commerce/merchants";
import { ACCOUNT_SCOPE, userIdFrom, wwwAuthenticate } from "../auth";
import { dataResult } from "./responses";

const oauth = [{ type: "oauth2", scopes: [ACCOUNT_SCOPE] }];

export const getAccountTool = {
  title: "Get Account",
  description:
    "Show which Shopping with Agent account you are signed in as and the stores you own. Requires sign-in.",
  inputSchema: z.object({}),
  // ChatGPT reads per-tool security schemes to know this tool needs OAuth.
  _meta: { securitySchemes: oauth },
};

export async function runGetAccountTool(
  _input: unknown,
  ctx: { http?: { authInfo?: AuthInfo } },
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  const userId = userIdFrom(authInfo);
  // Normally unreachable (the controller answers with 401 first); ChatGPT's in-result challenge.
  if (!userId) {
    return {
      content: [{ type: "text", text: "Sign in to Shopping with Agent to see your account." }],
      isError: true,
      _meta: { "mcp/www_authenticate": [wwwAuthenticate()] },
    };
  }
  const account = await getAccount(userId);
  if (!account) return { content: [{ type: "text", text: "Account not found." }], isError: true };
  const stores = (await listStoresForUser(userId)).map((store) => ({
    id: store.id,
    name: store.name,
    shop: store.slug,
    connected: store.enabled === true,
    productCount: store.productCount,
    lastSyncedAt: store.lastSyncedAt,
    lastError: store.lastError,
  }));
  // The token's issuer and audience were already checked; this shows who it was issued to.
  return dataResult({
    account,
    stores,
    connection: { clientId: authInfo?.clientId, scopes: authInfo?.scopes },
  });
}
