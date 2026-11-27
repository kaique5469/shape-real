import { describe, expect, it, vi } from "vitest";
import type { Anamnese, AnamneseAnswers, StepId, WorkStyle } from "./anamnese-types";
import { stripHealth } from "./anamnese";
import { alunoBase, anamneseBase, anoParaIdade, HOJE } from "./anamnese-fixtures";
import type { FichaDelivery, ItemDelivery } from "./delivery";
import { lembreteDevido, nextSteps, pedidoPendente, SEM_LIBERACAO_MEDICA, type PassosInput } from "./next-steps";
import { readAnamnese } from "./questionario-link";
import { alertas, mensagemAvisar } from "./triagem";
import type { Profile } from "./types";
import { resolveDefaults } from "./work-style";

// readAnamnese real (track E), embrulhado só para os casos "versao_nova" e "invalida" (mockReturnValueOnce).
vi.mock("./questionario-link", async (importOriginal) => {
  const real = await importOriginal<typeof import("./questionario-link")>();
  return { ...real, readAnamnese: vi.fn(real.readAnamnese) };
});
// O modo padrão vem do jeito de trabalhar (track B); aqui ele é controlado pelo teste.
vi.mock("./work-style", async (importOriginal) => {
  const real = await importOriginal<typeof import("./work-style")>();
  return { ...real, resolveDefaults: vi.fn(real.resolveDefaults) };
});

const parq = (...sim: number[]): AnamneseAnswers["parq"] => [0, 1, 2, 3, 4, 5, 6].map((i) => (sim.includes(i) ? 1 : 0)) as AnamneseAnswers["parq"];
const ficha = { id: "p1", durationWeeks: 6, createdAt: "2026-11-21T10:00:00-03:00", updatedAt: "2026-11-21T10:00:00-03:00" };
const envio = (kind: ItemDelivery["kind"]): FichaDelivery => ({ program: { kind } as ItemDelivery, diet: { kind: "sem_item" }, staleEcho: null });
const entrada = (profile: Profile, over: Partial<PassosInput> = {}): PassosInput => ({
  profile,
  activeProgram: null,
  envioFicha: null,
  metricsCount: 0,
  hasDiet: false,
  mode: "local",
  hoje: HOJE,
  ...over,
});
const passos = (profile: Profile, over: Partial<PassosInput> = {}) => nextSteps(entrada(profile, over));
const idsDe = (profile: Profile, over: Partial<PassosInput> = {}) => passos(profile, over).map((x) => x.id);
const com = (an: Anamnese, over: Partial<Profile> = {}) => alunoBase({ anamnese: an, ...over });
const passo = (profile: Profile, id: StepId, over: Partial<PassosInput> = {}) => passos(profile, over).find((x) => x.id === id);

