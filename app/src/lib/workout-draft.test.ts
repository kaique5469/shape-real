import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@/lib/domain/types";
import { decimalsOf, draftHasWork, draftKey, draftProgressText, parseDraft, parsePtNumber, readDraftInfo, restDelayBand, saveDraft, splitCompareLine, suggestionEdit, tween, type WorkoutDraft } from "./workout-draft";

const session: Session = {
  id: "s1",
  userId: "u",
  programId: "p1",
  dayKey: "B",
  startedAt: "2026-03-01T10:00:00Z",
  exercises: [{ uid: "a", exerciseId: "supino_reto_barra", name: "Supino", sets: [{ loadKg: 40, reps: 10, done: true }, { loadKg: 40, reps: null, done: false }] }],
  volumeKg: 0,
  prs: [],
};

describe("parseDraft: rascunhos antigos e novos", () => {
  it("rascunho gravado antes deste lote (sem rest, sugestão sem 'retorno') abre igual", () => {
    const old = JSON.stringify({ session, suggestions: { a: { kind: "manter", loadKg: 40, text: "Manter 40 kg: faltaram 9 reps para fechar 3×12." } }, restSec: { a: 90 } });
    const d = parseDraft(old);
    expect(d).toEqual({ session, suggestions: { a: { kind: "manter", loadKg: 40, text: "Manter 40 kg: faltaram 9 reps para fechar 3×12." } }, restSec: { a: 90 } });
    expect(d && "rest" in d).toBe(false);
  });

  it("sugestão de retorno e descanso em andamento", () => {
    const raw = JSON.stringify({
      session,
      suggestions: { a: { kind: "retorno", loadKg: 36, text: "Faz 18 dias desde a última vez neste exercício: volte com 36 kg e reencontre o ritmo." } },
      restSec: { a: 90 },
      rest: { until: 1_772_360_000_000, total: 90 },
    });
    const d = parseDraft(raw);
    expect(d?.suggestions.a?.kind).toBe("retorno");
    expect(d?.rest).toEqual({ until: 1_772_360_000_000, total: 90 });
  });

  it("partes ausentes ou inválidas viram vazias; sem sessão utilizável, null", () => {
    expect(parseDraft(JSON.stringify({ session }))).toEqual({ session, suggestions: {}, restSec: {} });
    const messy = parseDraft(JSON.stringify({ session, suggestions: { a: { kind: "manter" }, b: "x", c: { kind: "reps", loadKg: null, text: "Busque 12 reps." } }, restSec: { a: "90", b: 60 }, rest: { until: "amanhã" } }));
    expect(messy).toEqual({ session, suggestions: { c: { kind: "reps", loadKg: null, text: "Busque 12 reps." } }, restSec: { b: 60 } });
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("{nope")).toBeNull();
    expect(parseDraft(JSON.stringify({ suggestions: {} }))).toBeNull();
    expect(parseDraft(JSON.stringify({ session: { ...session, exercises: "x" } }))).toBeNull();
    expect(parseDraft(JSON.stringify({ session: { ...session, exercises: [{ uid: "a" }] } }))).toBeNull();
  });
});

describe("saveDraft", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("grava o descanso atual junto, e some com ele quando não há descanso", () => {
    const draft: WorkoutDraft = { session, suggestions: {}, restSec: { a: 90 }, rest: { until: 1, total: 1 } };
    saveDraft("u", draft, { until: 1_772_360_000_000, total: 90 });
    expect(parseDraft(store.get(draftKey("u")))?.rest).toEqual({ until: 1_772_360_000_000, total: 90 });
    saveDraft("u", draft, null);
    expect(JSON.parse(store.get(draftKey("u"))!)).not.toHaveProperty("rest");
    // "Hoje" continua lendo o mesmo rascunho.
    expect(readDraftInfo("u")).toMatchObject({ done: 1, total: 2, href: "/sessao?p=p1&d=B" });
  });

  it("série preenchida sem ✓ também é treino em andamento (Hoje mostra a retomada; nada é sobrescrito sem aviso)", () => {
    const filledOnly: Session = { ...session, exercises: [{ ...session.exercises[0]!, sets: [{ loadKg: 40, reps: 9, done: false }, { loadKg: 40, reps: null, done: false }] }] };
    const empty: Session = { ...session, exercises: [{ ...session.exercises[0]!, sets: [{ loadKg: 40, reps: null, done: false }] }] };
    expect(draftHasWork(filledOnly)).toBe(true);
    expect(draftHasWork(session)).toBe(true);
    expect(draftHasWork(empty)).toBe(false);
    saveDraft("u", { session: filledOnly, suggestions: {}, restSec: {} }, null);
    expect(readDraftInfo("u")).toMatchObject({ done: 0, total: 2, filled: 1 });
    saveDraft("u", { session: empty, suggestions: {}, restSec: {} }, null);
    expect(readDraftInfo("u")).toBeNull();
  });

  it("nunca lança sem armazenamento", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveDraft("u", { session, suggestions: {}, restSec: {} }, null)).not.toThrow();
  });
});

