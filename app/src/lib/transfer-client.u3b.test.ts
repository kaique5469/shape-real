import { describe, expect, it, vi } from "vitest";
import type { DietPlan, Profile } from "@/lib/domain/types";

// U3b: o reenvio do personal substitui a dieta inteira no aparelho do aluno, inclusive o ajuste feito lá.
// U3c: uma dieta só com metas e orientações é importada e abre em `leitura_metas`.
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
vi.stubGlobal("localStorage", new MemStorage());
vi.stubGlobal("window", globalThis);

vi.mock("@/lib/app-context", async () => {
  const { LocalRepository } = await import("@/lib/data/local");
  return { localRepo: new LocalRepository() };
});
vi.mock("@/lib/analytics", () => ({ track: () => {}, reportError: () => {} }));

const { localRepo } = await import("@/lib/app-context");
const { buildFichaPacket } = await import("@/lib/domain/transfer");
const { dietForLink, dietOrigin, dietReplaceNotice, dietScreen } = await import("@/lib/domain/diet-plan");
const { importFicha } = await import("./transfer-client");

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const student: Profile = { id: "s1", name: "Juliana Prado", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1" };
const diet: DietPlan = {
  id: "d1",
  ownerId: "s1",
  createdBy: "c1",
  name: "Plano alimentar de Juliana",
  targets: { kcal: 1650, proteinG: 126, carbsG: 172, fatG: 51 },
  meals: [
    { uid: "m1", name: "Café da manhã", time: "07:00", items: [{ uid: "i1", foodId: "pao_frances", name: "Pão francês", grams: 50, kcal: 150, proteinG: 4, carbsG: 29, fatG: 1.5 }] },
    { uid: "m2", name: "Almoço", time: "12:30", items: [{ uid: "i2", foodId: "arroz_branco", name: "Arroz branco cozido", grams: 135, kcal: 173, proteinG: 3.4, carbsG: 38, fatG: 0.3 }] },
  ],
  notes: "Beba água.",
  updatedAt: "2026-11-10T12:00:00Z",
};
const packet = (d: DietPlan) => buildFichaPacket({ coach, student, program: null, diet: d, customExercises: [], customFoods: [] });

describe("reenvio da dieta e adjustedAt (U3b)", () => {
  it("depois de gravar adjustedAt, um novo importFicha deixa a dieta sem adjustedAt e com o cardápio do pacote", async () => {
    const aluna = await importFicha(packet(diet), null);
    const mine = (await localRepo.getDiet(aluna.id))!;
    expect(dietOrigin(mine, aluna.id, { remoteCoach: aluna.remoteCoach })).toMatchObject({ kind: "personal", coachFirstName: "Rafael" });

    // A aluna ajusta o cardápio neste aparelho ("Salvar ajustes" grava adjustedAt e mantém createdBy).
    const ajustada = { ...mine, meals: mine.meals.map((m) => (m.uid === "m1" ? { ...m, items: m.items.map((i) => ({ ...i, grams: 250 })) } : m)), adjustedAt: "2026-11-24T15:00:00Z" };
    await localRepo.saveDiet(ajustada);
    const local = (await localRepo.getDiet(aluna.id))!;
    expect(local).toMatchObject({ adjustedAt: "2026-11-24T15:00:00Z", createdBy: "c1" });
    // O /abrir avisaria antes de substituir.
    expect(dietReplaceNotice(local, aluna.id, true)).toBe("ajustes");

    await importFicha(packet({ ...diet, meals: [diet.meals[0]!, { ...diet.meals[1]!, items: [{ ...diet.meals[1]!.items[0]!, grams: 180 }] }], updatedAt: "2026-11-25T09:00:00Z" }), aluna);
    const after = (await localRepo.getDiet(aluna.id))!;
    expect(after).not.toHaveProperty("adjustedAt");
    expect(after.createdBy).toBe("c1");
    expect(after.meals[0]!.items[0]!.grams).toBe(50);
    expect(after.meals[1]!.items[0]!.grams).toBe(180);
    expect(dietReplaceNotice(after, aluna.id, true)).toBeNull();
  });

  it("pacote sem dieta não mexe na dieta ajustada", async () => {
    const aluna = await importFicha(packet({ ...diet, id: "d2" }), null);
    const mine = (await localRepo.getDiet(aluna.id))!;
    await localRepo.saveDiet({ ...mine, adjustedAt: "2026-11-24T15:00:00Z" });
    await importFicha(buildFichaPacket({ coach, student, program: null, diet: null, customExercises: [], customFoods: [] }), aluna);
    expect((await localRepo.getDiet(aluna.id))?.adjustedAt).toBe("2026-11-24T15:00:00Z");
  });
});

describe("dieta só com metas e orientações (U3c)", () => {
  it("é importada e abre em leitura_metas, sem botão de ajuste", async () => {
    const soMetas = dietForLink({ ...diet, id: "d3", meals: [{ uid: "m1", name: "Almoço", items: [] }] })!;
    const aluna = await importFicha(packet(soMetas), null);
    const saved = (await localRepo.getDiet(aluna.id))!;
    expect(saved).toMatchObject({ targets: diet.targets, notes: "Beba água.", createdBy: "c1" });
    const origin = dietOrigin(saved, aluna.id, { remoteCoach: aluna.remoteCoach });
    expect(dietScreen({ mode: "self", editing: false, dirty: false, saved, hasDraftOrDiet: true, origin })).toBe("leitura_metas");
  });
});
