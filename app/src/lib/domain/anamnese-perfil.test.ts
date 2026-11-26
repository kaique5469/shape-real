import { describe, expect, it } from "vitest";
import type { Anamnese, AnamneseAnswers, Liberacao } from "./anamnese-types";
import { ANAMNESE_V, CONSENT_TEXT_ID, PARQ_TEXT_ID } from "./anamnese-types";
import type { Profile } from "./types";

const {
  APAGAR_CAIXA,
  APAGAR_TITULO,
  CARTAO_JEITO_KEY,
  CARTAO_JEITO_TEXTO,
  TERMO_CAIXA_PERSONAL,
  acoesDoAlerta,
  avisoCadastroNovo,
  eventoDaAcao,
  mostrarCartaoJeito,
  passosVisiveis,
  registroDoQuestionario,
  rotuloFazerQuestionario,
  textoPelaMetade,
  temRespostas,
  textoCoberto,
  textoLiberacaoAnterior,
  veioDe,
  SELO_TEXTO,
  TEXTO_REVOGAR,
  apagarRespostas,
  avisoDieta,
  diasDePedidoPendente,
  extraDoEnvioDaFicha,
  idsDeRespostas,
  marcarFeito,
  marcarVisto,
  pedidoPendente,
  registrarTermo,
  revogarSaude,
  seloDoAluno,
  temSaudeNoQuestionario,
  textoPendente,
} = await import("./anamnese-perfil");
const { contactReason } = await import("./attention");
const { alertas, comConversei, comOverride, novaLiberacao } = await import("./triagem");
const { PERGUNTAS } = await import("./anamnese");
const nextStepsMod = await import("./next-steps");

// Datas no fuso do aparelho. 26/11/2026, 15h.
const at = (day: number, hour = 10, month = 11) => new Date(2026, month - 1, day, hour);
const iso = (day: number, hour = 10, month = 11) => at(day, hour, month).toISOString();
const HOJE = at(26, 15);

/** Respostas sem nenhum alerta (treina há mais de 3 meses, PAR-Q todo "não"). */
const BASE: AnamneseAnswers = {
  nome: "Ana Souza",
  ano: 1990,
  sexo: "F",
  altura: 168,
  peso: 64,
  parq: [0, 0, 0, 0, 0, 0, 0],
  regular: "sim3m",
  condicoes: [],
  sintomas: [],
  remedios: 0,
  cirurgia: 0,
  gestacao: "nao",
  dor: 0,
  lesao: 0,
  objetivo: "gordura",
  experiencia: "a3",
  dias: 3,
  minutos: 60,
  onde: "academia",
  nutri: "nao",
  foco: ["gluteos"],
};

function anamnese(a: Partial<AnamneseAnswers> = {}, extra: Partial<Anamnese> = {}): Anamnese {
  const quando = extra.answeredAt ?? iso(20);
  return {
    v: ANAMNESE_V,
    id: "r1",
    answeredAt: quando,
    by: "aluno",
    via: "link",
    modulos: [],
    parqText: PARQ_TEXT_ID,
    a: { ...BASE, ...a },
    consent: { at: quando, source: "aluno_questionario", textId: CONSENT_TEXT_ID },
    declaredAt: quando,
    ...extra,
  };
}

function aluno(extra: Partial<Profile> = {}): Profile {
  return {
    id: "s1",
    name: "Ana Souza",
    role: "athlete",
    plan: "free",
    onboarded: true,
    createdAt: iso(1),
    managedBy: "c1",
    goal: "emagrecimento",
    daysPerWeek: 3,
    ...extra,
  };
}

const visto = { receivedAt: iso(20), vistoEm: iso(20) };
const lib = (alertas: Liberacao["alertas"], registradoEm: string): Liberacao => ({ ...novaLiberacao({ por: "medico", data: registradoEm.slice(0, 10), alertas, agora: registradoEm }) });

