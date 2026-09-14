import { NextResponse } from "next/server";
import { getDashboardMerchant } from "@/server/merchants/repository";
import { enqueueSync } from "@/server/sync/outbox";

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie");
  try {
    const merchant = await getDashboardMerchant(cookie);
    if (!merchant?.connectionId) throw new Error("No connection");
    await enqueueSync(merchant.connectionId);
  } catch {
    // Surface stays on /seller; board shows lastError / status.
  }
  return NextResponse.redirect(new URL("/seller", request.url), 303);
}
