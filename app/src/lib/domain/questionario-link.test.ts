import { describe, expect, it } from "vitest";
import { packData, packedFromText, pastedLinkHref, unpackData } from "../share-link";
import { HEALTH_KEYS, stripHealth } from "./anamnese";
import { alunoBase, anamneseBase, anoParaIdade, personalBase, respostasBase, RESPONDIDO_EM } from "./anamnese-fixtures";
import { ANAMNESE_V, type Anamnese, type AnamneseAnswers, type AnamneseLink } from "./anamnese-types";
import {
  buildPedido,
  buildRespostas,
  comPedido,
  ehDataIso,
  lembreteMessage,
  linkPedido,
  linkRespostas,
  packetProblem,
  parsePedido,
  parseRespostas,
  pedidoMessage,
  pedidoReaproveitavel,
  PEDIR_TEXTO,
  PROBLEMA_TEXTO,
  readAnamnese,
  respostasMessage,
  TEXTO_LIVRE_MAX,
  textoLivreTotal,
  VERSAO_PROTOCOLO,
  whatsappDoPersonalOk,
  nomeDoPersonalOk,
  type PedidoPacket,
  type RespostasPacket,
} from "./questionario-link";
import { isIsoDate } from "./delivery";
import { buildFichaPacket, buildTreinosPacket, parsePacket, TRANSFER_VERSION } from "./transfer";
import type { Profile, Program } from "./types";

const AGORA = "2026-11-23T10:00:00-03:00";
const ORIGIN = "https://app.shapereal.com.br";
const coach = personalBase();
const aluno = alunoBase();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function pedido(over: Partial<Parameters<typeof buildPedido>[0]> = {}): PedidoPacket {
  return buildPedido({ coach, student: aluno, modulos: [], atendimento: "academia", id: "pedido-1", agora: AGORA, ...over });
}
function respostas(a: Partial<AnamneseAnswers> = {}, meta: Partial<Anamnese> = {}): RespostasPacket {
  return buildRespostas({ pedido: pedido(), anamnese: anamneseBase(a, { id: "pedido-1", ...meta }), agora: AGORA });
}
/** Pacote de respostas cru (como chega do link), com uma alteração aplicada. */
function cru(mudar: (r: Record<string, any>) => void, base: RespostasPacket = respostas()): unknown {
  const r = clone(base) as Record<string, any>;
  mudar(r);
  return r;
}

describe("pacotes: ida e volta", () => {
  it("pedido: packData/unpackData preserva os dados", async () => {
    const p = pedido({ modulos: ["rotina", "objetivo"] });
    const volta = parsePedido(await unpackData(await packData(p)));
    expect(volta).toEqual(p);
  });

  it("respostas: packData/unpackData preserva os dados (com saúde, termo e autorização)", async () => {
    const r = respostas(
      { parq: [0, 0, 0, 0, 1, 0, 0], parqDetalhe: "Artrose no joelho", dor: 1, dorOnde: [{ r: "joelho", l: "d" }, { r: "outro", t: "calcanhar" }], dorNota: 4, dorQuando: ["movimento"], dorDesde: "mais3m", recado: "Treino de manhã" },
      { termo: { at: RESPONDIDO_EM, nome: "Ana Souza" } },
    );
    const volta = parseRespostas(await unpackData(await packData(r)));
    expect(volta).toEqual(r);
  });

  it("respostas sem saúde (stripHealth) também abrem", () => {
    const an = stripHealth(anamneseBase({ dor: 1, dorOnde: [{ r: "lombar" }] }, { id: "pedido-1" }));
    const r = buildRespostas({ pedido: pedido(), anamnese: an, agora: AGORA });
    expect(parseRespostas(clone(r))).toEqual(r);
  });

  it("opcionais vazios (null) saem, como em parsePacket", () => {
    const p = cru((r) => {
      r.anamnese.a.recado = null;
      r.anamnese.termo = null;
    });
    const volta = parseRespostas(p)!;
    expect(volta).not.toBeNull();
    expect("recado" in volta.anamnese.a).toBe(false);
    expect("termo" in volta.anamnese).toBe(false);
  });

  it("chave desconhecida é descartada (o link não injeta campos do aparelho do personal)", () => {
    const p = cru((r) => {
      r.anamnese.overrides = [{ at: AGORA, alertas: ["A-PEITO"] }];
      r.anamnese.conversei = { at: AGORA, alertas: ["A-PESSOAL"] };
      r.anamnese.vistoEm = AGORA;
      r.anamnese.a.inventada = "x";
      r.extra = 1;
    });
    const volta = parseRespostas(p)! as unknown as Record<string, any>;
    expect(volta.extra).toBeUndefined();
    expect(volta.anamnese.overrides).toBeUndefined();
    expect(volta.anamnese.conversei).toBeUndefined();
    expect(volta.anamnese.vistoEm).toBeUndefined();
    expect(volta.anamnese.a.inventada).toBeUndefined();
  });

  it("buildRespostas não leva campos do aparelho do personal e usa o nome confirmado pelo aluno", () => {
    const an: Anamnese = { ...anamneseBase({ nome: "Ana Paula Souza" }), receivedAt: AGORA, overrides: [{ at: AGORA, alertas: ["A-PARQ7"] }], conversei: { at: AGORA, alertas: [] }, vistoEm: AGORA };
    const r = buildRespostas({ pedido: pedido(), anamnese: an, agora: AGORA });
    expect(Object.keys(r.anamnese)).not.toEqual(expect.arrayContaining(["receivedAt"]));
    for (const k of ["receivedAt", "overrides", "conversei", "vistoEm"]) expect(k in r.anamnese).toBe(false);
    expect(r.studentName).toBe("Ana Paula Souza");
    expect(r.coachId).toBe(coach.id);
    expect(r.studentRef).toBe(aluno.id);
    const semNome = buildRespostas({ pedido: pedido(), anamnese: anamneseBase({ nome: "  " }), agora: AGORA });
    expect(semNome.studentName).toBe(aluno.name);
  });
});