describe("seloDoAluno: cada estado", () => {
  it("sem questionário e sem pedido: nenhum selo", () => {
    expect(seloDoAluno(aluno(), HOJE)).toBeNull();
  });
  it("respostas vistas e sem alerta: nenhum selo", () => {
    expect(seloDoAluno(aluno({ anamnese: anamnese({}, visto) }), HOJE)).toBeNull();
  });
  it("'Não começar: ver resumo' com alerta vermelho aberto", () => {
    const p = aluno({ anamnese: anamnese({ parq: [0, 1, 0, 0, 0, 0, 0] }, visto) });
    expect(seloDoAluno(p, HOJE)).toEqual({ selo: "nao_comecar", texto: "Não começar: ver resumo" });
  });
  it("'Não começar' também com respostas de versão nova ou danificadas", () => {
    const nova = aluno({ anamnese: { ...anamnese(), v: ANAMNESE_V + 1 } });
    const danificada = aluno({ anamnese: { id: "r1" } as unknown as Anamnese });
    expect(seloDoAluno(nova, HOJE)?.selo).toBe("nao_comecar");
    expect(seloDoAluno(danificada, HOJE)?.selo).toBe("nao_comecar");
  });
  it("vermelho coberto por liberação registrada depois das respostas: sai o 'Não começar'", () => {
    const p = aluno({ anamnese: anamnese({ parq: [0, 1, 0, 0, 0, 0, 0] }, visto), liberacoes: [lib(["A-PEITO"], iso(22))] });
    expect(seloDoAluno(p, HOJE)).toBeNull();
  });
  it("liberação anterior às respostas não cobre (respostas novas reabrem)", () => {
    const p = aluno({ anamnese: anamnese({ parq: [0, 1, 0, 0, 0, 0, 0] }, visto), liberacoes: [lib(["A-PEITO"], iso(10))] });
    expect(seloDoAluno(p, HOJE)?.selo).toBe("nao_comecar");
  });
  it("'Liberação pendente' com laranja aberto", () => {
    const p = aluno({ anamnese: anamnese({ parq: [0, 0, 0, 0, 0, 0, 1] }, visto) });
    expect(seloDoAluno(p, HOJE)).toEqual({ selo: "liberacao_pendente", texto: "Liberação pendente" });
  });
  it("laranja com 'Seguir mesmo assim' ou liberação: sem selo", () => {
    const base = aluno({ anamnese: anamnese({ parq: [0, 0, 0, 0, 0, 0, 1] }, visto) });
    const seguiu = { ...base, anamnese: { ...base.anamnese!, overrides: [{ at: iso(21), alertas: ["A-PARQ7" as const] }] } };
    expect(seloDoAluno(seguiu, HOJE)).toBeNull();
    expect(seloDoAluno({ ...base, liberacoes: [lib(["A-PARQ7"], iso(21))] }, HOJE)).toBeNull();
    // A ação da tela (comOverride) chega ao mesmo lugar.
    expect(seloDoAluno(comOverride(base, ["A-PARQ7"], iso(21)), HOJE)).toBeNull();
  });
  it("sem dados de saúde (A-SEM-TRIAGEM) não vira 'Liberação pendente': a página pede triagem pessoalmente", () => {
    const p = aluno({ anamnese: anamnese({}, { ...visto, healthOmitted: true, consent: undefined }) });
    expect(seloDoAluno(p, HOJE)).toBeNull();
  });
  it("amarelo e azul não dão selo", () => {
    const p = aluno({ anamnese: anamnese({ condicoes: ["pressao"], pressaoControle: "naoSei", parq: [0, 0, 0, 0, 0, 1, 0], remedios: 1, remediosPara: ["pressao"] }, visto) });
    expect(seloDoAluno(p, HOJE)).toBeNull();
  });
  it("'Respostas novas': chegaram pelo link e o resumo ainda não foi visto", () => {
    const p = aluno({ anamnese: anamnese({}, { receivedAt: iso(25) }) });
    expect(seloDoAluno(p, HOJE)).toEqual({ selo: "respostas_novas", texto: "Respostas novas" });
    expect(seloDoAluno(marcarVisto(p, iso(26)), HOJE)).toBeNull();
  });
  it("preenchido junto (sem receivedAt) não é 'Respostas novas'", () => {
    expect(seloDoAluno(aluno({ anamnese: anamnese({}, { via: "junto", by: "personal" }) }), HOJE)).toBeNull();
  });
  it("'Questionário pendente · N dias' com pedido sem resposta", () => {
    const pedido = (day: number) => ({ anamnesePedido: { id: "q1", at: iso(day), modulos: [], packed: "x" } });
    expect(seloDoAluno(aluno(pedido(23)), HOJE)).toEqual({ selo: "questionario_pendente", texto: "Questionário pendente · 3 dias" });
    expect(seloDoAluno(aluno(pedido(25)), HOJE)?.texto).toBe("Questionário pendente · 1 dia");
    expect(seloDoAluno(aluno(pedido(26)), HOJE)?.texto).toBe("Questionário pendente · pedido hoje");
  });
  it("pedido com respostas mais novas (ou da mesma rodada): não está pendente", () => {
    const pedido = { id: "q1", at: iso(21), modulos: [], packed: "x" };
    const mais = aluno({ anamnesePedido: pedido, anamnese: anamnese({}, { ...visto, id: "r2", answeredAt: iso(22) }) });
    const mesma = aluno({ anamnesePedido: pedido, anamnese: anamnese({}, { ...visto, id: "q1", answeredAt: iso(20) }) });
    const antigas = aluno({ anamnesePedido: pedido, anamnese: anamnese({}, { ...visto, id: "r0", answeredAt: iso(10) }) });
    expect(seloDoAluno(mais, HOJE)).toBeNull();
    expect(seloDoAluno(mesma, HOJE)).toBeNull();
    expect(seloDoAluno(antigas, HOJE)?.selo).toBe("questionario_pendente");
  });
});

describe("seloDoAluno: prioridade", () => {
  const pedido = { anamnesePedido: { id: "q9", at: iso(24), modulos: [], packed: "x" } };
  it("trava vence porta", () => {
    const p = aluno({ anamnese: anamnese({ parq: [0, 1, 0, 0, 0, 0, 1] }, { receivedAt: iso(25) }) });
    expect(seloDoAluno(p, HOJE)?.selo).toBe("nao_comecar");
  });
  it("porta vence respostas novas", () => {
    const p = aluno({ anamnese: anamnese({ parq: [0, 0, 0, 0, 0, 0, 1] }, { receivedAt: iso(25) }) });
    expect(seloDoAluno(p, HOJE)?.selo).toBe("liberacao_pendente");
  });
  it("respostas novas vence pendente", () => {
    const p = aluno({ ...pedido, anamnese: anamnese({}, { id: "r0", answeredAt: iso(10), receivedAt: iso(25) }) });
    expect(pedidoPendente(p, p.anamnese!)).toBe(true);
    expect(seloDoAluno(p, HOJE)?.selo).toBe("respostas_novas");
  });
  it("trava vence pendente", () => {
    const p = aluno({ ...pedido, anamnese: anamnese({ parq: [0, 1, 0, 0, 0, 0, 0] }, { ...visto, id: "r0", answeredAt: iso(10) }) });
    expect(seloDoAluno(p, HOJE)?.selo).toBe("nao_comecar");
  });
});

