import { describe, expect, it } from "vitest";
import { analyzeDietText } from "./nutrition";

const metas = { kcal: 1650, proteinG: 126, carbsG: 172, fatG: 51 };

describe("analisador com números como na tela (U3a)", () => {
  const r = analyzeDietText("Almoço: 400g de arroz, 300g de frango, 2 conchas de feijão\nJantar: 300g de batata doce, 200g de patinho", metas, 70);
  const texts = [r.summary, ...r.highlights, ...r.adjustments];

  it("calorias com separador de milhar no resumo e nas dicas", () => {
    expect(r.totals.kcal).toBeGreaterThan(1000);
    expect(r.summary).toMatch(/\d\.\d{3} kcal/);
    expect(texts.join(" ")).toContain("1.650 kcal");
    for (const t of texts) expect(t).not.toMatch(/\b\d{4} kcal/);
  });

  it("a nota continua calculada (testes do motor intactos), só não vai para a tela nem para a medição", () => {
    expect(typeof r.score).toBe("number");
  });
});
