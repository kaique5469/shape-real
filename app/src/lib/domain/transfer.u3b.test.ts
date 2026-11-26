import { describe, expect, it } from "vitest";
import { dietForLink, dietLinkSummary } from "./diet-plan";
import { buildFichaPacket, parsePacket, type FichaPacket } from "./transfer";
import type { DietPlan, Profile } from "./types";

// U3b: `adjustedAt` existe só no aparelho do aluno. Se um link trouxer o campo (app adulterado ou versão futura), ele
// não entra: o esquema do pacote descarta campos desconhecidos da dieta.
// U3c: a dieta só com metas e orientações (sem cardápio) também vai pelo link e abre do outro lado.
const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const student: Profile = { id: "s1", name: "Juliana Prado", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1" };
const diet: DietPlan = {
  id: "d1",
  ownerId: "s1",
  createdBy: "c1",
  name: "Plano alimentar de Juliana",
  targets: { kcal: 1650, proteinG: 126, carbsG: 172, fatG: 51 },
  meals: [{ uid: "m1", name: "Almoço", time: "12:30", items: [{ uid: "i1", foodId: "arroz_branco", name: "Arroz branco cozido", grams: 135, kcal: 173, proteinG: 3.4, carbsG: 38, fatG: 0.3 }] }],
  notes: "Beba água.",
  updatedAt: "2026-11-10T12:00:00Z",
};
const roundTrip = (d: DietPlan | null) => parsePacket(JSON.parse(JSON.stringify(buildFichaPacket({ coach, student, program: null, diet: d, customExercises: [], customFoods: [] })))) as FichaPacket | null;

describe("parsePacket e adjustedAt da dieta (U3b)", () => {
  it("um pacote com diet.adjustedAt devolve a dieta sem o campo", () => {
    const back = roundTrip({ ...diet, adjustedAt: "2026-11-24T15:00:00Z" });
    expect(back?.diet).toBeTruthy();
    expect(back!.diet).not.toHaveProperty("adjustedAt");
    expect(back!.diet!.updatedAt).toBe(diet.updatedAt);
    expect(back!.diet!.meals[0]!.items[0]!.grams).toBe(135);
  });
});

describe("dieta só com metas e orientações pelo link (U3c)", () => {
  const soMetas: DietPlan = { ...diet, meals: [{ uid: "m1", name: "Almoço", items: [] }] };
  it("é escolhida para o link, montada e aberta, com metas e orientações", () => {
    const chosen = dietForLink(soMetas);
    expect(chosen).toBe(soMetas);
    const back = roundTrip(chosen);
    expect(back?.kind).toBe("ficha");
    expect(back!.diet).toMatchObject({ id: "d1", targets: soMetas.targets, notes: "Beba água." });
    expect(back!.diet!.meals.every((m) => m.items.length === 0)).toBe(true);
    expect(dietLinkSummary(back!.diet!)).toBe("Metas do dia e orientações");
  });
  it("sem orientações, o /abrir diz só 'Metas do dia'", () => {
    const back = roundTrip({ ...soMetas, notes: undefined });
    expect(dietLinkSummary(back!.diet!)).toBe("Metas do dia");
  });
  it("com cardápio, a linha leva as refeições e as metas com separador", () => {
    expect(dietLinkSummary(roundTrip(diet)!.diet!)).toBe("1 refeição · metas de 1.650 kcal por dia");
  });
});