describe("textos do selo não nomeiam condição", () => {
  const textos = [...Object.values(SELO_TEXTO), textoPendente(0), textoPendente(1), textoPendente(12)];
  // Rótulos de condição, sintoma, remédio, lugar da dor, gestação e alertas da coluna, do próprio catálogo.
  const rotulos = PERGUNTAS.filter((q) => ["condicoes", "sintomas", "remediosPara", "dorOnde", "dorAlerta", "gestacao", "complicacoes"].includes(q.id))
    .flatMap((q) => q.opcoes ?? [])
    .map((o) => o.rotulo)
    .filter((r) => !/^(nenhum|nenhuma|não|outr[oa]|prefiro)/i.test(r));
  const palavras = ["pressão", "diabetes", "coração", "cardí", "gestante", "grávida", "dor", "câncer", "remédio", "lesão", "joelho", "coluna", "PAR-Q", "médic"];
  it("nenhum rótulo do catálogo nem palavra de saúde", () => {
    expect(rotulos.length).toBeGreaterThan(20);
    for (const t of textos) {
      for (const r of rotulos) expect(t.toLowerCase()).not.toContain(r.toLowerCase());
      for (const w of palavras) expect(t.toLowerCase()).not.toContain(w.toLowerCase());
    }
  });
});

describe("diasDePedidoPendente e a fila de contato", () => {
  const pedido = { id: "q1", at: iso(23), modulos: [], packed: "x" };
  it("dias de calendário desde o pedido; null sem pedido", () => {
    expect(diasDePedidoPendente(aluno({ anamnesePedido: pedido }), HOJE)).toBe(3);
    expect(diasDePedidoPendente(aluno(), HOJE)).toBeNull();
  });
  it("com respostas mais novas, null: a fila não lembra", () => {
    const p = aluno({ anamnesePedido: pedido, anamnese: anamnese({}, { ...visto, id: "r2", answeredAt: iso(24) }) });
    expect(diasDePedidoPendente(p, HOJE)).toBeNull();
    expect(contactReason(false, null, false, diasDePedidoPendente(p, HOJE))).toBeNull();
  });
  it("com respostas ilegíveis, null (nada a afirmar)", () => {
    expect(diasDePedidoPendente(aluno({ anamnesePedido: pedido, anamnese: { id: "x" } as unknown as Anamnese }), HOJE)).toBeNull();
  });
  it("2 dias entra na fila; 1 dia não", () => {
    expect(contactReason(false, null, false, diasDePedidoPendente(aluno({ anamnesePedido: { ...pedido, at: iso(24) } }), HOJE))).toBe("questionario_pendente");
    expect(contactReason(false, null, false, diasDePedidoPendente(aluno({ anamnesePedido: { ...pedido, at: iso(25) } }), HOJE))).toBeNull();
  });
});

