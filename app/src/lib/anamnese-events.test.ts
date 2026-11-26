import { describe, expect, it, vi } from "vitest";
import {
  evAnamneseDeleted,
  evAnamneseLinkOpened,
  evAnamneseOpened,
  evAnamneseReceived,
  evAnamneseRequested,
  evAnamneseSent,
  evFichaLinkExtra,
  evNextStep,
  evPartDone,
  evProgramGeneratedExtra,
  evSendConfirmed,
  evStudentCreatedExtra,
  evSummaryViewed,
  evWorkStyleSet,
  FAIXAS_MINUTOS,
  faixaMinutos,
} from "./anamnese-events";
import type { Anamnese, AnamneseAnswers, CtxQuestionario, Diferenca, StepId } from "./domain/anamnese-types";
import { QUESTIONARIO_DESDE, SECOES } from "./domain/anamnese-types";
import { secoesDoPedido, secoesDoQuestionario } from "./domain/anamnese";
import { alunoBase, anamneseBase, ctxBase, HOJE } from "./domain/anamnese-fixtures";
import { nextSteps } from "./domain/next-steps";

vi.mock("posthog-js", () => ({ default: { capture: () => {}, identify: () => {}, reset: () => {}, register: () => {}, captureException: () => {} } }));
// As respostas passam pelo readAnamnese real (track E).

const { EVENT_PROPS, EXTRA_PROPS } = await import("./analytics");

/** Nome de propriedade que sugere resposta, saúde, identidade ou link (spec §11.3). */
const FORBIDDEN = /nome|name|phone|telefone|email|cref|peso|weight|altura|height|texto|text|nota|score|idade|sexo|dor|saude|parq|alert|libera|gesta|condic|remed|sintom|lesao|termo|nutri|override|conversei|href|url|pedido_id|^publico$/i;

/** Todos os builders com entradas variadas: chaves e valores conferidos contra o contrato. */
const AMOSTRAS = {
  work_style_set: [evWorkStyleSet(undefined, "onboarding", true), evWorkStyleSet({ atendimento: "misto", publico: ["dor", "esporte"], semanas: 8, alimentacao: "parceiro" }, "conta", false)],
  anamnese_requested: [
    evAnamneseRequested({ via: "whatsapp", modulos: [], extras: 0, de: "cadastro", reenvio: false }),
    evAnamneseRequested({ via: "copiar", reavaliacao: "saude", modulos: ["rotina", "dorMais"], extras: 5, de: "lembrete", reenvio: true }),
  ],
  anamnese_opened: [evAnamneseOpened({ modo: "link", iosBrowser: true, retomou: false, aparelho: "aluno" })],
  anamnese_link_opened: [evAnamneseLinkOpened(true)],
  anamnese_part_done: SECOES.map((s) => evPartDone(s, secoesDoPedido(ctxBase({ modulos: ["rotina"], extras: ["x"] })), "link")).filter((x) => x !== null),
  anamnese_sent: [evAnamneseSent({ modo: "junto", inicio: "2026-11-23T12:00:00Z", fim: "2026-11-23T12:20:00Z", modulosPedidos: ["rotina"], pulados: ["rotina"], extras: 1, reenvio: false, incompleto: true })],
  anamnese_send_confirmed: [evSendConfirmed("tentar")],
  anamnese_received: [evAnamneseReceived({ achou: "nome", diferencas: [], reenvio: false, agora: "2026-11-23T12:00:00Z", pedidoAt: "2026-11-20T12:00:00Z" })],
  anamnese_deleted: [evAnamneseDeleted(true)],
  summary_viewed: [evSummaryViewed(false, "junto")],
  next_step_clicked: (["gerar_ficha", "enviar_ficha", "avaliacao", "questionario", "lembrar"] as const).map((p) => evNextStep(p)).filter((x) => x !== null),
} as const;
const EXTRAS = {
  program_generated: [evProgramGeneratedExtra(true, 12)],
  ficha_link_sent: [evFichaLinkExtra({ primeira: true, criadoEm: "2026-11-27T10:00:00-03:00", agora: "2026-11-27T13:20:00-03:00", questionario: "junto" })],
  student_created: [evStudentCreatedExtra("receber")],
} as const;

