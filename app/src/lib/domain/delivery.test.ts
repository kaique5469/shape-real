import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPrepEntries, nextAck, parseFichaAck, parseFichaSendRecord, parsePrepLog, PREP_LOG_MAX, RECENT_DAYS, type FichaAck, type PrepEntry } from "./delivery";

describe("constantes", () => {
  it("log de toques com 200 entradas e linha curta de 7 dias", () => {
    expect(PREP_LOG_MAX).toBe(200);
    expect(RECENT_DAYS).toBe(7);
  });
});

describe("nextAck", () => {
  const novo: FichaAck = { programAt: "2026-11-20T10:00:00.000Z", treinosSentAt: "2026-11-23T18:40:00.000Z", registeredAt: "2026-11-23T19:00:00.000Z" };
  const antigo: FichaAck = { programAt: "2026-11-10T10:00:00.000Z", treinosSentAt: "2026-11-18T18:40:00.000Z", registeredAt: "2026-11-23T19:05:00.000Z" };

  it("sem eco anterior → o novo", () => {
    expect(nextAck(null, antigo)).toEqual(antigo);
  });

  it("pacote de treinos mais novo substitui", () => {
    expect(nextAck(antigo, novo)).toEqual(novo);
  });

  it("não volta atrás: um pacote mais antigo, registrado depois, não substitui o mais novo", () => {
    expect(nextAck(novo, antigo)).toEqual(novo);
  });

  it("mesmo pacote de novo → fica o anterior", () => {
    const again = { ...novo, registeredAt: "2026-11-24T08:00:00.000Z" };
    expect(nextAck(novo, again)).toBe(novo);
  });

  it("data inválida no novo nunca vence; data inválida no anterior perde para uma válida", () => {
    expect(nextAck(novo, { ...antigo, treinosSentAt: "ontem" })).toBe(novo);
    const quebrado = { ...antigo, treinosSentAt: "x" };
    expect(nextAck(quebrado, novo)).toBe(novo);
  });
});

describe("leitura do armazenamento", () => {
  it("parsePrepLog descarta entradas malformadas", () => {
    expect(parsePrepLog(null)).toEqual({});
    expect(parsePrepLog([])).toEqual({});
    expect(
      parsePrepLog({
        t1: { via: "whatsapp", at: "2026-11-23T18:40:00.000Z" },
        t2: { via: "sms", at: "2026-11-23T18:40:00.000Z" },
        t3: { via: "copy", at: "amanhã" },
        t4: "whatsapp",
        t5: { via: "copy", at: "2026-11-22T10:00:00.000Z", extra: 1 },
      }),
    ).toEqual({ t1: { via: "whatsapp", at: "2026-11-23T18:40:00.000Z" }, t5: { via: "copy", at: "2026-11-22T10:00:00.000Z" } });
  });

  it("parseFichaSendRecord: versões podem ser null; registro sem hora ou canal não vale", () => {
    const rec = { at: "2026-11-20T14:02:00.000Z", via: "copy", programAt: "2026-11-19T10:00:00.000Z", dietAt: null };
    expect(parseFichaSendRecord(rec)).toEqual(rec);
    expect(parseFichaSendRecord({ ...rec, dietAt: undefined })).toEqual({ ...rec, dietAt: null });
    expect(parseFichaSendRecord({ ...rec, via: "email" })).toBeNull();
    expect(parseFichaSendRecord({ ...rec, at: 5 })).toBeNull();
    expect(parseFichaSendRecord({ ...rec, programAt: "versão 2" })).toBeNull();
    expect(parseFichaSendRecord("x")).toBeNull();
  });

  it("parseFichaAck: exige as duas horas; versões inválidas somem", () => {
    expect(parseFichaAck({ treinosSentAt: "2026-11-23T18:40:00.000Z", registeredAt: "2026-11-23T19:00:00.000Z", programAt: "2026-11-20T10:00:00.000Z", dietAt: 7 })).toEqual({
      treinosSentAt: "2026-11-23T18:40:00.000Z",
      registeredAt: "2026-11-23T19:00:00.000Z",
      programAt: "2026-11-20T10:00:00.000Z",
    });
    expect(parseFichaAck({ registeredAt: "2026-11-23T19:00:00.000Z" })).toBeNull();
    expect(parseFichaAck(null)).toBeNull();
  });
});

describe("addPrepEntries", () => {
  const at = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();

  it("grava canal e hora por treino e atualiza um toque anterior", () => {
    const log = addPrepEntries({ t1: { via: "copy", at: at(1) } }, ["t1", "t2"], { via: "whatsapp", at: at(5) });
    expect(log).toEqual({ t1: { via: "whatsapp", at: at(5) }, t2: { via: "whatsapp", at: at(5) } });
  });

  it("passa de 200: saem os de toque mais antigo, nunca os recém-tocados", () => {
    const log: Record<string, PrepEntry> = {};
    for (let i = 0; i < PREP_LOG_MAX; i++) log[`t${i}`] = { via: "copy", at: at(i + 10) };
    // Um id novo com hora mais antiga que todos (relógio atrasado) continua.
    const next = addPrepEntries(log, ["novo-a", "novo-b"], { via: "whatsapp", at: at(0) });
    expect(Object.keys(next)).toHaveLength(PREP_LOG_MAX);
    expect(next["novo-a"]).toEqual({ via: "whatsapp", at: at(0) });
    expect(next["novo-b"]).toBeDefined();
    expect(next.t0).toBeUndefined();
    expect(next.t1).toBeUndefined();
    expect(next.t2).toBeDefined();
    expect(next[`t${PREP_LOG_MAX - 1}`]).toBeDefined();
  });
});