describe("revogarSaude", () => {
  const cheio = aluno({
    anamnese: anamnese({ parq: [0, 0, 0, 0, 1, 0, 0], condicoes: ["diabetes2"], hipo: "nunca", complicacoes: [], dor: 1, dorOnde: [{ r: "joelho", l: "d" }], dorNota: 3, dorQuando: ["movimento"], dorDesde: "mais3m", barreira: ["dor", "tempo"], motivo: ["medica", "estetica"] }, { ...visto, termo: { at: iso(20), nome: "Ana Souza" }, overrides: [{ at: iso(21), alertas: ["A-PARQ7"] }] }),
    anamnesePrev: anamnese({ remedios: 1, remediosPara: ["pressao"], pressaoControle: "controlada" }, { id: "r0", answeredAt: iso(1, 10, 10) }),
    liberacoes: [lib(["A-DOENCA"], iso(22))],
    limitations: "joelho direito",
    limitacoesDoQuestionario: ["joelho direito"],
    weightKg: 64,
    heightCm: 168,
    consentHealthAt: iso(20),
    consentSource: "aluno_questionario",
    passosFeitos: { nutricionista_clinico: iso(23), dieta: iso(23) },
    emphasis: ["gluteos"],
  });

  it("tira saúde, liberações, limitações, medidas, tokens e autorização", () => {
    const r = revogarSaude(cheio);
    expect(r.anamnese?.healthOmitted).toBe(true);
    expect(r.anamnese?.a.parq).toBeUndefined();
    expect(r.anamnese?.a.condicoes).toBeUndefined();
    expect(r.anamnese?.a.dorOnde).toBeUndefined();
    expect(r.anamnese?.a.peso).toBeUndefined();
    expect(r.anamnese?.termo).toBeUndefined();
    expect(r.anamnese?.consent).toBeUndefined();
    expect(r.anamnese?.overrides).toBeUndefined();
    expect(r.anamnese?.a.barreira).toEqual(["tempo"]);
    expect(r.anamnese?.a.motivo).toEqual(["estetica"]);
    expect(r.anamnesePrev?.healthOmitted).toBe(true);
    expect(r.anamnesePrev?.a.remediosPara).toBeUndefined();
    for (const k of ["liberacoes", "limitations", "limitacoesDoQuestionario", "weightKg", "heightCm", "consentHealthAt", "consentSource"] as const) expect(r[k]).toBeUndefined();
    expect(temSaudeNoQuestionario(r)).toBe(false);
  });
  it("mantém nome, objetivo, dias, foco, as respostas de treino e o que o personal marcou fora da saúde", () => {
    const r = revogarSaude(cheio);
    expect(r.name).toBe("Ana Souza");
    expect(r.goal).toBe("emagrecimento");
    expect(r.daysPerWeek).toBe(3);
    expect(r.emphasis).toEqual(["gluteos"]);
    expect(r.anamnese?.a.nome).toBe("Ana Souza");
    expect(r.anamnese?.a.dias).toBe(3);
    expect(r.anamnese?.a.foco).toEqual(["gluteos"]);
    expect(r.anamnese?.id).toBe("r1");
    expect(r.passosFeitos).toEqual({ dieta: iso(23) });
  });
  it("respostas ilegíveis saem inteiras (não dá para separar a saúde)", () => {
    const r = revogarSaude(aluno({ anamnese: { ...anamnese(), v: 99 }, anamnesePrev: anamnese({}, { id: "r0" }) }));
    expect(r.anamnese).toBeUndefined();
    expect(r.anamnesePrev?.healthOmitted).toBe(true);
  });
  it("não muda o perfil recebido", () => {
    const antes = JSON.stringify(cheio);
    revogarSaude(cheio);
    expect(JSON.stringify(cheio)).toBe(antes);
  });
  it("o texto da confirmação é o da spec", () => {
    expect(TEXTO_REVOGAR).toBe("As respostas de saúde do questionário e as liberações registradas serão apagadas.");
  });
  it("temSaudeNoQuestionario: respostas com saúde, ilegíveis ou liberações", () => {
    expect(temSaudeNoQuestionario(cheio)).toBe(true);
    expect(temSaudeNoQuestionario(aluno())).toBe(false);
    expect(temSaudeNoQuestionario(aluno({ anamnese: anamnese({}, { healthOmitted: true }) }))).toBe(false);
    expect(temSaudeNoQuestionario(aluno({ anamnese: { id: "x" } as unknown as Anamnese }))).toBe(true);
    expect(temSaudeNoQuestionario(aluno({ liberacoes: [lib(["A-PEITO"], iso(22))] }))).toBe(true);
  });
});

describe("idsDeRespostas", () => {
  it("ids da rodada atual e da anterior, sem repetir", () => {
    expect(idsDeRespostas(aluno({ anamnese: anamnese(), anamnesePrev: anamnese({}, { id: "r0" }) }))).toEqual(["r1", "r0"]);
    expect(idsDeRespostas(aluno({ anamnese: anamnese(), anamnesePrev: anamnese() }))).toEqual(["r1"]);
    expect(idsDeRespostas(aluno())).toEqual([]);
  });
  it("de respostas ilegíveis, só o id", () => {
    expect(idsDeRespostas(aluno({ anamnese: { ...anamnese(), id: "nova", v: 99 } }))).toEqual(["nova"]);
    expect(idsDeRespostas(aluno({ anamnese: { id: "danificada" } as unknown as Anamnese }))).toEqual(["danificada"]);
    expect(idsDeRespostas(aluno({ anamnese: { id: 7 } as unknown as Anamnese }))).toEqual([]);
  });
});

describe("apagarRespostas", () => {
  const base = aluno({
    anamnese: anamnese({ peso: 64, altura: 168 }, visto),
    anamnesePrev: anamnese({ peso: 66 }, { id: "r0", answeredAt: iso(1, 10, 10) }),
    liberacoes: [lib(["A-PEITO"], iso(22))],
    anamnesePedido: { id: "q2", at: iso(25), modulos: [], packed: "x" },
    limitations: "condromalácia patelar; joelho direito",
    limitacoesDoQuestionario: ["joelho direito"],
    weightKg: 64,
    heightCm: 170,
    consentHealthAt: iso(20),
    consentSource: "aluno_questionario",
    passosFeitos: { termo: iso(23), dieta: iso(23) },
  });
  it("sem 'apagar também': respostas, anterior, liberações, pedido e tokens saem; cadastro e autorização ficam", () => {
    const r = apagarRespostas(base, false);
    for (const k of ["anamnese", "anamnesePrev", "liberacoes", "anamnesePedido", "limitacoesDoQuestionario"] as const) expect(r[k]).toBeUndefined();
    expect(r.limitations).toBe("condromalácia patelar; joelho direito");
    expect(r.weightKg).toBe(64);
    expect(r.heightCm).toBe(170);
    expect(r.consentHealthAt).toBe(iso(20));
    expect(r.passosFeitos).toEqual({ dieta: iso(23) });
    expect(idsDeRespostas(r)).toEqual([]);
  });
  it("com 'apagar também': só o que foi copiado (trechos do app e medidas iguais às respostas)", () => {
    const r = apagarRespostas(base, true);
    expect(r.limitations).toBe("condromalácia patelar");
    expect(r.weightKg).toBeUndefined(); // 64 veio da resposta
    expect(r.heightCm).toBe(170); // o personal mediu 170; a resposta foi 168
    expect(r.limitacoesDoQuestionario).toBeUndefined();
  });
  it("com 'apagar também' e limitações só do app: o campo sai", () => {
    const r = apagarRespostas({ ...base, limitations: "joelho direito" }, true);
    expect(r.limitations).toBeUndefined();
  });
  it("peso da rodada anterior também conta como copiado", () => {
    expect(apagarRespostas({ ...base, weightKg: 66 }, true).weightKg).toBeUndefined();
  });
});

