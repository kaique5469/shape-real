import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diz ao cliente se a IA real está ligada neste ambiente e como se tem acesso (sem expor segredos). */
export function GET() {
  return NextResponse.json(aiStatus(), { headers: { "Cache-Control": "no-store" } });
}
