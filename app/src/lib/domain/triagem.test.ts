import { describe, expect, it } from "vitest";
import type { AlertId, Anamnese, AnamneseAnswers, Liberacao } from "./anamnese-types";
import { gravarResposta, PERGUNTAS, stripHealth } from "./anamnese";
import { alunoBase, anamneseBase, anoParaIdade, HOJE, RESPONDIDO_EM } from "./anamnese-fixtures";
import {
  ALERTA_DEF,
  abertosParaLiberar,
  alertas,
  cobre,
  comConversei,
  comLiberacao,
  comOverride,
  mensagemAvisar,
  motivoTetoModerado,
  MOTIVO_INATIVO,
  NIVEL_ROTULO,
  novaLiberacao,
  ORDEM_ALERTAS,
  SINAIS_PARAR,
  travaEPorta,
} from "./triagem";
import { readAnamnese } from "./questionario-link";
import type { Profile } from "./types";

// As respostas passam pelo readAnamnese real (track E): toda fixture também é conferida pelo esquema tolerante.

const ctx = (liberacoes: Liberacao[] = []) => ({ hoje: HOJE, liberacoes });
const ids = (an: Anamnese, libs: Liberacao[] = []) => alertas(an, ctx(libs)).map((x) => x.id);
const parq = (...sim: number[]): AnamneseAnswers["parq"] => [0, 1, 2, 3, 4, 5, 6].map((i) => (sim.includes(i) ? 1 : 0)) as AnamneseAnswers["parq"];
const dor = (over: Partial<AnamneseAnswers> = {}): Partial<AnamneseAnswers> => ({ dor: 1, dorOnde: [{ r: "joelho", l: "d" }], dorNota: 4, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "nao", ...over });
const lombar = (alerta: AnamneseAnswers["dorAlerta"]): Partial<AnamneseAnswers> => dor({ dorOnde: [{ r: "lombar" }], dorAlerta: alerta });
const lib = (alertasCobertos: AlertId[], over: Partial<Liberacao> = {}): Liberacao => ({
  id: "lib-1",
  por: "medico",
  data: "2026-11-21",
  alertas: alertasCobertos,
  registradoEm: "2026-11-21T09:00:00-03:00",
  ...over,
});