describe("marcarVisto, registrarTermo e marcarFeito", () => {
  it("marcarVisto grava vistoEm uma vez", () => {
    const p = aluno({ anamnese: anamnese({}, { receivedAt: iso(25) }) });
    const v = marcarVisto(p, iso(26, 9));
    expect(v.anamnese?.vistoEm).toBe(iso(26, 9));
    expect(marcarVisto(v, iso(26, 11))).toBe(v);
    expect(marcarVisto(aluno(), iso(26))).toEqual(aluno());
  });
  it("registrarTermo grava o termo com o nome do aluno e a data", () => {
    const p = aluno({ name: "  Ana   Souza ", anamnese: anamnese({ parq: [0, 0, 0, 0, 1, 0, 0] }, visto) });
    const r = registrarTermo(p, iso(26, 9));
    expect(r.anamnese?.termo).toEqual({ at: iso(26, 9), nome: "Ana Souza" });
    expect(r.anamnese?.a.parq).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });
  it("registrarTermo sem respostas de saúde não grava nada", () => {
    const p = aluno({ anamnese: anamnese({}, { healthOmitted: true }) });
    expect(registrarTermo(p, iso(26))).toBe(p);
    expect(registrarTermo(aluno(), iso(26))).toEqual(aluno());
  });
  it("marcarFeito grava o passo com a data e mantém os outros", () => {
    const p = aluno({ passosFeitos: { dieta: iso(20) } });
    expect(marcarFeito(p, "nutricionista_clinico", iso(26)).passosFeitos).toEqual({ dieta: iso(20), nutricionista_clinico: iso(26) });
    expect(marcarFeito(aluno(), "nutricionista", iso(26)).passosFeitos).toEqual({ nutricionista: iso(26) });
  });
});

describe("avisoDieta", () => {
  const TEXTO = "Ana informou uma condição em que o plano alimentar é do nutricionista. Use esta aba só para registrar as metas que o nutricionista passar.";
  const casos: [string, Partial<AnamneseAnswers>][] = [
    ["diabetes tipo 2", { condicoes: ["diabetes2"], hipo: "nunca", complicacoes: [] }],
    ["doença renal", { condicoes: ["rins"] }],
    ["transtorno alimentar", { condicoes: ["alimentar"] }],
    ["gestante", { gestacao: "gravida", obstetra: "sim", assoalho: 0 }],
    ["remédio para emagrecer", { remedios: 1, remediosPara: ["emagrecer"] }],
    ["doença celíaca", { restricoes: ["celiaca"] }],
  ];
  for (const [nome, a] of casos)
    it(`com ${nome}: aviso fixo, só com o primeiro nome e sem nomear a condição`, () => {
      const t = avisoDieta(aluno({ anamnese: anamnese(a, visto) }));
      expect(t).toBe(TEXTO);
      // "plano alimentar" é do texto literal; "transtorno alimentar" não pode aparecer.
      expect(t).not.toMatch(/diabetes|rins|renal|transtorno|gestante|grávida|gravidez|emagrecer|celíaca|Souza/i);
    });
  it("sem gatilho, sem respostas, sem saúde ou com respostas ilegíveis: null", () => {
    expect(avisoDieta(aluno({ anamnese: anamnese({ condicoes: ["pressao"], pressaoControle: "controlada" }, visto) }))).toBeNull();
    expect(avisoDieta(aluno({ anamnese: anamnese({ restricoes: ["lactose"] }, visto) }))).toBeNull();
    expect(avisoDieta(aluno())).toBeNull();
    expect(avisoDieta(aluno({ anamnese: anamnese({ condicoes: ["rins"] }, { healthOmitted: true }) }))).toBeNull();
    expect(avisoDieta(aluno({ anamnese: { id: "x" } as unknown as Anamnese }))).toBeNull();
  });
});

describe("extraDoEnvioDaFicha (ficha_link_sent)", () => {
  const criado = aluno({ createdAt: iso(26, 9) });
  it("como o questionário foi feito: link, junto ou nenhum (ilegível conta como nenhum)", () => {
    expect(extraDoEnvioDaFicha({ ...criado, anamnese: anamnese() }, true, iso(26, 12)).questionario).toBe("link");
    expect(extraDoEnvioDaFicha({ ...criado, anamnese: anamnese({}, { via: "junto", by: "personal" }) }, true, iso(26, 12)).questionario).toBe("junto");
    expect(extraDoEnvioDaFicha(criado, true, iso(26, 12)).questionario).toBe("nenhum");
    expect(extraDoEnvioDaFicha({ ...criado, anamnese: { id: "x" } as unknown as Anamnese }, true, iso(26, 12)).questionario).toBe("nenhum");
  });
  it("primeira, horas desde o cadastro e aluno novo", () => {
    expect(extraDoEnvioDaFicha(criado, true, iso(26, 12))).toEqual({ primeira: true, horas_desde_cadastro: 3, questionario: "nenhum", aluno_novo: true });
    expect(extraDoEnvioDaFicha({ ...criado, createdAt: iso(1, 9, 10) }, false, iso(26, 12)).aluno_novo).toBe(false);
  });
  it("dois alunos que só diferem na saúde dão as mesmas chaves", () => {
    const sem = { ...criado, anamnese: anamnese({}, visto) };
    const com = { ...criado, anamnese: anamnese({ parq: [0, 1, 0, 0, 0, 0, 1], condicoes: ["diabetes2"], dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 8 }, visto) };
    const semSaude = { ...criado, anamnese: anamnese({}, { ...visto, healthOmitted: true }) };
    const a = extraDoEnvioDaFicha(sem, true, iso(26, 12));
    expect(extraDoEnvioDaFicha(com, true, iso(26, 12))).toEqual(a);
    expect(extraDoEnvioDaFicha(semSaude, true, iso(26, 12))).toEqual(a);
  });
});