describe("isIsoDate", () => {
  it("só data ISO (o Date.parse do V8 aceita 'versão 2')", async () => {
    const { isIsoDate } = await import("./delivery");
    expect(isIsoDate("2026-11-23T21:40:00.000Z")).toBe(true);
    expect(isIsoDate("2026-11-23T18:40:00-03:00")).toBe(true);
    expect(isIsoDate("2026-11-23")).toBe(true);
    expect(isIsoDate("versão 2")).toBe(false);
    expect(isIsoDate("2026-13-45T99:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(20261123)).toBe(false);
  });
});

// ---- U2a: envio do aluno ------------------------------------------------------------------------------
describe("U2a — estado do envio de cada treino", async () => {
  const { prepStatusText, resendCounts, resendEntry, resendNote, sessionDelivery, sessionDeliveryText } = await import("./delivery");
  // Os textos usam o fuso do aparelho: fixa São Paulo (18:40 = 21:40Z).
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  const AT = "2026-11-23T21:40:00.000Z"; // 23/11 às 18:40 em São Paulo
  const NOW = new Date("2026-11-24T12:00:00.000Z");
  const plusDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86_400_000);
  /** Guarda da U2 §5.2: nenhum texto afirma o que aconteceu do outro lado. */
  const FORBIDDEN = /enviado para|aberto|chegou|conferid|recebido/i;

  describe("sessionDelivery (T1–T3)", () => {
    const none = new Set<string>();
    it("sem registro → nao_enviado", () => {
      expect(sessionDelivery({ id: "t1", legacySent: none, log: {} })).toEqual({ kind: "nao_enviado" });
    });
    it("só a lista antiga → iniciado_antigo (sem hora nem canal)", () => {
      expect(sessionDelivery({ id: "t1", legacySent: new Set(["t1"]), log: {} })).toEqual({ kind: "iniciado_antigo" });
    });
    it("log → iniciado com canal e hora", () => {
      expect(sessionDelivery({ id: "t1", legacySent: none, log: { t1: { via: "copy", at: AT } } })).toEqual({ kind: "iniciado", via: "copy", at: AT });
    });
    it("o log vale mais que a lista antiga", () => {
      expect(sessionDelivery({ id: "t1", legacySent: new Set(["t1"]), log: { t1: { via: "whatsapp", at: AT } } })).toEqual({ kind: "iniciado", via: "whatsapp", at: AT });
    });
    it("outro treino no log não conta; nomes herdados do objeto também não", () => {
      expect(sessionDelivery({ id: "t2", legacySent: none, log: { t1: { via: "copy", at: AT } } })).toEqual({ kind: "nao_enviado" });
      expect(sessionDelivery({ id: "constructor", legacySent: none, log: {} })).toEqual({ kind: "nao_enviado" });
    });
  });

  describe("sessionDeliveryText (tabela da U2 §3.2)", () => {
    it("nao_enviado: linha curta sempre, texto longo e ação 'Enviar para C'", () => {
      expect(sessionDeliveryText({ kind: "nao_enviado" }, "Rafael", NOW)).toEqual({
        short: "Ainda não enviado",
        long: "Você ainda não enviou este treino para Rafael.",
        icon: "pendente",
        actionLabel: "Enviar para Rafael",
      });
    });

    it("iniciado pelo WhatsApp (dentro de 7 dias)", () => {
      expect(sessionDeliveryText({ kind: "iniciado", via: "whatsapp", at: AT }, "Rafael", NOW)).toEqual({
        short: "Envio iniciado · 23/11",
        long: "Você tocou em Enviar no WhatsApp em 23/11 às 18:40. O app não vê se a mensagem saiu: se não saiu, envie de novo.",
        icon: "whatsapp",
        actionLabel: "Enviar de novo para Rafael",
      });
    });

    it("iniciado por cópia (dentro de 7 dias)", () => {
      expect(sessionDeliveryText({ kind: "iniciado", via: "copy", at: AT }, "Rafael", NOW)).toEqual({
        short: "Mensagem copiada · 23/11",
        long: "Mensagem copiada em 23/11 às 18:40. Se você não colou na conversa com Rafael, envie de novo.",
        icon: "copia",
        actionLabel: "Enviar de novo para Rafael",
      });
    });

    it("iniciado_antigo: sem linha curta; texto longo e reenvio", () => {
      expect(sessionDeliveryText({ kind: "iniciado_antigo" }, "Rafael", NOW)).toEqual({
        short: null,
        long: "O envio deste treino já foi iniciado neste celular. Se Rafael não recebeu, envie de novo.",
        icon: "whatsapp",
        actionLabel: "Enviar de novo para Rafael",
      });
    });

    it("linha curta só nos últimos 7 dias; o texto longo e a ação continuam depois", () => {
      const d = { kind: "iniciado", via: "whatsapp", at: AT } as const;
      expect(sessionDeliveryText(d, "Rafael", plusDays(AT, 6)).short).toBe("Envio iniciado · 23/11");
      expect(sessionDeliveryText(d, "Rafael", plusDays(AT, 7)).short).toBe("Envio iniciado · 23/11");
      const old = sessionDeliveryText(d, "Rafael", plusDays(AT, 8));
      expect(old.short).toBeNull();
      expect(old.long).toContain("23/11 às 18:40");
      expect(old.actionLabel).toBe("Enviar de novo para Rafael");
      expect(sessionDeliveryText({ ...d, via: "copy" }, "Rafael", plusDays(AT, 8)).short).toBeNull();
    });

    it("hora no futuro (relógio mexido) ainda mostra a linha", () => {
      expect(sessionDeliveryText({ kind: "iniciado", via: "copy", at: AT }, "Rafael", plusDays(AT, -2)).short).toBe("Mensagem copiada · 23/11");
    });

    it("guarda: nenhum texto afirma envio, abertura, chegada, recebimento ou conferência", () => {
      const states = [{ kind: "nao_enviado" }, { kind: "iniciado_antigo" }, { kind: "iniciado", via: "whatsapp", at: AT }, { kind: "iniciado", via: "copy", at: AT }] as const;
      for (const d of states) {
        const t = sessionDeliveryText(d, "Rafael", NOW);
        for (const s of [t.short ?? "", t.long, t.actionLabel]) expect(s).not.toMatch(FORBIDDEN);
      }
    });
  });

  describe("prepStatusText", () => {
    it("aluno × WhatsApp e cópia", () => {
      expect(prepStatusText("whatsapp", AT, "Rafael", "aluno")).toBe("Envio iniciado às 18:40. Se a mensagem não saiu no WhatsApp, envie de novo.");
      expect(prepStatusText("copy", AT, "Rafael", "aluno")).toBe("Mensagem copiada às 18:40. Cole na conversa com Rafael.");
    });
    it("personal × WhatsApp e cópia", () => {
      expect(prepStatusText("whatsapp", AT, "Juliana", "personal")).toBe("Envio iniciado às 18:40. Confira na conversa com Juliana se a mensagem saiu.");
      expect(prepStatusText("copy", AT, "Juliana", "personal")).toBe("Mensagem copiada às 18:40. Cole na conversa com Juliana.");
    });
    it("guarda", () => {
      for (const via of ["whatsapp", "copy"] as const) for (const side of ["aluno", "personal"] as const) expect(prepStatusText(via, AT, "Rafael", side)).not.toMatch(FORBIDDEN);
    });
  });

  describe("resendNote", () => {
    it("sem toque → null", () => {
      expect(resendNote([], "Rafael")).toBeNull();
    });
    it("com hora: vale o toque mais recente entre os treinos mostrados", () => {
      expect(resendNote([{ via: "copy", at: "2026-11-20T10:00:00.000Z" }, { via: "whatsapp", at: AT }, "antigo"], "Rafael")).toBe(
        "Envio já iniciado em 23/11 às 18:40. Enviar de novo não duplica nada no app de Rafael.",
      );
    });
    it("só a lista antiga (sem hora)", () => {
      expect(resendNote(["antigo", "antigo"], "Rafael")).toBe("O envio já foi iniciado antes. Enviar de novo não duplica nada no app de Rafael.");
    });
    it("guarda", () => {
      expect(resendNote([{ via: "copy", at: AT }], "Rafael")).not.toMatch(FORBIDDEN);
      expect(resendNote(["antigo"], "Rafael")).not.toMatch(FORBIDDEN);
    });
  });

  describe("apoio do diálogo e da medição", () => {
    it("resendEntry: toque com hora, 'antigo' ou nada", () => {
      expect(resendEntry({ kind: "iniciado", via: "copy", at: AT })).toEqual({ via: "copy", at: AT });
      expect(resendEntry({ kind: "iniciado_antigo" })).toBe("antigo");
      expect(resendEntry({ kind: "nao_enviado" })).toBeNull();
    });
    it("resendCounts: resend quando algum treino já tinha toque; novos = os sem toque", () => {
      expect(resendCounts([{ kind: "nao_enviado" }, { kind: "nao_enviado" }])).toEqual({ resend: false, novos: 2 });
      expect(resendCounts([{ kind: "nao_enviado" }, { kind: "iniciado_antigo" }])).toEqual({ resend: true, novos: 1 });
      expect(resendCounts([{ kind: "iniciado", via: "whatsapp", at: AT }])).toEqual({ resend: true, novos: 0 });
    });
  });
});

// ---- U2b: envio da ficha (aparelho do personal) -------------------------------------------------------
describe("U2b — envio da ficha e da dieta", async () => {
  const { fichaDelivery, fichaDeliveryLines, fichaSendSituation, prepStatusText } = await import("./delivery");
  type Item = import("./delivery").ItemDelivery;
  type FD = import("./delivery").FichaDelivery;
  // Os textos usam o fuso do aparelho: fixa São Paulo (14:02 = 17:02Z).
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  const SINCE = "2026-11-15T12:00:00.000Z"; // marcador: o registro começou aqui
  const OLD = "2026-11-01T13:00:00.000Z"; // conteúdo anterior ao marcador
  const V1 = "2026-11-19T13:00:00.000Z"; // ficha que foi no envio
  const V2 = "2026-11-21T13:00:00.000Z"; // ficha editada depois
  const D1 = "2026-11-18T13:00:00.000Z"; // dieta que foi no envio
  const D2 = "2026-11-22T13:00:00.000Z"; // dieta editada depois
  const SENT = "2026-11-20T17:02:00.000Z"; // toque: 20/11 às 14:02 em São Paulo
  const rec = (over: Partial<import("./delivery").FichaSendRecord> = {}) => ({ at: SENT, via: "copy" as const, programAt: V1, dietAt: D1, ...over });
  const fd = (programAt: string | null, dietAt: string | null, record: ReturnType<typeof rec> | null, since: string | null = SINCE) =>
    fichaDelivery({ current: { programAt, dietAt }, record, trackingSince: since });
  const lines = (d: FD) => fichaDeliveryLines(d, "Juliana");
  const of = (program: Item, diet: Item = { kind: "sem_item" }, staleEcho: FD["staleEcho"] = null): FD => ({ program, diet, staleEcho });

  describe("fichaDelivery", () => {
    it("sem ficha ativa e sem dieta → sem_item nos dois", () => {
      expect(fd(null, null, rec())).toEqual({ program: { kind: "sem_item" }, diet: { kind: "sem_item" }, staleEcho: null });
    });

    it("enviado sem eco: o último envio levou esta versão (hora e canal do toque)", () => {
      expect(fd(V1, D1, rec())).toEqual({ program: { kind: "enviado", at: SENT, via: "copy" }, diet: { kind: "enviado", at: SENT, via: "copy" }, staleEcho: null });
      expect(fd(V1, null, rec({ via: "whatsapp", dietAt: null })).program).toEqual({ kind: "enviado", at: SENT, via: "whatsapp" });
    });

    it("mudou com registro: editada depois do envio, mesmo com o conteúdo anterior ao marcador", () => {
      expect(fd(V2, D1, rec()).program).toEqual({ kind: "mudou", sentAt: SENT, studentVersion: null });
      expect(fd(OLD, D2, rec({ programAt: "2026-10-01T00:00:00.000Z" }), SINCE)).toMatchObject({ program: { kind: "mudou" }, diet: { kind: "mudou", sentAt: SENT } });
    });

    it("nao_enviado: sem registro desta versão e a versão nasceu depois do marcador (igual ao marcador conta)", () => {
      expect(fd(V2, null, null).program).toEqual({ kind: "nao_enviado" });
      expect(fd(SINCE, null, null).program).toEqual({ kind: "nao_enviado" });
    });

    it("desconhecido: versão anterior ao marcador, sem marcador ou data ilegível (nada é afirmado)", () => {
      expect(fd(OLD, null, null).program).toEqual({ kind: "desconhecido" });
      expect(fd(V2, null, null, null).program).toEqual({ kind: "desconhecido" });
      expect(fd("ontem", null, null).program).toEqual({ kind: "desconhecido" });
      expect(fd(V2, null, null, "lixo").program).toEqual({ kind: "desconhecido" });
    });

    it("aluno só com dieta", () => {
      expect(fd(null, D1, rec({ programAt: null }))).toEqual({ program: { kind: "sem_item" }, diet: { kind: "enviado", at: SENT, via: "copy" }, staleEcho: null });
      expect(fd(null, D2, null).diet).toEqual({ kind: "nao_enviado" });
    });

    it("item que não foi no último envio segue as regras de quem não tem registro", () => {
      // O envio levou só a ficha; a dieta foi montada depois do marcador.
      expect(fd(V1, D2, rec({ dietAt: null })).diet).toEqual({ kind: "nao_enviado" });
      expect(fd(V1, OLD, rec({ dietAt: null })).diet).toEqual({ kind: "desconhecido" });
    });

    it("reenvio idêntico continua 'enviado', com a hora do último toque (a versão é o conteúdo, não a hora do pacote)", () => {
      const first = rec({ at: SENT });
      const again = rec({ at: "2026-11-21T09:30:00.000Z", via: "whatsapp" });
      expect(fd(V1, D1, first).program.kind).toBe("enviado");
      expect(fd(V1, D1, again).program).toEqual({ kind: "enviado", at: "2026-11-21T09:30:00.000Z", via: "whatsapp" });
      expect(lines(fd(V1, D1, again)).page).toBe("Envio da ficha atual iniciado em 21/11 às 06:30.");
    });

    it("sem eco nesta etapa: staleEcho é null", () => {
      expect(fd(V2, D2, rec()).staleEcho).toBeNull();
    });
  });

  describe("fichaDeliveryLines", () => {
    it("manchete da ficha: textos exatos", () => {
      expect(lines(fd(V1, null, rec({ dietAt: null })))).toEqual({
        page: "Mensagem com a ficha atual copiada em 20/11 às 14:02.",
        pageIcon: "copia",
        dialog: ["Mensagem com a ficha atual copiada em 20/11 às 14:02.", "A confirmação aparece quando Juliana mandar o próximo treino."],
        dialogIcon: "copia",
      });
      expect(lines(fd(V1, null, rec({ via: "whatsapp", dietAt: null }))).page).toBe("Envio da ficha atual iniciado em 20/11 às 14:02.");
      expect(lines(fd(V1, null, rec({ via: "whatsapp", dietAt: null }))).pageIcon).toBe("whatsapp");
      expect(lines(fd(V2, D1, rec()))).toEqual({ page: "A ficha mudou depois do último envio (20/11).", pageIcon: "pendente", dialog: ["A ficha mudou depois do último envio (20/11)."], dialogIcon: "pendente" });
      expect(lines(fd(V2, D2, rec())).page).toBe("A ficha e a dieta mudaram depois do último envio (20/11).");
      expect(lines(fd(V2, D2, rec())).dialog).toHaveLength(1);
      expect(lines(fd(V2, null, null)).page).toBe("A versão atual da ficha ainda não foi para o app de Juliana.");
    });

    it("sem ficha, a manchete vem da dieta ('a dieta' no lugar de 'a ficha'), sem repetir no detalhe", () => {
      expect(lines(fd(null, D1, rec({ programAt: null }))).dialog).toEqual(["Mensagem com a dieta atual copiada em 20/11 às 14:02.", "A confirmação aparece quando Juliana mandar o próximo treino."]);
      expect(lines(fd(null, D2, rec({ programAt: null }))).dialog).toEqual(["A dieta mudou depois do último envio (20/11)."]);
      expect(lines(fd(null, D2, null)).dialog).toEqual(["A versão atual da dieta ainda não foi para o app de Juliana."]);
    });

    it("detalhe da dieta: mudou (e a ficha não) e ainda não foi", () => {
      expect(lines(fd(V2, D2, null)).dialog).toEqual(["A versão atual da ficha ainda não foi para o app de Juliana.", "A dieta atual ainda não foi para o app de Juliana."]);
      const nova = lines(fd(V2, D2, rec({ programAt: null })));
      expect(nova.dialog).toEqual(["A versão atual da ficha ainda não foi para o app de Juliana.", "A dieta mudou depois do último envio."]);
      expect(nova.page).toBe("A versão atual da ficha ainda não foi para o app de Juliana.");
    });

    it("ficha em dia e dieta pendente: a página mostra a dieta (não diz 'em dia' com a dieta para trás)", () => {
      const l = lines(fd(V1, D2, rec()));
      expect(l.dialog).toEqual(["Mensagem com a ficha atual copiada em 20/11 às 14:02.", "A dieta mudou depois do último envio."]);
      expect(l.dialogIcon).toBe("copia");
      expect(l.page).toBe("A dieta mudou depois do último envio.");
      expect(l.pageIcon).toBe("pendente");
      expect(lines(fd(V1, D2, rec({ dietAt: null }))).page).toBe("A dieta atual ainda não foi para o app de Juliana.");
    });

    it("desconhecido: nenhuma linha; com a dieta pendente, só a linha da dieta", () => {
      expect(lines(fd(OLD, null, null))).toEqual({ page: null, pageIcon: null, dialog: [], dialogIcon: null });
      expect(lines(fd(OLD, OLD, null))).toEqual({ page: null, pageIcon: null, dialog: [], dialogIcon: null });
      expect(lines(fd(null, null, null))).toEqual({ page: null, pageIcon: null, dialog: [], dialogIcon: null });
      expect(lines(fd(OLD, D2, null))).toEqual({ page: "A dieta atual ainda não foi para o app de Juliana.", pageIcon: "pendente", dialog: ["A dieta atual ainda não foi para o app de Juliana."], dialogIcon: "pendente" });
    });

    it("estados do eco (U2c) já têm texto: confirmado, versão do aluno e eco antigo", () => {
      const ack = { kind: "confirmado" as const, ackAt: "2026-11-22T15:00:00.000Z" };
      expect(lines(of(ack, ack)).page).toBe("Juliana está com a ficha e a dieta atuais. Confirmado pelo treino recebido em 22/11.");
      expect(lines(of(ack)).page).toBe("Juliana está com a ficha atual. Confirmado pelo treino recebido em 22/11.");
      expect(lines(of(ack)).pageIcon).toBe("confirmado");
      expect(lines(of(ack, { kind: "mudou", sentAt: SENT, studentVersion: null })).dialog).toEqual([
        "Juliana está com a ficha atual. Confirmado pelo treino recebido em 22/11.",
        "A dieta mudou depois do último envio.",
      ]);
      expect(lines(of({ kind: "mudou", sentAt: null, studentVersion: "2026-11-10T13:00:00.000Z" })).page).toBe("Juliana está com a versão de 10/11. A ficha mudou depois disso.");
      const stale = of({ kind: "enviado", at: SENT, via: "whatsapp" }, { kind: "sem_item" }, { registeredAt: "2026-11-25T15:00:00.000Z", version: "2026-11-10T13:00:00.000Z" });
      expect(lines(stale).dialog).toEqual(["Envio da ficha atual iniciado em 20/11 às 14:02.", "O treino recebido em 25/11 ainda veio com a versão de 10/11."]);
    });

    it("todas as combinações: no máximo 2 linhas no diálogo, a página com uma linha, nada com 'desconhecido' na ficha e na dieta, e nenhuma palavra proibida", () => {
      const items: Item[] = [
        { kind: "sem_item" },
        { kind: "confirmado", ackAt: "2026-11-22T15:00:00.000Z" },
        { kind: "enviado", at: SENT, via: "whatsapp" },
        { kind: "enviado", at: SENT, via: "copy" },
        { kind: "mudou", sentAt: SENT, studentVersion: null },
        { kind: "mudou", sentAt: null, studentVersion: "2026-11-10T13:00:00.000Z" },
        { kind: "nao_enviado" },
        { kind: "desconhecido" },
      ];
      const PROIBIDO = /enviada para|aberto no WhatsApp|chegou|Nenhum envio/i;
      for (const p of items)
        for (const d of items)
          for (const stale of [null, { registeredAt: "2026-11-25T15:00:00.000Z", version: "2026-11-10T13:00:00.000Z" }]) {
            const l = lines(of(p, d, stale));
            expect(l.dialog.length).toBeLessThanOrEqual(2);
            if (l.page) expect(l.page).not.toContain("\n");
            if (l.page) expect(l.dialog).toContain(l.page);
            expect(Boolean(l.page)).toBe(Boolean(l.pageIcon));
            for (const t of [l.page, ...l.dialog]) if (t) expect(t).not.toMatch(PROIBIDO);
            if ((p.kind === "desconhecido" || p.kind === "sem_item") && (d.kind === "desconhecido" || d.kind === "sem_item")) expect(l.page).toBeNull();
          }
      for (const via of ["whatsapp", "copy"] as const) expect(prepStatusText(via, SENT, "Juliana", "personal")).not.toMatch(PROIBIDO);
    });

    it("textos do toque no aparelho do personal", () => {
      expect(prepStatusText("whatsapp", SENT, "Juliana", "personal")).toBe("Envio iniciado às 14:02. Confira na conversa com Juliana se a mensagem saiu.");
      expect(prepStatusText("copy", SENT, "Juliana", "personal")).toBe("Mensagem copiada às 14:02. Cole na conversa com Juliana.");
    });
  });

  describe("fichaSendSituation (medição, situação de antes do toque)", () => {
    const enviado: Item = { kind: "enviado", at: SENT, via: "copy" };
    const mudou: Item = { kind: "mudou", sentAt: SENT, studentVersion: null };
    it("nunca: nada do que vai tinha ido", () => {
      expect(fichaSendSituation(of({ kind: "nao_enviado" }))).toBe("nunca");
      expect(fichaSendSituation(of({ kind: "nao_enviado" }, { kind: "nao_enviado" }))).toBe("nunca");
    });
    it("repetido: tudo o que vai já tinha ido (ou voltou confirmado)", () => {
      expect(fichaSendSituation(of(enviado))).toBe("repetido");
      expect(fichaSendSituation(of(enviado, { kind: "confirmado", ackAt: SENT }))).toBe("repetido");
    });
    it("mudou: algo mudou ou entrou depois do último envio", () => {
      expect(fichaSendSituation(of(mudou))).toBe("mudou");
      expect(fichaSendSituation(of(enviado, mudou))).toBe("mudou");
      expect(fichaSendSituation(of(enviado, { kind: "nao_enviado" }))).toBe("mudou");
      expect(fichaSendSituation(of({ kind: "desconhecido" }, mudou))).toBe("mudou");
    });
    it("sem_info: conteúdo anterior ao registro, ou nada a enviar", () => {
      expect(fichaSendSituation(of({ kind: "desconhecido" }))).toBe("sem_info");
      expect(fichaSendSituation(of({ kind: "desconhecido" }, { kind: "nao_enviado" }))).toBe("sem_info");
      expect(fichaSendSituation(of({ kind: "sem_item" }))).toBe("sem_info");
    });
  });
});

describe("U2d — /receber sem 'atualizado' falso", async () => {
  const { receivePreview, receiveResult, sameSession, seriesText } = await import("./delivery");
  type S = import("./types").Session;
  const base: S = {
    id: "t1",
    userId: "aluno-local",
    programId: "p1",
    dayKey: "A",
    startedAt: "2026-11-23T00:47:56.006Z",
    finishedAt: "2026-11-23T00:48:00.270Z",
    exercises: [{ uid: "e1", exerciseId: "leg_press", name: "Leg press 45°", sets: [{ loadKg: 80, reps: 8, done: true }, { loadKg: 80, reps: null, done: false }] }],
    volumeKg: 640,
    prs: [],
  };

  describe("sameSession", () => {
    it("não depende da ordem das chaves", () => {
      const reordered = JSON.parse(JSON.stringify({ prs: [], volumeKg: 640, exercises: base.exercises, finishedAt: base.finishedAt, startedAt: base.startedAt, dayKey: "A", programId: "p1", userId: "aluno-local", id: "t1" })) as S;
      expect(sameSession(base, reordered)).toBe(true);
    });
    it("ignora userId (no painel o treino fica com o id do aluno do personal) e campos undefined ou null", () => {
      expect(sameSession(base, { ...base, userId: "s1" })).toBe(true);
      expect(sameSession(base, { ...base, note: undefined, feeling: undefined })).toBe(true);
      // O link tira os nulos: a série sem repetição chega sem a chave.
      const fromLink = { ...base, exercises: [{ ...base.exercises[0]!, sets: [{ loadKg: 80, reps: 8, done: true }, { loadKg: 80, done: false }] }] } as S;
      expect(sameSession(base, fromLink)).toBe(true);
    });
    it("anotação, carga, repetição ou ordem das séries diferentes → false", () => {
      expect(sameSession(base, { ...base, note: "joelho ok" })).toBe(false);
      expect(sameSession({ ...base, note: "a" }, { ...base, note: "b" })).toBe(false);
      expect(sameSession(base, { ...base, exercises: [{ ...base.exercises[0]!, sets: [{ loadKg: 82.5, reps: 8, done: true }, base.exercises[0]!.sets[1]!] }] })).toBe(false);
      expect(sameSession(base, { ...base, exercises: [{ ...base.exercises[0]!, sets: [...base.exercises[0]!.sets].reverse() }] })).toBe(false);
      expect(sameSession(base, { ...base, finishedAt: "2026-11-23T01:00:00.000Z" })).toBe(false);
    });
  });

  it("seriesText: '1 série' no singular", () => {
    expect(seriesText(1)).toBe("1 série");
    expect(seriesText(0)).toBe("0 séries");
    expect(seriesText(3)).toBe("3 séries");
  });

  describe("receivePreview (antes de registrar)", () => {
    it("sem saber o aluno, ou nenhum no painel: só a contagem", () => {
      expect(receivePreview(1, null, "Juliana")).toEqual({ title: "1 treino para registrar", line: null, allPresent: false });
      expect(receivePreview(3, 0, "Juliana")).toEqual({ title: "3 treinos para registrar", line: null, allPresent: false });
    });
    it("alguns no painel: os novos no título e a linha dos que já estão", () => {
      expect(receivePreview(2, 1, "Juliana")).toEqual({ title: "1 treino novo para registrar", line: "1 já está no painel de Juliana.", allPresent: false });
      expect(receivePreview(5, 2, "Juliana")).toEqual({ title: "3 treinos novos para registrar", line: "2 já estão no painel de Juliana.", allPresent: false });
    });
    it("todos no painel: 'já estão no painel' e o botão vira 'Registrar de novo'", () => {
      expect(receivePreview(2, 2, "Juliana")).toEqual({ title: "Estes treinos já estão no painel de Juliana", line: null, allPresent: true });
      expect(receivePreview(1, 1, "Juliana")).toEqual({ title: "Este treino já está no painel de Juliana", line: null, allPresent: true });
    });
  });

  describe("receiveResult (depois de registrar)", () => {
    it("título no singular ou no plural", () => {
      expect(receiveResult({ added: 1, updated: 0, same: 0 }, "Juliana").title).toBe("Treino de Juliana registrado.");
      expect(receiveResult({ added: 2, updated: 0, same: 0 }, "Juliana").title).toBe("Treinos de Juliana registrados.");
    });
    it("corpo só com as partes diferentes de zero, unidas por ', ' e ' e '", () => {
      expect(receiveResult({ added: 1, updated: 0, same: 0 }, "Juliana").body).toBe("1 treino novo. Frequência, cargas e o relatório de evolução já contam com ele.");
      expect(receiveResult({ added: 2, updated: 0, same: 1 }, "Juliana").body).toBe("2 treinos novos e 1 que já estava no painel. Frequência, cargas e o relatório de evolução já contam com eles.");
      expect(receiveResult({ added: 1, updated: 1, same: 2 }, "Juliana").body).toBe("1 treino novo, 1 atualizado e 2 que já estavam no painel. Frequência, cargas e o relatório de evolução já contam com eles.");
      expect(receiveResult({ added: 0, updated: 2, same: 0 }, "Juliana").body).toBe("2 atualizados. Frequência, cargas e o relatório de evolução já contam com eles.");
    });
    it("nada novo nem mudado: 'Nada novo', nunca '0 treinos novos' nem 'atualizado'", () => {
      expect(receiveResult({ added: 0, updated: 0, same: 1 }, "Juliana")).toEqual({
        title: "Treino de Juliana registrado.",
        body: "Nada novo: este treino já estava no painel. Frequência, cargas e o relatório de evolução já contam com ele.",
      });
      expect(receiveResult({ added: 0, updated: 0, same: 3 }, "Juliana").body).toBe("Nada novo: estes treinos já estavam no painel. Frequência, cargas e o relatório de evolução já contam com eles.");
      for (const r of [
        { added: 0, updated: 0, same: 1 },
        { added: 1, updated: 0, same: 4 },
        { added: 0, updated: 1, same: 1 },
      ]) {
        expect(receiveResult(r, "Juliana").body).not.toMatch(/\b0 /);
        if (!r.updated) expect(receiveResult(r, "Juliana").body).not.toMatch(/atualizad/);
      }
    });
  });
});

describe("U2c — eco da versão", async () => {
  const { fichaDelivery, fichaDeliveryLines, fichaEchoOf, fichaSendSituation, fichaVersao } = await import("./delivery");
  type Rec = import("./delivery").FichaSendRecord;
  type Ack = import("./delivery").FichaAck;
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  const SINCE = "2026-11-01T12:00:00.000Z";
  const V0 = "2026-11-05T13:00:00.000Z"; // versão antiga da ficha
  const V1 = "2026-11-10T13:00:00.000Z"; // ficha que foi no envio (10/11)
  const V2 = "2026-11-21T13:00:00.000Z"; // ficha editada depois
  const D1 = "2026-11-10T14:00:00.000Z";
  const D2 = "2026-11-22T13:00:00.000Z";
  const SENT = "2026-11-20T17:02:00.000Z"; // toque: 20/11 às 14:02
  const REG = "2026-11-22T15:00:00.000Z"; // personal registrou o treino: 22/11
  const rec = (over: Partial<Rec> = {}): Rec => ({ at: SENT, via: "copy", programAt: V1, dietAt: D1, ...over });
  const ack = (over: Partial<Ack> = {}): Ack => ({ programAt: V1, dietAt: D1, treinosSentAt: "2026-11-22T10:00:00.000Z", registeredAt: REG, ...over });
  const fd = (programAt: string | null, dietAt: string | null, record: Rec | null, a: Ack | null) => fichaDelivery({ current: { programAt, dietAt }, record, ack: a, trackingSince: SINCE });
  const lines = (d: ReturnType<typeof fd>) => fichaDeliveryLines(d, "Juliana");

  describe("fichaDelivery com eco", () => {
    it("confirmado (I2): o treino recebido trouxe a versão atual, com a data do registro", () => {
      expect(fd(V1, D1, rec(), ack())).toEqual({ program: { kind: "confirmado", ackAt: REG }, diet: { kind: "confirmado", ackAt: REG }, staleEcho: null });
      expect(lines(fd(V1, D1, rec(), ack()))).toEqual({
        page: "Juliana está com a ficha e a dieta atuais. Confirmado pelo treino recebido em 22/11.",
        pageIcon: "confirmado",
        dialog: ["Juliana está com a ficha e a dieta atuais. Confirmado pelo treino recebido em 22/11."],
        dialogIcon: "confirmado",
      });
      expect(lines(fd(V1, null, rec({ dietAt: null }), ack({ dietAt: undefined }))).page).toBe("Juliana está com a ficha atual. Confirmado pelo treino recebido em 22/11.");
    });

    it("confirmado vale mesmo com registro de envio mais antigo (de outro conteúdo) ou sem registro", () => {
      expect(fd(V1, null, rec({ programAt: V0 }), ack()).program).toEqual({ kind: "confirmado", ackAt: REG });
      expect(fd(V1, null, null, ack()).program).toEqual({ kind: "confirmado", ackAt: REG });
    });

    it("reenvio idêntico continua 'enviado' e um eco igual dá 'confirmado' (por isso a versão é o conteúdo)", () => {
      const again = rec({ at: "2026-11-21T09:30:00.000Z", via: "whatsapp" });
      expect(fd(V1, null, again, null).program.kind).toBe("enviado");
      expect(fd(V1, null, again, ack()).program.kind).toBe("confirmado");
    });

    it("mudou com registro e eco: vale a data do último envio; a versão do aluno vai junto", () => {
      expect(fd(V2, null, rec(), ack()).program).toEqual({ kind: "mudou", sentAt: SENT, studentVersion: V1 });
      expect(lines(fd(V2, null, rec(), ack())).page).toBe("A ficha mudou depois do último envio (20/11).");
    });

    it("mudou só com eco (sem registro desta ficha): 'Juliana está com a versão de 10/11'", () => {
      expect(fd(V2, null, null, ack()).program).toEqual({ kind: "mudou", sentAt: null, studentVersion: V1 });
      expect(lines(fd(V2, null, null, ack())).page).toBe("Juliana está com a versão de 10/11. A ficha mudou depois disso.");
      // O último envio levou só a dieta: a ficha segue pelo eco.
      expect(fd(V2, D1, rec({ programAt: null }), ack()).program).toEqual({ kind: "mudou", sentAt: null, studentVersion: V1 });
    });

    it("ficha confirmada e dieta mudou: a manchete confirma a ficha e o detalhe pede o envio da dieta", () => {
      const d = fd(V1, D2, rec(), ack());
      expect(d.program).toEqual({ kind: "confirmado", ackAt: REG });
      expect(d.diet).toEqual({ kind: "mudou", sentAt: SENT, studentVersion: D1 });
      const l = lines(d);
      expect(l.dialog).toEqual(["Juliana está com a ficha atual. Confirmado pelo treino recebido em 22/11.", "A dieta mudou depois do último envio."]);
      expect(l.page).toBe("A dieta mudou depois do último envio.");
    });

    it("staleEcho: ficha enviada, e o treino registrado DEPOIS do envio ainda veio com a versão velha", () => {
      const d = fd(V2, null, rec({ programAt: V2, dietAt: null }), ack({ programAt: V1, dietAt: undefined, registeredAt: "2026-11-25T15:00:00.000Z" }));
      expect(d.program).toEqual({ kind: "enviado", at: SENT, via: "copy" });
      expect(d.staleEcho).toEqual({ registeredAt: "2026-11-25T15:00:00.000Z", version: V1 });
      expect(lines(d).dialog).toEqual(["Mensagem com a ficha atual copiada em 20/11 às 14:02.", "O treino recebido em 25/11 ainda veio com a versão de 10/11."]);
      // A página continua com a manchete (o envio foi feito; o detalhe é do diálogo).
      expect(lines(d).page).toBe("Mensagem com a ficha atual copiada em 20/11 às 14:02.");
    });

    it("sem staleEcho quando o treino foi registrado ANTES do envio, sem versão no eco, ou com data ilegível", () => {
      expect(fd(V2, null, rec({ programAt: V2, dietAt: null }), ack({ registeredAt: "2026-11-19T10:00:00.000Z" })).staleEcho).toBeNull();
      expect(fd(V2, null, rec({ programAt: V2, dietAt: null }), ack({ programAt: undefined, registeredAt: "2026-11-25T15:00:00.000Z" })).staleEcho).toBeNull();
      expect(fd(V2, null, rec({ programAt: V2, dietAt: null }), ack({ registeredAt: "x" })).staleEcho).toBeNull();
      expect(lines(fd(V2, null, rec({ programAt: V2, dietAt: null }), ack({ registeredAt: "2026-11-19T10:00:00.000Z" }))).dialog[1]).toBe("A confirmação aparece quando Juliana mandar o próximo treino.");
    });

    it("aluno só com dieta: o eco da dieta confirma, e o eco antigo vale para a dieta", () => {
      expect(fd(null, D1, rec({ programAt: null }), ack({ programAt: undefined })).diet).toEqual({ kind: "confirmado", ackAt: REG });
      expect(lines(fd(null, D1, rec({ programAt: null }), ack({ programAt: undefined }))).page).toBe("Juliana está com a dieta atual. Confirmado pelo treino recebido em 22/11.");
      const stale = fd(null, D2, rec({ programAt: null, dietAt: D2 }), ack({ programAt: undefined, dietAt: D1, registeredAt: "2026-11-25T15:00:00.000Z" }));
      expect(stale.staleEcho).toEqual({ registeredAt: "2026-11-25T15:00:00.000Z", version: D1 });
    });

    it("sem eco (ack ausente ou null), tudo como antes", () => {
      expect(fichaDelivery({ current: { programAt: V1, dietAt: null }, record: rec(), trackingSince: SINCE }).program.kind).toBe("enviado");
      expect(fd(V1, null, rec(), null).staleEcho).toBeNull();
    });

    it("medição: confirmado conta como 'repetido'", () => {
      expect(fichaSendSituation(fd(V1, D1, rec(), ack()))).toBe("repetido");
      expect(fichaSendSituation(fd(V2, null, null, ack()))).toBe("mudou");
    });
  });

  describe("fichaVersao (treinos_link_received.ficha_versao)", () => {
    it("atual, anterior e sem_info", () => {
      expect(fichaVersao({ programAt: V1, dietAt: D1 }, { programAt: V1, dietAt: D1 })).toBe("atual");
      expect(fichaVersao({ programAt: V1 }, { programAt: V1, dietAt: D2 })).toBe("atual");
      expect(fichaVersao({ programAt: V1, dietAt: D1 }, { programAt: V1, dietAt: D2 })).toBe("anterior");
      expect(fichaVersao({ programAt: V1 }, { programAt: V2, dietAt: null })).toBe("anterior");
      expect(fichaVersao({ dietAt: D1 }, { programAt: null, dietAt: null })).toBe("anterior");
      expect(fichaVersao(undefined, { programAt: V1, dietAt: null })).toBe("sem_info");
      expect(fichaVersao({}, { programAt: V1, dietAt: null })).toBe("sem_info");
    });
  });

  describe("fichaEchoOf (quando o bloco ficha vale como eco)", () => {
    const packet = { ficha: { programAt: V1, dietAt: D1 }, coachId: "c1", studentRef: "s1", sentAt: "2026-11-22T10:00:00.000Z" };
    it("mesmo personal e mesmo aluno: as versões legíveis", () => {
      expect(fichaEchoOf(packet, "s1", "c1")).toEqual({ programAt: V1, dietAt: D1 });
      expect(fichaEchoOf({ ...packet, ficha: { programAt: V1, dietAt: "versão 2" } }, "s1", "c1")).toEqual({ programAt: V1 });
    });
    it("sem bloco, outro personal, outro aluno, sem personal, sentAt ilegível ou nenhuma versão → null", () => {
      expect(fichaEchoOf({ ...packet, ficha: undefined }, "s1", "c1")).toBeNull();
      expect(fichaEchoOf(packet, "s1", "c2")).toBeNull();
      expect(fichaEchoOf(packet, "s2", "c1")).toBeNull();
      expect(fichaEchoOf(packet, "s1", undefined)).toBeNull();
      expect(fichaEchoOf({ ...packet, sentAt: "ontem" }, "s1", "c1")).toBeNull();
      expect(fichaEchoOf({ ...packet, ficha: { programAt: "x" } }, "s1", "c1")).toBeNull();
    });
  });
});