/** Um positivo e um vizinho negativo (que muda uma resposta só) para cada um dos 29 alertas. */
const CASOS: Record<AlertId, { pos: Anamnese; neg: Anamnese }> = {
  "A-PEITO": { pos: anamneseBase({ parq: parq(1) }), neg: anamneseBase({ sintomas: ["faltaAr"] }) },
  "A-TONTURA": { pos: anamneseBase({ parq: parq(3) }), neg: anamneseBase({ sintomas: ["palpitacao"] }) },
  "A-SINTOMA": { pos: anamneseBase({ sintomas: ["faltaAr"] }), neg: anamneseBase({ sintomas: ["peito"] }) },
  "A-SUPERVISAO": { pos: anamneseBase({ parq: parq(0) }), neg: anamneseBase({ parq: parq(5) }) },
  "A-PAUSA": { pos: anamneseBase({ parq: parq(4), orientacao: "pausa" }), neg: anamneseBase({ parq: parq(4), orientacao: "restricao" }) },
  "A-OBSTETRA": { pos: anamneseBase({ gestacao: "gravida", obstetra: "pediuNao" }), neg: anamneseBase({ gestacao: "gravida", obstetra: "sim" }) },
  "A-COLUNA-URG": { pos: anamneseBase(lombar(["sela"])), neg: anamneseBase(lombar(["neuro"])) },
  "A-COLUNA": { pos: anamneseBase(lombar(["trauma"])), neg: anamneseBase(lombar([])) },
  "A-DOENCA": { pos: anamneseBase({ condicoes: ["coracao"], regular: "nao" }), neg: anamneseBase({ condicoes: ["coracao"], regular: "sim3m" }) },
  "A-PARQ7": { pos: anamneseBase({ parq: parq(6) }), neg: anamneseBase({ parq: parq(4) }) },
  "A-GESTANTE": { pos: anamneseBase({ gestacao: "gravida", obstetra: "naoPerguntei" }), neg: anamneseBase({ gestacao: "gravida", obstetra: "sim" }) },
  "A-HIPO": {
    pos: anamneseBase({ condicoes: ["diabetes2"], regular: "sim3m", hipo: "frequente", complicacoes: [] }),
    neg: anamneseBase({ condicoes: ["diabetes2"], regular: "sim3m", hipo: "asVezes", complicacoes: [] }),
  },
  "A-DIAB-COMP": { pos: anamneseBase({ condicoes: ["diabetes1"], hipo: "nunca", complicacoes: ["pes"] }), neg: anamneseBase({ condicoes: ["diabetes1"], hipo: "nunca", complicacoes: [] }) },
  "A-DOR-FORTE": { pos: anamneseBase(dor({ dorNota: 7 })), neg: anamneseBase(dor({ dorNota: 6 })) },
  "A-DOR-TRAUMA": { pos: anamneseBase(dor({ dorDesde: "ate6s", dorTrauma: 1 })), neg: anamneseBase(dor({ dorDesde: "ate6s", dorTrauma: 0 })) },
  "A-PARQ-INCOMPLETO": { pos: anamneseBase({ parq: undefined }, { via: "junto", by: "personal" }), neg: anamneseBase({}, { via: "junto", by: "personal" }) },
  "A-SEM-TRIAGEM": { pos: stripHealth(anamneseBase()), neg: anamneseBase() },
  "A-DOENCA-ATIVO": { pos: anamneseBase({ condicoes: ["rins"], regular: "sim3m" }), neg: anamneseBase({ condicoes: ["prediabetes"], regular: "sim3m" }) },
  "A-PRESSAO": { pos: anamneseBase({ condicoes: ["pressao"], pressaoControle: "naoSei" }), neg: anamneseBase({ condicoes: ["pressao"], pressaoControle: "controlada" }) },
  "A-PESSOAL": { pos: anamneseBase({ condicoes: "pessoal", orientacao: "nao" }), neg: anamneseBase({ condicoes: [], orientacao: "nao" }) },
  "A-POSPARTO": { pos: anamneseBase({ gestacao: "pp3", assoalho: 0 }), neg: anamneseBase({ gestacao: "pp12", assoalho: 0 }) },
  "A-QUEDA": {
    pos: anamneseBase({ ano: anoParaIdade(70), gestacao: undefined, quedas: 1, instavel: 0, medoCair: 0 }),
    neg: anamneseBase({ ano: anoParaIdade(70), gestacao: undefined, quedas: 0, instavel: 0, medoCair: 0 }),
  },
  "A-PARQ-SIM": { pos: anamneseBase({ parq: parq(4) }), neg: anamneseBase({ parq: parq(4, 6) }) },
  "A-GESTANTE-OK": { pos: anamneseBase({ gestacao: "gravida", obstetra: "sim" }), neg: anamneseBase({ gestacao: "gravida", obstetra: "naoPerguntei" }) },
  "A-CANCER": { pos: anamneseBase({ condicoes: ["cancer"], orientacao: "livre" }), neg: anamneseBase({ condicoes: ["osteoporose"], orientacao: "livre" }) },
  "A-ALIMENTAR": { pos: anamneseBase({ condicoes: ["alimentar"], orientacao: "nao" }), neg: anamneseBase({ condicoes: ["artrose"], orientacao: "nao" }) },
  "A-CIRURGIA": { pos: anamneseBase({ cirurgia: 1, cirurgiaQual: "vesícula em março" }), neg: anamneseBase({ cirurgia: 0 }) },
  "A-70": { pos: anamneseBase({ ano: anoParaIdade(70), gestacao: undefined, quedas: 0, instavel: 0, medoCair: 0 }), neg: anamneseBase({ ano: anoParaIdade(69), gestacao: undefined, quedas: 0, instavel: 0, medoCair: 0 }) },
  // Leitura cautelosa da idade (a mesma de precisaResponsavel): calculada 18 pode ter 17; o vizinho negativo é 19.
  "A-MENOR": { pos: anamneseBase({ ano: anoParaIdade(17), responsavel: "Maria Souza" }), neg: anamneseBase({ ano: anoParaIdade(19), responsavel: "Maria Souza" }) },
};

