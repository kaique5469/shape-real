import { describe, expect, it } from "vitest";
import { MACRO_ORDER, ON_TARGET_TOLERANCE, comparePlan, diffSrText, fmtDiff, fmtMacro, itemsBand, planSummary, type MacroComparison } from "./diet-plan";
import type { MacroTargets } from "./types";

const metas: MacroTargets = { kcal: 1650, proteinG: 126, carbsG: 172, fatG: 51 };
const at = (cmp: MacroComparison[], key: MacroComparison["key"]) => cmp.find((c) => c.key === key)!;

describe("comparePlan (R9)", () => {
  it("1.650 × 1.647 → na meta, diferença −3", () => {
    const c = at(comparePlan(metas, { ...metas, kcal: 1647 }), "kcal");
    expect(c).toEqual({ key: "kcal", target: 1650, plan: 1647, diff: -3, status: "na_meta" });
  });
  it("1.650 × 1.733 → acima, +83", () => {
    const c = at(comparePlan(metas, { ...metas, kcal: 1733 }), "kcal");
    expect(c.status).toBe("acima");
    expect(c.diff).toBe(83);
  });
  it("1.650 × 1.567 → abaixo", () => {
    const c = at(comparePlan(metas, { ...metas, kcal: 1567 }), "kcal");
    expect(c.status).toBe("abaixo");
    expect(c.diff).toBe(-83);
  });
  it("os limites exatos de ±5% contam como na meta", () => {
    expect(ON_TARGET_TOLERANCE).toBe(0.05);
    expect(at(comparePlan(metas, { ...metas, kcal: 1732.5 }), "kcal").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, kcal: 1567.5 }), "kcal").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, proteinG: 132.3 }), "proteinG").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, proteinG: 119.7 }), "proteinG").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, kcal: 1733 }), "kcal").status).toBe("acima");
    expect(at(comparePlan(metas, { ...metas, kcal: 1567 }), "kcal").status).toBe("abaixo");
  });
  it("meta 0: cardápio 0 → na meta; cardápio 10 → acima", () => {
    const zero = { ...metas, carbsG: 0 };
    expect(at(comparePlan(zero, { ...metas, carbsG: 0 }), "carbsG").status).toBe("na_meta");
    const c = at(comparePlan(zero, { ...metas, carbsG: 10 }), "carbsG");
    expect(c.status).toBe("acima");
    expect(c.diff).toBe(10);
  });
  it("segue a ordem de MACRO_ORDER (calorias, proteína, carboidrato, gordura)", () => {
    expect(MACRO_ORDER).toEqual(["kcal", "proteinG", "carbsG", "fatG"]);
    expect(comparePlan(metas, metas).map((c) => c.key)).toEqual(["kcal", "proteinG", "carbsG", "fatG"]);
  });
  it("arredonda a diferença, não o cardápio", () => {
    const c = at(comparePlan(metas, { ...metas, proteinG: 140.6 }), "proteinG");
    expect(c.plan).toBe(140.6);
    expect(c.diff).toBe(15);
  });
});

describe("fmtDiff", () => {
  it("na meta, sinal de mais, menos U+2212 e separador de milhar", () => {
    expect(fmtDiff({ diff: -3, status: "na_meta" })).toBe("na meta");
    expect(fmtDiff({ diff: 597, status: "acima" })).toBe("+597");
    expect(fmtDiff({ diff: -352, status: "abaixo" })).toBe("−352");
    expect(fmtDiff({ diff: -352, status: "abaixo" })).not.toContain("-");
    expect(fmtDiff({ diff: 1200, status: "acima" })).toBe("+1.200");
  });
  it("texto para leitor de tela só fora da meta", () => {
    expect(diffSrText("acima")).toBe("acima da meta");
    expect(diffSrText("abaixo")).toBe("abaixo da meta");
    expect(diffSrText("na_meta")).toBeNull();
  });
  it("macro com unidade e separador", () => {
    expect(fmtMacro("kcal", 1650)).toBe("1.650 kcal");
    expect(fmtMacro("proteinG", 125.6)).toBe("126 g");
  });
});

describe("planSummary (R10)", () => {
  it("todos na meta", () => {
    expect(planSummary(comparePlan(metas, { kcal: 1647, proteinG: 125, carbsG: 172, fatG: 51 }))).toBe("O cardápio fecha com as metas do dia.");
  });
  it("calorias e carboidrato acima, proteína abaixo", () => {
    expect(planSummary(comparePlan(metas, { kcal: 2247, proteinG: 100, carbsG: 289, fatG: 52 }))).toBe("Acima das metas em calorias e carboidrato. Abaixo em proteína.");
  });
  it("três acima", () => {
    expect(planSummary(comparePlan(metas, { kcal: 2247, proteinG: 141, carbsG: 289, fatG: 52 }))).toBe("Acima das metas em calorias, proteína e carboidrato.");
  });
  it("só abaixo: a frase leva 'das metas'", () => {
    expect(planSummary(comparePlan(metas, { kcal: 1647, proteinG: 90, carbsG: 172, fatG: 51 }))).toBe("Abaixo das metas em proteína.");
  });
  it("a ordem do texto segue MACRO_ORDER mesmo com a lista fora de ordem", () => {
    const cmp = comparePlan(metas, { kcal: 2247, proteinG: 141, carbsG: 289, fatG: 80 }).reverse();
    expect(planSummary(cmp)).toBe("Acima das metas em calorias, proteína, carboidrato e gordura.");
  });
  it("sem itens (null)", () => {
    expect(planSummary(null)).toBe("Monte o cardápio para comparar com as metas.");
  });
  it("nunca usa o vocabulário de consumo", () => {
    const all = [
      planSummary(null),
      planSummary(comparePlan(metas, metas)),
      planSummary(comparePlan(metas, { kcal: 2247, proteinG: 90, carbsG: 289, fatG: 10 })),
    ].join(" ");
    expect(all).not.toMatch(/faltam|passou|consumid|você comeu|Total do\s+dia/i);
  });
});

describe("itemsBand", () => {
  it("0, 3 e 6", () => {
    expect(itemsBand(0)).toBe("0");
    expect(itemsBand(3)).toBe("1-5");
    expect(itemsBand(5)).toBe("1-5");
    expect(itemsBand(6)).toBe("6+");
    expect(itemsBand(40)).toBe("6+");
  });
  it("valor estranho cai em 0", () => {
    expect(itemsBand(-1)).toBe("0");
    expect(itemsBand(Number.NaN)).toBe("0");
  });
});