describe("limites de texto (spec §10.1)", () => {
  const CAMPOS: [keyof AnamneseAnswers, number][] = [
    ["nome", 120],
    ["responsavel", 120],
    ["parqDetalhe", 200],
    ["condicaoOutra", 100],
    ["remediosNomes", 150],
    ["cirurgiaQual", 100],
    ["orientacaoQual", 150],
    ["lesaoQual", 150],
    ["naoQuerOutro", 100],
    ["alergia", 60],
    ["sucesso", 150],
    ["esporte", 60],
    ["lesao12Qual", 100],
    ["evita", 150],
    ["orientacaoFisio", 150],
    ["recado", 300],
  ];
  for (const [campo, max] of CAMPOS) {
    it(`${campo}: ${max} aceita, ${max + 1} recusa`, () => {
      expect(parseRespostas(clone(respostas({ [campo]: "a".repeat(max) })))).not.toBeNull();
      expect(parseRespostas(clone(respostas({ [campo]: "a".repeat(max + 1) })))).toBeNull();
    });
  }

  it("texto de região ('Outro lugar'): 60 aceita, 61 recusa", () => {
    const com = (n: number) => respostas({ dor: 1, dorOnde: [{ r: "outro", t: "a".repeat(n) }], dorNota: 3, dorQuando: ["movimento"], dorDesde: "ate3m" });
    expect(parseRespostas(clone(com(60)))).not.toBeNull();
    expect(parseRespostas(clone(com(61)))).toBeNull();
  });

  it("texto da data: 60 aceita, 61 recusa", () => {
    const com = (n: number) => respostas({ data: { quando: "2027-03", texto: "a".repeat(n) } });
    expect(parseRespostas(clone(com(60)))).not.toBeNull();
    expect(parseRespostas(clone(com(61)))).toBeNull();
  });

  it("perguntas próprias: pergunta até 100 e resposta até 300", () => {
    const com = (q: number, r: number) => respostas({}, { extras: [{ q: "q".repeat(q), r: "r".repeat(r) }] });
    expect(parseRespostas(clone(com(100, 300)))).not.toBeNull();
    expect(parseRespostas(clone(com(101, 10)))).toBeNull();
    expect(parseRespostas(clone(com(10, 301)))).toBeNull();
  });

  it("nome no termo e no responsável: até 120", () => {
    expect(parseRespostas(clone(respostas({}, { termo: { at: RESPONDIDO_EM, nome: "a".repeat(121) } })))).toBeNull();
    const consent = { at: RESPONDIDO_EM, source: "aluno_questionario" as const, textId: "c1", responsavel: { nome: "a".repeat(121), at: RESPONDIDO_EM } };
    expect(parseRespostas(clone(respostas({}, { consent })))).toBeNull();
  });

  it("pedido: nomes até 120 e perguntas próprias até 100", () => {
    const p = pedido();
    expect(parsePedido({ ...clone(p), student: { ref: "x", name: "a".repeat(121) } })).toBeNull();
    expect(parsePedido({ ...clone(p), coach: { ...p.coach, name: "a".repeat(121) } })).toBeNull();
    expect(parsePedido({ ...clone(p), extras: ["a".repeat(101)] })).toBeNull();
    expect(parsePedido({ ...clone(p), extras: ["a".repeat(100)] })).not.toBeNull();
  });

  /** 1.200 nas perguntas próprias + 1.800 nos campos de texto = 3.000. */
  const noTeto = (alergia: string) =>
    respostas(
      {
        recado: "r".repeat(300),
        parqDetalhe: "p".repeat(200),
        remediosNomes: "m".repeat(150),
        lesaoQual: "l".repeat(150),
        orientacaoQual: "o".repeat(150),
        sucesso: "s".repeat(150),
        evita: "e".repeat(150),
        orientacaoFisio: "f".repeat(150),
        condicaoOutra: "c".repeat(100),
        cirurgiaQual: "q".repeat(100),
        naoQuerOutro: "n".repeat(100),
        lesao12Qual: "z".repeat(100),
        ...(alergia ? { alergia } : {}),
      },
      { extras: [1, 2, 3].map(() => ({ q: "q".repeat(100), r: "r".repeat(300) })) },
    );

  it("soma dos textos livres: 3.000 aceita, 3.001 recusa", () => {
    expect(textoLivreTotal(noTeto("").anamnese)).toBe(TEXTO_LIVRE_MAX);
    expect(parseRespostas(clone(noTeto("")))).not.toBeNull();
    expect(textoLivreTotal(noTeto("a").anamnese)).toBe(3001);
    expect(parseRespostas(clone(noTeto("a")))).toBeNull();
  });

  it("textoLivreTotal soma o 'Outro lugar' da dor e o texto da data, e não soma nome nem responsável", () => {
    const an = anamneseBase({ nome: "a".repeat(100), responsavel: "b".repeat(100), dorOnde: [{ r: "outro", t: "abc" }], data: { quando: "2027-01", texto: "abcd" } });
    expect(textoLivreTotal(an)).toBe(7);
  });
});

