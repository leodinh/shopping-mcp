import { ZodError } from "zod";
import { searchProducts } from "@/server/catalog/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await searchProducts(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Invalid search parameters", issues: error.issues }, { status: 400 });
    console.error("Catalog search failed", error);
    return Response.json({ error: "Catalog unavailable. Check database setup." }, { status: 503 });
  }
}
