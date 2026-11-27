import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AnamneseAnswers, CtxQuestionario, SecaoId } from "./anamnese-types";
import { LADOS, MODULOS, REGIOES, REGIOES_COM_LADO, REMEDIOS, SECOES } from "./anamnese-types";
import {
  ANO_GUARDADO,
  AVISO_TEXTO,
  avisoAbaixoDe,
  avisosImediatos,
  comNomes,
  ctxDe,
  ERRO_ANO,
  erroAno,
  estimarMinutos,
  faltando,
  gatilhoNutricionista,
  gravarResposta,
  HEALTH_KEYS,
  idadeDe,
  LADO_OPCOES,
  lerResposta,
  limparOcultas,
  mostraFaixaMenor12,
  NENHUM,
  opcaoMarcada,
  PARQ_INTRO,
  PARQ_PERGUNTAS,
  parqCompleto,
  PERGUNTAS,
  perguntasVisiveis,
  PESSOAL,
  precisaResponsavel,
  REGIAO_OUTRO_ROTULO,
  RESPOSTA_PULOU,
  RESPOSTA_PULOU_PARTE,
  respostaDe,
  respostasPorParte,
  SECAO_TITULO,
  secoesDoPedido,
  secoesDoQuestionario,
  stripHealth,
  TERMO_TEXTO,
} from "./anamnese";
import type { Pergunta } from "./anamnese";
import { alunoBase, anamneseBase, anoParaIdade, ctxBase, HOJE, personalBase, RESPONDIDO_EM, respostasBase } from "./anamnese-fixtures";
import { buildPedido, buildRespostas, parseRespostas, readAnamnese } from "./questionario-link";

/** A pergunta aparece em alguma parte do questionário com estas respostas? */
function visivel(id: string, a: AnamneseAnswers, ctx: CtxQuestionario = ctxBase()): boolean {
  return SECOES.some((s) => perguntasVisiveis(s, a, ctx).some((p) => p.id === id));
}
const sem = (...chaves: (keyof AnamneseAnswers)[]) => {
  const a = respostasBase();
  for (const k of chaves) delete a[k];
  return a;
};

describe("textos literais da Lei SP 16.724/2018 (spec §4.5)", () => {
  it("PAR-Q: 7 perguntas literais, numeradas", () => {
    expect(PARQ_PERGUNTAS).toEqual([
      "1) Algum médico já disse que você possui algum problema de coração e que só deveria realizar atividade física supervisionado por profissionais de saúde?",
      "2) Você sente dores no peito quando pratica atividade física?",
      "3) No último mês, você sentiu dores no peito quando praticou atividade física?",
      "4) Você apresenta desequilíbrio devido à tontura e/ou perda de consciência?",
      "5) Você possui algum problema ósseo ou articular que poderia ser piorado pela atividade física?",
      "6) Você toma atualmente algum medicamento para pressão arterial e/ou problema de coração?",
      "7) Sabe de alguma outra razão pela qual você não deve praticar atividade física?",
    ]);
  });

  it("introdução literal, com aspas curvas e ANTES em caixa alta", () => {
    expect(PARQ_INTRO).toEqual([
      "Este questionário tem o objetivo de identificar a necessidade de avaliação por um médico antes do início da atividade física.",
      "Caso você responda “SIM” a uma ou mais perguntas, converse com seu médico ANTES de aumentar seu nível atual de atividade física.",
      "Mencione este questionário e as perguntas às quais você respondeu “SIM”. Por favor, assinale “SIM” ou “NÃO” às seguintes perguntas:",
    ]);
  });

  it("termo do Anexo II literal", () => {
    expect(TERMO_TEXTO).toEqual([
      "Estou ciente de que é recomendável conversar com um médico antes de aumentar meu nível atual de atividade física, por ter respondido “SIM” a uma ou mais perguntas do “Questionário de Prontidão para Atividade Física” (PAR-Q).",
      "Assumo plena responsabilidade por qualquer atividade física praticada sem o atendimento a essa recomendação.",
    ]);
  });

  it("as perguntas do PAR-Q no catálogo usam o texto literal, sem enxerto", () => {
    PARQ_PERGUNTAS.forEach((t, i) => expect(PERGUNTAS.find((p) => p.id === `parq.${i}`)?.texto).toBe(t));
    expect(PERGUNTAS.find((p) => p.id === "parq.4")?.ajuda).toEqual({ rotulo: "O que conta?", texto: "Por exemplo: artrose, hérnia, lesão no joelho ou no ombro." });
  });

  it("avisos imediatos literais (§4.6 e §4.7)", () => {
    expect(AVISO_TEXTO.samu).toBe("Converse com um médico antes de começar a treinar. Se sentir dor forte no peito, falta de ar ou desmaio agora, ligue para o SAMU: 192.");
    expect(AVISO_TEXTO.coluna).toBe("Dormência entre as pernas ou mudança no xixi ou no cocô junto com dor nas costas pede avaliação médica hoje. Não espere o treino.");
  });

  it("títulos das partes", () => {
    expect(SECAO_TITULO).toMatchObject({ voce: "Você", parq: "Saúde: 7 perguntas", saude: "Saúde: como você está hoje", dor: "Dores e lesões", treino: "Seu treino", enviar: "Conferir e enviar" });
    expect(comNomes(SECAO_TITULO.extras, ctxBase())).toBe("Perguntas de Carlos");
  });
});