/** Valores permitidos de cada chave de texto (spec §12). */
const CATEGORIAS: Record<string, readonly string[]> = {
  origem: ["onboarding", "conta", "cartao", "aba", "receber", "junto"],
  atendimento: ["academia", "casa", "online", "misto", "turmas", "nao_respondeu"],
  alimentacao: ["encaminho", "parceiro", "orientacoes", "nao_respondeu"],
  via: ["whatsapp", "copiar"],
  reavaliacao: ["nao", "saude", "tudo"],
  de: ["cadastro", "aluno", "passos", "lembrete"],
  modo: ["link", "junto", "previa", "agora", "whatsapp", "depois", "completo", "receber"],
  aparelho: ["aluno", "personal_dono", "outro"],
  tela: ["receber"],
  parte: SECOES.filter((s) => s !== "dorMais"),
  minutos: FAIXAS_MINUTOS,
  resposta: ["sim", "tentar", "copiar"],
  achou: ["ref", "nome", "escolhido", "novo"],
  passo: ["gerar_ficha", "enviar_ficha", "avaliacao", "checkin", "reavaliar", "questionario", "lembrar"],
  questionario: ["link", "junto", "nenhum"],
};

describe("contrato das propriedades", () => {
  it("chaves de cada builder ⊆ EVENT_PROPS / EXTRA_PROPS do evento, sem nome de dado proibido", () => {
    for (const [evento, lista] of Object.entries(AMOSTRAS)) {
      const permitidas = (EVENT_PROPS as Record<string, readonly string[]>)[evento];
      for (const props of lista) {
        expect(Object.keys(props).sort()).toEqual([...(permitidas ?? [])].sort());
        for (const k of Object.keys(props)) expect(FORBIDDEN.test(k), k).toBe(false);
      }
    }
    for (const [evento, lista] of Object.entries(EXTRAS)) {
      const permitidas = (EXTRA_PROPS as Record<string, readonly string[]>)[evento] ?? [];
      for (const props of lista) for (const k of Object.keys(props)) expect(permitidas, `${evento}.${k}`).toContain(k);
    }
  });

  it("valores: só categorias, contagens limitadas, booleanos e null", () => {
    for (const lista of [...Object.values(AMOSTRAS), ...Object.values(EXTRAS)])
      for (const props of lista)
        for (const [k, v] of Object.entries(props)) {
          if (typeof v === "string") expect(CATEGORIAS[k], `${k}=${v}`).toContain(v);
          else if (typeof v === "number") expect(Number.isInteger(v) && v >= 0).toBe(true);
          else expect(v === null || typeof v === "boolean", k).toBe(true);
        }
    expect(AMOSTRAS.anamnese_requested[1]).toMatchObject({ modulos_n: 2, extras_n: 3, reenvio: true, reavaliacao: "saude" });
    expect(EXTRAS.program_generated[0].ajustes_n).toBe(7);
  });

  it("nenhum builder aceita nome, telefone ou resposta", () => {
    // @ts-expect-error nome não é entrada de evento
    evAnamneseRequested({ via: "whatsapp", modulos: [], extras: 0, de: "aluno", reenvio: false, nome: "Ana" });
    // @ts-expect-error resposta não é entrada de evento
    evAnamneseSent({ modo: "link", inicio: "", fim: "", modulosPedidos: [], pulados: [], extras: 0, reenvio: false, incompleto: false, a: {} });
    expect(evAnamneseLinkOpened(false)).toEqual({ tela: "receber", via_paste: false });
  });
});

describe("faixaMinutos", () => {
  const ini = "2026-11-23T12:00:00Z";
  const fim = (m: number, s = 0) => new Date(Date.parse(ini) + (m * 60 + s) * 1000).toISOString();
  it("limites: 2:59, 3:00, 4:59, 5:00, 7:59, 8:00, 12:00 e 12:01", () => {
    expect(faixaMinutos(ini, fim(2, 59))).toBe("<3");
    expect(faixaMinutos(ini, fim(3))).toBe("3-5");
    expect(faixaMinutos(ini, fim(4, 59))).toBe("3-5");
    expect(faixaMinutos(ini, fim(5))).toBe("5-8");
    expect(faixaMinutos(ini, fim(7, 59))).toBe("5-8");
    expect(faixaMinutos(ini, fim(8))).toBe("8-12");
    expect(faixaMinutos(ini, fim(12))).toBe("8-12");
    expect(faixaMinutos(ini, fim(12, 1))).toBe(">12");
  });
  it("data ilegível ou negativa: '<3'", () => {
    expect(faixaMinutos("", "")).toBe("<3");
    expect(faixaMinutos(fim(5), ini)).toBe("<3");
  });
});

