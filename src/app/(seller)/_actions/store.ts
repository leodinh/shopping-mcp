"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { demoStores } from "@/shared/demo-stores";
import { connectDemoStore } from "@/server/merchants/service";

export async function connectStoreAction(
  _previous: { message: string; ok: boolean },
  formData: FormData,
) {
  let result;
  const slug = formData.get("storeSlug");
  if (typeof slug !== "string" || !demoStores.some((store) => store.slug === slug)) {
    return { ok: false, message: "Choose an available demo store." };
  }
  (await cookies()).set("demo-store", slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  try {
    const connected = await connectDemoStore(slug);
    result = {
      ok: true,
      message: `${connected.storeName} connected. ${connected.imported} products synced.`,
    };
  } catch (error) {
    console.error("Demo store connection failed", error);
    result = {
      ok: false,
      message:
        "Could not complete sync. Check that the demo API and database are running, then retry. Any previously synced products are preserved.",
    };
  }
  revalidatePath("/");
  return result;
}
