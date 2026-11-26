import { describe, expect, it } from "vitest";
import {
  REST_ALERT_WINDOW_MS,
  REST_DISCARD_AFTER_MS,
  anySetPending,
  fmtClock,
  fmtOvertime,
  nextSetOf,
  restEndedAgoText,
  restAfterRemove,
  restAfterUnmark,
  restEndedText,
  restFromDraft,
  restPhase,
  shiftRest,
  shouldStartRest,
  startRest,
  type RestTimer,
} from "./rest";

const T0 = Date.parse("2026-03-01T10:00:00Z");
const rest = { until: T0, total: 90 };

describe("restPhase", () => {
  it("em andamento: segundos que faltam, arredondados para cima", () => {
    expect(restPhase(rest, T0 - 60_000)).toEqual({ phase: "running", leftSec: 60, total: 90 });
    expect(restPhase(rest, T0 - 59_200)).toEqual({ phase: "running", leftSec: 60, total: 90 });
    expect(restPhase(rest, T0 - 1)).toEqual({ phase: "running", leftSec: 1, total: 90 });
  });

  it("vencido agora: fim percebido na hora, pode apitar", () => {
    expect(restPhase(rest, T0)).toEqual({ phase: "ended", overSec: 0, justEnded: true });
    expect(restPhase(rest, T0 + REST_ALERT_WINDOW_MS)).toEqual({ phase: "ended", overSec: 5, justEnded: true });
    expect(restPhase(rest, T0 + REST_ALERT_WINDOW_MS + 1)).toMatchObject({ phase: "ended", justEnded: false });
  });

  it("vencido há 40 s (voltou de outro app ou recarregou): mostra o tempo, sem bipe atrasado", () => {
    expect(restPhase(rest, T0 + 40_000)).toEqual({ phase: "ended", overSec: 40, justEnded: false });
    expect(restPhase(rest, T0 + 40_900)).toEqual({ phase: "ended", overSec: 40, justEnded: false });
  });

  it("vencido há 11 min: descartar; até 10 min ainda aparece", () => {
    expect(restPhase(rest, T0 + 11 * 60_000)).toEqual({ phase: "expired" });
    expect(restPhase(rest, T0 + REST_DISCARD_AFTER_MS)).toEqual({ phase: "ended", overSec: 600, justEnded: false });
    expect(restPhase(rest, T0 + REST_DISCARD_AFTER_MS + 1)).toEqual({ phase: "expired" });
  });

  it("sem descanso ou dado inválido", () => {
    expect(restPhase(null, T0)).toEqual({ phase: "none" });
    expect(restPhase(undefined, T0)).toEqual({ phase: "none" });
    expect(restPhase({ until: Number.NaN, total: 90 }, T0)).toEqual({ phase: "none" });
    // Fim a mais de 1 h no futuro (relógio do aparelho mudou): ignorado.
    expect(restPhase({ until: T0 + 2 * 3_600_000, total: 90 }, T0)).toEqual({ phase: "none" });
  });
});

describe("descanso salvo no rascunho", () => {
  it("restFromDraft aceita { until, total } e recusa rascunho antigo ou corrompido", () => {
    expect(restFromDraft({ until: T0, total: 90 })).toEqual({ until: T0, total: 90 });
    expect(restFromDraft(undefined)).toBeNull();
    expect(restFromDraft(null)).toBeNull();
    expect(restFromDraft("90")).toBeNull();
    expect(restFromDraft({ until: "amanhã", total: 90 })).toBeNull();
    expect(restFromDraft({ until: T0 })).toBeNull();
    expect(restFromDraft({ until: T0, total: -5 })).toBeNull();
    expect(restFromDraft({ until: Number.POSITIVE_INFINITY, total: 90 })).toBeNull();
  });

  it("recarregar no meio mantém a contagem; depois do fim mostra há quanto tempo acabou", () => {
    const saved = JSON.parse(JSON.stringify({ rest: startRest(90, T0) })) as { rest: unknown };
    expect(restPhase(restFromDraft(saved.rest), T0 + 30_000)).toEqual({ phase: "running", leftSec: 60, total: 90 });
    const over = restPhase(restFromDraft(saved.rest), T0 + 130_000);
    expect(over).toEqual({ phase: "ended", overSec: 40, justEnded: false });
    expect(restEndedAgoText(over.phase === "ended" ? over.overSec : 0)).toBe("Descanso acabou há 40 s");
  });
});