describe("passos e partes que não viram evento", () => {
  it("evNextStep null para liberacao, triagem_presencial, termo, nutricionista_clinico, atualizar_saude, dieta e nutricionista", () => {
    for (const p of ["liberacao", "triagem_presencial", "termo", "nutricionista_clinico", "atualizar_saude", "dieta", "nutricionista"] as const) expect(evNextStep(p)).toBeNull();
    expect(evNextStep("lembrar")).toEqual({ passo: "lembrar" });
    expect(evNextStep("questionario")).toEqual({ passo: "questionario" });
  });

  it("evPartDone: null para dorMais; índice pela posição no pedido; no junto, null para parq, saude e dor", () => {
    const pedido = secoesDoPedido(ctxBase({ modulos: ["rotina", "dorMais"] }));
    expect(evPartDone("dorMais", pedido, "link")).toBeNull();
    expect(evPartDone("rotina", pedido, "link")).toEqual({ parte: "rotina", indice: 5, modo: "link" });
    expect(evPartDone("enviar", pedido, "link")).toEqual({ parte: "enviar", indice: 6, modo: "link" });
    expect(evPartDone("parq", pedido, "link")).toEqual({ parte: "parq", indice: 1, modo: "link" });
    for (const s of ["parq", "saude", "dor"] as const) expect(evPartDone(s, pedido, "junto")).toBeNull();
    expect(evPartDone("treino", pedido, "junto")).toEqual({ parte: "treino", indice: 4, modo: "junto" });
    expect(evPartDone("esporte", pedido, "link")).toBeNull(); // fora do pedido
  });

  it("anamnese_sent: pulados_n sem dorMais; anamnese_received: diferencas_n sem peso e altura", () => {
    const sent = evAnamneseSent({ modo: "link", inicio: "", fim: "", modulosPedidos: ["dorMais", "rotina"], pulados: ["dorMais", "rotina"], extras: 0, reenvio: false, incompleto: false });
    expect(sent).toMatchObject({ modulos_n: 2, pulados_n: 1, reavaliacao: "nao" });
    const dif = (campo: Diferenca["campo"]): Diferenca => ({ campo, rotulo: campo, cadastro: "a", resposta: "b", padrao: "cadastro" });
    expect(evAnamneseReceived({ achou: "ref", diferencas: [dif("goal"), dif("weightKg"), dif("heightCm")], reenvio: false, agora: "2026-11-23T12:00:00Z" })).toEqual({
      achou: "ref",
      diferencas_n: 1,
      reenvio: false,
      dias_desde_pedido: null,
      reavaliacao: "nao",
    });
    expect(evAnamneseReceived({ achou: "novo", diferencas: [], reenvio: true, pedidoAt: "2026-11-20T13:00:00Z", agora: "2026-11-23T12:00:00Z" }).dias_desde_pedido).toBe(2);
  });
});

describe("dois alunos que só diferem na saúde geram as mesmas propriedades (spec §12, D-34)", () => {
  // Mesmas respostas fora da saúde; um com dor no joelho, diabetes, gestação e "sim" no PAR-Q; o outro sem nada.
  const comSaude: Partial<AnamneseAnswers> = {
    parq: [0, 0, 0, 0, 1, 0, 0],
    regular: "nao",
    condicoes: ["diabetes2"],
    hipo: "nunca",
    complicacoes: [],
    orientacao: "livre",
    gestacao: "gravida",
    obstetra: "sim",
    semanas: 20,
    assoalho: 0,
    dor: 1,
    dorOnde: [{ r: "joelho", l: "d" }],
    dorNota: 5,
    dorQuando: ["movimento"],
    dorDesde: "mais3m",
    tratamento: "fisio",
    peso: 70,
    altura: 160,
  };
  const modulos = ["rotina", "dorMais"] as const;
  const a: Anamnese = anamneseBase(comSaude, { modulos: [...modulos], pulados: ["dorMais"] });
  const b: Anamnese = anamneseBase({ regular: "nao", peso: 58, altura: 168 }, { modulos: [...modulos] });
  const ctx = (an: Anamnese): CtxQuestionario => ctxBase({ modulos: an.modulos });

  it("anamnese_part_done em todas as partes (null para dorMais)", () => {
    const partesA = secoesDoQuestionario(ctx(a), a.a);
    const partesB = secoesDoQuestionario(ctx(b), b.a);
    expect(partesA).toContain("dorMais");
    expect(partesB).not.toContain("dorMais");
    const ev = (an: Anamnese, partes: string[], s: (typeof SECOES)[number]) => (partes.includes(s) ? evPartDone(s, secoesDoPedido(ctx(an)), "link") : null);
    for (const s of SECOES) expect(ev(a, partesA, s), s).toEqual(ev(b, partesB, s));
  });

  it("anamnese_part_done no junto com e sem a autorização de saúde", () => {
    const com = ctxBase({ modo: "junto", modulos: ["rotina"] });
    const sem = { ...com, semSaude: true };
    const ev = (c: CtxQuestionario, s: (typeof SECOES)[number]) => (secoesDoQuestionario(c, b.a).includes(s) ? evPartDone(s, secoesDoPedido(c), "junto") : null);
    for (const s of SECOES) expect(ev(com, s), s).toEqual(ev(sem, s));
  });

  it("anamnese_sent e anamnese_received", () => {
    const sent = (an: Anamnese) =>
      evAnamneseSent({ modo: "link", inicio: "2026-11-20T09:55:00-03:00", fim: an.answeredAt, modulosPedidos: an.modulos, pulados: an.pulados ?? [], extras: 0, reenvio: false, incompleto: false });
    expect(sent(a)).toEqual(sent(b));
    const dif = (campo: Diferenca["campo"]): Diferenca => ({ campo, rotulo: campo, cadastro: "1", resposta: "2", padrao: "cadastro" });
    const recA = evAnamneseReceived({ achou: "ref", diferencas: [dif("goal"), dif("weightKg"), dif("heightCm")], reenvio: false, pedidoAt: "2026-11-18T10:00:00-03:00", agora: "2026-11-21T10:00:00-03:00" });
    const recB = evAnamneseReceived({ achou: "ref", diferencas: [dif("goal")], reenvio: false, pedidoAt: "2026-11-18T10:00:00-03:00", agora: "2026-11-21T10:00:00-03:00" });
    expect(recA).toEqual(recB);
  });

  it("next_step_clicked de cada passo das duas listas; passo presente em só uma delas dá null", () => {
    const entrada = (an: Anamnese) => ({ profile: alunoBase({ anamnese: an }), activeProgram: null, envioFicha: null, metricsCount: 0, hasDiet: false, mode: "local" as const, hoje: HOJE });
    const listaA = nextSteps(entrada(a)).map((x) => x.id);
    const listaB = nextSteps(entrada(b)).map((x) => x.id);
    expect(listaA).not.toEqual(listaB); // a saúde muda os passos…
    const todos = [...new Set<StepId>([...listaA, ...listaB])];
    const ev = (lista: StepId[], id: StepId) => (lista.includes(id) ? evNextStep(id) : null);
    for (const id of todos) expect(ev(listaA, id), id).toEqual(ev(listaB, id)); // …mas não o que sai no evento
    for (const id of todos) if (listaA.includes(id) !== listaB.includes(id)) expect(evNextStep(id), id).toBeNull();
  });
});

