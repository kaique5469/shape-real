import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAI, structuredCall } from "@/lib/ai/server";
import { analyzeDiet, buildDietTemplate, parseDietText, sumItems } from "@/lib/domain/nutrition";
import { uid } from "@/lib/domain/ids";
import type { DietItem, Meal } from "@/lib/domain/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const targets = z.object({ kcal: z.number().min(800).max(6000), proteinG: z.number().min(20).max(400), carbsG: z.number().min(0).max(900), fatG: z.number().min(10).max(300) });
const body = z.object({
  mode: z.enum(["analyze", "generate"]),
  text: z.string().max(4000).optional(),
  targets,
  goal: z.string().max(40).optional(),
  weightKg: z.number().min(25).max(350).optional(),
  preferences: z.string().max(500).optional(),
  ownerId: z.string().min(1).max(64),
  createdBy: z.string().min(1).max(64),
});

const ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["name", "grams", "kcal", "proteinG", "carbsG", "fatG"],
  properties: { name: { type: "string" }, grams: { type: "number" }, kcal: { type: "number" }, proteinG: { type: "number" }, carbsG: { type: "number" }, fatG: { type: "number" } },
};
const MEALS = {
  type: "array",
  items: { type: "object", additionalProperties: false, required: ["name", "time", "items"], properties: { name: { type: "string" }, time: { type: "string" }, items: { type: "array", items: ITEM } } },
};
const ANALYZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meals", "score", "summary", "highlights", "adjustments"],
  properties: { meals: MEALS, score: { type: "integer" }, summary: { type: "string" }, highlights: { type: "array", items: { type: "string" } }, adjustments: { type: "array", items: { type: "string" } } },
};
const GENERATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notes", "meals"],
  properties: { name: { type: "string" }, notes: { type: "string" }, meals: MEALS },
};

const SYSTEM = `Você é o nutricionista virtual do Shape Real, app brasileiro de treino. Trabalhe com alimentos e porções comuns no Brasil e valores próximos da tabela TACO.
- Seja prático e direto, em português do Brasil, sem jargão.
- Não prescreva suplementos além de whey/creatina, não trate doenças, não dê diagnósticos. Se o texto indicar condição clínica (diabetes, gestação, transtorno alimentar, doença renal), recomende acompanhamento com nutricionista.
- Gramas sempre do alimento pronto para consumo. Arredonde gramas para múltiplos de 5.
- "time" no formato HH:MM ou string vazia.
- Em análises: "score" 0–100 (aderência às metas + qualidade), "summary" em 1 frase, até 4 destaques positivos e até 5 ajustes concretos com troca de alimento e quantidade.`;

interface AIMeal {
  name: string;
  time: string;
  items: Omit<DietItem, "uid">[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
function toMeals(ms: AIMeal[]): Meal[] {
  return ms.slice(0, 8).map((m) => ({
    uid: uid(),
    name: m.name.slice(0, 40),
    time: /^\d{2}:\d{2}$/.test(m.time) ? m.time : undefined,
    items: m.items.slice(0, 15).map((i) => ({
      uid: uid(),
      name: i.name.slice(0, 60),
      grams: Math.max(0, Math.round(i.grams)),
      kcal: Math.max(0, Math.round(i.kcal)),
      proteinG: Math.max(0, r1(i.proteinG)),
      carbsG: Math.max(0, r1(i.carbsG)),
      fatG: Math.max(0, r1(i.fatG)),
    })),
  }));
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const b = parsed.data;
  const owner = { ownerId: b.ownerId, createdBy: b.createdBy };
  const tgt = `Metas diárias: ${b.targets.kcal} kcal, ${b.targets.proteinG} g proteína, ${b.targets.carbsG} g carboidrato, ${b.targets.fatG} g gordura. Objetivo: ${b.goal ?? "não informado"}. Peso: ${b.weightKg ?? "?"} kg.`;

  if (b.mode === "analyze") {
    if (!b.text?.trim()) return NextResponse.json({ error: "Escreva o que você comeu." }, { status: 400 });
    const auth = await authorizeAI(req, "diet_analyze");
    if (auth.useAI) {
      const ai = await structuredCall<{ meals: AIMeal[]; score: number; summary: string; highlights: string[]; adjustments: string[] }>(auth.provider, {
        system: SYSTEM,
        user: `${tgt}\n\nAnalise o que a pessoa comeu (estime porções quando faltarem):\n"""${b.text}"""`,
        schema: ANALYZE_SCHEMA,
        maxTokens: 8000,
      });
      if (ai) {
        const meals = toMeals(ai.meals);
        return NextResponse.json({
          source: "ia",
          meals,
          totals: sumItems(meals.flatMap((m) => m.items)),
          score: Math.max(0, Math.min(100, Math.round(ai.score))),
          summary: ai.summary.slice(0, 240),
          highlights: ai.highlights.slice(0, 4),
          adjustments: ai.adjustments.slice(0, 5),
          unknown: [],
          usage: auth.usage,
        });
      }
    }
    const { meals, unknown } = parseDietText(b.text);
    const fb = analyzeDiet(meals, b.targets, b.weightKg);
    return NextResponse.json({
      source: "motor",
      notice: auth.useAI ? "A IA não respondeu a tempo — análise feita pelo motor do Shape Real." : auth.notice,
      quota: !auth.useAI && auth.status === 402,
      meals,
      totals: fb.totals,
      score: fb.score,
      summary: meals.length ? "Análise pela base de alimentos do Shape Real (valores aproximados)." : "Não reconheci os alimentos. Escreva quantidades e nomes, ex.: “2 ovos, 1 pão francês”.",
      highlights: fb.highlights,
      adjustments: fb.adjustments,
      unknown,
    });
  }

  const auth = await authorizeAI(req, "diet_generate");
  if (auth.useAI) {
    const ai = await structuredCall<{ name: string; notes: string; meals: AIMeal[] }>(auth.provider, {
      system: SYSTEM,
      user: `${tgt}\nPreferências/restrições: ${b.preferences || "nenhuma"}\n\nMonte um cardápio de 1 dia com 4–6 refeições que bata as metas (±5%).`,
      schema: GENERATE_SCHEMA,
      maxTokens: 8000,
    });
    if (ai) {
      const meals = toMeals(ai.meals);
      return NextResponse.json({
        source: "ia",
        diet: { id: uid(), ...owner, name: ai.name.slice(0, 60) || "Cardápio", targets: b.targets, meals, notes: ai.notes.slice(0, 600), updatedAt: new Date().toISOString() },
        usage: auth.usage,
      });
    }
  }
  return NextResponse.json({
    source: "motor",
    notice: auth.useAI ? "A IA não respondeu a tempo — cardápio montado pelo motor do Shape Real." : auth.notice,
    quota: !auth.useAI && auth.status === 402,
    diet: buildDietTemplate(b.targets, owner),
  });
}