describe("códigos e formatos", () => {
  it("parq com 6 ou 8 itens é recusado; com 7, aceito", () => {
    expect(parseRespostas(cru((r) => (r.anamnese.a.parq = [0, 0, 0, 0, 0, 0])))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.parq = [0, 0, 0, 0, 0, 0, 0, 0])))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.parq = [0, 0, 0, 0, 0, 0, 1])))).not.toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.parq = [0, 0, 0, 0, 0, 0, 2])))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.parq = [0, null, 0, 0, 0, 0, 0])))).toBeNull();
  });

  it("código fora do catálogo é recusado (nunca descartado em silêncio)", () => {
    expect(parseRespostas(cru((r) => (r.anamnese.a.condicoes = ["lupus"])))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.objetivo = "voar")))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.sintomas = ["peito", "x"])))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.dorOnde = [{ r: "cotovelo", l: "meio" }])))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.minutos = 50)))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.modulos = ["inventado"])))).toBeNull();
    expect(parsePedido({ ...clone(pedido()), modulos: ["inventado"] })).toBeNull();
    expect(parsePedido({ ...clone(pedido()), atendimento: "lua" })).toBeNull();
  });

  it("escalas de 0 a 10, dias de 1 a 7 e arrays com teto", () => {
    expect(parseRespostas(cru((r) => (r.anamnese.a.dorNota = 11)))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.estresse = -1)))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.dias = 8)))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.dias = 0)))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.a.dorOnde = Array.from({ length: 11 }, () => ({ r: "joelho" })))))).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.extras = Array.from({ length: 4 }, () => ({ q: "q" })))))).toBeNull();
  });

  it("'Prefiro falar pessoalmente' em condições e remédios é aceito", () => {
    expect(parseRespostas(clone(respostas({ condicoes: "pessoal", remedios: "pessoal" })))).not.toBeNull();
  });

  it("saúde só com autorização; 'sem dados de saúde' não leva saúde nem autorização", () => {
    const semConsent = respostas({}, { consent: undefined });
    expect(parseRespostas(clone(semConsent))).toBeNull();
    const omitidoComSaude = respostas({}, { healthOmitted: true, consent: undefined });
    expect(parseRespostas(clone(omitidoComSaude))).toBeNull();
    const omitido = stripHealth(anamneseBase({}, { id: "pedido-1" }));
    expect(parseRespostas(clone(buildRespostas({ pedido: pedido(), anamnese: { ...omitido, consent: anamneseBase().consent }, agora: AGORA })))).toBeNull();
    expect(parseRespostas(clone(buildRespostas({ pedido: pedido(), anamnese: omitido, agora: AGORA })))).not.toBeNull();
  });

  it("autorização pelo link é sempre do aluno ('personal' só no modo junto)", () => {
    const consent = { at: RESPONDIDO_EM, source: "personal" as const, textId: "c1" };
    expect(parseRespostas(clone(respostas({}, { consent })))).toBeNull();
  });

  it("datas precisam ser ISO", () => {
    expect(parseRespostas(cru((r) => (r.anamnese.answeredAt = "ontem")))).toBeNull();
    expect(parsePedido({ ...clone(pedido()), sentAt: "versão 2" })).toBeNull();
  });
});

