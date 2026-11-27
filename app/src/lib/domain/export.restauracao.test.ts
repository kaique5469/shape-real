import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase } from "./anamnese-fixtures";
import type { Liberacao } from "./anamnese-types";
import { apagarRespostas, revogarSaude } from "./anamnese-perfil";
import { buildBackup, mesclarRestauracao, parseBackup } from "./export";
import { consentConfirmed } from "./transfer";

// Revisão da rodada 2 (LGPD): restaurar uma cópia de segurança de ANTES da revogação ou do "Apagar respostas" não
// desfaz o ato: não voltam a autorização, as liberações, o peso, a altura, as limitações nem as respostas.

const COPIA_EM = "2026-11-20T12:00:00-03:00";
const ATO_EM = "2026-11-22T09:00:00-03:00";
const lib = (id: string, registradoEm: string): Liberacao => ({ id, por: "medico", data: registradoEm.slice(0, 10), alertas: ["A-PARQ7"], restricoes: "evitar carga alta", registradoEm });

/** O aluno como estava quando a cópia foi feita: questionário com saúde, autorização, liberação e medidas. */
const naCopia = alunoBase({
  anamnese: anamneseBase({ dor: 1, dorOnde: [{ r: "joelho", l: "d" }], dorNota: 3, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "nao" }, { id: "an-1" }),
  liberacoes: [lib("lib-1", "2026-11-20T11:00:00-03:00")],
  consentHealthAt: "2026-11-20T10:00:00-03:00",
  consentSource: "personal",
  weightKg: 62,
  heightCm: 165,
  limitations: "joelho direito",
  limitacoesDoQuestionario: ["joelho direito"],
});

describe("mesclarRestauracao depois da revogação", () => {
  const revogado = revogarSaude(naCopia, ATO_EM);

  it("revogarSaude grava a data da revogação", () => {
    expect(revogado.saudeRevogadaEm).toBe(ATO_EM);
  });

  it("a cópia antiga não traz de volta autorização, liberações, peso, altura, limitações nem a saúde das respostas", () => {
    const r = mesclarRestauracao(revogado, naCopia);
    expect(consentConfirmed(r)).toBe(false);
    expect(r.consentHealthAt).toBeUndefined();
    expect(r.liberacoes).toBeUndefined();
    expect(r.weightKg).toBeUndefined();
    expect(r.heightCm).toBeUndefined();
    expect(r.limitations).toBeUndefined();
    expect(r.limitacoesDoQuestionario).toBeUndefined();
    expect(r.anamnese?.healthOmitted).toBe(true);
    expect(r.anamnese?.a.dorOnde).toBeUndefined();
    expect(r.saudeRevogadaEm).toBe(ATO_EM);
  });

  it("o que não é de saúde continua vindo da cópia (regra de sempre)", () => {
    const r = mesclarRestauracao(revogado, { ...naCopia, phone: "11911111111" });
    expect(r.phone).toBe("11911111111");
  });

  it("autorização registrada de novo depois da revogação: fica a do aparelho", () => {
    const deNovo = { ...revogado, consentHealthAt: "2026-11-23T10:00:00-03:00", consentSource: "personal" as const, weightKg: 63 };
    const r = mesclarRestauracao(deNovo, naCopia);
    expect(r.consentHealthAt).toBe("2026-11-23T10:00:00-03:00");
    expect(r.weightKg).toBe(63);
  });

  it("cópia feita depois da revogação (com a mesma marca): a mescla de sempre", () => {
    const copiaNova = { ...revogado, phone: "11922222222", weightKg: 64 };
    const r = mesclarRestauracao(revogado, copiaNova);
    expect(r.weightKg).toBe(64);
    expect(r.saudeRevogadaEm).toBe(ATO_EM);
  });
});

describe("mesclarRestauracao depois de 'Apagar respostas'", () => {
  it("a cópia antiga não traz de volta a rodada nem as liberações; a marca fica", () => {
    const apagado = apagarRespostas(naCopia, false, ATO_EM);
    expect(apagado.respostasApagadasEm).toBe(ATO_EM);
    const r = mesclarRestauracao(apagado, naCopia);
    expect(r.anamnese).toBeUndefined();
    expect(r.anamnesePrev).toBeUndefined();
    expect(r.liberacoes).toBeUndefined();
    expect(r.respostasApagadasEm).toBe(ATO_EM);
    // "Apagar respostas" mantém a autorização.
    expect(r.consentHealthAt).toBe(naCopia.consentHealthAt);
  });

  it("com 'Apagar também…': limitações do app, peso igual à resposta e tokens não voltam", () => {
    const apagado = apagarRespostas(naCopia, true, ATO_EM);
    const r = mesclarRestauracao(apagado, naCopia);
    expect(r.limitations).toBeUndefined();
    expect(r.limitacoesDoQuestionario).toBeUndefined();
    expect(r.weightKg).toBeUndefined();
  });

  it("liberação registrada depois do ato continua (está no aparelho)", () => {
    const apagado = { ...apagarRespostas(naCopia, false, ATO_EM), liberacoes: [lib("lib-2", "2026-11-23T10:00:00-03:00")] };
    expect(mesclarRestauracao(apagado, naCopia).liberacoes?.map((l) => l.id)).toEqual(["lib-2"]);
  });

  it("perfil apagado antes desta regra (sem a marca no perfil): as marcas sr:v1:qapagado da rodada valem", () => {
    const { respostasApagadasEm: _m, ...semMarca } = apagarRespostas(naCopia, false, ATO_EM);
    void _m;
    const r = mesclarRestauracao(semMarca, naCopia, new Map([["an-1", ATO_EM]]));
    expect(r.anamnese).toBeUndefined();
    expect(r.liberacoes).toBeUndefined();
  });

  it("sem ato depois da cópia: a mescla de sempre (D-32)", () => {
    const r = mesclarRestauracao(alunoBase(), naCopia);
    expect(r.anamnese).toBe(naCopia.anamnese);
    expect(r.liberacoes?.map((l) => l.id)).toEqual(["lib-1"]);
  });
});

describe("marcas de rodadas apagadas no arquivo da cópia", () => {
  it("buildBackup leva só quando há; parseBackup aceita só id → data legível", () => {
    const sem = buildBackup({ profile: alunoBase({ role: "coach" }), apagadas: {} }, new Date(COPIA_EM));
    expect("apagadas" in sem).toBe(false);
    const com = buildBackup({ profile: alunoBase({ role: "coach" }), apagadas: { "an-1": ATO_EM } }, new Date(COPIA_EM));
    const lido = parseBackup(JSON.stringify({ ...com, apagadas: { ...com.apagadas, "": ATO_EM, "an-2": "ontem", "an-3": 7 } }));
    expect(lido?.apagadas).toEqual({ "an-1": ATO_EM });
    expect(parseBackup(JSON.stringify({ ...com, apagadas: "x" }))).toBeNull();
  });
});
