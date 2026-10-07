import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./better-auth";

/** The signed-in User from the Better Auth session cookie, or null when signed out. */
export async function currentUser(headers: IncomingHttpHeaders | Headers) {
  const fetchHeaders = headers instanceof Headers ? headers : fromNodeHeaders(headers);
  // No session cookie (plain or __Secure- prefixed) means signed out: skip the session lookup.
  if (!/better-auth\.session_token=/.test(fetchHeaders.get("cookie") ?? "")) return null;
  const session = await auth().api.getSession({ headers: fetchHeaders });
  return session ? { id: session.user.id, email: session.user.email } : null;
}
