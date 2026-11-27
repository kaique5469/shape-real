import { describe, expect, it } from "vitest";
import type { Anamnese, AnamneseAnswers } from "./anamnese-types";
import { alunoBase, anamneseBase, anoParaIdade, HOJE } from "./anamnese-fixtures";
import { antesDeGerar, applyAnamnese } from "./anamnese-ficha";
import { acoesDoAlerta, registroDoQuestionario } from "./anamnese-perfil";
import { readAnamnese } from "./questionario-link";
import { summarize } from "./resumo";
import { alertas, comConversei, comOverride, TITULO_SAUDE_INCOMPLETA } from "./triagem";

// Revisão clínica da rodada 2: dado que falta não é liberação; respostas novas reabrem as decisões do personal; a
// idade do lembrete legal é lida com a mesma cautela do questionário; e a falta de autorização de um menor não é
// atribuída ao aluno.

const ctx = { hoje: HOJE, liberacoes: [] };
const ids = (an: Anamnese) => alertas(an, ctx).map((x) => x.id);

/** Junto salvo com "Salvar o que já tem": Parte 1 e PAR-Q respondidos; Saúde e/ou Dores puladas (sem as chaves). */
function juntoPulado(incompleto: Anamnese["incompleto"], tirar: (keyof AnamneseAnswers)[]): Anamnese {
  const base = anamneseBase({}, { id: "j1", via: "junto", by: "personal", incompleto, consent: { at: "2026-11-20T10:00:00-03:00", source: "personal", textId: "c1" } });
  const a = { ...base.a } as Record<string, unknown>;
  for (const k of tirar) delete a[k];
  return { ...base, a: a as AnamneseAnswers };
}

describe("junto com Saúde ou Dores puladas", () => {
  const SAUDE: (keyof AnamneseAnswers)[] = ["regular", "condicoes", "sintomas", "remedios", "cirurgia", "gestacao"];

  it("Saúde e Dores puladas: alerta laranja de triagem incompleta, sem 'Nenhum sinal de alerta' e com a porta no gerador", () => {
    const an = juntoPulado(["saude", "dor"], [...SAUDE, "dor", "lesao"]);
    const al = alertas(an, ctx).find((x) => x.id === "A-PARQ-INCOMPLETO");
    expect(al?.titulo).toBe(TITULO_SAUDE_INCOMPLETA);
    expect(al?.nivel).toBe("laranja");
    expect(al?.recomendado).toBe("Complete as perguntas de saúde com Ana antes de começar.");
    expect(al?.porque).toEqual([
      { pergunta: "Saúde: como você está hoje", resposta: "Pulou" },
      { pergunta: "Dores e lesões", resposta: "Pulou" },
    ]);
    const perfil = alunoBase({ anamnese: an });
    expect(summarize({ profile: perfil, hoje: HOJE })?.semAlertasTexto).toBeNull();
    expect(antesDeGerar(perfil, HOJE).modo).toBe("porta");
    expect(acoesDoAlerta(al!, perfil)).toEqual([{ tipo: "preencher", rotulo: "Completar a saúde com Ana", href: "/questionario?aluno=aluno-1" }]);
  });

  it("só Dores pulada (com dor lombar e sinais da coluna sem resposta): mesmo alerta", () => {
    const an = juntoPulado(["dor"], ["dorAlerta"]);
    const comDor = { ...an, a: { ...an.a, dor: 1 as const, dorOnde: [{ r: "lombar" as const }], dorNota: 4, dorQuando: ["movimento" as const], dorDesde: "mais3m" as const } };
    expect(ids(comDor)).toContain("A-PARQ-INCOMPLETO");
    expect(antesDeGerar(alunoBase({ anamnese: comDor }), HOJE).modo).toBe("porta");
  });

  it("só o PAR-Q incompleto: o texto de antes; tudo respondido: nada", () => {
    const parq = juntoPulado(["parq"], []);
    const semParq = { ...parq, a: { ...parq.a, parq: [0, 0, 0] as unknown as AnamneseAnswers["parq"] } };
    const al = alertas(semParq, ctx).find((x) => x.id === "A-PARQ-INCOMPLETO");
    expect(al?.titulo).toBe("PAR-Q incompleto");
    expect(acoesDoAlerta(al!, alunoBase())[0]?.rotulo).toBe("Completar o PAR-Q com Ana");
    expect(ids(juntoPulado(undefined, []))).not.toContain("A-PARQ-INCOMPLETO");
  });

  it("pelo link, `incompleto` não existe: nada muda", () => {
    expect(ids(anamneseBase({}, { incompleto: ["saude"] }))).not.toContain("A-PARQ-INCOMPLETO");
  });
});