describe("tabela de spec §6.3", () => {
  it("29 alertas, na ordem da tabela, com nível e rótulos", () => {
    expect(ORDEM_ALERTAS).toHaveLength(29);
    expect(ORDEM_ALERTAS).not.toContain("A-INATIVO");
    expect(NIVEL_ROTULO).toEqual({ vermelho: "Não começar agora", laranja: "Pedir liberação antes de começar", amarelo: "Começar com limite", azul: "Cuidado", lembrete: "Lembrete" });
    expect(ALERTA_DEF["A-CIRURGIA"]).toMatchObject({ nivel: "azul", efeito: "info" });
  });

  it("a fixture base (tudo 'não', já treina) não tem alerta", () => {
    expect(ids(anamneseBase())).toEqual([]);
  });

  for (const id of Object.keys(CASOS) as AlertId[]) {
    it(`${id}: positivo e vizinho negativo`, () => {
      expect(ids(CASOS[id].pos)).toContain(id);
      expect(ids(CASOS[id].neg)).not.toContain(id);
    });
  }

  it("'porque' sempre com a pergunta curta e a resposta literal", () => {
    const curtos = new Set([...PERGUNTAS.map((p) => p.curto), "Autorização de saúde", "PAR-Q"]);
    for (const { pos } of Object.values(CASOS))
      for (const al of alertas(pos, ctx())) {
        expect(al.porque.length, al.id).toBeGreaterThan(0);
        for (const o of al.porque) {
          expect(curtos.has(o.pergunta), `${al.id}: ${o.pergunta}`).toBe(true);
          expect(o.resposta.length).toBeGreaterThan(0);
        }
      }
    const peito = alertas(anamneseBase({ parq: parq(2), sintomas: ["peito"] }), ctx()).find((x) => x.id === "A-PEITO");
    expect(peito?.porque).toEqual([
      { pergunta: "PAR-Q 3: dor no peito no último mês", resposta: "Sim" },
      { pergunta: "Sintomas", resposta: "Dor, aperto ou desconforto no peito, pescoço, mandíbula ou braços" },
    ]);
  });

  it("título e recomendação nunca citam condição que o aluno não marcou", () => {
    const palavras: { re: RegExp; marcou: (a: AnamneseAnswers) => boolean }[] = [
      { re: /diabetes|hipoglic/i, marcou: (a) => Array.isArray(a.condicoes) && a.condicoes.some((c) => c === "diabetes1" || c === "diabetes2") },
      { re: /pressão alta|hipertens/i, marcou: () => false },
      { re: /câncer/i, marcou: (a) => Array.isArray(a.condicoes) && a.condicoes.includes("cancer") },
      { re: /transtorno alimentar/i, marcou: (a) => Array.isArray(a.condicoes) && a.condicoes.includes("alimentar") },
      { re: /gestante/i, marcou: (a) => a.gestacao === "gravida" },
      { re: /coração|cardio|infarto|avc/i, marcou: () => false },
    ];
    for (const { pos } of Object.values(CASOS))
      for (const al of alertas(pos, ctx()))
        for (const w of palavras) if (w.re.test(`${al.titulo} ${al.recomendado}`)) expect(w.marcou(pos.a), `${al.id}: ${al.titulo}`).toBe(true);
  });

  it("ordem: vermelho, laranja, amarelo, azul, lembrete; no nível, a ordem da tabela", () => {
    const an = anamneseBase({ ano: anoParaIdade(72), gestacao: undefined, quedas: 1, instavel: 0, medoCair: 0, parq: parq(6, 3), cirurgia: 1, condicoes: "pessoal", orientacao: "nao" });
    expect(ids(an)).toEqual(["A-TONTURA", "A-PARQ7", "A-PESSOAL", "A-QUEDA", "A-CIRURGIA", "A-70"]);
  });
});

