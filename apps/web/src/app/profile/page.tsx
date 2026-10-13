import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadSeller } from "@/features/profile/api";
import { Profile } from "@/features/profile/profile";

export const metadata = {
  title: "Profile · Shopping with Agent",
};

/** Protected: the API validates the session; without a valid one, the visitor goes home. */
export default async function ProfilePage() {
  let seller;
  try {
    seller = await loadSeller((await cookies()).toString());
  } catch (error) {
    // The API couldn't answer, so the session is unknown: show nothing but a retry.
    console.error("Profile load failed", error);
    return <Profile initial={null} />;
  }
  if (!seller) redirect("/");
  return <Profile initial={seller} />;
}
