import { describe, expect, it } from "vitest";
import { analyzeDiet, buildDietTemplate, dietTotals, macroTargets, parseDietText, parseFoodLine } from "./nutrition";

const owner = { ownerId: "u1", createdBy: "u1" };

describe("nutrição", () => {
  it("metas de macros coerentes", () => {
    const t = macroTargets({ sex: "M", weightKg: 80, heightCm: 178, age: 30, activity: "moderado", goal: "emagrecimento" });
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(t.proteinG).toBe(176);
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal)).toBeLessThan(10);
  });

  it("lê porções caseiras em texto livre", () => {
    expect(parseFoodLine("2 ovos").item?.grams).toBe(100);
    expect(parseFoodLine("150g de frango").item?.foodId).toBe("frango_peito");
    expect(parseFoodLine("1 concha de feijão").item?.grams).toBe(86);
    expect(parseFoodLine("meia banana").item?.grams).toBe(35);
    expect(parseFoodLine("arroz integral").item?.foodId).toBe("arroz_integral");
  });

  it("separa refeições e aponta o que não reconheceu", () => {
    const r = parseDietText("Café da manhã: 2 ovos, 1 pão francês, café\nAlmoço: 150g arroz, 1 concha feijão e 120g frango\nJantar: xyzabc");
    expect(r.meals.map((m) => m.name)).toEqual(["Café da manhã", "Almoço"]);
    expect(r.unknown).toContain("xyzabc");
  });

  it("feedback aponta falta de proteína", () => {
    const r = parseDietText("Almoço: 300g arroz, 1 concha feijão, salada");
    const fb = analyzeDiet(r.meals, { kcal: 2200, proteinG: 160, carbsG: 250, fatG: 70 }, 80);
    expect(fb.adjustments.some((a) => a.includes("proteína"))).toBe(true);
    expect(fb.score).toBeLessThan(80);
  });

  it("cardápio-base fica perto da meta calórica", () => {
    const targets = { kcal: 2400, proteinG: 170, carbsG: 270, fatG: 70 };
    const d = buildDietTemplate(targets, owner);
    const t = dietTotals(d);
    expect(Math.abs(t.kcal - targets.kcal) / targets.kcal).toBeLessThan(0.2);
  });
});

describe("cardápio-base ajustado às metas", () => {
  it("fecha proteína e calorias perto da meta em perfis diferentes", () => {
    for (const targets of [
      { kcal: 3020, proteinG: 163, carbsG: 426, fatG: 74 },
      { kcal: 1700, proteinG: 140, carbsG: 150, fatG: 55 },
      { kcal: 2400, proteinG: 170, carbsG: 270, fatG: 70 },
    ]) {
      const t = dietTotals(buildDietTemplate(targets, owner));
      expect(Math.abs(t.kcal - targets.kcal) / targets.kcal).toBeLessThan(0.08);
      expect(Math.abs(t.proteinG - targets.proteinG) / targets.proteinG).toBeLessThan(0.12);
    }
  });
});
