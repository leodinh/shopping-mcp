import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";

export async function POST(request: Request) {
  const setCookie = await destroySession(request.headers.get("cookie"));
  const response = NextResponse.redirect(new URL("/seller", request.url), 303);
  response.headers.set("Set-Cookie", setCookie);
  return response;
}
