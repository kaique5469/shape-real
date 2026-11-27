import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase, anoParaIdade, HOJE } from "@/lib/domain/anamnese-fixtures";
import { applyAnamnese } from "@/lib/domain/anamnese-ficha";
import { ctxDoJunto, idDaRodadaIncompleta, rascunhoDaIncompleta, rotuloDoSalvarJunto, saudeAutorizada, secaoDoRascunho } from "./questionario-flow";

// Revisão da rodada 2: "Completar o questionário · Continuar" continua a rodada do junto salva pela metade (com as
// respostas e na primeira parte incompleta) e a substitui (mesmo id), em vez de virar uma "reavaliação anterior".

const AGORA = "2026-11-23T12:00:00-03:00";
const ctx = ctxDoJunto({ hoje: HOJE, personal: "Camila Rocha", aluno: "Ana Souza" });
const metade = anamneseBase({ altura: undefined, peso: 92, sexo: "M" }, { id: "junto-1", via: "junto", by: "personal", incompleto: ["voce"], consent: { at: "2026-11-20T10:00:00-03:00", source: "personal", textId: "c1" } });

describe("rodada do junto salva pela metade", () => {
  it("o rascunho derivado mantém peso e sexo e aponta para a primeira parte incompleta", () => {
    const r = rascunhoDaIncompleta(alunoBase({ anamnese: metade }), ctx, AGORA);
    expect(r).not.toBeNull();
    expect(r!.a.peso).toBe(92);
    expect(r!.a.sexo).toBe("M");
    expect(r!.autorizouJunto).toBe(true);
    expect(r!.iniciadoEm).toBe(metade.answeredAt);
    expect(secaoDoRascunho(r!, ctx, "junto")).toBe("voce");
  });

  it("parte incompleta mais adiante: começa nela", () => {
    const r = rascunhoDaIncompleta(alunoBase({ anamnese: { ...metade, incompleto: ["saude", "dor"] } }), ctx, AGORA);
    expect(secaoDoRascunho(r!, ctx, "junto")).toBe("saude");
  });

  it("sem autorização (saúde fora): a caixa da boas-vindas volta desmarcada", () => {
    const r = rascunhoDaIncompleta(alunoBase({ anamnese: { ...metade, healthOmitted: true, consent: undefined, a: { nome: "Ana Souza", dias: 3 } } }), ctx, AGORA);
    expect(r!.autorizouJunto).toBe(false);
  });

  it("rodada completa, do link ou sem rodada: nada a continuar e id novo", () => {
    expect(rascunhoDaIncompleta(alunoBase({ anamnese: { ...metade, incompleto: undefined } }), ctx, AGORA)).toBeNull();
    expect(rascunhoDaIncompleta(alunoBase({ anamnese: { ...metade, via: "link" } }), ctx, AGORA)).toBeNull();
    expect(rascunhoDaIncompleta(alunoBase(), ctx, AGORA)).toBeNull();
    expect(idDaRodadaIncompleta(alunoBase({ anamnese: { ...metade, incompleto: undefined } }))).toBeNull();
  });

  it("completar grava com o mesmo id: substitui a rodada e anamnesePrev continua vazia", () => {
    const aluno = alunoBase({ anamnese: metade });
    expect(idDaRodadaIncompleta(aluno)).toBe("junto-1");
    const completa = anamneseBase({ peso: 92, sexo: "M" }, { id: "junto-1", via: "junto", by: "personal", answeredAt: "2026-11-23T11:00:00-03:00", consent: { at: "2026-11-23T11:00:00-03:00", source: "personal", textId: "c1" } });
    const salvo = applyAnamnese(aluno, completa, {}, AGORA);
    expect(salvo.anamnese?.id).toBe("junto-1");
    expect(salvo.anamnese?.incompleto).toBeUndefined();
    expect(salvo.anamnesePrev).toBeUndefined();
  });
});

describe("rotuloDoSalvarJunto (menor sem a autorização do responsável)", () => {
  const menor = { a: { nome: "Pedro Souza", ano: anoParaIdade(14), responsavel: "Rosa Souza" }, autorizouJunto: true } as const;

  it("autorização marcada sem a caixa do responsável: o botão diz que vai sem saúde, com a linha explicando", () => {
    const vai = saudeAutorizada({ ...menor, responsavelOk: false }, "junto", HOJE);
    expect(vai).toBe(false);
    const r = rotuloDoSalvarJunto({ autorizouJunto: true, saudeVai: vai, responsavel: "Rosa Souza" });
    expect(r.botao).toBe("Salvar sem dados de saúde");
    expect(r.linha).toBe("Sem a autorização de Rosa Souza, as respostas de saúde (Partes 2 a 4, peso e altura) não são salvas.");
  });

  it("sem o nome do responsável: 'do responsável'", () => {
    expect(rotuloDoSalvarJunto({ autorizouJunto: true, saudeVai: false, responsavel: " " }).linha).toBe("Sem a autorização do responsável, as respostas de saúde (Partes 2 a 4, peso e altura) não são salvas.");
  });

  it("com a caixa do responsável, ou sem a autorização da boas-vindas (as partes de saúde nem aparecem): o de sempre", () => {
    const vai = saudeAutorizada({ ...menor, responsavelOk: true }, "junto", HOJE);
    expect(rotuloDoSalvarJunto({ autorizouJunto: true, saudeVai: vai, responsavel: "Rosa Souza" })).toEqual({ botao: "Salvar e ver o resumo", linha: null });
    expect(rotuloDoSalvarJunto({ autorizouJunto: false, saudeVai: false, responsavel: "Rosa Souza" })).toEqual({ botao: "Salvar e ver o resumo", linha: null });
  });
});
