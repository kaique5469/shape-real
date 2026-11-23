import { describe, expect, it } from "vitest";
import { DIET_CONSENT_ERROR, dietItemText, dietToText, householdMeasure, macroLine, parseDietBody } from "./diet-share";
import { getFood } from "./foods";
import { itemFromFood } from "./nutrition";
import type { DietPlan } from "./types";

const arroz = getFood("arroz_branco")!;
const feijao = getFood("feijao_carioca")!;

const diet: DietPlan = {
  id: "d1",
  ownerId: "u1",
  createdBy: "c1",
  name: "Dieta de corte",
  targets: { kcal: 1800, proteinG: 130, carbsG: 190, fatG: 55 },
  notes: "Beba 2,5 L de água por dia.",
  updatedAt: "2026-01-01T10:00:00Z",
  meals: [
    { uid: "m1", name: "Almoço", time: "12:30", items: [itemFromFood(arroz, arroz.unit!.g * 3), itemFromFood(feijao, feijao.unit!.g)] },
    { uid: "m2", name: "Ceia", items: [] },
  ],
};

describe("medida caseira", () => {
  it("converte gramas em medidas inteiras e meias, com plural", () => {
    expect(householdMeasure(arroz, arroz.unit!.g * 3)).toBe("3 colheres de servir");
    expect(householdMeasure(feijao, feijao.unit!.g)).toBe("1 concha");
    expect(householdMeasure(feijao, feijao.unit!.g / 2)).toBe("½ concha");
    expect(householdMeasure(feijao, feijao.unit!.g * 1.5)).toBe("1 ½ conchas");
  });
  it("flexiona o adjetivo da medida no plural e para antes de 'de'", () => {
    expect(householdMeasure({ unit: { label: "xícara pequena", g: 50 } }, 100)).toBe("2 xícaras pequenas");
    expect(householdMeasure({ unit: { label: "unidade média", g: 150 } }, 300)).toBe("2 unidades médias");
    expect(householdMeasure({ unit: { label: "colher de sopa", g: 15 } }, 45)).toBe("3 colheres de sopa");
  });
  it("não inventa medida quando a quantidade não fecha", () => {
    expect(householdMeasure(arroz, arroz.unit!.g * 3.27)).toBeNull();
    expect(householdMeasure(undefined, 100)).toBeNull();
  });
});

describe("dieta em texto para WhatsApp", () => {
  const text = dietToText(diet, { studentName: "Ana Souza", coachName: "Carlos" });
  it("abre com o aluno e as metas", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("*Plano alimentar — Ana Souza*");
    expect(lines[1]).toContain("1.800 kcal");
    expect(lines[1]).toContain("proteína 130 g");
  });
  it("lista refeições com horário, gramas e medida caseira", () => {
    expect(text).toContain("*Almoço* (12:30)");
    expect(text).toContain(`• ${arroz.name} — ${arroz.unit!.g * 3} g (3 colheres de servir)`);
    expect(text).toContain("Subtotal:");
  });
  it("pula refeições vazias, soma o dia e fecha com orientações e assinatura", () => {
    expect(text).not.toContain("*Ceia*");
    expect(text).toContain("*Total do cardápio*:");
    expect(text).not.toMatch(/Total do\s+dia/);
    expect(text).toContain("Beba 2,5 L de água por dia.");
    expect(text.trim().endsWith("Beba 2,5 L de água por dia.\n\nCarlos")).toBe(true);
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });
  it("com CREF, assina 'Nome · CREF …'; sem personal, não assina", () => {
    expect(dietToText(diet, { coachName: "Camila Duarte", coachCref: "012345-G/SP" }).split("\n").at(-1)).toBe("Camila Duarte · CREF 012345-G/SP");
    expect(dietToText(diet).trim().endsWith("Beba 2,5 L de água por dia.")).toBe(true);
  });
});

describe("peças do texto reaproveitadas na tela (U3a)", () => {
  it("dietItemText é a linha do WhatsApp sem o marcador", () => {
    const item = itemFromFood(arroz, arroz.unit!.g * 3);
    expect(dietItemText(item)).toBe(`${arroz.name} — ${arroz.unit!.g * 3} g (3 colheres de servir)`);
    expect(dietToText(diet)).toContain(`• ${dietItemText(item)}`);
    expect(dietItemText({ name: "Marmita", grams: 1250 })).toBe("Marmita — 1.250 g");
  });
  it("macroLine com separador de milhar e na ordem calorias, proteína, carboidrato, gordura", () => {
    expect(macroLine({ kcal: 1650, proteinG: 126, carbsG: 172.4, fatG: 51 })).toBe("1.650 kcal · proteína 126 g · carboidrato 172 g · gordura 51 g");
    expect(dietToText(diet).split("\n")[1]).toBe(`Metas do dia: ${macroLine(diet.targets)}`);
  });
});

describe("dados para as metas em Dieta", () => {
  const ok = { sex: "F" as const, birthYear: "1994", heightCm: "165", weightKg: "62,5" };
  const opts = { thisYear: 2026, needsConsent: true, consent: true };
  it("com os quatro dados e a autorização marcada, salva", () => {
    expect(parseDietBody(ok, opts)).toEqual({ ok: true, data: { sex: "F", birthYear: 1994, heightCm: 165, weightKg: 62.5 } });
  });
  it("primeira vez sem marcar a autorização: não salva", () => {
    expect(parseDietBody(ok, { ...opts, consent: false })).toEqual({ ok: false, field: "consent", error: DIET_CONSENT_ERROR });
  });
  it("quem já autorizou não precisa marcar de novo", () => {
    expect(parseDietBody(ok, { ...opts, needsConsent: false, consent: false }).ok).toBe(true);
  });
  it("pede os quatro dados e confere as faixas", () => {
    expect(parseDietBody({ ...ok, sex: "" }, opts)).toMatchObject({ ok: false, field: "sex" });
    expect(parseDietBody({ ...ok, weightKg: " " }, opts)).toMatchObject({ ok: false, field: "weightKg" });
    expect(parseDietBody({ ...ok, birthYear: "94" }, opts)).toMatchObject({ ok: false, field: "birthYear" });
    expect(parseDietBody({ ...ok, heightCm: "1,65" }, opts)).toMatchObject({ ok: false, field: "heightCm" });
    expect(parseDietBody({ ...ok, weightKg: "625" }, opts)).toMatchObject({ ok: false, field: "weightKg" });
  });
});
