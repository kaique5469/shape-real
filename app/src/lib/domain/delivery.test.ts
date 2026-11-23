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