describe("catálogo", () => {
  it("ids únicos; toda pergunta tem texto e pergunta curta", () => {
    const ids = PERGUNTAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PERGUNTAS) {
      expect(p.texto.length).toBeGreaterThan(0);
      expect(p.curto.length).toBeGreaterThan(0);
    }
  });

  it("toda HEALTH_KEY é pergunta do catálogo (ou o PAR-Q)", () => {
    for (const k of HEALTH_KEYS) expect(k === "parq" || PERGUNTAS.some((p) => p.id === k)).toBe(true);
    expect(HEALTH_KEYS).toHaveLength(47);
  });

  it("idade = ano de hoje − ano; null sem ano", () => {
    expect(idadeDe({ ano: 1990 }, HOJE)).toBe(36);
    expect(idadeDe({}, HOJE)).toBeNull();
  });

  it("perguntasVisiveis troca os nomes e põe a faixa do ano de hoje", () => {
    const voce = perguntasVisiveis("voce", respostasBase(), ctxBase());
    expect(voce.find((p) => p.id === "nome")?.dica).toBe("Carlos cadastrou assim. Corrija se precisar.");
    expect(voce.find((p) => p.id === "altura")?.porQue).toBe("Para Carlos ter um ponto de partida. A medida é conferida na avaliação.");
    expect(voce.find((p) => p.id === "ano")).toMatchObject({ min: 1926, max: 2016 });
    const misto = perguntasVisiveis("treino", respostasBase(), ctxBase({ atendimento: "misto" }));
    expect(misto.find((p) => p.id === "diasComPersonal")?.texto).toBe("Quantos desses dias você treina com Carlos?");
  });
});

describe("visibilidade (coluna Obrig. das tabelas; segurança nunca some por falta de dado)", () => {
  it("gestação: F, nd e sexo sem resposta entre 14 e 55 e com idade desconhecida; nunca M nem 56+", () => {
    for (const sexo of ["F", "nd", undefined] as const) {
      for (const idade of [14, 30, 55]) expect(visivel("gestacao", { ...respostasBase({ ano: anoParaIdade(idade) }), sexo })).toBe(true);
      expect(visivel("gestacao", { ...sem("ano"), sexo })).toBe(true);
      expect(visivel("gestacao", { ...respostasBase({ ano: anoParaIdade(56) }), sexo })).toBe(false);
      expect(visivel("gestacao", { ...respostasBase({ ano: anoParaIdade(13) }), sexo })).toBe(false);
    }
    expect(visivel("gestacao", respostasBase({ sexo: "M" }))).toBe(false);
    expect(visivel("gestacao", { ...sem("ano"), sexo: "M" })).toBe(false);
  });

  it("'Não se aplica' só com 'Prefiro não dizer' ou sexo sem resposta", () => {
    const opcoes = (a: AnamneseAnswers) => perguntasVisiveis("saude", a, ctxBase()).find((p) => p.id === "gestacao")?.opcoes?.map((o) => o.v);
    expect(opcoes(respostasBase({ sexo: "nd" }))).toContain("nd");
    expect(opcoes(sem("sexo"))).toContain("nd");
    expect(opcoes(respostasBase({ sexo: "F" }))).not.toContain("nd");
  });

  it("quedas, instável e medo de cair: com ano = hoje − 65 e sem ano; somem com ano = hoje − 63", () => {
    for (const id of ["quedas", "instavel", "medoCair"]) {
      expect(visivel(id, respostasBase({ ano: anoParaIdade(65) }))).toBe(true);
      expect(visivel(id, sem("ano"))).toBe(true);
      expect(visivel(id, respostasBase({ ano: anoParaIdade(63) }))).toBe(false);
    }
  });

  it("responsável: com ano = hoje − 17 (e − 18, leitura cautelosa); some com ano = hoje − 19 e sem ano", () => {
    expect(visivel("responsavel", respostasBase({ ano: anoParaIdade(17) }))).toBe(true);
    expect(visivel("responsavel", respostasBase({ ano: anoParaIdade(18) }))).toBe(true);
    expect(visivel("responsavel", respostasBase({ ano: anoParaIdade(19) }))).toBe(false);
    expect(visivel("responsavel", sem("ano"))).toBe(false);
  });

  it("precisaResponsavel e faixa de menor de 12 pela mesma leitura cautelosa", () => {
    expect(precisaResponsavel(respostasBase({ ano: anoParaIdade(18) }), HOJE)).toBe(true);
    expect(precisaResponsavel(respostasBase({ ano: anoParaIdade(19) }), HOJE)).toBe(false);
    expect(precisaResponsavel(sem("ano"), HOJE)).toBe(false);
    expect(mostraFaixaMenor12(respostasBase({ ano: anoParaIdade(12) }), HOJE)).toBe(true);
    expect(mostraFaixaMenor12(respostasBase({ ano: anoParaIdade(13) }), HOJE)).toBe(false);
  });

  it("pressaoControle: condição pressao e cada remédio pressao, diuretico e betabloqueador", () => {
    expect(visivel("pressaoControle", respostasBase())).toBe(false);
    expect(visivel("pressaoControle", respostasBase({ condicoes: ["pressao"] }))).toBe(true);
    for (const r of ["pressao", "diuretico", "betabloqueador"] as const) expect(visivel("pressaoControle", respostasBase({ remedios: 1, remediosPara: [r] }))).toBe(true);
    expect(visivel("pressaoControle", respostasBase({ remedios: 1, remediosPara: ["colesterol"] }))).toBe(false);
    // Remédio marcado mas "toma remédio" = Não: não conta.
    expect(visivel("pressaoControle", respostasBase({ remedios: 0, remediosPara: ["pressao"] }))).toBe(false);
  });

  it("hipo e complicações: diabetes1, diabetes2, insulina e remédio para diabetes", () => {
    const casos: Partial<AnamneseAnswers>[] = [{ condicoes: ["diabetes1"] }, { condicoes: ["diabetes2"] }, { remedios: 1, remediosPara: ["insulina"] }, { remedios: 1, remediosPara: ["diabetes"] }];
    for (const c of casos) {
      expect(visivel("hipo", respostasBase(c))).toBe(true);
      expect(visivel("complicacoes", respostasBase(c))).toBe(true);
    }
    expect(visivel("hipo", respostasBase({ condicoes: ["prediabetes"] }))).toBe(false);
    expect(visivel("complicacoes", respostasBase())).toBe(false);
  });

  it("dorAlerta só com lombar ou costasAlta; dorTrauma só com ate6s", () => {
    const dor = (over: Partial<AnamneseAnswers>) => respostasBase({ dor: 1, dorOnde: [{ r: "joelho" }], dorNota: 3, dorQuando: ["movimento"], dorDesde: "mais3m", ...over });
    expect(visivel("dorAlerta", dor({ dorOnde: [{ r: "lombar" }] }))).toBe(true);
    expect(visivel("dorAlerta", dor({ dorOnde: [{ r: "costasAlta" }] }))).toBe(true);
    expect(visivel("dorAlerta", dor({ dorOnde: [{ r: "pescoco" }] }))).toBe(false);
    expect(visivel("dorTrauma", dor({ dorDesde: "ate6s" }))).toBe(true);
    expect(visivel("dorTrauma", dor({ dorDesde: "ate3m" }))).toBe(false);
    expect(visivel("dorOnde", respostasBase())).toBe(false);
  });

  it("parado só com regular pouco/nao e experiência ≠ nunca", () => {
    expect(visivel("parado", respostasBase({ regular: "pouco", experiencia: "a3" }))).toBe(true);
    expect(visivel("parado", respostasBase({ regular: "nao", experiencia: "m3" }))).toBe(true);
    expect(visivel("parado", respostasBase({ regular: "nao", experiencia: "nunca" }))).toBe(false);
    expect(visivel("parado", respostasBase({ regular: "sim3m", experiencia: "a3" }))).toBe(false);
    expect(visivel("parado", respostasBase({ regular: "simRecente", experiencia: "a3" }))).toBe(false);
  });

  it("diasComPersonal só com atendimento misto", () => {
    expect(visivel("diasComPersonal", respostasBase(), ctxBase({ atendimento: "misto" }))).toBe(true);
    for (const atendimento of ["academia", "online", undefined] as const) expect(visivel("diasComPersonal", respostasBase(), ctxBase({ atendimento }))).toBe(false);
  });

  it("orientação: algum sim no PAR-Q, condição, sintoma, remédio ou 'prefiro falar pessoalmente'", () => {
    expect(visivel("orientacao", respostasBase())).toBe(false);
    expect(visivel("orientacao", respostasBase({ parq: [0, 0, 0, 0, 1, 0, 0] }))).toBe(true);
    expect(visivel("orientacao", respostasBase({ condicoes: ["artrose"] }))).toBe(true);
    expect(visivel("orientacao", respostasBase({ sintomas: ["cansaco"] }))).toBe(true);
    expect(visivel("orientacao", respostasBase({ remedios: 1, remediosPara: ["colesterol"] }))).toBe(true);
    expect(visivel("orientacao", respostasBase({ condicoes: "pessoal" }))).toBe(true);
  });

  it("equipamentos só fora da academia completa", () => {
    expect(visivel("equipamentos", respostasBase({ onde: "casa" }))).toBe(true);
    expect(visivel("equipamentos", respostasBase({ onde: "academia" }))).toBe(false);
  });

  it("junto sem autorização de saúde: nem PAR-Q, nem saúde, nem dor, nem peso e altura", () => {
    const ctx = ctxBase({ modo: "junto", semSaude: true });
    expect(visivel("peso", respostasBase(), ctx)).toBe(false);
    expect(visivel("altura", respostasBase(), ctx)).toBe(false);
    expect(visivel("parq.0", respostasBase(), ctx)).toBe(false);
    expect(visivel("nome", respostasBase(), ctx)).toBe(true);
    const objetivo = perguntasVisiveis("treino", respostasBase(), ctx).find((p) => p.id === "objetivo");
    expect(objetivo?.opcoes?.map((o) => o.v)).not.toContain("semDor");
  });
});

