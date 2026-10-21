import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectFailureMessage } from "@shopping-mcp/contracts";
import { loadSeller } from "@/features/profile/api";
import { Profile } from "@/features/profile/profile";

export const metadata = {
  title: "Profile · Shopping with Agent",
};

/**
 * Protected: the API validates the session; without a valid one, the visitor goes home. A failed
 * Shopify connection comes back here with `?connect_error=<reason>`, shown as the page's notice.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { connect_error: failure } = await searchParams;
  const notice = failure ? connectFailureMessage(failure) : "";
  // Outside the try: Next signals dynamic rendering by throwing from cookies(); never catch it.
  const cookie = (await cookies()).toString();
  let seller;
  try {
    seller = await loadSeller(cookie);
  } catch (error) {
    // The API couldn't answer, so the session is unknown: show nothing but a retry.
    console.error("Profile load failed", error);
    return <Profile initial={null} notice={notice} />;
  }
  if (!seller) redirect("/");
  return <Profile initial={seller} notice={notice} />;
}
