import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDeclaracoes,
  dispensado,
  lembreteDeCopia,
  paraEnviar,
  parseDeclaracoes,
  prepStatusText,
  PREP_LOG_MAX,
  resendCounts,
  resendEntry,
  rotuloDoEnvio,
  sessionDelivery,
  sessionDeliveryText,
  textoDoLote,
  TEXTO_REGISTRO_FALHOU,
  type DeclaracaoEnvio,
  type PrepEntry,
} from "./delivery";

// R3-3: "para enviar", "preparado sem confirmação" e "enviado (declarado)". Estado nunca afirmado sem evidência:
// "Já enviei" é declaração da pessoa, nunca "recebido".

const tz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const COPIOU = "2026-11-23T21:40:00.000Z"; // 23/11 18:40 em São Paulo
const DEPOIS = "2026-11-23T22:00:00.000Z"; // 19:00
const ANTES = "2026-11-23T20:00:00.000Z";
const NOW = new Date("2026-11-24T12:00:00.000Z");
const none = new Set<string>();
/** Guarda da U2 §5.2 (a mesma de delivery.test.ts). */
const FORBIDDEN = /enviado para|aberto|chegou|conferid|recebido/i;
const log = (via: PrepEntry["via"], at = COPIOU): Record<string, PrepEntry> => ({ t1: { via, at } });

describe("declarações (`:decl`)", () => {
  it("parseDeclaracoes: só datas ISO legíveis; lixo vira vazio (nunca afirma)", () => {
    expect(parseDeclaracoes(null)).toEqual({});
    expect(parseDeclaracoes("x")).toEqual({});
    expect(parseDeclaracoes({ t1: { enviei: DEPOIS }, t2: { dispensei: "ontem" }, t3: "x", "": { enviei: DEPOIS } })).toEqual({ t1: { enviei: DEPOIS } });
    expect(parseDeclaracoes({ t1: { enviei: DEPOIS, dispensei: COPIOU, outra: 1 } })).toEqual({ t1: { enviei: DEPOIS, dispensei: COPIOU } });
  });

  it("addDeclaracoes: soma sem apagar a outra declaração e limita o tamanho (saem as mais antigas)", () => {
    let d: Record<string, DeclaracaoEnvio> = addDeclaracoes({}, ["t1"], "dispensei", COPIOU);
    d = addDeclaracoes(d, ["t1"], "enviei", DEPOIS);
    expect(d.t1).toEqual({ dispensei: COPIOU, enviei: DEPOIS });
    let grande: Record<string, DeclaracaoEnvio> = {};
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < PREP_LOG_MAX + 5; i++) grande = addDeclaracoes(grande, [`t${i}`], "enviei", new Date(base + i * 60_000).toISOString());
    expect(Object.keys(grande)).toHaveLength(PREP_LOG_MAX);
    expect(grande.t0).toBeUndefined();
    expect(grande[`t${PREP_LOG_MAX + 4}`]).toBeDefined();
  });
});

describe("sessionDelivery com declarações", () => {
  it("'Já enviei' depois do toque → declarado, com o toque guardado", () => {
    expect(sessionDelivery({ id: "t1", legacySent: new Set(["t1"]), log: log("copy"), decl: { t1: { enviei: DEPOIS } } })).toEqual({ kind: "declarado", at: DEPOIS, prep: { via: "copy", at: COPIOU } });
  });

  it("copiar de novo depois de 'Já enviei' volta a 'preparado' (vale o fato mais novo)", () => {
    expect(sessionDelivery({ id: "t1", legacySent: none, log: log("copy", DEPOIS), decl: { t1: { enviei: ANTES } } })).toEqual({ kind: "iniciado", via: "copy", at: DEPOIS });
  });

  it("'Já enviei' sem toque (declaração direta) → declarado sem toque", () => {
    expect(sessionDelivery({ id: "t1", legacySent: none, log: {}, decl: { t1: { enviei: DEPOIS } } })).toEqual({ kind: "declarado", at: DEPOIS, prep: null });
  });

  it("dispensar nunca vira confirmação: continua 'preparado'", () => {
    const d = sessionDelivery({ id: "t1", legacySent: new Set(["t1"]), log: log("copy"), decl: { t1: { dispensei: DEPOIS } } });
    expect(d).toEqual({ kind: "iniciado", via: "copy", at: COPIOU });
    expect(dispensado("t1", log("copy"), { t1: { dispensei: DEPOIS } })).toBe(true);
    // Copiou de novo depois de dispensar: o lembrete volta.
    expect(dispensado("t1", log("copy", DEPOIS), { t1: { dispensei: ANTES } })).toBe(false);
  });

  it("sem declarações, nada muda (compatível com a U2a)", () => {
    expect(sessionDelivery({ id: "t1", legacySent: none, log: {} })).toEqual({ kind: "nao_enviado" });
    expect(sessionDelivery({ id: "t1", legacySent: new Set(["t1"]), log: {} })).toEqual({ kind: "iniciado_antigo" });
    expect(paraEnviar({ kind: "nao_enviado" })).toBe(true);
    expect(paraEnviar({ kind: "iniciado", via: "copy", at: COPIOU })).toBe(false);
    expect(paraEnviar({ kind: "declarado", at: DEPOIS, prep: null })).toBe(false);
  });

  it("relógio mexido para trás: o toque 'no futuro' com declaração mais velha fica preparado; data ilegível do toque não derruba a declaração", () => {
    expect(sessionDelivery({ id: "t1", legacySent: none, log: log("copy", "2027-01-01T00:00:00.000Z"), decl: { t1: { enviei: DEPOIS } } }).kind).toBe("iniciado");
    expect(sessionDelivery({ id: "t1", legacySent: none, log: { t1: { via: "copy", at: "lixo" } }, decl: { t1: { enviei: DEPOIS } } }).kind).toBe("declarado");
  });

  it("texto do declarado: rotulado como declaração, sem 'recebido' nem 'enviado para'", () => {
    const t = sessionDeliveryText({ kind: "declarado", at: DEPOIS, prep: { via: "copy", at: COPIOU } }, "Rafael", NOW);
    expect(t.short).toBe("Você marcou: já enviei · 23/11");
    expect(t.long).toBe("Você marcou este treino como enviado em 23/11 às 19:00. O app não vê a conversa: se Rafael não recebeu, envie de novo.");
    expect(t.actionLabel).toBe("Enviar de novo para Rafael");
    expect(t.icon).not.toBe("confirmado");
    expect(`${t.short} ${t.long}`).not.toMatch(FORBIDDEN);
    // Linha curta só nos últimos 7 dias, como os toques.
    expect(sessionDeliveryText({ kind: "declarado", at: DEPOIS, prep: null }, "Rafael", new Date("2026-12-10T12:00:00.000Z")).short).toBeNull();
  });

  it("reenvio: declarado conta como já tocado (nota e medição)", () => {
    expect(resendEntry({ kind: "declarado", at: DEPOIS, prep: { via: "whatsapp", at: COPIOU } })).toEqual({ via: "whatsapp", at: COPIOU });
    expect(resendEntry({ kind: "declarado", at: DEPOIS, prep: null })).toBe("antigo");
    expect(resendCounts([{ kind: "declarado", at: DEPOIS, prep: null }, { kind: "nao_enviado" }])).toEqual({ resend: true, novos: 1 });
  });
});