describe("partes", () => {
  it("pedido normal: núcleo, treino e enviar", () => {
    expect(secoesDoQuestionario(ctxBase(), respostasBase())).toEqual(["voce", "parq", "saude", "dor", "treino", "enviar"]);
  });

  it("com 2 módulos (na ordem de MODULOS) e perguntas próprias", () => {
    const ctx = ctxBase({ modulos: ["objetivo", "rotina"], extras: ["Tem cachorro?"] });
    expect(secoesDoQuestionario(ctx, respostasBase())).toEqual(["voce", "parq", "saude", "dor", "treino", "rotina", "objetivo", "extras", "enviar"]);
  });

  it("dorMais só com dor ou lesão = Sim", () => {
    const ctx = ctxBase({ modulos: ["dorMais"] });
    expect(secoesDoQuestionario(ctx, respostasBase())).not.toContain("dorMais");
    expect(secoesDoQuestionario(ctx)).not.toContain("dorMais");
    expect(secoesDoQuestionario(ctx, respostasBase({ dor: 1 }))).toContain("dorMais");
    expect(secoesDoQuestionario(ctx, respostasBase({ lesao: 1 }))).toContain("dorMais");
  });

  it("junto sem autorização: sem parq, saude e dor", () => {
    expect(secoesDoQuestionario(ctxBase({ modo: "junto", semSaude: true }), respostasBase())).toEqual(["voce", "treino", "enviar"]);
  });

  it("secoesDoPedido: o que o pedido define, nunca dorMais, nunca depende de semSaude", () => {
    const ctx = ctxBase({ modulos: ["dorMais", "esporte"] });
    expect(secoesDoPedido(ctx)).toEqual(["voce", "parq", "saude", "dor", "treino", "esporte", "enviar"]);
    expect(secoesDoPedido({ ...ctx, semSaude: true })).toEqual(secoesDoPedido(ctx));
  });

  it("parte que não existe agora não tem perguntas", () => {
    expect(perguntasVisiveis("parq", respostasBase(), ctxBase({ semSaude: true }))).toEqual([]);
  });
});