describe("regras com nuance", () => {
  it("PAR-Q 5 sozinho: A-PARQ-SIM azul, sem trava nem porta; 5 + 7: A-PARQ7 laranja e sem A-PARQ-SIM", () => {
    const so5 = anamneseBase({ parq: parq(4) });
    const al = alertas(so5, ctx());
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ id: "A-PARQ-SIM", nivel: "azul", titulo: "PAR-Q com “sim” na pergunta 5" });
    expect(al[0]?.recomendado).toContain("Termo não marcado.");
    expect(travaEPorta(so5, ctx())).toEqual({ trava: [], porta: [] });
    const com57 = alertas(anamneseBase({ parq: parq(4, 6) }), ctx());
    expect(com57.map((x) => x.id)).toEqual(["A-PARQ7"]);
    expect(com57[0]?.nivel).toBe("laranja");
    const com56 = alertas(anamneseBase({ parq: parq(4, 5) }, { termo: { at: "2026-11-20T10:05:00-03:00", nome: "Ana" } }), ctx());
    expect(com56[0]?.titulo).toBe("PAR-Q com “sim” nas perguntas 5 e 6");
    expect(com56[0]?.recomendado).toContain("Termo marcado em 20/11.");
  });

  it("A-PARQ7 mostra o detalhe que o aluno escreveu", () => {
    const al = alertas(anamneseBase({ parq: parq(6), parqDetalhe: "Tive covid mês passado" }), ctx())[0];
    expect(al?.porque).toContainEqual({ pergunta: "Detalhe do PAR-Q", resposta: "Tive covid mês passado" });
    expect(al?.recomendado).toBe("Converse com Ana. Se for de saúde, peça liberação.");
  });

  it("A-SINTOMA muda o texto conforme o aluno já treina", () => {
    const inativo = alertas(anamneseBase({ sintomas: ["inchaco"], regular: "nao" }), ctx()).find((x) => x.id === "A-SINTOMA");
    const ativo = alertas(anamneseBase({ sintomas: ["inchaco"], regular: "sim3m" }), ctx()).find((x) => x.id === "A-SINTOMA");
    expect(inativo?.recomendado).toBe("Avaliação médica antes de qualquer treino.");
    expect(ativo?.recomendado).toBe("Parar o treino atual e buscar avaliação médica.");
  });

  it("sem treino regular não é alerta (D-30): só o teto padrão com o motivo", () => {
    const sedentario = anamneseBase({ regular: "nao" });
    expect(ids(sedentario)).toEqual([]);
    expect(motivoTetoModerado(sedentario, ctx())).toBe(MOTIVO_INATIVO);
    expect(MOTIVO_INATIVO).toBe("Sem treino regular nos últimos 3 meses");
  });

  it("A-DOR-TRAUMA some com A-COLUNA; A-COLUNA-URG prevalece sobre A-COLUNA", () => {
    const comColuna = anamneseBase(dor({ dorOnde: [{ r: "lombar" }], dorDesde: "ate6s", dorTrauma: 1, dorAlerta: ["trauma"] }));
    expect(ids(comColuna)).toContain("A-COLUNA");
    expect(ids(comColuna)).not.toContain("A-DOR-TRAUMA");
    const urg = anamneseBase(dor({ dorOnde: [{ r: "lombar" }], dorDesde: "ate6s", dorTrauma: 1, dorAlerta: ["neuro", "esfincter"] }));
    expect(ids(urg)).toContain("A-COLUNA-URG");
    expect(ids(urg)).not.toContain("A-COLUNA");
    expect(ids(urg)).not.toContain("A-DOR-TRAUMA");
  });

  it("A-DOR-FORTE também com dor em repouso, à noite ou o tempo todo", () => {
    for (const q of ["parado", "noite", "sempre"] as const) expect(ids(anamneseBase(dor({ dorQuando: [q] })))).toContain("A-DOR-FORTE");
  });

  it("A-CIRURGIA é azul, com o texto no título, e não entra em travaEPorta", () => {
    const an = CASOS["A-CIRURGIA"].pos;
    const al = alertas(an, ctx())[0];
    expect(al).toMatchObject({ id: "A-CIRURGIA", nivel: "azul", titulo: "Cirurgia nos últimos 12 meses: vesícula em março" });
    expect(travaEPorta(an, ctx())).toEqual({ trava: [], porta: [] });
  });

  it("A-POSPARTO: com pp3 e com pp12 + assoalho; nunca na gestante com assoalho", () => {
    expect(ids(anamneseBase({ gestacao: "pp3", assoalho: 0 }))).toContain("A-POSPARTO");
    expect(ids(anamneseBase({ gestacao: "pp12", assoalho: 1 }))).toContain("A-POSPARTO");
    expect(ids(anamneseBase({ gestacao: "gravida", obstetra: "sim", assoalho: 1 }))).not.toContain("A-POSPARTO");
  });

  it("A-QUEDA com idade desconhecida e queda = Sim; não aos 64", () => {
    expect(ids(anamneseBase({ ano: undefined, quedas: 1, instavel: 0, medoCair: 0 }))).toContain("A-QUEDA");
    expect(ids(anamneseBase({ ano: anoParaIdade(64), quedas: 1 }))).not.toContain("A-QUEDA");
    expect(ids(anamneseBase({ ano: anoParaIdade(66), gestacao: undefined, quedas: 0, instavel: 0, medoCair: 1 }))).toContain("A-QUEDA");
  });

  it("A-GESTANTE também sem resposta sobre o obstetra (dado que falta não é liberação)", () => {
    expect(ids(anamneseBase({ gestacao: "gravida" }, { via: "junto", by: "personal" }))).toContain("A-GESTANTE");
  });

  it("A-PRESSAO também com a pergunta da pressão sem resposta (conta como 'Não sei'); não com pressão controlada", () => {
    expect(ids(anamneseBase({ remedios: 1, remediosPara: ["betabloqueador"], orientacao: "nao" }, { via: "junto", by: "personal" }))).toContain("A-PRESSAO");
    expect(ids(anamneseBase({ condicoes: ["pressao"], pressaoControle: "alta" }))).toContain("A-PRESSAO");
    expect(ids(anamneseBase({ condicoes: ["pressao"], pressaoControle: "asVezes" }))).not.toContain("A-PRESSAO");
  });

  it("A-PESSOAL diz sobre o quê", () => {
    const t = (a: Partial<AnamneseAnswers>) => alertas(anamneseBase(a), ctx()).find((x) => x.id === "A-PESSOAL")?.titulo;
    expect(t({ condicoes: "pessoal" })).toBe("Prefere falar pessoalmente sobre condições");
    expect(t({ remedios: "pessoal" })).toBe("Prefere falar pessoalmente sobre remédios");
    expect(t({ condicoes: "pessoal", remedios: "pessoal" })).toBe("Prefere falar pessoalmente sobre condições e remédios");
  });

  it("A-MENOR: autorização do responsável registrada; abaixo de 15, a frase da lei", () => {
    const resp = { nome: "Maria Souza", at: "2026-11-20T10:00:00-03:00" };
    const com = alertas(anamneseBase({ ano: anoParaIdade(16), responsavel: "Maria Souza" }, { consent: { at: RESPONDIDO_EM, source: "aluno_questionario", textId: "c1", responsavel: resp } }), ctx());
    expect(com.find((x) => x.id === "A-MENOR")?.recomendado).toBe("Menor de 18 anos: autorização de Maria Souza registrada em 20/11.");
    const catorze = alertas(anamneseBase({ ano: anoParaIdade(14), responsavel: "Maria Souza" }, { consent: { at: RESPONDIDO_EM, source: "aluno_questionario", textId: "c1", responsavel: resp } }), ctx());
    expect(catorze.find((x) => x.id === "A-MENOR")?.recomendado).toContain("quem tem menos de 15 anos precisa de autorização por escrito do responsável.");
  });

  it("sem dados de saúde: só A-SEM-TRIAGEM e os lembretes de idade", () => {
    const cheia = anamneseBase({ ano: anoParaIdade(16), responsavel: "Maria", parq: parq(1, 6), condicoes: ["diabetes2"], hipo: "frequente", cirurgia: 1, ...lombar(["sela"]) });
    expect(ids(stripHealth(cheia))).toEqual(["A-SEM-TRIAGEM", "A-MENOR"]);
    // Menor: a saúde pode ter ficado de fora pela falta da autorização do responsável; o texto não atribui ao aluno.
    const s = alertas(stripHealth(cheia), ctx())[0];
    expect(s?.recomendado).toBe("As respostas de saúde não vieram: faltou a autorização de Ana ou do responsável. Faça a triagem pessoalmente antes de começar.");
    const adulta = alertas(stripHealth(anamneseBase({ ano: anoParaIdade(30) })), ctx())[0];
    expect(adulta?.recomendado).toBe("Ana não autorizou o envio das respostas de saúde. Faça a triagem pessoalmente antes de começar.");
    expect(ids(stripHealth(anamneseBase({ ano: anoParaIdade(75) })))).toEqual(["A-SEM-TRIAGEM", "A-70"]);
  });

  it("SINAIS_PARAR literal", () => {
    expect(SINAIS_PARAR).toBe(
      "Pare o exercício e oriente procurar o obstetra se houver: sangramento vaginal, contrações dolorosas regulares, perda de líquido, falta de ar antes do esforço, tontura, dor de cabeça, dor no peito, fraqueza que afeta o equilíbrio, dor ou inchaço na panturrilha.",
    );
  });
});

