import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { faixaAoEditar } from "./program-editor";

/** R3-6: o editor nunca mostra "12–8"; ao sair do campo, a faixa invertida troca na hora. */
describe("faixaAoEditar (R3-6)", () => {
  const faixa = (repsMin: number, repsMax: number) => ({ repsMin, repsMax });

  it("Mín 12 com Máx 8: ao sair do campo vira 8–12 (troca, não iguala nem apaga)", () => {
    expect(faixaAoEditar("min", 12, faixa(8, 8), true)).toEqual(faixa(8, 12));
    expect(faixaAoEditar("min", 12, faixa(6, 8), true)).toEqual(faixa(8, 12));
  });

  it("Máx abaixo do Mín: ao sair do campo troca também", () => {
    expect(faixaAoEditar("max", 6, faixa(10, 12), true)).toEqual(faixa(6, 10));
  });

  it("enquanto digita, valor que inverteria a faixa não é gravado (o resumo segue mostrando a faixa válida)", () => {
    expect(faixaAoEditar("min", 12, faixa(6, 8), false)).toBeNull();
    expect(faixaAoEditar("max", 5, faixa(6, 8), false)).toBeNull();
  });

  it("enquanto digita, valor dentro da ordem grava só o campo editado", () => {
    expect(faixaAoEditar("min", 1, faixa(6, 8), false)).toEqual(faixa(1, 8));
    expect(faixaAoEditar("max", 15, faixa(6, 8), false)).toEqual(faixa(6, 15));
  });

  it("faixa em ordem e igual nas duas pontas não muda nada", () => {
    expect(faixaAoEditar("min", 8, faixa(6, 12), true)).toEqual(faixa(8, 12));
    expect(faixaAoEditar("max", 10, faixa(6, 12), true)).toEqual(faixa(6, 10));
    expect(faixaAoEditar("min", 10, faixa(10, 10), true)).toEqual(faixa(10, 10));
    expect(faixaAoEditar("max", 10, faixa(10, 10), false)).toEqual(faixa(10, 10));
  });

  it("o resultado final está sempre em ordem (Mín ≤ Máx), para qualquer par", () => {
    for (const v of [1, 5, 8, 12, 30, 999])
      for (const [lo, hi] of [[1, 1], [6, 8], [8, 12], [30, 45]] as const)
        for (const campo of ["min", "max"] as const) {
          const r = faixaAoEditar(campo, v, faixa(lo, hi), true)!;
          expect(r.repsMin, `${campo}=${v} em ${lo}–${hi}`).toBeLessThanOrEqual(r.repsMax);
          expect([r.repsMin, r.repsMax]).toContain(v);
        }
  });
});

/** Etapa 2: os dois campos de Mín e Máx passam pela regra, e a troca é anunciada ao leitor de tela. */
describe("editor ligado à faixa (R3-6)", () => {
  const src = readFileSync(fileURLToPath(new URL("./program-editor.tsx", import.meta.url)), "utf8");

  it("Mín e Máx chamam editarFaixa, que usa faixaAoEditar (sem o antigo 'iguala ao outro')", () => {
    expect(src).toContain('onCommit={(v, final) => editarFaixa(e, "min", v ?? 1, final)}');
    expect(src).toContain('onCommit={(v, final) => editarFaixa(e, "max", v ?? 1, final)}');
    expect(src).toMatch(/function editarFaixa\([^)]*\) \{\s*const next = faixaAoEditar\(campo, v, e, final\);\s*if \(!next\) return;/);
    expect(src).not.toContain("repsMax: Math.max(e.repsMax, v ?? 1)");
    expect(src).not.toContain("repsMin: Math.min(e.repsMin, v ?? 1)");
  });

  it("a troca vai para uma região viva só de leitor de tela", () => {
    expect(src).toMatch(/<p role="status" className="sr-only">\s*\{faixaAviso \?\? ""\}/);
    expect(src).toContain("Faixa posta em ordem: de ${next.repsMin} a ${next.repsMax}.");
  });
});