describe("controles do descanso", () => {
  it("startRest: sem descanso configurado não inicia", () => {
    expect(startRest(90, T0)).toEqual({ until: T0 + 90_000, total: 90 });
    expect(startRest(0, T0)).toBeNull();
  });

  it("−15s / +15s deslocam o fim e o total; −15s nunca joga o fim para antes de agora", () => {
    expect(shiftRest({ until: T0 + 60_000, total: 90 }, 15, T0)).toEqual({ until: T0 + 75_000, total: 105 });
    expect(shiftRest({ until: T0 + 60_000, total: 90 }, -15, T0)).toEqual({ until: T0 + 45_000, total: 75 });
    expect(shiftRest({ until: T0 + 10_000, total: 90 }, -15, T0)).toEqual({ until: T0, total: 80 });
    expect(restPhase(shiftRest({ until: T0 + 10_000, total: 90 }, -15, T0), T0)).toMatchObject({ phase: "ended", overSec: 0 });
  });
});

describe("última série: anySetPending / shouldStartRest", () => {
  const s = (done: boolean) => ({ done });
  const a = { uid: "a", sets: [s(true), s(true), s(false)] };
  const b = { uid: "b", sets: [s(true), s(true), s(true)] };

  it("a série que acabou de ser marcada conta como feita", () => {
    expect(anySetPending([a, b])).toBe(true);
    expect(anySetPending([a, b], { logUid: "a", index: 2 })).toBe(false);
    expect(shouldStartRest([a, b], { logUid: "a", index: 2 }, 90)).toBe(false);
  });

  it("considera todos os exercícios, inclusive os adicionados na hora", () => {
    const added = { uid: "c", sets: [s(false)] };
    expect(anySetPending([a, b, added], { logUid: "a", index: 2 })).toBe(true);
    expect(shouldStartRest([a, b, added], { logUid: "a", index: 2 }, 90)).toBe(true);
    // Sem descanso configurado, nunca inicia.
    expect(shouldStartRest([a, b, added], { logUid: "a", index: 2 }, 0)).toBe(false);
  });

  it("séries marcadas fora de ordem: a pendente pode ser uma anterior", () => {
    const outOfOrder = { uid: "a", sets: [s(false), s(true), s(false)] };
    expect(anySetPending([outOfOrder], { logUid: "a", index: 2 })).toBe(true);
    expect(anySetPending([outOfOrder], { logUid: "a", index: 0 })).toBe(true);
    expect(anySetPending([{ uid: "a", sets: [s(false), s(true), s(true)] }], { logUid: "a", index: 0 })).toBe(false);
  });

  it("bi-set: a última série do 2º exercício encerra o treino só se o 1º também acabou", () => {
    const first = { uid: "x", sets: [s(true), s(true), s(true)] };
    const second = { uid: "y", sets: [s(true), s(true), s(false)] };
    expect(shouldStartRest([first, second], { logUid: "y", index: 2 }, 60)).toBe(false);
    const firstPending = { uid: "x", sets: [s(true), s(true), s(false)] };
    expect(shouldStartRest([firstPending, second], { logUid: "y", index: 2 }, 60)).toBe(true);
  });

  it("exercício sem séries não segura o descanso", () => {
    expect(anySetPending([{ uid: "a", sets: [] }])).toBe(false);
    expect(anySetPending([])).toBe(false);
  });
});