describe("lembrete do Hoje (só copiados)", () => {
  it("copiados viram 'Você copiou N treinos. Já colou na conversa?'; WhatsApp aberto não cobra", () => {
    expect(lembreteDeCopia([{ id: "t1", via: "copy", at: COPIOU }])).toEqual({ ids: ["t1"], texto: "Você copiou 1 treino. Já colou na conversa?" });
    expect(lembreteDeCopia([{ id: "t1", via: "copy", at: COPIOU }, { id: "t2", via: "copy", at: COPIOU }, { id: "t3", via: "whatsapp", at: COPIOU }])).toEqual({ ids: ["t1", "t2"], texto: "Você copiou 2 treinos. Já colou na conversa?" });
    expect(lembreteDeCopia([{ id: "t3", via: "whatsapp", at: COPIOU }])).toBeNull();
    expect(lembreteDeCopia([])).toBeNull();
  });

  it("dispensado ou 'Já enviei' depois da cópia: some; cópia nova depois disso: volta", () => {
    const p = [{ id: "t1", via: "copy" as const, at: COPIOU }];
    expect(lembreteDeCopia(p, { t1: { dispensei: DEPOIS } })).toBeNull();
    expect(lembreteDeCopia(p, { t1: { enviei: DEPOIS } })).toBeNull();
    expect(lembreteDeCopia(p, { t1: { dispensei: ANTES } })?.ids).toEqual(["t1"]);
  });
});

describe("lote acima do limite por link (QA-07)", () => {
  it("23 pendentes com limite 20: 'Enviar 20 de 23 treinos' e '20 de 23 neste envio; faltam 3.'", () => {
    expect(rotuloDoEnvio(23, 20, "Rafael")).toBe("Enviar 20 de 23 treinos");
    expect(textoDoLote(23, 20)).toBe("20 de 23 neste envio; faltam 3.");
    expect(textoDoLote(21, 20)).toBe("20 de 21 neste envio; falta 1.");
  });

  it("até o limite: rótulo de sempre e sem linha de lote", () => {
    expect(rotuloDoEnvio(1, 20, "Rafael")).toBe("Enviar treino para Rafael");
    expect(rotuloDoEnvio(20, 20, "Rafael")).toBe("Enviar 20 treinos para Rafael");
    expect(textoDoLote(20, 20)).toBeNull();
    expect(textoDoLote(0, 20)).toBeNull();
  });
});

describe("textos de falha e o negativo da cópia bem-sucedida", () => {
  it("registro que falhou não diz 'copiada'", () => {
    expect(TEXTO_REGISTRO_FALHOU).toBe("Não deu para registrar neste aparelho; o treino continua como para enviar.");
    expect(TEXTO_REGISTRO_FALHOU).not.toMatch(/copiad/);
  });

  it("teste negativo: cópia bem-sucedida mantém 'Mensagem copiada às …'", () => {
    expect(prepStatusText("copy", COPIOU, "Rafael", "aluno")).toBe("Mensagem copiada às 18:40. Cole na conversa com Rafael.");
  });
});
