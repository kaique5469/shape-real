import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase, HOJE } from "./anamnese-fixtures";
import { antesDeGerar, avaliacaoPendente, entradaInicial, pickAiInput, textoAntesDeGerar, toGenerateInput } from "./anamnese-ficha";
import type { Parq } from "./anamnese-types";
import { generateProgram } from "./generator";
import { abertosParaLiberar, alertas, comLiberacao, comOverride, novaLiberacao } from "./triagem";

/*
 * Sem dublês: readAnamnese (E) e triagem (A) reais. O que se confere é o caminho do gerador assistido (spec §6.4,
 * aceite do track B): com vermelho aberto não há "Seguir mesmo assim" e o override não destrava; com laranja, o
 * override datado destrava; PAR-Q 5 ou 6 "sim" isolado não abre porta (§19).
 */
const parq = (...sim: number[]): Parq => [0, 0, 0, 0, 0, 0, 0].map((_, i) => (sim.includes(i) ? 1 : 0)) as Parq;
const DEPOIS = "2026-11-23T11:00:00-03:00";

describe("gerador assistido com a triagem real", () => {
  it("vermelho (PAR-Q 2 'sim'): trava sem 'Seguir mesmo assim'; override não destrava; liberação registrada destrava", () => {
    const p = alunoBase({ anamnese: anamneseBase({ parq: parq(1) }) });
    const antes = antesDeGerar(p, HOJE);
    expect(antes.modo).toBe("trava");
    expect(textoAntesDeGerar(antes, p.name)).toMatchObject({ registrar: true, seguir: false });
    expect(avaliacaoPendente(p, HOJE)).toBe(true);
    // "Seguir mesmo assim" só vale para laranja: mesmo gravado à força, o vermelho continua travando.
    const forcado = comOverride(p, antes.modo === "trava" ? antes.alertas.map((a) => a.id) : [], DEPOIS);
    expect(antesDeGerar(forcado, HOJE).modo).toBe("trava");
    // A liberação cobre os pontos abertos (as caixas do diálogo, todas marcadas).
    const an = p.anamnese!;
    const caixas = abertosParaLiberar(alertas(an, { hoje: HOJE, liberacoes: [] })).map((a) => a.id);
    expect(caixas).toContain("A-PEITO");
    const liberado = comLiberacao(p, novaLiberacao({ por: "medico", data: "2026-11-23", alertas: caixas, agora: DEPOIS }));
    expect(antesDeGerar(liberado, HOJE)).toEqual({ modo: "livre" });
    expect(avaliacaoPendente(liberado, HOJE)).toBe(false);
  });

  it("laranja (PAR-Q 7 'sim'): porta; 'Seguir mesmo assim' grava o override datado e destrava", () => {
    const p = alunoBase({ anamnese: anamneseBase({ parq: parq(6), parqDetalhe: "viagem" }) });
    const antes = antesDeGerar(p, HOJE);
    expect(antes.modo).toBe("porta");
    expect(textoAntesDeGerar(antes, p.name)).toMatchObject({ registrar: true, seguir: true, conversei: "Conversei com Ana sobre isso" });
    const seguiu = comOverride(p, antes.modo === "porta" ? antes.alertas.map((a) => a.id) : [], DEPOIS);
    expect(seguiu.anamnese!.overrides).toEqual([{ at: DEPOIS, alertas: ["A-PARQ7"] }]);
    expect(antesDeGerar(seguiu, HOJE)).toEqual({ modo: "livre" });
  });

  it("PAR-Q 5 ou 6 'sim' isolado não abre porta (só lembra o termo)", () => {
    expect(antesDeGerar(alunoBase({ anamnese: anamneseBase({ parq: parq(4) }) }), HOJE)).toEqual({ modo: "livre" });
    expect(antesDeGerar(alunoBase({ anamnese: anamneseBase({ parq: parq(5) }) }), HOJE)).toEqual({ modo: "livre" });
  });

  it("aluno sem treino regular: teto moderado marcado; a ficha sai com a nota e a IA não recebe nada do questionário", () => {
    const p = alunoBase({ goal: "hipertrofia", level: "iniciante", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", anamnese: anamneseBase({ regular: "nao", naoQuer: ["afundo"] }) });
    const ficha = toGenerateInput(p, { semanas: 6 }, HOJE, { hoje: HOJE, liberacoes: [] })!;
    expect(ficha.tetoMotivo).toBe("Sem treino regular nos últimos 3 meses");
    const e = entradaInicial(p, { semanas: 6 }, ficha, true);
    expect(e).toMatchObject({ teto: true, durationWeeks: 6 });
    const { teto: _t, durationWeeks: _d, sistemaEscolhido: _s, avoidIds, ...base } = e;
    void _t;
    void _d;
    void _s;
    const input = { ...base, avoidIds, intensityCap: "moderada" as const, seed: 7 };
    const prog = generateProgram(input, { ownerId: p.id, createdBy: "c1" });
    expect(prog.notes).toContain("Intensidade moderada (dá para conversar treinando)");
    expect(prog.days.flatMap((d) => d.exercises.map((x) => x.exerciseId))).not.toContain("afundo");
    expect(Object.keys(pickAiInput(input)).sort()).toEqual(["daysPerWeek", "emphasis", "equipment", "goal", "level", "limitations", "seed", "sessionMinutes", "system"].filter((k) => k in input).sort());
    expect(pickAiInput(input)).not.toHaveProperty("avoidIds");
    expect(pickAiInput(input)).not.toHaveProperty("intensityCap");
  });
});