describe("passo 1: liberação", () => {
  const vermelho = anamneseBase({ parq: parq(1) });
  const laranja = anamneseBase({ parq: parq(6) });

  it("é o primeiro passo com vermelho; tem 'Registrar liberação' e 'Avisar' com o texto fixo", () => {
    const lista = passos(com(vermelho));
    expect(lista[0]).toMatchObject({ id: "liberacao", titulo: "Pedir liberação médica a Ana", clinico: true });
    expect(lista[0]?.acoes).toEqual([
      { tipo: "liberacao", rotulo: "Registrar liberação" },
      { tipo: "avisar", rotulo: "Avisar Ana", texto: mensagemAvisar(alertas(vermelho, { hoje: HOJE, liberacoes: [] }), "Ana") },
    ]);
  });

  it("some com a liberação registrada depois das respostas", () => {
    const lib = { id: "l1", por: "medico" as const, data: "2026-11-21", alertas: ["A-PEITO" as const], registradoEm: "2026-11-21T09:00:00-03:00" };
    expect(idsDe(com(vermelho, { liberacoes: [lib] }))).not.toContain("liberacao");
  });

  it("com laranja, some também com 'Seguir mesmo assim'; com vermelho, o override não basta", () => {
    expect(idsDe(com(laranja))[0]).toBe("liberacao");
    expect(idsDe(com({ ...laranja, overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-PARQ7"] }] }))).not.toContain("liberacao");
    expect(idsDe(com({ ...vermelho, overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-PEITO"] }] }))).toContain("liberacao");
  });

  it("amarelo e azul não pedem liberação", () => {
    expect(idsDe(com(anamneseBase({ condicoes: ["pressao"], pressaoControle: "alta", cirurgia: 1 })))).not.toContain("liberacao");
  });

  it("sem dados de saúde ou PAR-Q pela metade: o passo é outro (triagem pessoalmente; completar), não liberação médica", () => {
    expect(idsDe(com(stripHealth(anamneseBase())))).not.toContain("liberacao");
    const metade = anamneseBase({ parq: undefined }, { via: "junto", by: "personal", incompleto: ["parq"] });
    expect(idsDe(com(metade))).not.toContain("liberacao");
    expect(passo(com(metade), "questionario")?.titulo).toBe("Completar o questionário");
  });
});

describe("passo 2: triagem pessoalmente", () => {
  it("com healthOmitted, clínico, para preencher junto", () => {
    expect(passo(com(stripHealth(anamneseBase())), "triagem_presencial")).toEqual({
      id: "triagem_presencial",
      titulo: "Fazer a triagem de saúde pessoalmente",
      acoes: [{ tipo: "href", rotulo: "Preencher a saúde com Ana", href: "/questionario?aluno=aluno-1" }],
      clinico: true,
    });
    expect(idsDe(com(anamneseBase()))).not.toContain("triagem_presencial");
  });
});

describe("passo 3: questionário", () => {
  it("sem pedido: 'Fazer o questionário inicial', com a ação principal do modo padrão", () => {
    const real = resolveDefaults(undefined, { hasPhone: true });
    vi.mocked(resolveDefaults).mockReturnValueOnce({ ...real, modoPadrao: "whatsapp" });
    const zap = passo(alunoBase(), "questionario");
    expect(zap?.titulo).toBe("Fazer o questionário inicial");
    expect(zap?.acoes.map((a) => a.rotulo)).toEqual(["Mandar pelo WhatsApp", "Preencher com Ana"]);
    vi.mocked(resolveDefaults).mockReturnValueOnce({ ...real, modoPadrao: "agora" });
    const agora = passo(alunoBase(), "questionario");
    expect(agora?.acoes).toEqual([
      { tipo: "href", rotulo: "Preencher com Ana", href: "/questionario?aluno=aluno-1" },
      { tipo: "pedir", rotulo: "Mandar pelo WhatsApp" },
    ]);
  });

  it("o modo padrão recebe o jeito do personal e se o aluno tem telefone", () => {
    const ws: WorkStyle = { atendimento: "online" };
    vi.mocked(resolveDefaults).mockClear();
    passos(alunoBase({ phone: undefined }), { ws });
    expect(resolveDefaults).toHaveBeenCalledWith(ws, { hasPhone: false });
  });

  it("pedido pendente há 1 dia: sem 'Lembrar'; há 2 dias: com 'Lembrar'", () => {
    const pedido = (at: string) => ({ id: "ped-1", at, modulos: [], packed: "x" });
    // Meio-dia: o mesmo dia de calendário em −03:00 e em UTC.
    const um = alunoBase({ anamnesePedido: pedido("2026-11-22T12:00:00-03:00") });
    expect(passo(um, "questionario")).toMatchObject({ titulo: "Questionário pedido em 22/11 · ainda sem resposta", clinico: false });
    expect(passo(um, "questionario")?.acoes.map((a) => a.tipo)).toEqual(["href"]);
    expect(lembreteDevido(um, HOJE)).toBe(false);
    const dois = alunoBase({ anamnesePedido: pedido("2026-11-21T12:00:00-03:00") });
    expect(passo(dois, "questionario")?.acoes[0]).toEqual({ tipo: "pedir", rotulo: "Lembrar Ana", lembrete: true });
    expect(lembreteDevido(dois, HOJE)).toBe(true);
  });

  it("pedido respondido (resposta mais nova ou mesmo id) não é pendente", () => {
    const pedido = { id: "ped-1", at: "2026-11-10T10:00:00-03:00", modulos: [], packed: "x" };
    expect(idsDe(com(anamneseBase(), { anamnesePedido: pedido }))).not.toContain("questionario");
    expect(lembreteDevido(com(anamneseBase(), { anamnesePedido: pedido }), HOJE)).toBe(false);
    const refeito = { ...pedido, id: "ped-2", at: "2026-11-21T10:00:00-03:00" };
    expect(passo(com(anamneseBase(), { anamnesePedido: refeito }), "questionario")?.titulo).toContain("ainda sem resposta");
    expect(lembreteDevido(alunoBase(), HOJE)).toBe(false);
  });

  it("pedidoPendente (exportado para o selo da lista): mesma regra do passo", () => {
    const pedido = { id: "ped-1", at: "2026-11-10T10:00:00-03:00", modulos: [], packed: "x" };
    expect(pedidoPendente(alunoBase({ anamnesePedido: pedido }), null)).toBe(true);
    expect(pedidoPendente(alunoBase({ anamnesePedido: pedido }), anamneseBase())).toBe(false);
    expect(pedidoPendente(alunoBase({ anamnesePedido: { ...pedido, at: "2026-11-21T10:00:00-03:00" } }), anamneseBase())).toBe(true);
    expect(pedidoPendente(alunoBase({ anamnesePedido: { ...pedido, id: "an-1", at: "2026-11-21T10:00:00-03:00" } }), anamneseBase())).toBe(false);
    expect(pedidoPendente(alunoBase(), null)).toBe(false);
    expect(SEM_LIBERACAO_MEDICA).toEqual(["A-SEM-TRIAGEM", "A-PARQ-INCOMPLETO"]);
  });

  it("incompleto: 'Completar o questionário' com 'Continuar'", () => {
    const an = anamneseBase({ dias: undefined }, { via: "junto", by: "personal", incompleto: ["treino"] });
    expect(passo(com(an), "questionario")).toEqual({
      id: "questionario",
      titulo: "Completar o questionário",
      acoes: [{ tipo: "href", rotulo: "Continuar", href: "/questionario?aluno=aluno-1" }],
      clinico: false,
    });
  });

  it("respostas completas: sem passo de questionário", () => {
    expect(idsDe(com(anamneseBase()))).not.toContain("questionario");
  });
});

describe("passo 4: termo do PAR-Q", () => {
  it("só com 'sim' no PAR-Q, sem termo e idade ≥ 15", () => {
    expect(passo(com(anamneseBase({ parq: parq(4) })), "termo")).toEqual({ id: "termo", titulo: "Pegar a assinatura do termo do PAR-Q", acoes: [{ tipo: "termo", rotulo: "Abrir o termo" }], clinico: true });
    expect(idsDe(com(anamneseBase()))).not.toContain("termo");
    expect(idsDe(com(anamneseBase({ parq: parq(4) }, { termo: { at: "2026-11-20T10:00:00-03:00", nome: "Ana" } })))).not.toContain("termo");
    expect(idsDe(com(anamneseBase({ parq: parq(4), ano: anoParaIdade(14), responsavel: "Maria" })))).not.toContain("termo");
    expect(idsDe(com(anamneseBase({ parq: parq(4), ano: anoParaIdade(15), responsavel: "Maria" })))).toContain("termo");
  });
});

describe("passo 5 e 11: nutricionista clínico e dieta (D-18 e decisão do dono)", () => {
  const gatilhos: Partial<AnamneseAnswers>[] = [
    { condicoes: ["diabetes1"], regular: "sim3m", hipo: "nunca", complicacoes: [] },
    { condicoes: ["diabetes2"], regular: "sim3m", hipo: "nunca", complicacoes: [] },
    { condicoes: ["rins"], regular: "sim3m" },
    { condicoes: ["alimentar"], orientacao: "nao" },
    { gestacao: "gravida", obstetra: "sim" },
    { remedios: 1, remediosPara: ["emagrecer"], orientacao: "nao" },
    { restricoes: ["celiaca"] },
  ];

  it("nutricionista_clinico para cada gatilho, clínico, com [Feito]; a dieta some", () => {
    for (const g of gatilhos) {
      const p = com(anamneseBase(g));
      expect(passo(p, "nutricionista_clinico")).toEqual({
        id: "nutricionista_clinico",
        titulo: "Encaminhar Ana para nutricionista",
        sub: "Plano alimentar para condição de saúde é atividade do nutricionista.",
        acoes: [{ tipo: "feito", rotulo: "Feito" }],
        clinico: true,
      });
      expect(idsDe(p)).not.toContain("dieta");
    }
  });

  it("some com nutricionista = sim e com [Feito] (a dieta continua escondida)", () => {
    expect(idsDe(com(anamneseBase({ ...gatilhos[2], nutri: "sim" })))).not.toContain("nutricionista_clinico");
    const feito = com(anamneseBase(gatilhos[2]), { passosFeitos: { nutricionista_clinico: "2026-11-22T10:00:00-03:00" } });
    expect(idsDe(feito)).not.toContain("nutricionista_clinico");
    expect(idsDe(feito)).not.toContain("dieta");
  });

  it("dieta escondida com alimentação 'encaminho' ou 'parceiro'; presente com 'orientações' e sem resposta", () => {
    const p = com(anamneseBase());
    expect(idsDe(p, { ws: { alimentacao: "encaminho" } })).not.toContain("dieta");
    expect(idsDe(p, { ws: { alimentacao: "parceiro" } })).not.toContain("dieta");
    expect(passo(p, "dieta", { ws: { alimentacao: "orientacoes" } })).toEqual({
      id: "dieta",
      titulo: "Definir metas e orientações de dieta",
      sub: "Calorias, proteína e um cardápio base.",
      acoes: [{ tipo: "aba", rotulo: "Abrir a dieta", aba: "dieta" }],
      clinico: false,
    });
    expect(idsDe(p)).toContain("dieta");
    expect(idsDe(alunoBase())).toContain("dieta"); // aluno sem questionário: como hoje
    expect(idsDe(p, { hasDiet: true })).not.toContain("dieta");
  });
});

describe("passo 6: gerar a ficha", () => {
  it("com questionário: 'Gerar ficha com estas respostas', com o resumo da sugestão e ?auto=1", () => {
    expect(passo(com(anamneseBase()), "gerar_ficha", { fichaSugeridaResumo: "ABC · 3×60 min" })).toEqual({
      id: "gerar_ficha",
      titulo: "Gerar ficha com estas respostas",
      sub: "ABC · 3×60 min",
      acoes: [{ tipo: "href", rotulo: "Gerar", href: "/alunos/aluno-1/ficha/nova?auto=1" }],
      clinico: false,
    });
  });

  it("com vermelho aberto: não promete 'Gerar' (o gerador trava); oferece montar do zero e volta a 'Gerar' com a liberação", () => {
    const vermelho = anamneseBase({ parq: parq(1) });
    expect(passo(com(vermelho), "gerar_ficha")).toEqual({
      id: "gerar_ficha",
      titulo: "Montar a ficha de Ana",
      sub: "Gerar com estas respostas libera depois de registrar a liberação.",
      acoes: [{ tipo: "href", rotulo: "Montar do zero", href: "/alunos/aluno-1/ficha/nova" }],
      clinico: false,
    });
    const lib = { id: "l1", por: "medico" as const, data: "2026-11-21", alertas: ["A-PEITO" as const], registradoEm: "2026-11-21T09:00:00-03:00" };
    expect(passo(com(vermelho, { liberacoes: [lib] }), "gerar_ficha")?.titulo).toBe("Gerar ficha com estas respostas");
    // Laranja abre só a porta ("Seguir mesmo assim" dentro do gerador): o passo continua sendo "Gerar".
    expect(passo(com(anamneseBase({ parq: parq(6) })), "gerar_ficha")?.titulo).toBe("Gerar ficha com estas respostas");
  });

  it("sem questionário: 'Montar a ficha de {aluno}'; com ficha ativa, nada", () => {
    expect(passo(alunoBase(), "gerar_ficha")).toMatchObject({ titulo: "Montar a ficha de Ana", acoes: [{ tipo: "href", rotulo: "Montar", href: "/alunos/aluno-1/ficha/nova" }] });
    expect(idsDe(alunoBase(), { activeProgram: ficha })).not.toContain("gerar_ficha");
  });
});

describe("passo 7: enviar a ficha (registro único do envio, sem sharedAt)", () => {
  const p = com(anamneseBase());
  it("aparece só quando o registro diz que esta versão não foi (nunca enviada ou mudou depois)", () => {
    expect(passo(p, "enviar_ficha", { activeProgram: ficha, envioFicha: envio("nao_enviado") })).toEqual({
      id: "enviar_ficha",
      titulo: "Enviar a ficha para o celular de Ana",
      acoes: [{ tipo: "enviar_ficha", rotulo: "Enviar" }],
      clinico: false,
    });
    expect(idsDe(p, { activeProgram: ficha, envioFicha: envio("mudou") })).toContain("enviar_ficha");
  });

  it("some com a ficha enviada ou confirmada, sem leitura do registro e sem ficha ativa", () => {
    for (const kind of ["enviado", "confirmado", "desconhecido"] as const) expect(idsDe(p, { activeProgram: ficha, envioFicha: envio(kind) })).not.toContain("enviar_ficha");
    expect(idsDe(p, { activeProgram: ficha, envioFicha: null })).not.toContain("enviar_ficha");
    expect(idsDe(p, { activeProgram: null, envioFicha: envio("nao_enviado") })).not.toContain("enviar_ficha");
  });

  it("some com aluno de exemplo (sample e demo-*) e no modo nuvem", () => {
    const over = { activeProgram: ficha, envioFicha: envio("nao_enviado") };
    expect(idsDe(com(anamneseBase(), { sample: true }), over)).not.toContain("enviar_ficha");
    expect(idsDe(com(anamneseBase(), { id: "demo-juliana" }), over)).not.toContain("enviar_ficha");
    expect(idsDe(p, { ...over, mode: "supabase" })).not.toContain("enviar_ficha");
  });
});

describe("passo 8: avaliação", () => {
  it("presencial, casa, misto ou sem resposta: avaliação presencial; online ou turmas: pedir medidas", () => {
    for (const atendimento of ["academia", "casa", "misto", undefined] as const) expect(passo(alunoBase(), "avaliacao", { ws: { atendimento } })?.titulo).toBe("Fazer a avaliação presencial");
    for (const atendimento of ["online", "turmas"] as const) expect(passo(alunoBase(), "avaliacao", { ws: { atendimento } })?.titulo).toBe("Pedir peso e medidas a Ana");
    expect(passo(alunoBase(), "avaliacao")?.acoes).toEqual([{ tipo: "aba", rotulo: "Registrar medidas", aba: "evolucao" }]);
  });

  it("sub com os itens a conferir (quando houver); some com medidas", () => {
    expect(passo(alunoBase(), "avaliacao", { conferirN: 3 })?.sub).toBe("Na primeira aula, confira também 3 itens do questionário.");
    expect(passo(alunoBase(), "avaliacao", { conferirN: 1 })?.sub).toBe("Na primeira aula, confira também 1 item do questionário.");
    expect(passo(alunoBase(), "avaliacao")?.sub).toBeUndefined();
    expect(idsDe(alunoBase(), { metricsCount: 2 })).not.toContain("avaliacao");
  });
});

describe("ordem, respostas ilegíveis e Entrega 2", () => {
  it("na ordem da tabela de spec §7", () => {
    const an = anamneseBase({ parq: parq(0, 4), condicoes: ["rins"], regular: "sim3m" });
    expect(idsDe(com(an, { anamnesePedido: { id: "ped-2", at: "2026-11-21T10:00:00-03:00", modulos: [], packed: "x" } }))).toEqual([
      "liberacao",
      "questionario",
      "termo",
      "nutricionista_clinico",
      "gerar_ficha",
      "avaliacao",
    ]);
  });

  it("'versao_nova': nenhum passo que dependa das respostas e nada a pedir", () => {
    vi.mocked(readAnamnese).mockReturnValueOnce("versao_nova");
    expect(idsDe(com(anamneseBase({ parq: parq(1) })))).toEqual(["gerar_ficha", "avaliacao"]);
  });

  it("'invalida': pedir o questionário de novo e montar a ficha do zero", () => {
    vi.mocked(readAnamnese).mockReturnValueOnce("invalida");
    const lista = passos(com(anamneseBase({ parq: parq(1) })));
    expect(lista.map((x) => x.id)).toEqual(["questionario", "gerar_ficha", "avaliacao"]);
    expect(lista[0]?.titulo).toBe("Fazer o questionário inicial");
    expect(lista[1]?.titulo).toBe("Montar a ficha de Ana");
  });

  it("[E2] checkin, nutricionista, reavaliar e atualizar_saude não aparecem na Entrega 1", () => {
    const velho = anamneseBase({ nutri: "gostaria" }, { answeredAt: "2025-09-01T10:00:00-03:00" });
    const lista = idsDe(com(velho), { ws: { atendimento: "online", alimentacao: "encaminho" }, activeProgram: { ...ficha, createdAt: "2025-09-02T10:00:00-03:00" }, envioFicha: envio("enviado") });
    for (const id of ["checkin", "nutricionista", "reavaliar", "atualizar_saude"]) expect(lista).not.toContain(id);
  });
});