describe("faltando", () => {
  it("respostas completas da fixture: nada falta", () => {
    expect(faltando("todas", respostasBase(), ctxBase())).toEqual([]);
  });

  it("lista as obrigatórias visíveis sem resposta, na ordem", () => {
    const a = respostasBase({ dor: 1 });
    expect(faltando("dor", a, ctxBase()).map((p) => p.id)).toEqual(["dorOnde", "dorNota", "dorQuando", "dorDesde", "tratamento"]);
    expect(faltando("voce", sem("nome", "peso"), ctxBase()).map((p) => p.id)).toEqual(["nome"]); // peso é opcional
  });

  it("[] em lista com 'Nenhum' e 'pessoal' contam como respondidas", () => {
    expect(faltando("saude", respostasBase({ condicoes: [], sintomas: [] }), ctxBase())).toEqual([]);
    const pessoal = respostasBase({ condicoes: "pessoal", remedios: "pessoal", orientacao: "nao" });
    expect(faltando("saude", pessoal, ctxBase())).toEqual([]);
  });

  it("[] em lista sem 'Nenhum' (remédios para, onde dói) não conta", () => {
    const a = respostasBase({ remedios: 1, remediosPara: [], orientacao: "nao" });
    expect(faltando("saude", a, ctxBase()).map((p) => p.id)).toEqual(["remediosPara"]);
  });

  it("PAR-Q pela metade: falta cada posição sem resposta", () => {
    let a = sem("parq");
    a = gravarResposta(a, "parq.0", 0);
    a = gravarResposta(a, "parq.3", 1);
    expect(faltando("parq", a, ctxBase()).map((p) => p.id)).toEqual(["parq.1", "parq.2", "parq.4", "parq.5", "parq.6"]);
  });
});

describe("estimarMinutos", () => {
  it("núcleo 4; com objetivo 6 (4 + 1,5 para cima); com 3 perguntas próprias 5", () => {
    expect(estimarMinutos({ modulos: [], extras: [] })).toBe(4);
    expect(estimarMinutos({ modulos: ["objetivo"], extras: [] })).toBe(6);
    expect(estimarMinutos({ modulos: [], extras: ["a", "b", "c"] })).toBe(5);
    expect(estimarMinutos({ modulos: ["rotina", "habitos"], extras: [] })).toBe(5);
  });
});

describe("gravarResposta e limparOcultas", () => {
  it("é imutável", () => {
    const a = respostasBase();
    const b = gravarResposta(a, "dias", 4);
    expect(a.dias).toBe(3);
    expect(b.dias).toBe(4);
  });

  it("opção exclusiva limpa as outras (por toque e pela lista inteira)", () => {
    let a = respostasBase({ condicoes: ["artrose", "pressao"] });
    a = gravarResposta(a, "condicoes", NENHUM);
    expect(a.condicoes).toEqual([]);
    a = gravarResposta(a, "condicoes", "osteoporose");
    expect(a.condicoes).toEqual(["osteoporose"]);
    a = gravarResposta(a, "condicoes", PESSOAL);
    expect(a.condicoes).toBe("pessoal");
    a = gravarResposta(a, "condicoes", "artrose");
    expect(a.condicoes).toEqual(["artrose"]);
    a = gravarResposta(a, "condicoes", "artrose");
    expect(a.condicoes).toEqual([]); // desmarcar o último deixa a lista vazia
    let e = respostasBase({ onde: "casa", equipamentos: ["halteres", "banco"] });
    e = gravarResposta(e, "equipamentos", ["halteres", "banco", "nada"]);
    expect(e.equipamentos).toEqual(["nada"]);
    e = gravarResposta(e, "equipamentos", "elasticos");
    expect(e.equipamentos).toEqual(["elasticos"]);
  });

  it("opcaoMarcada: 'Nenhuma' com [], 'Prefiro falar pessoalmente' com 'pessoal'", () => {
    const condicoes = PERGUNTAS.find((p) => p.id === "condicoes");
    const sexo = PERGUNTAS.find((p) => p.id === "sexo");
    if (!condicoes || !sexo) throw new Error("catálogo");
    expect(opcaoMarcada(condicoes, respostasBase({ condicoes: [] }), NENHUM)).toBe(true);
    expect(opcaoMarcada(condicoes, respostasBase({ condicoes: [] }), "artrose")).toBe(false);
    expect(opcaoMarcada(condicoes, respostasBase({ condicoes: "pessoal" }), PESSOAL)).toBe(true);
    expect(opcaoMarcada(condicoes, respostasBase({ condicoes: ["artrose"] }), "artrose")).toBe(true);
    expect(opcaoMarcada(condicoes, sem("condicoes"), NENHUM)).toBe(false);
    expect(opcaoMarcada(sexo, respostasBase(), "F")).toBe(true);
  });

  it("respeita o limite de seleções e ignora código fora do catálogo", () => {
    const a = respostasBase({ foco: ["gluteos", "pernas", "abdomen"] });
    expect(gravarResposta(a, "foco", "peito")).toBe(a);
    expect(gravarResposta(a, "objetivo", "voar")).toBe(a);
  });

  it("número com vírgula, faixa e texto com teto", () => {
    expect(gravarResposta({}, "peso", "72,5").peso).toBe(72.5);
    expect(gravarResposta({ peso: 70 }, "peso", "7000").peso).toBeUndefined();
    expect(gravarResposta({}, "nome", "x".repeat(200)).nome).toHaveLength(120);
    expect(gravarResposta({ nome: "Ana" }, "nome", "")).not.toHaveProperty("nome");
  });

  it("PAR-Q: guarda só as posições respondidas e nunca completa com 'Não'", () => {
    let a: AnamneseAnswers = {};
    a = gravarResposta(a, "parq.2", 1);
    expect(lerResposta(a, "parq.2")).toBe(1);
    expect(lerResposta(a, "parq.0")).toBeUndefined();
    expect(parqCompleto(a)).toBe(false);
    // Sobrevive ao JSON do rascunho (buracos viram null e continuam sem resposta).
    const volta = JSON.parse(JSON.stringify(a)) as AnamneseAnswers;
    expect(lerResposta(volta, "parq.0")).toBeUndefined();
    expect(lerResposta(volta, "parq.2")).toBe(1);
    for (let i = 0; i < 7; i++) if (i !== 2) a = gravarResposta(a, `parq.${i}`, 0);
    expect(parqCompleto(a)).toBe(true);
    expect([...(a.parq ?? [])]).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(gravarResposta(a, "parq.2", 5)).toBe(a);
  });

  it("limparOcultas tira gestação (e as que dependem dela) ao mudar o sexo para M", () => {
    let a = respostasBase({ gestacao: "gravida", obstetra: "sim", semanas: 20, assoalho: 0 });
    a = limparOcultas(gravarResposta(a, "sexo", "M"), ctxBase());
    for (const k of ["gestacao", "obstetra", "semanas", "assoalho"] as const) expect(a[k]).toBeUndefined();
  });

  it("limparOcultas tira 'Não se aplica' quando o sexo passa a ser F", () => {
    const a = limparOcultas(respostasBase({ sexo: "F", gestacao: "nd" }), ctxBase());
    expect(a.gestacao).toBeUndefined();
  });

  it("limparOcultas no junto sem autorização tira toda a saúde do rascunho", () => {
    const a = respostasBase({ dor: 1, dorOnde: [{ r: "joelho" }], barreira: ["dor", "tempo"], objetivo: "semDor" });
    const limpo = limparOcultas(a, ctxBase({ modo: "junto", semSaude: true }));
    for (const k of HEALTH_KEYS) expect(limpo[k]).toBeUndefined();
    expect(limpo.barreira).toEqual(["tempo"]);
    expect(limpo.objetivo).toBeUndefined();
    expect(limpo.nome).toBe("Ana Souza");
  });

  it("limparOcultas mantém o que está visível (sem mudar a referência)", () => {
    const a = respostasBase();
    expect(limparOcultas(a, ctxBase())).toBe(a);
  });
});

