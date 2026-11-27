import { describe, expect, it } from "vitest";
import { anamneseBase, anoParaIdade, personalBase } from "@/lib/domain/anamnese-fixtures";
import { PROBLEMA_TEXTO } from "@/lib/domain/questionario-link";
import { buildFichaPacket, buildTreinosPacket, ehLinkDeVersaoNova, KINDS_DO_APP, LINK_VERSAO_NOVA_TEXTO } from "@/lib/domain/transfer";
import { KINDS_CONHECIDOS } from "@/lib/domain/questionario-link";
import type { Profile } from "@/lib/domain/types";
import { destinoColado, LINK_RUIM, RECEBER_TEXTO } from "./questionario-receber";

// Revisão da rodada 2: no /receber de um menor, quem autorizou foi o responsável; e link de versão mais nova pede
// para atualizar em todo lugar (nunca "link cortado").

describe("RECEBER_TEXTO.autorizacao", () => {
  it("menor: nomeia o responsável que autorizou, com a data dele", () => {
    const an = anamneseBase(
      { ano: anoParaIdade(11), nome: "Pedro Souza", responsavel: "Ana Souza" },
      { consent: { at: "2026-11-26T09:00:00-03:00", source: "aluno_questionario", textId: "c1", responsavel: { nome: "Ana Souza", at: "2026-11-26T09:00:00-03:00" } } },
    );
    expect(RECEBER_TEXTO.autorizacao("Pedro Souza", an)).toBe("Autorização de saúde: dada por Ana Souza, responsável por Pedro, em 26/11.");
  });
  it("adulto: como antes; sem saúde: 'enviou sem dados de saúde'", () => {
    expect(RECEBER_TEXTO.autorizacao("Júlia Prado", anamneseBase({}, { consent: { at: "2026-11-26T09:00:00-03:00", source: "aluno_questionario", textId: "c1" } }))).toBe(
      "Autorização de saúde: dada por Júlia em 26/11.",
    );
    expect(RECEBER_TEXTO.autorizacao("Júlia Prado", { healthOmitted: true })).toBe("Júlia enviou sem dados de saúde.");
  });
});

describe("link de versão mais nova", () => {
  const coach = personalBase();
  const aluno: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z" };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

  it("'Colar aqui' com ficha ou treinos v:2 pede para atualizar (não 'veio cortado')", () => {
    const ficha = { ...clone(buildFichaPacket({ coach, student: aluno, program: null, diet: null, customExercises: [], customFoods: [] })), v: 2 };
    expect(destinoColado(ficha, "1.x")).toEqual({ erro: PROBLEMA_TEXTO.versao_nova, problema: "versao_nova" });
    const treinos = { ...clone(buildTreinosPacket({ student: aluno, coachId: coach.id, studentRef: "s1", sessions: [] })), v: 2 };
    expect(destinoColado(treinos, "1.x")).toEqual({ erro: PROBLEMA_TEXTO.versao_nova, problema: "versao_nova" });
    expect(destinoColado({ kind: "ficha" }, "1.x")).toEqual({ erro: LINK_RUIM, problema: "invalido" });
  });

  it("ehLinkDeVersaoNova (/abrir e 'Colar aqui', sem o esquema do questionário): kind desconhecido ou v acima da atual", () => {
    expect(ehLinkDeVersaoNova({ kind: "xyz", v: 1 })).toBe(true);
    expect(ehLinkDeVersaoNova({ kind: "ficha", v: 2 })).toBe(true);
    expect(ehLinkDeVersaoNova({ kind: "ficha", v: 1 })).toBe(false);
    expect(ehLinkDeVersaoNova({ kind: "ficha" })).toBe(false);
    expect(ehLinkDeVersaoNova(null)).toBe(false);
    expect(ehLinkDeVersaoNova([])).toBe(false);
  });

  it("as cópias em transfer.ts batem com questionario-link.ts", () => {
    expect(LINK_VERSAO_NOVA_TEXTO).toBe(PROBLEMA_TEXTO.tipo_desconhecido);
    expect(LINK_VERSAO_NOVA_TEXTO).toBe(PROBLEMA_TEXTO.versao_nova);
    expect([...KINDS_DO_APP]).toEqual([...KINDS_CONHECIDOS]);
  });
});