describe("página do aluno: menu, ?novo=1 e cartão do jeito", () => {
  it("menu: 'Fazer o questionário' sem respostas; '… de novo' com", () => {
    expect(rotuloFazerQuestionario(aluno())).toBe("Fazer o questionário");
    expect(rotuloFazerQuestionario(aluno({ anamnese: anamnese() }))).toBe("Fazer o questionário de novo");
    expect(rotuloFazerQuestionario(aluno({ anamnese: { id: "x" } as unknown as Anamnese }))).toBe("Fazer o questionário de novo");
  });
  it("'Apagar respostas' só quando há respostas (legíveis ou não)", () => {
    expect(temRespostas(aluno())).toBe(false);
    expect(temRespostas(aluno({ anamnesePrev: anamnese() }))).toBe(true);
    expect(temRespostas(aluno({ anamnesePedido: { id: "q", at: iso(25), modulos: [], packed: "x" } }))).toBe(false);
  });
  it("?novo=1 conforme o caso", () => {
    expect(avisoCadastroNovo(aluno(), true)).toBe("Cadastro de Ana concluído. Faça o questionário inicial antes da ficha.");
    expect(avisoCadastroNovo(aluno({ anamnesePedido: { id: "q", at: iso(25), modulos: [], packed: "x" } }), true)).toBe("Cadastro de Ana concluído.");
    expect(avisoCadastroNovo(aluno({ anamnese: anamnese() }), true)).toBe("Cadastro de Ana concluído.");
    expect(avisoCadastroNovo(aluno(), false)).toBe("Cadastro de Ana concluído. O próximo passo é montar a ficha.");
  });
  it("cartão do jeito: só com a chave, para personal sem jeito definido nem pulado, e sem o 'Agora não'", () => {
    const coach = { role: "coach" as const };
    expect(CARTAO_JEITO_KEY).toBe("sr:v1:ws-cartao");
    expect(CARTAO_JEITO_TEXTO).toBe("Conte em 5 toques como você trabalha e o app já deixa o questionário, o cadastro e a ficha do seu jeito.");
    expect(mostrarCartaoJeito(coach, true, false)).toBe(true);
    expect(mostrarCartaoJeito({ ...coach, workStyle: { atendimento: "online" } }, true, false)).toBe(true);
    expect(mostrarCartaoJeito(coach, false, false)).toBe(false);
    expect(mostrarCartaoJeito(coach, true, true)).toBe(false);
    expect(mostrarCartaoJeito({ ...coach, workStyle: { definidoEm: iso(20) } }, true, false)).toBe(false);
    expect(mostrarCartaoJeito({ ...coach, workStyle: { puladoEm: iso(20) } }, true, false)).toBe(false);
    expect(mostrarCartaoJeito({ role: "athlete" }, true, false)).toBe(false);
    expect(mostrarCartaoJeito(null, true, false)).toBe(false);
  });
  it("textos dos diálogos", () => {
    expect(TERMO_CAIXA_PERSONAL("Ana Souza")).toBe("Ana leu e concordou com o termo");
    expect(APAGAR_TITULO("Ana Souza")).toBe("Apagar as respostas do questionário de Ana?");
    expect(APAGAR_CAIXA).toBe("Apagar também as limitações e medidas copiadas para o cadastro");
  });
});