describe("restDelayBand", () => {
  it("faixas do atraso entre o fim do descanso e a próxima série", () => {
    expect(restDelayBand(0)).toBe("0-15s");
    expect(restDelayBand(14.9)).toBe("0-15s");
    expect(restDelayBand(15)).toBe("15-60s");
    expect(restDelayBand(59)).toBe("15-60s");
    expect(restDelayBand(60)).toBe("60s+");
    expect(restDelayBand(900)).toBe("60s+");
    expect(restDelayBand(-3)).toBe("0-15s");
    expect(restDelayBand(Number.NaN)).toBe("0-15s");
  });
});

describe("suggestionEdit", () => {
  const sets = (...loads: (number | null)[]) => ({ sets: loads.map((loadKg, i) => ({ loadKg, reps: 10, done: i < 2 })) });

  it("mantida ou editada, só pelo tipo e sim/não", () => {
    expect(suggestionEdit(sets(40, 40, 50), { kind: "manter", loadKg: 40 })).toEqual({ tipo: "manter", editada: false });
    expect(suggestionEdit(sets(40, 42.5), { kind: "aumentar", loadKg: 40 })).toEqual({ tipo: "aumentar", editada: true });
    expect(suggestionEdit(sets(36, 36), { kind: "retorno", loadKg: 36 })).toEqual({ tipo: "retorno", editada: false });
    expect(suggestionEdit(sets(null, 20), { kind: "reduzir", loadKg: 20 })).toEqual({ tipo: "reduzir", editada: true });
  });

  it("fora do evento: sem sugestão, sem carga, primeira vez, reps, nenhuma série feita", () => {
    expect(suggestionEdit(sets(40), undefined)).toBeNull();
    expect(suggestionEdit(sets(40), { kind: "manter", loadKg: null })).toBeNull();
    expect(suggestionEdit(sets(40), { kind: "primeira", loadKg: 40 })).toBeNull();
    expect(suggestionEdit(sets(40), { kind: "reps", loadKg: 40 })).toBeNull();
    expect(suggestionEdit({ sets: [{ loadKg: 40, reps: 10, done: false }, { loadKg: 40, reps: 0, done: true }] }, { kind: "manter", loadKg: 40 })).toBeNull();
  });
});

describe("splitCompareLine", () => {
  it("separa nome e detalhe, e os números de 'A → B' para animar", () => {
    expect(splitCompareLine("Agachamento: 60 → 62,5 kg")).toEqual({
      name: "Agachamento",
      detail: "60 → 62,5 kg",
      arrow: { head: "", fromText: "60", from: 60, toText: "62,5", to: 62.5, tail: " kg" },
    });
    expect(splitCompareLine("Prancha: 45 → 60 s").arrow).toMatchObject({ from: 45, to: 60, tail: " s" });
    expect(splitCompareLine("Barra fixa: 8 → 10 reps").arrow).toMatchObject({ from: 8, to: 10, tail: " reps" });
    expect(splitCompareLine("Barra fixa assistida (graviton/gravitron): 30 → 25 kg de ajuda")).toMatchObject({
      name: "Barra fixa assistida (graviton/gravitron)",
      arrow: { from: 30, to: 25, tail: " kg de ajuda" },
    });
  });

  it("sem seta: detalhe inteiro, sem animação", () => {
    expect(splitCompareLine("Supino reto: +1 rep com 40 kg")).toEqual({ name: "Supino reto", detail: "+1 rep com 40 kg" });
    expect(splitCompareLine("Flexão: +5 kg extra")).toEqual({ name: "Flexão", detail: "+5 kg extra" });
    expect(splitCompareLine("Sem nome")).toEqual({ name: "", detail: "Sem nome" });
    // Nome com dois-pontos: corta no último.
    expect(splitCompareLine("Remada: pegada neutra: 40 → 45 kg").name).toBe("Remada: pegada neutra");
  });

  it("números em pt-BR e casas decimais", () => {
    expect(parsePtNumber("62,5")).toBe(62.5);
    expect(parsePtNumber("60")).toBe(60);
    expect(parsePtNumber("1.000")).toBeNaN();
    expect(decimalsOf("62,5")).toBe(1);
    expect(decimalsOf("62,25")).toBe(2);
    expect(decimalsOf("60")).toBe(0);
  });
});

describe("tween", () => {
  it("vai do valor anterior ao novo, sem passar do alvo", () => {
    expect(tween(60, 62.5, 0)).toBe(60);
    expect(tween(60, 62.5, 1)).toBe(62.5);
    expect(tween(60, 62.5, 2)).toBe(62.5);
    expect(tween(30, 25, 0.5)).toBeLessThan(30);
    expect(tween(30, 25, 0.5)).toBeGreaterThan(25);
  });
});

describe("draftProgressText", () => {
  it("feitas, preenchidas sem ✓ ou as duas, com singular e plural", () => {
    expect(draftProgressText({ done: 3, total: 21, filled: 0 })).toBe("3 de 21 séries feitas");
    expect(draftProgressText({ done: 3, total: 21, filled: 1 })).toBe("3 de 21 séries feitas e 1 preenchida sem marcar");
    expect(draftProgressText({ done: 3, total: 21, filled: 2 })).toBe("3 de 21 séries feitas e 2 preenchidas sem marcar");
    expect(draftProgressText({ done: 0, total: 21, filled: 1 })).toBe("1 série preenchida sem marcar");
    expect(draftProgressText({ done: 0, total: 21, filled: 4 })).toBe("4 séries preenchidas sem marcar");
  });
});
