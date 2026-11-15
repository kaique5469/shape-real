import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAI, structuredCall } from "@/lib/ai/server";
import { PROGRAM_JSON_SCHEMA, PROGRAM_SYSTEM, fallbackProgram, programFromAI, programInputSchema, programUserPrompt } from "@/lib/ai/program";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ input: programInputSchema, ownerId: z.string().min(1).max(64), createdBy: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos para gerar a ficha." }, { status: 400 });
  const { input, ownerId, createdBy } = parsed.data;
  const owner = { ownerId, createdBy };

  const auth = await authorizeAI(req, "program");
  if (auth.useAI) {
    const ai = await structuredCall<Parameters<typeof programFromAI>[0]>({
      system: PROGRAM_SYSTEM,
      user: programUserPrompt(input),
      schema: PROGRAM_JSON_SCHEMA as unknown as Record<string, unknown>,
    });
    const program = ai ? programFromAI(ai, input, owner) : null;
    if (program) return NextResponse.json({ program, source: "ia", usage: auth.usage });
    return NextResponse.json({
      program: fallbackProgram(input, owner),
      source: "motor",
      notice: "A IA não respondeu a tempo — montamos com o motor do Shape Real. Seu crédito foi usado; tente de novo se quiser outra versão.",
    });
  }
  // Sem IA disponível a ficha ainda é entregue (motor determinístico); `quota` aciona o paywall no cliente.
  return NextResponse.json({ program: fallbackProgram(input, owner), source: "motor", notice: auth.notice, quota: auth.status === 402 });
}
