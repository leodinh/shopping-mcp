import { redirect } from "next/navigation";
import { loadAccount } from "@/features/account/session";
import { SignIn } from "@/features/account/sign-in";

export const metadata = { title: "Sign in · Shopping with Agent" };

/**
 * Decided on the server, so a signed-in visitor never sees the form flash: they go straight to
 * the profile, unless an MCP client's sign-in (`sig` in the query) is waiting to be resumed.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, { sig }] = await Promise.all([loadAccount(), searchParams]);
  if (account && !sig) redirect("/profile");
  return <SignIn resuming={Boolean(account)} />;
}