describe("avisosImediatos", () => {
  it("samu para peito, tontura e PAR-Q 2, 3 e 4", () => {
    expect(avisosImediatos(respostasBase({ sintomas: ["peito"] }))).toEqual(["samu"]);
    expect(avisosImediatos(respostasBase({ sintomas: ["tontura"] }))).toEqual(["samu"]);
    for (const i of [1, 2, 3]) {
      const parq = [0, 0, 0, 0, 0, 0, 0] as AnamneseAnswers["parq"] & number[];
      parq[i] = 1;
      expect(avisosImediatos(respostasBase({ parq }))).toEqual(["samu"]);
    }
  });

  it("coluna para sela e esfíncter", () => {
    const costas = (dorAlerta: AnamneseAnswers["dorAlerta"]) => respostasBase({ dor: 1, dorOnde: [{ r: "lombar" }], dorAlerta });
    expect(avisosImediatos(costas(["sela"]))).toEqual(["coluna"]);
    expect(avisosImediatos(costas(["esfincter"]))).toEqual(["coluna"]);
    expect(avisosImediatos(respostasBase({ dor: 1, dorOnde: [{ r: "costasAlta" }], dorAlerta: ["sela"] }))).toEqual(["coluna"]);
  });

  it("resposta antiga de dorAlerta, com a pergunta escondida, não dispara (sem dor ou sem dor nas costas)", () => {
    expect(avisosImediatos(respostasBase({ dor: 0, dorAlerta: ["sela"] }))).toEqual([]);
    expect(avisosImediatos(respostasBase({ dor: 1, dorOnde: [{ r: "joelho" }], dorAlerta: ["esfincter"] }))).toEqual([]);
  });

  it("vazio sem gatilho (PAR-Q 1, 5, 6 e 7, outros sintomas e outros sinais da coluna não disparam)", () => {
    expect(avisosImediatos(respostasBase())).toEqual([]);
    expect(avisosImediatos(respostasBase({ parq: [1, 0, 0, 0, 1, 1, 1], sintomas: ["cansaco"], dorAlerta: ["neuro"] }))).toEqual([]);
  });
});