describe("liberação, porta e 'Conversei' (spec §6.4)", () => {
  const vermelho = anamneseBase({ parq: parq(0) }); // A-SUPERVISAO
  const laranja = anamneseBase({ condicoes: ["avc"], regular: "nao" }); // A-DOENCA
  const ambos = anamneseBase({ parq: parq(0), condicoes: ["avc"], regular: "nao" });

  it("vermelho → trava; laranja → porta", () => {
    expect(travaEPorta(vermelho, ctx()).trava.map((x) => x.id)).toEqual(["A-SUPERVISAO"]);
    expect(travaEPorta(laranja, ctx()).porta.map((x) => x.id)).toEqual(["A-DOENCA"]);
    expect(travaEPorta(undefined, ctx())).toEqual({ trava: [], porta: [] });
  });

  it("override tira a porta e não a trava; liberação tira as duas", () => {
    const comOv: Anamnese = { ...ambos, overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-SUPERVISAO", "A-DOENCA"] }] };
    const tp = travaEPorta(comOv, ctx());
    expect(tp.trava.map((x) => x.id)).toEqual(["A-SUPERVISAO"]);
    expect(tp.porta).toEqual([]);
    expect(alertas(comOv, ctx()).find((x) => x.id === "A-DOENCA")?.coberto).toEqual({ por: "override", data: "2026-11-21T10:00:00-03:00" });
    expect(travaEPorta(ambos, ctx([lib(["A-SUPERVISAO", "A-DOENCA"])]))).toEqual({ trava: [], porta: [] });
  });

  it("[E1] cobre exige o id na lista e registro depois das respostas", () => {
    expect(cobre(lib(["A-SUPERVISAO"]), "A-SUPERVISAO", vermelho, HOJE)).toBe(true);
    expect(cobre(lib(["A-DOENCA"]), "A-SUPERVISAO", vermelho, HOJE)).toBe(false);
    expect(cobre(lib(["A-SUPERVISAO"], { registradoEm: "2026-11-19T09:00:00-03:00" }), "A-SUPERVISAO", vermelho, HOJE)).toBe(false);
  });

  it("respostas do link: compara com a chegada a este aparelho (receivedAt), no relógio do personal", () => {
    // Celular do aluno adiantado: answeredAt depois do registro, mas as respostas chegaram antes dele.
    const adiantado = { ...vermelho, answeredAt: "2026-11-21T11:00:00-03:00", receivedAt: "2026-11-21T08:00:00-03:00" };
    expect(cobre(lib(["A-SUPERVISAO"]), "A-SUPERVISAO", adiantado, HOJE)).toBe(true);
    expect(travaEPorta(adiantado, ctx([lib(["A-SUPERVISAO"])])).trava).toEqual([]);
    // Liberação registrada entre a resposta e a chegada: é anterior ao que o personal viu.
    const chegouDepois = { ...vermelho, answeredAt: "2026-11-20T10:00:00-03:00", receivedAt: "2026-11-22T10:00:00-03:00" };
    expect(cobre(lib(["A-SUPERVISAO"]), "A-SUPERVISAO", chegouDepois, HOJE)).toBe(false);
    expect(alertas(chegouDepois, ctx([lib(["A-SUPERVISAO"])]))[0]?.liberacaoAnterior).toEqual({ id: "lib-1", data: "2026-11-21" });
    // Restrições da liberação no teto moderado seguem a mesma regra.
    const ativo = anamneseBase({}, { answeredAt: "2026-11-20T10:00:00-03:00", receivedAt: "2026-11-22T10:00:00-03:00" });
    expect(motivoTetoModerado(ativo, ctx([lib([], { restricoes: "sem corrida" })]))).toBeNull();
    expect(motivoTetoModerado(ativo, ctx([lib([], { restricoes: "sem corrida", registradoEm: "2026-11-22T11:00:00-03:00" })]))).toBe("Liberação com restrições");
  });

  it("alerta coberto mostra quem liberou, quando e as restrições (a mais recente)", () => {
    const libs = [lib(["A-SUPERVISAO"], { id: "l1", data: "2026-11-20" }), lib(["A-SUPERVISAO"], { id: "l2", por: "fisio", data: "2026-11-22", registradoEm: "2026-11-22T09:00:00-03:00", restricoes: " sem corrida " })];
    expect(alertas(vermelho, ctx(libs))[0]?.coberto).toEqual({ por: "fisio", data: "2026-11-22", restricoes: "sem corrida" });
  });

  it("respostas novas reabrem o alerta e preenchem liberacaoAnterior", () => {
    const novas = { ...vermelho, id: "an-2", answeredAt: "2026-11-22T10:00:00-03:00" };
    const al = alertas(novas, ctx([lib(["A-SUPERVISAO"])]))[0];
    expect(al?.coberto).toBeUndefined();
    expect(al?.liberacaoAnterior).toEqual({ id: "lib-1", data: "2026-11-21" });
    expect(travaEPorta(novas, ctx([lib(["A-SUPERVISAO"])])).trava).toHaveLength(1);
  });

  it("'Conversei' cobre só A-PESSOAL; override não cobre amarelo", () => {
    const pessoal = anamneseBase({ condicoes: "pessoal", parq: parq(6) });
    const comConv: Anamnese = { ...pessoal, conversei: { at: "2026-11-21T10:00:00-03:00", alertas: ["A-PESSOAL", "A-PARQ7"] } };
    const al = alertas(comConv, ctx());
    expect(al.find((x) => x.id === "A-PESSOAL")?.coberto).toEqual({ por: "conversei", data: "2026-11-21T10:00:00-03:00" });
    expect(al.find((x) => x.id === "A-PARQ7")?.coberto).toBeUndefined();
    const ov: Anamnese = { ...pessoal, overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-PESSOAL"] }] };
    expect(alertas(ov, ctx()).find((x) => x.id === "A-PESSOAL")?.coberto).toBeUndefined();
  });

  it("abertosParaLiberar: vermelhos, laranjas e A-DOENCA-ATIVO sem liberação (override não é liberação)", () => {
    const an = anamneseBase({ parq: parq(0), condicoes: ["coracao"], regular: "sim3m", cirurgia: 1 }, { overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-PARQ7"] }] });
    expect(abertosParaLiberar(alertas(an, ctx())).map((x) => x.id)).toEqual(["A-SUPERVISAO", "A-DOENCA-ATIVO"]);
    expect(abertosParaLiberar(alertas(an, ctx([lib(["A-SUPERVISAO"])]))).map((x) => x.id)).toEqual(["A-DOENCA-ATIVO"]);
  });
});

describe("motivoTetoModerado", () => {
  it("cada motivo, na ordem", () => {
    expect(motivoTetoModerado(anamneseBase({ condicoes: ["coracao"], regular: "sim3m" }), ctx())).toBe("Condição de saúde conhecida, já treina");
    expect(motivoTetoModerado(anamneseBase({ condicoes: ["pressao"], pressaoControle: "alta" }), ctx())).toBe("Pressão sem controle conhecido");
    expect(motivoTetoModerado(anamneseBase({ remedios: "pessoal", orientacao: "nao" }), ctx())).toBe("Prefere falar pessoalmente sobre remédios");
    expect(motivoTetoModerado(anamneseBase({ regular: "pouco" }), ctx())).toBe(MOTIVO_INATIVO);
    expect(motivoTetoModerado(anamneseBase({ parq: parq(4) }), ctx([lib(["A-PARQ-SIM"], { restricoes: "sem impacto" })]))).toBe("Liberação com restrições");
  });

  it("null com 'Conversei', aluno ativo, liberação sem restrição e sem questionário", () => {
    const pessoal = anamneseBase({ condicoes: "pessoal" }, { conversei: { at: "2026-11-21T10:00:00-03:00", alertas: ["A-PESSOAL"] } });
    expect(motivoTetoModerado(pessoal, ctx())).toBeNull();
    expect(motivoTetoModerado(anamneseBase(), ctx())).toBeNull();
    expect(motivoTetoModerado(anamneseBase({ condicoes: ["avc"], regular: "sim3m" }), ctx([lib(["A-DOENCA-ATIVO"])]))).toBeNull();
    expect(motivoTetoModerado(undefined, ctx())).toBeNull();
  });

  it("sem dados de saúde, o teto vale com o motivo verdadeiro", () => {
    expect(motivoTetoModerado(stripHealth(anamneseBase()), ctx())).toBe("Sem triagem de saúde");
  });
});

describe("gravação imutável", () => {
  it("novaLiberacao: id novo, data de registro, restrições aparadas", () => {
    const l = novaLiberacao({ por: "obstetra", data: "2026-11-22", restricoes: "  ", alertas: ["A-GESTANTE", "A-GESTANTE"], agora: "2026-11-23T12:00:00-03:00" });
    expect(l.id.length).toBeGreaterThan(5);
    expect(l).toMatchObject({ por: "obstetra", data: "2026-11-22", alertas: ["A-GESTANTE"], registradoEm: "2026-11-23T12:00:00-03:00" });
    expect(l.restricoes).toBeUndefined();
    expect(l.validaAte).toBeUndefined(); // [E2]
  });

  it("comLiberacao, comOverride e comConversei não mudam o perfil original", () => {
    const p = alunoBase({ anamnese: anamneseBase({ parq: parq(6) }) });
    const l = novaLiberacao({ por: "medico", data: "2026-11-22", alertas: ["A-PARQ7"], agora: "2026-11-23T12:00:00-03:00" });
    const comLib = comLiberacao(p, l);
    expect(comLib.liberacoes).toEqual([l]);
    expect(p.liberacoes).toBeUndefined();
    const ov = comOverride(p, ["A-PARQ7"], "2026-11-23T12:00:00-03:00");
    expect(ov.anamnese?.overrides).toEqual([{ at: "2026-11-23T12:00:00-03:00", alertas: ["A-PARQ7"] }]);
    expect(p.anamnese?.overrides).toBeUndefined();
    const cv = comConversei(p, ["A-PESSOAL"], "2026-11-23T12:00:00-03:00");
    expect(cv.anamnese?.conversei).toEqual({ at: "2026-11-23T12:00:00-03:00", alertas: ["A-PESSOAL"] });
    expect(p.anamnese?.conversei).toBeUndefined();
    expect(comOverride(alunoBase(), ["A-PARQ7"], "2026-11-23T12:00:00-03:00").anamnese).toBeUndefined();
  });
});

describe("mensagemAvisar", () => {
  it("dois modelos fixos; nenhum rótulo de condição, sintoma ou remédio", () => {
    const rotulos = PERGUNTAS.filter((p) => ["condicoes", "sintomas", "remediosPara", "complicacoes", "dorAlerta"].includes(p.id)).flatMap((p) => (p.opcoes ?? []).map((o) => o.rotulo.toLowerCase()));
    for (const { pos } of Object.values(CASOS)) {
      const texto = mensagemAvisar(alertas(pos, ctx()), "Ana Souza").toLowerCase();
      for (const r of rotulos) expect(texto.includes(r), r).toBe(false);
      expect(texto).not.toMatch(/diabetes|press[aã]o|cora[cç][aã]o|c[aâ]ncer|gr[aá]vida|gestante/);
    }
    expect(mensagemAvisar(alertas(CASOS["A-PARQ7"].pos, ctx()), "Ana Souza")).toBe(
      "Oi, Ana! Li seu questionário. Antes de começarmos o treino, preciso que você converse com seu médico e me traga a liberação por escrito. Qualquer dúvida, me chama.",
    );
    expect(mensagemAvisar(alertas(CASOS["A-COLUNA-URG"].pos, ctx()), "Ana")).toBe(
      "Oi, Ana! Li seu questionário. Pelo que você marcou sobre a dor nas costas, procure atendimento médico ainda hoje. Depois me conta como foi.",
    );
  });
});

describe("ida e volta pelo aparelho (readAnamnese real do track E)", () => {
  const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const lido = (p: Profile): Anamnese => {
    const r = readAnamnese(p);
    if (!r || typeof r !== "object") throw new Error(`leitura: ${String(r)}`);
    return r;
  };

  it("junto com 'Salvar o que já tem' e PAR-Q pela metade: o 'Sim' respondido continua valendo (A-PEITO) e vem A-PARQ-INCOMPLETO", () => {
    const a = gravarResposta(gravarResposta({ ...anamneseBase().a, parq: undefined }, "parq.1", 1), "parq.4", 0);
    const an = anamneseBase({ ...a }, { via: "junto", by: "personal", incompleto: ["parq"], consent: { at: RESPONDIDO_EM, source: "personal", textId: "c1" } });
    const p = alunoBase({ anamnese: json(an) });
    const ids = alertas(lido(p), ctx()).map((x) => x.id);
    expect(ids).toContain("A-PEITO");
    expect(ids).toContain("A-PARQ-INCOMPLETO");
    expect(travaEPorta(lido(p), ctx()).trava.map((x) => x.id)).toEqual(["A-PEITO"]);
  });

  it("'Seguir mesmo assim' e 'Conversei' gravados e lidos de novo cobrem o alerta", () => {
    const p = alunoBase({ anamnese: json(anamneseBase({ parq: parq(6), condicoes: "pessoal" })) });
    const depois = json(comConversei(comOverride(p, ["A-PARQ7"], "2026-11-23T12:00:00-03:00"), ["A-PESSOAL"], "2026-11-23T12:05:00-03:00"));
    const lista = alertas(lido(depois), ctx());
    expect(lista.find((x) => x.id === "A-PARQ7")?.coberto).toEqual({ por: "override", data: "2026-11-23T12:00:00-03:00" });
    expect(lista.find((x) => x.id === "A-PESSOAL")?.coberto).toEqual({ por: "conversei", data: "2026-11-23T12:05:00-03:00" });
    expect(travaEPorta(lido(depois), ctx()).porta).toEqual([]);
    expect(motivoTetoModerado(lido(depois), ctx())).toBeNull();
  });

  it("liberação gravada no perfil e lida de novo tira a trava", () => {
    const p = alunoBase({ anamnese: json(anamneseBase({ parq: parq(1) })) });
    const l = novaLiberacao({ por: "medico", data: "2026-11-22", alertas: ["A-PEITO"], agora: "2026-11-23T12:00:00-03:00" });
    const depois = json(comLiberacao(p, l));
    expect(travaEPorta(lido(depois), { hoje: HOJE, liberacoes: depois.liberacoes ?? [] }).trava).toEqual([]);
  });
});
