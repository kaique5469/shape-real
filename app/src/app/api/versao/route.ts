import { versaoDoBuild } from "@/lib/versao";

export const runtime = "nodejs";
// Sempre na hora (sem pré-render nem cache): o checklist de release compara esta resposta com o commit publicado.
export const dynamic = "force-dynamic";

/** Qual build responde neste endereço: `{ sha, at, protocolo, copia }`, sem cache. /api não passa pelo service worker. */
export async function GET() {
  const corpo = versaoDoBuild({ sha: process.env.NEXT_PUBLIC_BUILD_SHA, at: process.env.NEXT_PUBLIC_BUILD_AT });
  return Response.json(corpo, { headers: { "Cache-Control": "no-store" } });
}
