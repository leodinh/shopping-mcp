import { listMerchants } from "@/server/merchants/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ merchants: await listMerchants() });
  } catch (error) {
    console.error("Merchant listing failed", error);
    return Response.json({ error: "Catalog unavailable. Check database setup." }, { status: 503 });
  }
}