describe("avisoAbaixoDe (onde o aviso imediato entra na tela)", () => {
  const parqSim = (...i: number[]) => respostasBase({ parq: [0, 1, 2, 3, 4, 5, 6].map((k) => (i.includes(k) ? 1 : 0)) as AnamneseAnswers["parq"] });

  it("PAR-Q: embaixo da primeira entre 2, 3 e 4 com 'Sim' (uma vez na parte)", () => {
    const a = parqSim(2, 3);
    expect(avisoAbaixoDe("parq.2", a)).toBe("samu");
    expect(avisoAbaixoDe("parq.3", a)).toBeNull();
    expect(avisoAbaixoDe("parq.1", a)).toBeNull();
    expect(avisoAbaixoDe("parq.3", parqSim(3))).toBe("samu");
    for (const i of [0, 4, 5, 6]) expect(avisoAbaixoDe(`parq.${i}`, parqSim(i))).toBeNull();
  });

  it("PAR-Q pela metade (rascunho): vale a posição respondida", () => {
    const a = gravarResposta({}, "parq.3", 1);
    expect(avisoAbaixoDe("parq.3", a)).toBe("samu");
    expect(avisoAbaixoDe("parq.1", a)).toBeNull();
  });

  it("parte Saúde: embaixo de 'sintomas' com peito ou tontura", () => {
    expect(avisoAbaixoDe("sintomas", respostasBase({ sintomas: ["cansaco", "tontura"] }))).toBe("samu");
    expect(avisoAbaixoDe("sintomas", respostasBase({ sintomas: ["peito"] }))).toBe("samu");
    expect(avisoAbaixoDe("sintomas", respostasBase({ sintomas: ["cansaco"] }))).toBeNull();
    expect(avisoAbaixoDe("sintomas", parqSim(1))).toBeNull();
  });

  it("Dores e lesões: embaixo de 'dorAlerta' com sela ou esfíncter, só com a pergunta à vista", () => {
    expect(avisoAbaixoDe("dorAlerta", respostasBase({ dor: 1, dorOnde: [{ r: "lombar" }], dorAlerta: ["neuro", "esfincter"] }))).toBe("coluna");
    expect(avisoAbaixoDe("dorAlerta", respostasBase({ dor: 1, dorOnde: [{ r: "lombar" }], dorAlerta: ["neuro"] }))).toBeNull();
    expect(avisoAbaixoDe("dorAlerta", respostasBase({ dor: 0, dorAlerta: ["sela"] }))).toBeNull();
  });

  it("as mesmas regras de avisosImediatos: o conjunto embaixo das perguntas visíveis é o de avisosImediatos", () => {
    const casos: AnamneseAnswers[] = [
      respostasBase(),
      parqSim(1, 3),
      respostasBase({ sintomas: ["tontura"], dor: 1, dorOnde: [{ r: "lombar" }], dorAlerta: ["sela"] }),
      respostasBase({ dor: 1, dorOnde: [{ r: "joelho" }], dorAlerta: ["sela"] }),
    ];
    for (const a of casos) {
      const naTela = new Set(SECOES.flatMap((s) => perguntasVisiveis(s, a, ctxBase()).map((p) => avisoAbaixoDe(p.id, a)).filter((x) => x !== null)));
      expect([...naTela].sort()).toEqual([...avisosImediatos(a)].sort());
    }
  });

  it("outras perguntas nunca levam aviso", () => {
    const a = respostasBase({ sintomas: ["peito"], parq: [0, 1, 0, 0, 0, 0, 0] });
    for (const p of PERGUNTAS) if (!/^(parq\.1|sintomas)$/.test(p.id)) expect(avisoAbaixoDe(p.id, a), p.id).toBeNull();
  });
});

describe("ano, lado e textos da tela", () => {
  it("erroAno: ERRO_ANO fora de (ano atual − 100) a (ano atual − 10) ou sem 4 algarismos; null vazio ou válido", () => {
    const atual = HOJE.getFullYear();
    expect(erroAno("1990", HOJE)).toBeNull();
    expect(erroAno(atual - 10, HOJE)).toBeNull();
    expect(erroAno(String(atual - 100), HOJE)).toBeNull();
    expect(erroAno(String(atual - 9), HOJE)).toBe(ERRO_ANO);
    expect(erroAno(String(atual - 101), HOJE)).toBe(ERRO_ANO);
    for (const ruim of ["90", "199", "19900", "19a0", "1990,5"]) expect(erroAno(ruim, HOJE), ruim).toBe(ERRO_ANO);
    expect(erroAno("", HOJE)).toBeNull();
    expect(erroAno(undefined, HOJE)).toBeNull();
    expect(ERRO_ANO).toBe("Confira o ano: use 4 números, como 1990.");
  });

  it("gravarResposta guarda o ano só na faixa do esquema do link (1900 a 2100)", () => {
    expect(gravarResposta({}, "ano", "1900").ano).toBe(1900);
    expect(gravarResposta({}, "ano", 2100).ano).toBe(2100);
    expect(gravarResposta({ ano: 1990 }, "ano", "1899")).not.toHaveProperty("ano");
    expect(gravarResposta({}, "ano", "2101")).not.toHaveProperty("ano");
    expect(ANO_GUARDADO).toEqual({ min: 1900, max: 2100 });
  });

  it("lado e 'Outro lugar' com os textos finais (spec §4.7)", () => {
    expect(LADO_OPCOES.map((o) => o.rotulo)).toEqual(["Direito", "Esquerdo", "Os dois"]);
    expect(LADO_OPCOES.map((o) => o.v)).toEqual([...LADOS]);
    expect(REGIAO_OUTRO_ROTULO).toBe("Onde?");
  });
});