describe("packetProblem", () => {
  const coachP: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
  const studentP: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z" };
  const program: Program = {
    id: "p1",
    ownerId: "s1",
    createdBy: "c1",
    name: "ABC",
    system: "abc",
    goal: "hipertrofia",
    level: "intermediario",
    daysPerWeek: 3,
    days: [{ key: "A", title: "Peito", focus: ["peito"], exercises: [{ uid: "u1", exerciseId: "supino_reto_barra", name: "Supino", sets: 3, repsMin: 8, repsMax: 10, restSec: 90, technique: "normal" }] }],
    active: true,
    source: "personal",
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
  };
  const ficha = () => clone(buildFichaPacket({ coach: coachP, student: studentP, program, diet: null, customExercises: [], customFoods: [] }));
  const treinos = () => clone(buildTreinosPacket({ student: studentP, coachId: "c1", studentRef: "s1", sessions: [] }));

  it("null para pedido, respostas, ficha e treinos válidos", () => {
    expect(packetProblem(clone(pedido()))).toBeNull();
    expect(packetProblem(clone(respostas()))).toBeNull();
    expect(packetProblem(ficha())).toBeNull();
    expect(packetProblem(treinos())).toBeNull();
  });

  it("tipo_desconhecido para kind 'xyz'", () => {
    expect(packetProblem({ ...clone(pedido()), kind: "xyz" })).toBe("tipo_desconhecido");
  });

  it("versao_nova para catalogV 2, anamnese.v 2 e protocolo v 2 (antes do esquema: recusa a importação inteira)", () => {
    expect(packetProblem({ ...clone(pedido()), catalogV: ANAMNESE_V + 1 })).toBe("versao_nova");
    expect(packetProblem(cru((r) => (r.anamnese.v = ANAMNESE_V + 1)))).toBe("versao_nova");
    // Mesmo com um código que este app não conhece (seria "invalido" no esquema), vence a versão.
    expect(packetProblem(cru((r) => ((r.anamnese.v = 2), (r.anamnese.a.condicoes = ["nova"]))))).toBe("versao_nova");
    expect(packetProblem({ ...clone(pedido()), v: 2 })).toBe("versao_nova");
    expect(parsePedido({ ...clone(pedido()), catalogV: 2 })).toBeNull();
    expect(parseRespostas(cru((r) => (r.anamnese.v = 2)))).toBeNull();
  });

  it("invalido para objeto cortado, sem kind ou que não é objeto", () => {
    expect(packetProblem(cru((r) => delete r.anamnese.a))).toBe("invalido");
    expect(packetProblem(cru((r) => delete r.studentRef))).toBe("invalido");
    const { student: _s, ...semAluno } = clone(pedido());
    void _s;
    expect(packetProblem(semAluno)).toBe("invalido");
    expect(packetProblem({ v: 1 })).toBe("invalido");
    expect(packetProblem(null)).toBe("invalido");
    expect(packetProblem("1.abc")).toBe("invalido");
    expect(packetProblem([])).toBe("invalido");
  });

  it("ficha e treinos: separa só tipo e versão (o conteúdo é conferido por parsePacket, fora do questionário do aluno)", () => {
    expect(packetProblem({ ...ficha(), v: 2 })).toBe("versao_nova");
    expect(packetProblem({ ...ficha(), program: { id: "x" } })).toBeNull();
    expect(parsePacket({ ...ficha(), program: { id: "x" } })).toBeNull();
  });

  it("PROBLEMA_TEXTO com os textos de §5.4", () => {
    expect(PROBLEMA_TEXTO.versao_nova).toBe("Este link é de uma versão mais nova do Shape Real. Atualize a página (puxe para baixo) e abra o link de novo.");
    expect(PROBLEMA_TEXTO.tipo_desconhecido).toBe(PROBLEMA_TEXTO.versao_nova);
    expect(PROBLEMA_TEXTO.invalido).toBe("Este link veio cortado ou incompleto. Peça para {personal} mandar de novo.");
  });

  it("parsePacket de transfer.ts continua aceitando ficha e treinos e devolve null para os tipos novos (regressão)", () => {
    expect(parsePacket(ficha())?.kind).toBe("ficha");
    expect(parsePacket(treinos())?.kind).toBe("treinos");
    expect(parsePacket(clone(pedido()))).toBeNull();
    expect(parsePacket(clone(respostas()))).toBeNull();
  });
});