describe("cards de alerta: linhas e ações", () => {
  const ctx = (liberacoes: Liberacao[] = []) => ({ hoje: HOJE, liberacoes });
  const card = (a: Partial<AnamneseAnswers>, extra: Partial<Anamnese> = {}, liberacoes: Liberacao[] = []) => alertas(anamnese(a, { ...visto, ...extra }), ctx(liberacoes));
  const p = aluno();
  const tipos = (al: Parameters<typeof acoesDoAlerta>[0]) => acoesDoAlerta(al, p).map((x) => x.tipo);

  it("'Veio de: pergunta → resposta'", () => {
    expect(veioDe({ pergunta: "Pressão", resposta: "Não sei" })).toBe("Veio de: Pressão → Não sei");
  });
  it("vermelho aberto: [Registrar liberação] [Avisar Ana], com a mensagem que não nomeia condição", () => {
    const [peito] = card({ parq: [0, 1, 0, 0, 0, 0, 0] });
    expect(peito!.id).toBe("A-PEITO");
    const acoes = acoesDoAlerta(peito!, p);
    expect(acoes.map((x) => x.tipo)).toEqual(["liberacao", "avisar"]);
    expect(acoes[1]).toMatchObject({ rotulo: "Avisar Ana" });
    expect((acoes[1] as { texto: string }).texto).not.toMatch(/peito|coração/i);
  });
  it("coluna com sinal de urgência: o 'Avisar' pede atendimento hoje", () => {
    const urg = card({ dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 5, dorQuando: ["movimento"], dorDesde: "ate3m", dorAlerta: ["sela"] }).find((x) => x.id === "A-COLUNA-URG")!;
    const avisar = acoesDoAlerta(urg, p).find((x) => x.tipo === "avisar") as { texto: string };
    expect(avisar.texto).toContain("procure atendimento médico ainda hoje");
  });
  it("laranja aberto: liberar e avisar; com 'Seguir mesmo assim', só liberar", () => {
    const al = card({ parq: [0, 0, 0, 0, 0, 0, 1] }).find((x) => x.id === "A-PARQ7")!;
    expect(tipos(al)).toEqual(["liberacao", "avisar"]);
    const seguiu = alertas(comOverride(aluno({ anamnese: anamnese({ parq: [0, 0, 0, 0, 0, 0, 1] }, visto) }), ["A-PARQ7"], iso(22)).anamnese!, ctx()).find((x) => x.id === "A-PARQ7")!;
    expect(tipos(seguiu)).toEqual(["liberacao"]);
    expect(textoCoberto(seguiu, "Ana Souza")).toBe("Você seguiu mesmo assim em 22/11.");
  });
  it("liberado por profissional: sem ações, com a linha da liberação e das restrições", () => {
    const l = { ...lib(["A-PEITO"], iso(22)), por: "obstetra" as const, data: "2026-11-21", restricoes: "sem corrida" };
    const al = card({ parq: [0, 1, 0, 0, 0, 0, 0] }, {}, [l]).find((x) => x.id === "A-PEITO")!;
    expect(acoesDoAlerta(al, p)).toEqual([]);
    expect(textoCoberto(al, "Ana")).toBe("Liberado por obstetra em 21/11; restrições: sem corrida");
    const semRestricao = card({ parq: [0, 1, 0, 0, 0, 0, 0] }, {}, [{ ...lib(["A-PEITO"], iso(22)), data: "2026-11-22" }]).find((x) => x.id === "A-PEITO")!;
    expect(textoCoberto(semRestricao, "Ana")).toBe("Liberado por médico em 22/11");
  });
  it("[E1] liberação anterior às respostas: a linha pede para registrar de novo e o card volta a ter as ações", () => {
    const antiga = { ...lib(["A-PEITO"], iso(10)), data: "2026-11-09" };
    const al = card({ parq: [0, 1, 0, 0, 0, 0, 0] }, {}, [antiga]).find((x) => x.id === "A-PEITO")!;
    expect(textoLiberacaoAnterior(al)).toBe("Liberação de 09/11 é anterior a estas respostas. Registre de novo se ainda vale.");
    expect(tipos(al)).toEqual(["liberacao", "avisar"]);
    expect(textoLiberacaoAnterior({})).toBeNull();
  });
  it("amarelo de condição conhecida em quem já treina: só [Registrar liberação]", () => {
    const al = card({ condicoes: ["coracao"] }).find((x) => x.id === "A-DOENCA-ATIVO")!;
    expect(tipos(al)).toEqual(["liberacao"]);
  });
  it("A-PESSOAL: [Conversei] até o personal registrar", () => {
    const al = card({ condicoes: "pessoal" }).find((x) => x.id === "A-PESSOAL")!;
    expect(tipos(al)).toEqual(["conversei"]);
    const feito = alertas(comConversei(aluno({ anamnese: anamnese({ condicoes: "pessoal" }, visto) }), ["A-PESSOAL"], iso(22)).anamnese!, ctx()).find((x) => x.id === "A-PESSOAL")!;
    expect(tipos(feito)).toEqual([]);
    expect(textoCoberto(feito, "Ana Souza")).toBe("Você conversou com Ana em 22/11.");
  });
  it("sem dados de saúde e PAR-Q incompleto: preencher com o aluno, não liberação médica", () => {
    const sem = alertas(anamnese({}, { ...visto, healthOmitted: true }), ctx()).find((x) => x.id === "A-SEM-TRIAGEM")!;
    expect(acoesDoAlerta(sem, p)).toEqual([{ tipo: "preencher", rotulo: "Preencher a saúde com Ana", href: "/questionario?aluno=s1" }]);
    const inc = alertas(anamnese({ parq: [0, 0, 0] as unknown as AnamneseAnswers["parq"] }, { via: "junto", by: "personal" }), ctx()).find((x) => x.id === "A-PARQ-INCOMPLETO")!;
    expect(acoesDoAlerta(inc, p)).toEqual([{ tipo: "preencher", rotulo: "Completar o PAR-Q com Ana", href: "/questionario?aluno=s1" }]);
  });
  it("amarelos de teto e token, azuis e lembretes: sem ações", () => {
    const lista = card({ condicoes: ["pressao", "cancer"], pressaoControle: "alta", parq: [0, 0, 0, 0, 1, 0, 0], cirurgia: 1 });
    for (const id of ["A-PRESSAO", "A-PARQ-SIM", "A-CANCER", "A-CIRURGIA"] as const) {
      const al = lista.find((x) => x.id === id)!;
      expect(al).toBeTruthy();
      expect(acoesDoAlerta(al, p)).toEqual([]);
    }
  });
});