describe("eventos de ficha, pedido e cadastro", () => {
  it("evFichaLinkExtra: aluno_novo pelo QUESTIONARIO_DESDE; horas inteiras; questionario link/junto/nenhum", () => {
    const dia = Date.parse(`${QUESTIONARIO_DESDE}T00:00:00`);
    const antes = new Date(dia - 60_000).toISOString();
    const depois = new Date(dia + 60_000).toISOString();
    const agora = new Date(dia + 5.6 * 3_600_000).toISOString();
    expect(evFichaLinkExtra({ primeira: true, criadoEm: depois, agora, questionario: "link" })).toEqual({ primeira: true, horas_desde_cadastro: 6, questionario: "link", aluno_novo: true });
    expect(evFichaLinkExtra({ primeira: false, criadoEm: antes, agora, questionario: "junto" })).toMatchObject({ aluno_novo: false, questionario: "junto" });
    expect(evFichaLinkExtra({ primeira: false, agora, questionario: "nenhum" })).toEqual({ primeira: false, horas_desde_cadastro: null, questionario: "nenhum", aluno_novo: false });
  });

  it("evAnamneseRequested com reenvio; reavaliação ausente vira 'nao'", () => {
    expect(evAnamneseRequested({ via: "whatsapp", modulos: [], extras: 0, de: "passos", reenvio: true })).toEqual({ via: "whatsapp", reavaliacao: "nao", modulos_n: 0, extras_n: 0, de: "passos", reenvio: true });
  });

  it("evStudentCreatedExtra('receber'), evAnamneseLinkOpened, evSummaryViewed, evAnamneseDeleted e evWorkStyleSet", () => {
    expect(evStudentCreatedExtra("receber")).toEqual({ modo: "receber" });
    expect(evAnamneseLinkOpened(true)).toEqual({ tela: "receber", via_paste: true });
    expect(evSummaryViewed(true, "aba")).toEqual({ tem_questionario: true, origem: "aba" });
    expect(evAnamneseDeleted(false)).toEqual({ com_cadastro: false });
    expect(evWorkStyleSet({ atendimento: "online", publico: ["emagrecimento"], semanas: 6 }, "cartao", false)).toEqual({
      origem: "cartao",
      pulou: false,
      atendimento: "online",
      alimentacao: "nao_respondeu",
      publico_n: 1,
      semanas: 6,
      perguntas_n: 0,
    });
  });
});
