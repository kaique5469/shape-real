import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase } from "@/lib/domain/anamnese-fixtures";
import { faltaAutorizacao, formInicial, pedeRevogacao } from "./student-form-state";

// Revisão da rodada 2 (LGPD, art. 8º, §5º): desmarcar a autorização com saúde do questionário leva à revogação (que
// apaga limitações, peso e altura), nunca ao erro "Marque a autorização…".

const doQuestionario = alunoBase({
  anamnese: anamneseBase({ dor: 1, dorOnde: [{ r: "pescoco" }], dorNota: 3, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "nao" }),
  limitations: "cervical; cardiopatia",
  limitacoesDoQuestionario: ["cervical"],
  weightKg: 80,
  heightCm: 178,
  consentHealthAt: "2026-11-20T10:00:00-03:00",
  consentSource: "personal",
});

describe("faltaAutorizacao", () => {
  it("desmarcar com saúde do questionário: revogação, sem o erro da autorização", () => {
    const f = { ...formInicial(doQuestionario, "edicao"), consent: false };
    expect(f.limitations).toBe("cervical; cardiopatia");
    expect(pedeRevogacao(doQuestionario, f)).toBe(true);
    expect(faltaAutorizacao(doQuestionario, f)).toBe(false);
  });
  it("cadastro novo ou perfil sem questionário com saúde digitada e sem a caixa: o erro continua", () => {
    const novo = { ...formInicial(null, "criacao"), weightKg: "70" };
    expect(faltaAutorizacao(null, novo)).toBe(true);
    const semQuestionario = alunoBase({ limitations: "lombar" });
    expect(faltaAutorizacao(semQuestionario, { ...formInicial(semQuestionario, "edicao"), consent: false })).toBe(true);
  });
  it("com a caixa marcada ou sem dado de saúde: nada falta", () => {
    expect(faltaAutorizacao(doQuestionario, formInicial(doQuestionario, "edicao"))).toBe(false);
    expect(faltaAutorizacao(null, formInicial(null, "criacao"))).toBe(false);
  });
});
