import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase, HOJE } from "./anamnese-fixtures";
import { applyAnamnese, AVISO_MOTOR_LOCAL, diffLimitacoes, limitacoesPedemConferencia, motivoDoMotorLocal } from "./anamnese-ficha";
import { generateProgram } from "./generator";

// Revisão da rodada 2: a limitação que só ENTRA num cadastro vazio é preenchida sem perguntar (spec §8.2 e §5.1), e
// "Manter como está" num cadastro vazio não tira a dor do aluno do cadastro em silêncio.

const AGORA = "2026-11-23T12:00:00-03:00";
const joelho = anamneseBase({ dor: 1, dorOnde: [{ r: "joelho" }], dorNota: 4, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "nao" });

describe("limitacoesPedemConferencia", () => {
  it("cadastro vazio (cadastro rápido) com dor no joelho: não pergunta, e 'manter' não impede o preenchimento", () => {
    const cadastro = alunoBase();
    const lim = diffLimitacoes(cadastro, joelho, HOJE);
    expect(lim.entra).toEqual(["joelho"]);
    expect(limitacoesPedemConferencia(cadastro, lim)).toBe(false);
    const salvo = applyAnamnese(cadastro, joelho, { limitacoes: "manter" }, AGORA);
    expect(salvo.limitations).toBe("joelho");
    expect(salvo.limitacoesDoQuestionario).toEqual(["joelho"]);
  });

  it("cadastro com limitação do personal e dor nova no ombro: pergunta (e 'manter' é respeitado)", () => {
    const cadastro = alunoBase({ limitations: "condromalácia no joelho direito" });
    const ombro = anamneseBase({ dor: 1, dorOnde: [{ r: "ombro", l: "e" }], dorNota: 3, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "nao" });
    const lim = diffLimitacoes(cadastro, ombro, HOJE);
    expect(lim.entra).toEqual(["ombro esquerdo"]);
    expect(limitacoesPedemConferencia(cadastro, lim)).toBe(true);
    expect(applyAnamnese(cadastro, ombro, { limitacoes: "manter" }, AGORA).limitations).toBe("condromalácia no joelho direito");
  });

  it("token antigo do app que sai: pergunta", () => {
    const cadastro = alunoBase({ limitations: "joelho", limitacoesDoQuestionario: ["joelho"] });
    const lim = diffLimitacoes(cadastro, anamneseBase({}, { id: "an-2" }), HOJE);
    expect(lim.sai).toEqual(["joelho"]);
    expect(limitacoesPedemConferencia(cadastro, lim)).toBe(true);
  });
});

describe("motivoDoMotorLocal (IA ligada)", () => {
  it("com questionário ou termos do app nas limitações, a base sai do motor do app (nada vai para /api/ai)", () => {
    expect(motivoDoMotorLocal({ comQuestionario: true, cap: false, avoidIds: [] })).toBe("questionario");
    expect(motivoDoMotorLocal({ comQuestionario: false, limitacoesDoQuestionario: ["pressão alta"], cap: false, avoidIds: [] })).toBe("questionario");
  });
  it("teto moderado ou exercícios fora da ficha (que a IA não recebe): motor do app", () => {
    expect(motivoDoMotorLocal({ comQuestionario: false, cap: true, avoidIds: [] })).toBe("restricao");
    expect(motivoDoMotorLocal({ comQuestionario: false, cap: false, avoidIds: ["burpee"] })).toBe("restricao");
  });
  it("sem nada disso, a IA pode montar", () => {
    expect(motivoDoMotorLocal({ comQuestionario: false, cap: false, avoidIds: [] })).toBeNull();
    expect(AVISO_MOTOR_LOCAL.questionario).toContain("as respostas não saem daqui");
  });
  it("o motor do app aplica o teto: sem HIIT nem burpee na ficha moderada", () => {
    const usados = (cap: boolean) => {
      const ids = new Set<string>();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const p = generateProgram(
          { goal: "condicionamento", level: "intermediario", daysPerWeek: 4, sessionMinutes: 60, equipment: "academia", system: "abcd", limitations: "", emphasis: [], ...(cap ? { intensityCap: "moderada" as const } : {}), seed },
          { ownerId: "a", createdBy: "p" },
        );
        for (const d of p.days) for (const e of d.exercises) ids.add(e.exerciseId);
      }
      return ids;
    };
    const FORA = ["hiit_esteira", "hiit_bike", "burpee"];
    expect(FORA.some((id) => usados(false).has(id))).toBe(true);
    for (const id of FORA) expect(usados(true).has(id)).toBe(false);
  });
});
