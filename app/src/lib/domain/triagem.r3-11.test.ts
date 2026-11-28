import { describe, expect, it } from "vitest";
import type { Anamnese, AnamneseAnswers, CtxTriagem } from "./anamnese-types";
import { stripHealth } from "./anamnese";
import { alunoBase, anamneseBase, HOJE, RESPONDIDO_EM } from "./anamnese-fixtures";
import { readAnamnese } from "./questionario-link";
import { alertas, motivoTetoModerado, travaEPorta } from "./triagem";

/**
 * R3-11 (QA-26): A-PARQ-INCOMPLETO também quando as respostas não vieram no junto. O formulário do link exige o PAR-Q,
 * então isso só acontece com pacote alterado, de versão antiga ou por bug: defesa em profundidade, sem recusar o pacote.
 */
const ctx = (over: Partial<CtxTriagem> = {}): CtxTriagem => ({ hoje: HOJE, liberacoes: [], ...over });
const ids = (an: Anamnese) => alertas(an, ctx()).map((x) => x.id);
const parqDe = (v: unknown[]) => v as unknown as AnamneseAnswers["parq"];

describe("A-PARQ-INCOMPLETO pelo link (R3-11)", () => {
  it("PAR-Q com uma resposta faltando: alerta presente, laranja (porta), com o título e o motivo do PAR-Q", () => {
    const an = anamneseBase({ parq: parqDe([0, 0, 0, undefined, 0, 0, 0]) });
    expect(an.via).toBe("link");
    const al = alertas(an, ctx()).find((x) => x.id === "A-PARQ-INCOMPLETO");
    expect(al).toMatchObject({ nivel: "laranja", efeito: "porta", titulo: "PAR-Q incompleto", recomendado: "Pergunte as 7 perguntas antes de começar." });
    expect(al?.porque).toEqual([{ pergunta: "PAR-Q", resposta: "Incompleto" }]);
  });

  it("sem PAR-Q nenhum, com lista curta, vazia ou com valor estranho: alerta presente", () => {
    for (const parq of [undefined, parqDe([]), parqDe([0, 0, 0]), parqDe([0, 0, 0, 0, 0, 0, 2]), parqDe(["0", 0, 0, 0, 0, 0, 0])]) {
      expect(ids(anamneseBase({ parq })), JSON.stringify(parq)).toContain("A-PARQ-INCOMPLETO");
    }
  });

  it("o 'sim' que veio continua valendo (A-PEITO trava) e o incompleto entra junto", () => {
    const an = anamneseBase({ parq: parqDe([0, 1, 0, undefined, 0, 0, 0]) });
    expect(ids(an)).toEqual(expect.arrayContaining(["A-PEITO", "A-PARQ-INCOMPLETO"]));
    const { trava, porta } = travaEPorta(an, ctx());
    expect(trava.map((x) => x.id)).toEqual(["A-PEITO"]);
    expect(porta.map((x) => x.id)).toContain("A-PARQ-INCOMPLETO");
  });

  it("o pacote continua legível: readAnamnese não recusa o PAR-Q pela metade (nunca perder respostas de versão antiga)", () => {
    const an = anamneseBase({ parq: parqDe([0, 0, 0, undefined, 0, 0, 0]) });
    const lido = readAnamnese(alunoBase({ anamnese: JSON.parse(JSON.stringify(an)) as Anamnese }));
    expect(lido && typeof lido === "object").toBe(true);
    expect(ids(lido as Anamnese)).toContain("A-PARQ-INCOMPLETO");
  });

  it("'Seguir mesmo assim' depois da chegada cobre o alerta, como qualquer laranja", () => {
    const an = anamneseBase({ parq: parqDe([0, 0, 0, undefined, 0, 0, 0]) }, { overrides: [{ at: "2026-11-21T09:00:00-03:00", alertas: ["A-PARQ-INCOMPLETO"] }] });
    expect(travaEPorta(an, ctx()).porta.map((x) => x.id)).not.toContain("A-PARQ-INCOMPLETO");
  });

  it("pelo link, `incompleto` (conceito do junto) não vira 'Triagem de saúde incompleta': só o PAR-Q conta", () => {
    const an = anamneseBase({}, { incompleto: ["saude", "dor"] });
    expect(ids(an)).not.toContain("A-PARQ-INCOMPLETO");
    const comParq = alertas(anamneseBase({ parq: undefined }, { incompleto: ["saude"] }), ctx()).find((x) => x.id === "A-PARQ-INCOMPLETO");
    expect(comParq?.titulo).toBe("PAR-Q incompleto");
  });
});

describe("negativos (R3-11)", () => {
  it("formulário normal pelo link (PAR-Q completo): sem A-PARQ-INCOMPLETO, com ou sem 'sim'", () => {
    for (const parq of [parqDe([0, 0, 0, 0, 0, 0, 0]), parqDe([0, 0, 0, 0, 1, 0, 0]), parqDe([1, 1, 1, 1, 1, 1, 1])]) {
      expect(ids(anamneseBase({ parq })), JSON.stringify(parq)).not.toContain("A-PARQ-INCOMPLETO");
    }
  });

  it("sem dados de saúde (autorização não marcada): A-SEM-TRIAGEM, nunca A-PARQ-INCOMPLETO", () => {
    const lista = ids(stripHealth(anamneseBase()));
    expect(lista).toContain("A-SEM-TRIAGEM");
    expect(lista).not.toContain("A-PARQ-INCOMPLETO");
  });

  it("junto: comportamento de antes (PAR-Q pela metade e Saúde pulada)", () => {
    const junto = { via: "junto" as const, by: "personal" as const, consent: { at: RESPONDIDO_EM, source: "personal" as const, textId: "c1" } };
    expect(ids(anamneseBase({}, junto))).not.toContain("A-PARQ-INCOMPLETO");
    expect(alertas(anamneseBase({ parq: undefined }, junto), ctx()).find((x) => x.id === "A-PARQ-INCOMPLETO")?.titulo).toBe("PAR-Q incompleto");
    expect(alertas(anamneseBase({}, { ...junto, incompleto: ["saude"] }), ctx()).find((x) => x.id === "A-PARQ-INCOMPLETO")?.titulo).toBe("Triagem de saúde incompleta");
  });

  it("travas, portas e teto iguais aos de antes nas respostas completas", () => {
    const casos: [Anamnese, string[], string[]][] = [
      [anamneseBase(), [], []],
      [anamneseBase({ parq: parqDe([0, 1, 0, 0, 0, 0, 0]) }), ["A-PEITO"], []],
      [anamneseBase({ parq: parqDe([0, 0, 0, 0, 0, 0, 1]) }), [], ["A-PARQ7"]],
      [anamneseBase({ condicoes: ["cancer"], orientacao: "livre" }), [], []],
    ];
    for (const [an, trava, porta] of casos) {
      const r = travaEPorta(an, ctx());
      expect(r.trava.map((x) => x.id)).toEqual(trava);
      expect(r.porta.map((x) => x.id)).toEqual(porta);
    }
    expect(motivoTetoModerado(anamneseBase(), ctx())).toBeNull();
  });
});