describe("'Seguir mesmo assim' e 'Conversei' só valem para as respostas que já tinham chegado", () => {
  const RECEBIDO = "2026-11-21T08:00:00-03:00";
  const primeira = anamneseBase(
    { dor: 1, dorOnde: [{ r: "joelho" }], dorNota: 7, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "nao", condicoes: "pessoal" },
    { id: "pedido-1", answeredAt: "2026-11-20T10:00:00-03:00" },
  );

  it("reenvio no mesmo id, mais novo: os alertas voltam abertos e o gerador volta à porta", () => {
    let p = applyAnamnese(alunoBase(), primeira, {}, RECEBIDO);
    p = comOverride(p, ["A-DOR-FORTE"], "2026-11-21T09:00:00-03:00");
    p = comConversei(p, ["A-PESSOAL"], "2026-11-21T09:01:00-03:00");
    const antes = alertas(readAnamnese(p) as Anamnese, { hoje: HOJE, liberacoes: [] });
    expect(antes.find((x) => x.id === "A-DOR-FORTE")?.coberto?.por).toBe("override");
    expect(antes.find((x) => x.id === "A-PESSOAL")?.coberto?.por).toBe("conversei");
    expect(antesDeGerar(p, HOJE).modo).toBe("livre");

    const segunda = anamneseBase(
      { dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 9, dorQuando: ["noite"], dorDesde: "mais3m", tratamento: "nao", dorAlerta: [], condicoes: "pessoal", remedios: "pessoal" },
      { id: "pedido-1", answeredAt: "2026-11-22T10:00:00-03:00" },
    );
    const depois = applyAnamnese(p, segunda, {}, "2026-11-22T11:00:00-03:00");
    const lista = alertas(readAnamnese(depois) as Anamnese, { hoje: HOJE, liberacoes: [] });
    expect(lista.find((x) => x.id === "A-DOR-FORTE")?.coberto).toBeUndefined();
    expect(lista.find((x) => x.id === "A-PESSOAL")?.coberto).toBeUndefined();
    expect(antesDeGerar(depois, HOJE).modo).toBe("porta");
    // O registro impresso continua com o histórico.
    expect(registroDoQuestionario(depois, lista).some((l) => l.startsWith("Seguiu mesmo assim em"))).toBe(true);
  });
});

describe("lembrete A-MENOR com a leitura cautelosa da idade", () => {
  const resp = { nome: "Maria", at: "2026-11-20T10:00:00-03:00" };
  const consent = { at: "2026-11-20T10:00:00-03:00", source: "aluno_questionario" as const, textId: "c1", responsavel: resp };

  it("idade calculada 18 (pode ter 17) com o responsável registrado: o lembrete aparece com o registro", () => {
    const al = alertas(anamneseBase({ ano: anoParaIdade(18), responsavel: "Maria" }, { consent }), ctx).find((x) => x.id === "A-MENOR");
    expect(al?.recomendado).toBe("Menor de 18 anos: autorização de Maria registrada em 20/11.");
  });

  it("idade calculada 15 (pode ter 14): a frase da lei SP para menores de 15", () => {
    const al = alertas(anamneseBase({ ano: anoParaIdade(15), responsavel: "Maria" }, { consent }), ctx).find((x) => x.id === "A-MENOR");
    expect(al?.recomendado).toContain("quem tem menos de 15 anos precisa de autorização por escrito do responsável.");
    const dezesseis = alertas(anamneseBase({ ano: anoParaIdade(16), responsavel: "Maria" }, { consent }), ctx).find((x) => x.id === "A-MENOR");
    expect(dezesseis?.recomendado).not.toContain("menos de 15 anos");
  });

  it("19 anos calculados: nenhum lembrete", () => {
    expect(ids(anamneseBase({ ano: anoParaIdade(19) }))).not.toContain("A-MENOR");
  });
});

describe("sem saúde por falta da autorização do responsável", () => {
  const menorSemSaude: Anamnese = { ...anamneseBase({}, {}), healthOmitted: true, consent: undefined, a: { nome: "Ana Souza", ano: anoParaIdade(16), responsavel: "Marta", objetivo: "saude", dias: 3 } };

  it("A-SEM-TRIAGEM e o registro impresso não dizem que o aluno não autorizou", () => {
    const al = alertas(menorSemSaude, ctx).find((x) => x.id === "A-SEM-TRIAGEM");
    expect(al?.recomendado).toBe("As respostas de saúde não vieram: faltou a autorização de Ana ou do responsável. Faça a triagem pessoalmente antes de começar.");
    expect(al?.recomendado).not.toContain("não autorizou");
    const registro = registroDoQuestionario(alunoBase({ anamnese: menorSemSaude }), []);
    expect(registro[0]).toBe("Autorização de saúde: faltou a de Ana Souza ou a do responsável. As respostas de saúde não foram guardadas.");
  });

  it("adulto sem autorização: o texto de antes", () => {
    const adulto: Anamnese = { ...menorSemSaude, a: { ...menorSemSaude.a, ano: anoParaIdade(30) } };
    expect(registroDoQuestionario(alunoBase({ anamnese: adulto }), [])[0]).toBe("Autorização de saúde: não dada. As respostas de saúde não foram guardadas.");
  });
});