describe("próximos passos: visíveis e eventos", () => {
  const passo = (id: Parameters<typeof eventoDaAcao>[1]["id"]) => ({ id });
  it("até 4 visíveis e 'e mais N'", () => {
    expect(passosVisiveis([1, 2, 3, 4, 5, 6])).toEqual({ visiveis: [1, 2, 3, 4], mais: 2 });
    expect(passosVisiveis([1, 2])).toEqual({ visiveis: [1, 2], mais: 0 });
  });
  it("eventos: o passo, 'lembrar' no lembrete, null nos clínicos, na dieta, no nutricionista e no exemplo", () => {
    const p = aluno();
    expect(eventoDaAcao(p, passo("gerar_ficha"), { tipo: "href", rotulo: "Gerar", href: "/x" })).toEqual({ passo: "gerar_ficha" });
    expect(eventoDaAcao(p, passo("enviar_ficha"), { tipo: "enviar_ficha", rotulo: "Enviar" })).toEqual({ passo: "enviar_ficha" });
    expect(eventoDaAcao(p, passo("questionario"), { tipo: "pedir", rotulo: "Mandar pelo WhatsApp" })).toEqual({ passo: "questionario" });
    expect(eventoDaAcao(p, passo("questionario"), { tipo: "pedir", rotulo: "Lembrar Ana", lembrete: true })).toEqual({ passo: "lembrar" });
    for (const id of ["liberacao", "triagem_presencial", "termo", "nutricionista_clinico", "atualizar_saude", "dieta", "nutricionista"] as const)
      expect(eventoDaAcao(p, passo(id), { tipo: "feito", rotulo: "Feito" })).toBeNull();
    expect(eventoDaAcao({ id: "demo-aluna-1" }, passo("gerar_ficha"), { tipo: "href", rotulo: "Gerar", href: "/x" })).toBeNull();
    expect(eventoDaAcao({ id: "teste-ex-1", sample: true }, passo("questionario"), { tipo: "pedir", rotulo: "Mandar" })).toBeNull();
  });
});

describe("uma regra só para o pedido pendente", () => {
  it("pedidoPendente é o mesmo do passo `questionario` (next-steps.ts)", () => {
    expect(pedidoPendente).toBe(nextStepsMod.pedidoPendente);
  });
});

describe("card do rascunho e registro impresso", () => {
  it("'Questionário pela metade (parte …)'", () => {
    expect(textoPelaMetade("Saúde: 7 perguntas")).toBe("Questionário pela metade (parte Saúde: 7 perguntas)");
    expect(textoPelaMetade("  ")).toBe("Questionário pela metade");
  });

  it("autorização pelo link, declaração, termo, liberação (pelo título do alerta), 'Seguir mesmo assim' e 'Conversei'", () => {
    const an = anamnese({ parq: [0, 1, 0, 0, 0, 0, 1], condicoes: "pessoal" }, { termo: { at: iso(20), nome: "Ana Souza" } });
    let p = aluno({ anamnese: an, liberacoes: [{ ...lib(["A-PEITO"], iso(22)), restricoes: "sem corrida" }] });
    p = comOverride(p, ["A-PARQ7"], iso(23));
    p = comConversei(p, ["A-PESSOAL"], iso(24));
    const lista = alertas(p.anamnese!, { hoje: HOJE, liberacoes: p.liberacoes ?? [] });
    const linhas = registroDoQuestionario(p, lista);
    expect(linhas[0]).toBe("Autorização de saúde: dada por Ana Souza pelo link em 20/11/2026.");
    expect(linhas).toContain("Declarou que as respostas são verdadeiras em 20/11/2026.");
    expect(linhas).toContain("Termo do PAR-Q: Ana Souza leu e concordou em 20/11/2026.");
    const peito = lista.find((x) => x.id === "A-PEITO")!.titulo;
    expect(linhas.find((l) => l.startsWith("Liberado por médico(a) em 22/11/2026"))).toBe(`Liberado por médico(a) em 22/11/2026 (registrado em 22/11/2026). Pontos: ${peito}. Restrições: sem corrida.`);
    expect(linhas.some((l) => l.startsWith("Seguiu mesmo assim em 23/11/2026. Pontos: "))).toBe(true);
    expect(linhas).toContain("Conversou com Ana Souza em 24/11/2026.");
    // Nunca o código interno do alerta.
    expect(linhas.join(" ")).not.toMatch(/A-[A-Z]/);
  });

  it("junto com responsável, termo não marcado e sem saúde", () => {
    const junto = anamnese(
      { parq: [0, 0, 0, 0, 1, 0, 0] },
      { by: "personal", via: "junto", consent: { at: iso(20), source: "personal", textId: CONSENT_TEXT_ID, responsavel: { nome: "Marta Souza", at: iso(20) } } },
    );
    const linhas = registroDoQuestionario(aluno({ anamnese: junto }), []);
    expect(linhas).toContain("Autorização de saúde: Ana Souza autorizou com você em 20/11/2026.");
    expect(linhas).toContain("Autorização do responsável: Marta Souza em 20/11/2026.");
    expect(linhas).toContain("Termo do PAR-Q: não marcado.");
    const sem = registroDoQuestionario(aluno({ anamnese: revogarSaude(aluno({ anamnese: anamnese() })).anamnese }), []);
    expect(sem[0]).toBe("Autorização de saúde: não dada. As respostas de saúde não foram guardadas.");
    expect(sem.some((l) => l.startsWith("Termo"))).toBe(false);
  });

  it("sem respostas legíveis: vazio", () => {
    expect(registroDoQuestionario(aluno(), [])).toEqual([]);
    expect(registroDoQuestionario(aluno({ anamnese: { ...anamnese(), v: 99 } }), [])).toEqual([]);
  });
});