describe("textos da barra de descanso", () => {
  it("contagem e tempo extra", () => {
    expect(fmtClock(90)).toBe("1:30");
    expect(fmtClock(5)).toBe("0:05");
    expect(fmtClock(-3)).toBe("0:00");
    expect(fmtOvertime(42)).toBe("+0:42");
    expect(fmtOvertime(75)).toBe("+1:15");
  });

  it("'acabou há' em segundos e depois em minutos", () => {
    expect(restEndedAgoText(0)).toBe("Descanso acabou");
    expect(restEndedAgoText(40)).toBe("Descanso acabou há 40 s");
    expect(restEndedAgoText(59.9)).toBe("Descanso acabou há 59 s");
    expect(restEndedAgoText(185)).toBe("Descanso acabou há 3 min");
  });

  it("'Descanso acabou · Série 3 de 4 · Supino'", () => {
    const log = { name: "Supino", sets: [{ done: true }, { done: true }, { done: false }, { done: false }] };
    expect(nextSetOf(log)).toEqual({ number: 3, of: 4, name: "Supino" });
    expect(restEndedText(nextSetOf(log))).toBe("Descanso acabou · Série 3 de 4 · Supino");
    expect(nextSetOf({ name: "Supino", sets: [{ done: true }] })).toBeNull();
    expect(restEndedText(null)).toBe("Descanso acabou");
  });
});

describe("série que iniciou o descanso (U1b)", () => {
  const from = { logUid: "agach", index: 0 };

  it("startRest guarda a série de origem; sem série, o descanso é o de sempre", () => {
    expect(startRest(90, T0, from)).toEqual({ until: T0 + 90_000, total: 90, from });
    expect(startRest(90, T0)).toEqual({ until: T0 + 90_000, total: 90 });
    expect(startRest(90, T0)).not.toHaveProperty("from");
    expect(startRest(0, T0, from)).toBeNull();
  });

  it("shiftRest (−15s / +15s) preserva a série de origem", () => {
    const r = startRest(90, T0, from)!;
    expect(shiftRest(r, 15, T0)).toEqual({ until: T0 + 105_000, total: 105, from });
    expect(shiftRest(r, -15, T0).from).toEqual(from);
    expect(shiftRest({ until: T0 + 60_000, total: 90 }, 15, T0)).not.toHaveProperty("from");
  });

  it("restFromDraft preserva o from válido e descarta o inválido sem perder o descanso", () => {
    const saved = JSON.parse(JSON.stringify({ rest: startRest(90, T0, from) })) as { rest: unknown };
    expect(restFromDraft(saved.rest)).toEqual({ until: T0 + 90_000, total: 90, from });
    for (const bad of [null, "agach:0", { logUid: "", index: 0 }, { logUid: "agach", index: -1 }, { logUid: "agach", index: 1.5 }, { logUid: 3, index: 0 }, { index: 0 }]) {
      const r = restFromDraft({ until: T0, total: 90, from: bad });
      expect(r).toEqual({ until: T0, total: 90 });
      expect(r).not.toHaveProperty("from");
    }
  });

  it("restAfterUnmark: mesma série → cancela; outra série → igual; sem origem (rascunho antigo) → igual; sem descanso → null", () => {
    const r = startRest(90, T0, from)!;
    expect(restAfterUnmark(r, { logUid: "agach", index: 0 })).toBeNull();
    expect(restAfterUnmark(r, { logUid: "agach", index: 1 })).toBe(r);
    expect(restAfterUnmark(r, { logUid: "supino", index: 0 })).toBe(r);
    const old: RestTimer = { until: T0, total: 90 };
    expect(restAfterUnmark(old, from)).toBe(old);
    expect(restAfterUnmark(null, from)).toBeNull();
  });

  it("vale também na barra de fim (o descanso continua no estado até OK ou 10 min)", () => {
    const r = startRest(90, T0, from)!;
    expect(restPhase(r, T0 + 95_000)).toMatchObject({ phase: "ended" });
    expect(restAfterUnmark(r, from)).toBeNull();
  });

  it("restAfterRemove: a série de origem saiu → cancela; outra série ou outro exercício → igual; exercício inteiro (0) → cancela", () => {
    const r = startRest(90, T0, { logUid: "agach", index: 3 })!;
    expect(restAfterRemove(r, "agach", 3)).toBeNull();
    expect(restAfterRemove(r, "agach", 4)).toBe(r);
    expect(restAfterRemove(r, "supino", 0)).toBe(r);
    expect(restAfterRemove(r, "agach", 0)).toBeNull();
    const old: RestTimer = { until: T0, total: 90 };
    expect(restAfterRemove(old, "agach", 0)).toBe(old);
    expect(restAfterRemove(null, "agach", 0)).toBeNull();
  });
});