describe("buildPedido", () => {
  const cheio = alunoBase({
    sex: "F",
    birthYear: 1987,
    weightKg: 71,
    heightCm: 164,
    goal: "emagrecimento",
    level: "iniciante",
    daysPerWeek: 4,
    sessionMinutes: 45,
    equipment: "academia",
    limitations: "joelho direito; lombar",
    coachNotes: "não mandar",
    anamnese: anamneseBase({ condicoes: ["pressao"] }),
  });

  it("só identidade, partes e atendimento: nenhuma chave de saúde nem dias, minutos ou objetivo", () => {
    const p = buildPedido({ coach, student: cheio, modulos: ["rotina"], atendimento: "misto", agora: AGORA });
    expect(Object.keys(p).sort()).toEqual(["atendimento", "catalogV", "coach", "id", "kind", "modulos", "sentAt", "student", "v"]);
    expect(Object.keys(p.student).sort()).toEqual(["name", "ref"]);
    const json = JSON.stringify(p);
    for (const k of [...HEALTH_KEYS, "dias", "minutos", "objetivo", "goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "limitations", "anamnese", "birthYear", "sex", "weightKg", "heightCm", "coachNotes"]) {
      expect(json).not.toContain(`"${k}"`);
    }
    for (const v of ["1987", "joelho", "lombar", "pressao", "não mandar", "emagrecimento"]) expect(json).not.toContain(v);
  });

  it("id novo quando não informado e reaproveitado quando informado; versão do catálogo deste app", () => {
    const a = buildPedido({ coach, student: aluno, modulos: [], agora: AGORA });
    const b = buildPedido({ coach, student: aluno, modulos: [], agora: AGORA });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(buildPedido({ coach, student: aluno, modulos: [], agora: AGORA, id: "mesmo" }).id).toBe("mesmo");
    expect(a.catalogV).toBe(ANAMNESE_V);
    expect(a.v).toBe(1);
  });

  it("telefone e CREF só quando existem; nomes cortados no teto do esquema", () => {
    const semNada = buildPedido({ coach: { ...coach, phone: undefined, cref: "  " }, student: { ...aluno, name: "a".repeat(200) }, modulos: [], agora: AGORA });
    expect("phone" in semNada.coach).toBe(false);
    expect("cref" in semNada.coach).toBe(false);
    expect(semNada.student.name).toHaveLength(120);
    expect(parsePedido(clone(semNada))).not.toBeNull();
  });
});

describe("mensagens do WhatsApp (sem nenhum valor de resposta)", () => {
  const sensivel = respostas({ ano: 1987, condicoes: ["outra"], condicaoOutra: "condromalácia patelar", remedios: 1, remediosPara: ["emagrecer"], remediosNomes: "semaglutida", dor: 1, dorOnde: [{ r: "joelho", l: "d" }], dorNota: 7, dorQuando: ["movimento"], dorDesde: "mais3m" });
  const DISTINTIVOS = ["condromal", "1987", "semaglutida", "joelho", "emagrecer", "patelar"];

  it("pedido, lembrete e respostas: o texto (fora do link) não contém nada das respostas", async () => {
    const lp = linkPedido(ORIGIN, await packData(pedido()));
    const lr = linkRespostas(ORIGIN, await packData(sensivel));
    const msgs: [string, string][] = [
      [pedidoMessage(pedido(), lp, 5), lp],
      [lembreteMessage(aluno.name, lp), lp],
      [respostasMessage(coach.name, lr), lr],
    ];
    for (const [msg, link] of msgs) {
      expect(msg).toContain(link);
      const texto = msg.replace(link, "");
      for (const v of DISTINTIVOS) expect(texto.toLowerCase()).not.toContain(v);
    }
  });

  it("textos literais de §5.3 e §5.4", () => {
    expect(pedidoMessage(pedido(), "LINK", 5)).toBe(
      "Oi, Ana! Aqui é Carlos. Para montar seu treino, responde este questionário? Leva uns 5 minutos, é pelo celular e não precisa baixar nada nem criar conta: LINK\n— Carlos Lima · CREF 012345-G/SP",
    );
    expect(pedidoMessage(pedido({ coach: { ...coach, cref: undefined } }), "LINK", 4)).toMatch(/LINK\n— Carlos Lima$/);
    expect(lembreteMessage("Ana Souza", "LINK")).toBe("Oi, Ana! Conseguiu ver o questionário? Se parou no meio, é só abrir o link de novo: LINK");
    expect(respostasMessage("carlos lima", "LINK")).toBe("Carlos, respondi o questionário. Toque para registrar no Shape Real: LINK");
    expect(respostasMessage("", "LINK")).toBe("Respondi o questionário. Toque para registrar no Shape Real: LINK");
  });

  it("lembrete não promete que o rascunho continua", () => {
    const msg = lembreteMessage("Ana", "LINK").toLowerCase();
    expect(msg).not.toContain("mesmo celular");
    expect(msg).not.toContain("continua de onde parou");
  });

  it("links: /questionario#d= e /receber#d=", () => {
    expect(linkPedido(ORIGIN, "1.abc")).toBe(`${ORIGIN}/questionario#d=1.abc`);
    expect(linkRespostas(ORIGIN, "1.abc")).toBe(`${ORIGIN}/receber#d=1.abc`);
  });
});

describe("tamanho do #d= (spec §10.3)", () => {
  /** Gerador pseudoaleatório com seed fixa (mulberry32): texto que comprime pior que o real. */
  function aleatorio(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const LETRAS = "abcdefghijklmnopqrstuvwxyz     ";
  const rnd = aleatorio(20261123);
  const texto = (n: number) => Array.from({ length: n }, () => LETRAS[Math.floor(rnd() * LETRAS.length)]).join("");
  const tamanho = async (v: unknown) => (await packData(v)).length;

  it("pedido típico (2 partes, CREF) < 1.000", async () => {
    expect(await tamanho(pedido({ modulos: ["rotina", "objetivo"] }))).toBeLessThan(1000);
  });

  it("pedido com 3 perguntas de 100 caracteres < 1.000", async () => {
    expect(await tamanho(pedido({ modulos: ["rotina", "objetivo"], extras: [texto(100), texto(100), texto(100)] }))).toBeLessThan(1000);
  });

  it("respostas típicas < 1.500", async () => {
    expect(await tamanho(respostas({ recado: "Prefiro treinar de manhã, antes do trabalho." }))).toBeLessThan(1500);
  });

  it("respostas pesadas (60+, condições, dor, remédios, 3 partes extras) < 2.500", async () => {
    const pesadas = respostas(
      {
        ano: anoParaIdade(67),
        sexo: "M",
        altura: 172,
        peso: 88.5,
        parq: [0, 0, 0, 0, 1, 1, 0],
        parqDetalhe: "Artrose no joelho e remédio de pressão",
        regular: "pouco",
        condicoes: ["pressao", "diabetes2", "artrose", "osteoporose"],
        sintomas: ["cansaco"],
        remedios: 1,
        remediosPara: ["pressao", "diabetes", "colesterol", "betabloqueador"],
        remediosNomes: "Losartana, metformina, sinvastatina, atenolol",
        cirurgia: 1,
        cirurgiaQual: "Catarata no olho direito em maio",
        orientacao: "restricao",
        orientacaoQual: "Liberou caminhada e musculação leve, sem peso alto",
        pressaoControle: "asVezes",
        hipo: "asVezes",
        complicacoes: ["pes"],
        quedas: 1,
        instavel: 0,
        medoCair: 1,
        dor: 1,
        dorOnde: [{ r: "joelho", l: "d" }, { r: "lombar" }, { r: "ombro", l: "e" }],
        dorNota: 6,
        dorQuando: ["movimento", "posTreino"],
        dorDesde: "mais3m",
        dorAlerta: [],
        lesao: 1,
        lesaoQual: "Fratura no punho esquerdo em 2019",
        tratamento: "fisio",
        objetivo: "saude",
        experiencia: "nunca",
        dias: 3,
        minutos: 45,
        nutri: "gostaria",
        foco: ["pernas", "costas"],
        naoQuer: ["saltos", "correr", "terra"],
        naoQuerOutro: "Nada deitado de bruços",
        barreira: ["dor", "tempo"],
        sono: "h6",
        estresse: 5,
        trabalho: "sentado",
        fuma: "parouMais6",
        alcool: "2a4mes",
        doses: "1a2",
        restricoes: ["lactose"],
        data: { quando: "2027-03", texto: "Casamento da filha" },
        motivo: ["saude", "medica"],
        sucesso: "Subir escada sem dor e brincar com os netos",
        importancia: 9,
        confianca: 7,
        gosta: ["maquinas", "mobilidade"],
        acompanhamento: ["lembrete"],
        recado: "Prefiro treinar de manhã cedo, antes do trabalho.",
      },
      { modulos: ["rotina", "habitos", "objetivo"], termo: { at: RESPONDIDO_EM, nome: "Ana Souza" } },
    );
    expect(parseRespostas(clone(pesadas))).not.toBeNull();
    expect(await tamanho(pesadas)).toBeLessThan(2500);
  });

  it("pior caso (texto pseudoaleatório somando 3.000 caracteres) < 4.000", async () => {
    const a: Partial<AnamneseAnswers> = {
      nome: texto(120),
      responsavel: texto(120),
      recado: texto(300),
      parqDetalhe: texto(200),
      remediosNomes: texto(150),
      lesaoQual: texto(150),
      orientacaoQual: texto(150),
      sucesso: texto(150),
      evita: texto(150),
      orientacaoFisio: texto(150),
      condicaoOutra: texto(100),
      cirurgiaQual: texto(100),
      naoQuerOutro: texto(100),
      lesao12Qual: texto(100),
    };
    const pior = respostas(a, { extras: [1, 2, 3].map(() => ({ q: texto(100), r: texto(300) })) });
    expect(textoLivreTotal(pior.anamnese)).toBe(3000);
    expect(parseRespostas(clone(pior))).not.toBeNull();
    expect(await tamanho(pior)).toBeLessThan(4000);
  });
});

describe("share-link com os tipos novos", () => {
  it("pastedLinkHref para os 4 tipos", () => {
    expect(pastedLinkHref("ficha", "1.abc")).toBe("/abrir#d=1.abc&colar=1");
    expect(pastedLinkHref("treinos", "1.abc")).toBe("/receber#d=1.abc&colar=1");
    expect(pastedLinkHref("anamnese", "1.abc")).toBe("/receber#d=1.abc&colar=1");
    expect(pastedLinkHref("pedido_anamnese", "1.abc")).toBe("/questionario#d=1.abc&colar=1");
  });

  it("packedFromText continua só com [01]. (sem cifra nesta entrega)", () => {
    expect(packedFromText("Toque: https://x/questionario#d=1.abc_-9")).toBe("1.abc_-9");
    expect(packedFromText("https://x/receber#d=0.abc")).toBe("0.abc");
    expect(packedFromText("https://x/receber#d=2.abc")).toBeNull();
  });
});

describe("readAnamnese (única porta de leitura)", () => {
  it("sem anamnese → null; válida → Anamnese", () => {
    expect(readAnamnese(alunoBase())).toBeNull();
    const an = anamneseBase();
    expect(readAnamnese(alunoBase({ anamnese: an }))).toEqual(an);
  });

  it("v = 2 → 'versao_nova' (mesmo com códigos que este app não conhece)", () => {
    const an = { ...anamneseBase(), v: ANAMNESE_V + 1, a: { ...respostasBase(), condicoes: ["nova"] } } as unknown as Anamnese;
    expect(readAnamnese(alunoBase({ anamnese: an }))).toBe("versao_nova");
  });

  it("código fora do catálogo → 'invalida'; dado danificado → 'invalida'", () => {
    const fora = { ...anamneseBase(), a: { ...respostasBase(), condicoes: ["lupus"] } } as unknown as Anamnese;
    expect(readAnamnese(alunoBase({ anamnese: fora }))).toBe("invalida");
    expect(readAnamnese(alunoBase({ anamnese: "texto" as unknown as Anamnese }))).toBe("invalida");
    expect(readAnamnese(alunoBase({ anamnese: { id: "x" } as unknown as Anamnese }))).toBe("invalida");
    expect(readAnamnese(alunoBase({ anamnese: { ...anamneseBase(), a: null } as unknown as Anamnese }))).toBe("invalida");
  });

  it("chave desconhecida é descartada (no topo e nas respostas)", () => {
    const an = { ...anamneseBase(), futura: 1, a: { ...respostasBase(), perguntaNova: "x" } } as unknown as Anamnese;
    const r = readAnamnese(alunoBase({ anamnese: an })) as Anamnese & Record<string, unknown>;
    expect(typeof r).toBe("object");
    expect(r.futura).toBeUndefined();
    expect((r.a as Record<string, unknown>).perguntaNova).toBeUndefined();
    expect(r.a.nome).toBe("Ana Souza");
  });

  it("mesma referência não refaz o parse; outra referência com o mesmo conteúdo, sim", () => {
    const an = { ...anamneseBase(), futura: 1 } as unknown as Anamnese;
    const r1 = readAnamnese(alunoBase({ anamnese: an }));
    const r2 = readAnamnese(alunoBase({ anamnese: an, name: "Outro perfil, mesma rodada" }));
    expect(r2).toBe(r1);
    const r3 = readAnamnese(alunoBase({ anamnese: { ...an } }));
    expect(r3).not.toBe(r1);
    expect(r3).toEqual(r1);
  });

  it("lê anamnesePrev pelo segundo argumento", () => {
    const prev = anamneseBase({}, { id: "an-0", answeredAt: "2025-11-20T10:00:00-03:00" });
    const p = alunoBase({ anamnese: anamneseBase(), anamnesePrev: prev });
    expect(readAnamnese(p, "anamnesePrev")).toEqual(prev);
    expect(readAnamnese(alunoBase({ anamnese: anamneseBase() }), "anamnesePrev")).toBeNull();
  });

  it("modo tolerante: campos do aparelho, junto pela metade e alerta desconhecido numa decisão do personal", () => {
    const an = {
      ...anamneseBase({ parq: [1, null, null, 0, null, null, null] as unknown as AnamneseAnswers["parq"] }, { via: "junto", by: "personal", incompleto: ["parq"] }),
      consent: { at: RESPONDIDO_EM, source: "personal", textId: "c1" },
      receivedAt: RESPONDIDO_EM,
      vistoEm: RESPONDIDO_EM,
      overrides: [{ at: RESPONDIDO_EM, alertas: ["A-PARQ7", "A-FUTURO"] }],
      conversei: { at: RESPONDIDO_EM, alertas: ["A-PESSOAL"] },
      parqDetalhe: undefined,
    } as unknown as Anamnese;
    const r = readAnamnese(alunoBase({ anamnese: an })) as Anamnese;
    expect(typeof r).toBe("object");
    expect(r.overrides).toEqual([{ at: RESPONDIDO_EM, alertas: ["A-PARQ7"] }]);
    expect(r.conversei?.alertas).toEqual(["A-PESSOAL"]);
    expect(r.receivedAt).toBe(RESPONDIDO_EM);
    expect(r.consent?.source).toBe("personal");
    expect((r.a.parq as unknown[])[0]).toBe(1);
    expect((r.a.parq as unknown[])[1] ?? undefined).toBeUndefined();
  });

  it("modo tolerante: texto acima do teto do link não derruba a leitura (o nome do cadastro pode ser longo)", () => {
    const an = anamneseBase({ nome: "a".repeat(130), recado: "r".repeat(400) });
    expect(typeof readAnamnese(alunoBase({ anamnese: an }))).toBe("object");
  });

  it("respostas de link registradas abrem pela mesma porta (ida e volta completa)", async () => {
    const r = respostas({ dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 5, dorQuando: ["parado"], dorDesde: "ate3m", dorAlerta: [] });
    const chegou = parseRespostas(await unpackData(await packData(r)))!;
    const an: AnamneseLink = chegou.anamnese;
    expect(readAnamnese(alunoBase({ anamnese: { ...an, receivedAt: AGORA } }))).toEqual({ ...an, receivedAt: AGORA });
  });
});

describe("cópias locais (o questionário do aluno não carrega transfer.ts nem delivery.ts)", () => {
  it("VERSAO_PROTOCOLO é a TRANSFER_VERSION de transfer.ts", () => {
    expect(VERSAO_PROTOCOLO).toBe(TRANSFER_VERSION);
  });

  it("ehDataIso decide igual a isIsoDate", () => {
    for (const v of ["2026-11-20", "2026-11-20T10:00:00-03:00", "2026-11-20T13:00:00.000Z", "2026-11-20T10:00", "versão 2", "20/11/2026", "", "2026-13-45", 42, null, "2".repeat(41)]) {
      expect(ehDataIso(v)).toBe(isIsoDate(v));
    }
  });
});

describe("pedido no aparelho do personal (spec §5.3)", () => {
  it("WhatsApp do personal: 10 dígitos ou mais", () => {
    expect(whatsappDoPersonalOk({ phone: "(11) 99999-0000" })).toBe(true);
    expect(whatsappDoPersonalOk({ phone: "99999-0000" })).toBe(false);
    expect(whatsappDoPersonalOk({ phone: undefined })).toBe(false);
    expect(whatsappDoPersonalOk(null)).toBe(false);
    // Nome provisório do /testar ("Personal") ou vazio: o diálogo pede o nome antes do pedido.
    expect(nomeDoPersonalOk({ name: "Rafael Nunes" })).toBe(true);
    expect(nomeDoPersonalOk({ name: "Personal" })).toBe(false);
    expect(nomeDoPersonalOk({ name: "  " })).toBe(false);
    expect(nomeDoPersonalOk(null)).toBe(false);
  });

  it("reenvio e lembrete reaproveitam o pedido pendente da mesma reavaliação", () => {
    const pend = { id: "p-1", at: AGORA, modulos: [], packed: "1.abc" };
    expect(pedidoReaproveitavel({ anamnesePedido: pend }, true)).toBe(pend);
    expect(pedidoReaproveitavel({ anamnesePedido: pend }, false)).toBeNull();
    expect(pedidoReaproveitavel({}, true)).toBeNull();
    expect(pedidoReaproveitavel({ anamnesePedido: pend }, true, "tudo")).toBeNull();
    expect(pedidoReaproveitavel({ anamnesePedido: { ...pend, reavaliacao: "tudo" } }, true, "tudo")?.id).toBe("p-1");
  });

  it("comPedido grava id, data, partes e o link pronto, sem nada de saúde", () => {
    const p = pedido();
    const depois = comPedido(alunoBase({ limitations: "lombar" }), p, "1.abc", "2026-11-24T09:00:00-03:00");
    expect(depois.anamnesePedido).toEqual({ id: "pedido-1", at: "2026-11-24T09:00:00-03:00", modulos: [], packed: "1.abc" });
    expect(depois.limitations).toBe("lombar");
  });
});

describe("PEDIR_TEXTO (spec §5.3, literais)", () => {
  it("textos do diálogo", () => {
    expect(PEDIR_TEXTO.titulo("Ana Souza")).toBe("Mandar questionário para Ana");
    expect(PEDIR_TEXTO.seuWhatsappDica("Ana Souza")).toBe("Para as respostas de Ana voltarem direto para você.");
    expect(PEDIR_TEXTO.comoResponde("Ana Souza", 4)).toBe("Ana responde no celular, sem cadastro, em uns 4 minutos.");
    expect(PEDIR_TEXTO.sempreVao).toBe("Sempre vão: Você, Saúde, Dores e lesões e Seu treino.");
    expect(PEDIR_TEXTO.abrirWhatsapp("Ana Souza")).toBe("Abrir WhatsApp de Ana");
    expect(PEDIR_TEXTO.pronto("Ana Souza")).toBe("Pronto. Quando Ana responder, você recebe um link no WhatsApp. Toque nele para registrar.");
    expect(PEDIR_TEXTO.exemplo).toBe("Exemplo: o questionário não é enviado.");
  });

  it("lembrete, erro do número e conta na nuvem (sem dado de saúde)", () => {
    expect(PEDIR_TEXTO.tituloLembrete("Ana Souza")).toBe("Lembrar Ana");
    expect(PEDIR_TEXTO.escolherContato).toBe("Escolher contato no WhatsApp");
    expect(PEDIR_TEXTO.erroWhatsapp).toBe("Inclua o DDD. Ex.: (11) 91234-5678.");
    expect(PEDIR_TEXTO.nuvem("Ana Souza")).toBe("Com conta no Shape Real, o questionário por link ainda não está disponível. Preencha junto com Ana.");
    expect(PEDIR_TEXTO.titulo("")).toBe("Mandar questionário para o aluno");
  });
});