describe("stripHealth", () => {
  const cheia = anamneseBase(
    {
      altura: 170, peso: 80, parq: [0, 0, 0, 0, 1, 0, 0], parqDetalhe: "joelho", regular: "nao", condicoes: ["artrose", "outra"], condicaoOutra: "x", sintomas: ["cansaco"],
      remedios: 1, remediosPara: ["colesterol"], remediosNomes: "y", cirurgia: 1, cirurgiaQual: "z", orientacao: "restricao", orientacaoQual: "w", gestacao: "pp12", assoalho: 1,
      pressaoControle: "alta", hipo: "nunca", complicacoes: [], quedas: 1, instavel: 0, medoCair: 1, dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 5, dorQuando: ["movimento"],
      dorDesde: "ate6s", dorTrauma: 0, dorAlerta: [], lesao: 1, lesaoQual: "a", tratamento: "fisio", sono: "h6", estresse: 7, fuma: "sim", alcool: "mensal", doses: "1a2",
      restricoes: ["alergia"], alergia: "b", lesao12: 1, lesao12Qual: "c", piora: ["agachar"], evita: "d", orientacaoFisio: "e", obstetra: "sim", semanas: 3,
      objetivo: "semDor", barreira: ["dor", "tempo"], motivo: ["medica", "dor", "estetica"], dias: 4, minutos: 45, onde: "casa", trabalho: "sentado",
    },
    { termo: { at: "2026-11-20T10:00:00-03:00", nome: "Ana Souza" }, overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-DOENCA"] }], incompleto: ["saude", "treino"] },
  );
  const s = stripHealth(cheia);

  it("remove cada HEALTH_KEY, o termo e a autorização; marca healthOmitted", () => {
    for (const k of HEALTH_KEYS) expect(s.a[k], k).toBeUndefined();
    expect(s.termo).toBeUndefined();
    expect(s.consent).toBeUndefined();
    expect(s.overrides).toBeUndefined();
    expect(s.healthOmitted).toBe(true);
    expect(s.incompleto).toEqual(["treino"]);
  });

  it("objetivo semDor vira saude; barreira perde dor; motivo perde medica e dor", () => {
    expect(s.a.objetivo).toBe("saude");
    expect(s.a.barreira).toEqual(["tempo"]);
    expect(s.a.motivo).toEqual(["estetica"]);
  });

  it("mantém objetivo massa, dias, minutos, onde e trabalho", () => {
    const m = stripHealth(anamneseBase({ objetivo: "massa", dias: 4, minutos: 45, onde: "casa", equipamentos: ["halteres"], trabalho: "sentado" }));
    expect(m.a).toMatchObject({ objetivo: "massa", dias: 4, minutos: 45, onde: "casa", trabalho: "sentado", nome: "Ana Souza", ano: 1990, sexo: "F" });
    expect(s.a).toMatchObject({ dias: 4, minutos: 45, onde: "casa", trabalho: "sentado" });
  });

  it("não muda a rodada original", () => {
    expect(cheia.a.peso).toBe(80);
    expect(cheia.consent).toBeDefined();
  });
});

describe("gatilhoNutricionista", () => {
  it("cada gatilho dispara", () => {
    const casos: Partial<AnamneseAnswers>[] = [
      { condicoes: ["diabetes1"] },
      { condicoes: ["diabetes2"] },
      { condicoes: ["rins"] },
      { condicoes: ["alimentar"] },
      { gestacao: "gravida", obstetra: "sim" },
      { remedios: 1, remediosPara: ["emagrecer"] },
      { restricoes: ["celiaca"] },
    ];
    for (const c of casos) expect(gatilhoNutricionista(anamneseBase(c))).toBe(true);
  });

  it("falso sem nenhum, sem questionário e sem dados de saúde", () => {
    expect(gatilhoNutricionista(anamneseBase({ condicoes: ["prediabetes", "pressao"], gestacao: "pp3", restricoes: ["lactose"] }))).toBe(false);
    expect(gatilhoNutricionista(undefined)).toBe(false);
    expect(gatilhoNutricionista(stripHealth(anamneseBase({ condicoes: ["diabetes2"] })))).toBe(false);
  });
});

describe("leitura humana", () => {
  it("respostaDe usa os rótulos literais", () => {
    const a = respostasBase({ dor: 1, dorOnde: [{ r: "joelho", l: "d" }, { r: "outro", t: "calcanhar" }], peso: 72.5, condicoes: [], remedios: "pessoal" });
    expect(respostaDe(a, "dorOnde")).toBe("Joelho (direito), Outro lugar: calcanhar");
    expect(respostaDe(a, "peso")).toBe("72,5 kg");
    expect(respostaDe(a, "condicoes")).toBe("Nenhuma destas");
    expect(respostaDe(a, "remedios")).toBe("Prefiro falar pessoalmente");
    expect(respostaDe(a, "parq.0")).toBe("Não");
    expect(respostaDe(a, "objetivo")).toBe("Ganhar massa muscular");
  });

  it("respostasPorParte: texto literal da pergunta; obrigatória em branco = 'Pulou'; sem saúde, só o resto", () => {
    const an = anamneseBase({ dias: undefined }, { via: "junto", by: "personal" });
    const partes = respostasPorParte(an, ctxDe(an, { hoje: HOJE, personal: "Carlos Lima", aluno: "Ana Souza" }));
    expect(partes.map((p) => p.secao)).toEqual(["voce", "parq", "saude", "dor", "treino"]);
    const parq = partes.find((p) => p.secao === "parq");
    expect(parq?.itens[0]).toEqual({ pergunta: PARQ_PERGUNTAS[0], resposta: "Não" });
    expect(partes.find((p) => p.secao === "treino")?.itens).toContainEqual({ pergunta: "Quantos dias por semana você consegue treinar de verdade?", resposta: "Pulou" });
    const semSaude = stripHealth(an);
    const s = respostasPorParte(semSaude, ctxDe(semSaude, { hoje: HOJE, personal: "Carlos", aluno: "Ana" })).map((p) => p.secao as SecaoId);
    expect(s).toEqual(["voce", "treino"]);
  });

  it("respostasPorParte também lê o rascunho ({ a, pulados }), com a saúde, antes do envio", () => {
    const a = gravarResposta(respostasBase({ dias: undefined }), "parq.3", 1);
    const partes = respostasPorParte({ a }, ctxBase());
    expect(partes.find((p) => p.secao === "parq")?.itens).toContainEqual({ pergunta: PARQ_PERGUNTAS[3], resposta: "Sim" });
    expect(partes.find((p) => p.secao === "treino")?.itens).toContainEqual({ pergunta: "Quantos dias por semana você consegue treinar de verdade?", resposta: RESPOSTA_PULOU });
    const pulou = respostasPorParte({ a: respostasBase(), pulados: ["rotina"] }, ctxBase({ modulos: ["rotina"] }));
    expect(pulou.find((p) => p.secao === "rotina")?.itens).toEqual([{ pergunta: "Rotina e sono", resposta: RESPOSTA_PULOU_PARTE }]);
  });

  it("todos os remédios têm rótulo", () => {
    const p = PERGUNTAS.find((x) => x.id === "remediosPara");
    for (const r of REMEDIOS) expect(p?.opcoes?.some((o) => o.v === r)).toBe(true);
  });
});

describe("integração com o link e o perfil (track E): o que o catálogo grava, o esquema aceita", () => {
  const pedido = buildPedido({ coach: personalBase(), student: alunoBase(), modulos: [...MODULOS], agora: RESPONDIDO_EM });
  const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  /** Valores de borda e todas as opções de cada pergunta (texto acima do teto: gravarResposta corta). */
  function valoresDe(p: Pergunta): unknown[] {
    const ops = (p.opcoes ?? []).map((o) => o.v);
    switch (p.tipo) {
      case "sn":
        return [0, 1];
      case "sn3":
      case "eu":
        return ops;
      case "em": {
        const juntas = (p.opcoes ?? []).filter((o) => !o.exclusiva).map((o) => o.v);
        return [...ops, p.maxSel ? juntas.slice(0, p.maxSel) : juntas];
      }
      case "esc":
        return Array.from({ length: (p.max ?? 10) - (p.min ?? 0) + 1 }, (_, i) => (p.min ?? 0) + i);
      case "num":
        return p.id === "ano" ? [ANO_GUARDADO.min, ANO_GUARDADO.max, "1990"] : [p.min, p.max, String(p.min).concat(",4")];
      case "txt":
        return ["  com espaço  ", "x".repeat((p.max ?? 100) + 50)];
      case "mes":
        return p.id === "data" ? [{ quando: "2027-03" }, { quando: "2027-03", texto: "y".repeat(100) }] : ["2027-03"];
      case "regioes":
        return [REGIOES.map((r) => ({ r, ...((REGIOES_COM_LADO as readonly string[]).includes(r) ? { l: "ambos" } : {}), ...(r === "outro" ? { t: "z".repeat(100) } : {}) }))];
    }
  }

  it("cada valor que gravarResposta guarda passa em parseRespostas (link) e em readAnamnese (perfil)", () => {
    let conferidos = 0;
    for (const p of PERGUNTAS)
      for (const v of valoresDe(p)) {
        const base = respostasBase();
        const a = gravarResposta(base, p.id, v);
        if (a === base) continue;
        // Ano de menor de 18: a saúde só passa com a autorização do responsável (questionario-link, revisão da rodada 2).
        const menor = precisaResponsavel(a, new Date(RESPONDIDO_EM));
        const responsavel = { nome: "Marta Teles", at: RESPONDIDO_EM };
        const an = anamneseBase(a, { modulos: [...MODULOS], ...(menor ? { consent: { at: RESPONDIDO_EM, source: "aluno_questionario" as const, textId: "c1", responsavel } } : {}) });
        const pacote = json(buildRespostas({ pedido, anamnese: an, agora: RESPONDIDO_EM }));
        expect(parseRespostas(pacote), `${p.id} = ${JSON.stringify(v)}`).not.toBeNull();
        expect(typeof readAnamnese(alunoBase({ anamnese: json(an) })), `${p.id} = ${JSON.stringify(v)}`).toBe("object");
        conferidos++;
      }
    expect(conferidos).toBeGreaterThan(300);
  });

  it("sanear de novo pelo catálogo não muda uma rodada lida do perfil (o JSON do aparelho volta igual)", () => {
    const an = anamneseBase({ dor: 1, dorOnde: [{ r: "joelho", l: "d" }], dorNota: 5, dorQuando: ["movimento"], dorDesde: "ate3m", tratamento: "fisio", foco: [], naoQuer: ["saltos"] });
    const lida = readAnamnese(alunoBase({ anamnese: json(an) }));
    if (!lida || typeof lida !== "object") throw new Error("leitura");
    let refeita: AnamneseAnswers = {};
    for (const p of PERGUNTAS) {
      const v = lerResposta(lida.a, p.id);
      if (v !== undefined && v !== null) refeita = gravarResposta(refeita, p.id, v);
    }
    expect(refeita).toEqual(lida.a);
  });

  it("stripHealth: o pacote 'sem dados de saúde' passa no link (sem saúde, sem autorização, sem termo)", () => {
    const an = stripHealth(anamneseBase({ parq: [0, 1, 0, 0, 0, 0, 0], dor: 1, dorOnde: [{ r: "lombar" }], objetivo: "semDor", barreira: ["dor"] }, { termo: { at: RESPONDIDO_EM, nome: "Ana Souza" } }));
    expect(parseRespostas(json(buildRespostas({ pedido, anamnese: an, agora: RESPONDIDO_EM })))).not.toBeNull();
    expect(readAnamnese(alunoBase({ anamnese: json(an) }))).toMatchObject({ healthOmitted: true });
  });
});

describe("arquivos do track A", () => {
  it("nenhum import de React, Next, runtime de analytics ou repositório (só tipos de analytics)", () => {
    const raiz = path.resolve(__dirname, "..");
    const arquivos = ["domain/anamnese.ts", "domain/triagem.ts", "domain/resumo.ts", "domain/next-steps.ts", "anamnese-events.ts", "domain/anamnese-fixtures.ts"];
    for (const f of arquivos) {
      const fonte = readFileSync(path.join(raiz, f), "utf8");
      const imports = fonte.match(/^import[^;]+;/gm) ?? [];
      for (const linha of imports) {
        expect(linha, `${f}: ${linha}`).not.toMatch(/from "(react|next[^"]*|posthog-js|@\/lib\/data[^"]*|\.\.?\/data[^"]*|\.\/repository)"/);
        if (/analytics"/.test(linha)) expect(linha.startsWith("import type"), `${f}: ${linha}`).toBe(true);
      }
    }
  });

  it("o catálogo não puxa format.ts nem o motor (vai no bundle de /questionario)", () => {
    const fonte = readFileSync(path.resolve(__dirname, "anamnese.ts"), "utf8");
    expect(fonte).not.toMatch(/from "\.\/(format|generator|exercises)"/);
  });
});
