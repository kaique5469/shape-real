import { describe, expect, it } from "vitest";
import { filledUnmarked, filledUnmarkedTitle, finishGate, isFilledUnmarked, markFilledDone, setCounts, setRowDescription, setRowState } from "./session-checks";
import type { ExerciseLog, Session, SetLog } from "./types";

/** Série como fica no rascunho: carga pré-preenchida, reps null até a pessoa digitar. */
const set = (reps: number | null, done = false, loadKg: number | null = 40): SetLog => ({ loadKg, reps, done });
const ex = (uid: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid, exerciseId: "supino_reto_barra", name: "Supino", sets, ...extra });
const session = (exercises: ExerciseLog[]): Session => ({ id: "s", userId: "u", startedAt: "2026-03-01T10:00:00Z", exercises, volumeKg: 0, prs: [] });

describe("filledUnmarked", () => {
  it("nenhuma preenchida: carga pré-preenchida e reps vazias não contam", () => {
    expect(filledUnmarked(session([ex("a", [set(null), set(null), set(null)])]))).toBe(0);
    // Reps 0 não é valor digitado de verdade.
    expect(filledUnmarked(session([ex("a", [set(0), set(null, false, null)])]))).toBe(0);
    expect(filledUnmarked(session([]))).toBe(0);
  });

  it("todas marcadas: nada a avisar", () => {
    expect(filledUnmarked(session([ex("a", [set(10, true), set(9, true)]), ex("b", [set(12, true)])]))).toBe(0);
  });

  it("mistura: conta só as preenchidas sem ✓", () => {
    const s = session([ex("a", [set(10, true), set(9), set(null)]), ex("b", [set(12), set(12), set(null, true)])]);
    expect(filledUnmarked(s)).toBe(3);
    expect(isFilledUnmarked(set(9))).toBe(true);
    expect(isFilledUnmarked(set(9, true))).toBe(false);
  });

  it("exercício por tempo: segundos digitados sem ✓ contam", () => {
    const plank = ex("p", [set(45, false, null), set(null, false, null), set(30, true, null)], { exerciseId: "prancha", name: "Prancha", unit: "seg" });
    const walk = ex("w", [set(20, false, null)], { exerciseId: "esteira_caminhada", name: "Esteira", unit: "min" });
    expect(filledUnmarked(session([plank, walk]))).toBe(2);
  });

  it("bi-set: soma as séries dos dois exercícios do grupo", () => {
    const a = ex("a", [set(12, true), set(10), set(null)], { planned: { sets: 3, repsMin: 10, repsMax: 12, technique: "bi_set" } });
    const b = ex("b", [set(12, true), set(11), set(null)], { exerciseId: "crucifixo_halter", name: "Crucifixo", planned: { sets: 3, repsMin: 10, repsMax: 12, technique: "bi_set" } });
    expect(filledUnmarked(session([a, b]))).toBe(2);
  });

  it("aceita só { exercises } (o rascunho da tela)", () => {
    expect(filledUnmarked({ exercises: [{ sets: [set(8)] }] })).toBe(1);
  });
});

describe("setCounts e finishGate", () => {
  it("separa feitas, preenchidas e vazias", () => {
    const s = session([ex("a", [set(10, true), set(9), set(null)]), ex("b", [set(12), set(null), set(null)])]);
    expect(setCounts(s)).toEqual({ total: 6, done: 1, filledUnmarked: 2, empty: 3 });
  });

  it("preenchidas sem ✓ abrem o diálogo, inclusive quando nenhuma série foi marcada", () => {
    expect(finishGate(session([ex("a", [set(10), set(9), set(8)])]))).toEqual({ kind: "filled", count: 3 });
    expect(finishGate(session([ex("a", [set(10, true), set(9), set(null)])]))).toEqual({ kind: "filled", count: 1 });
  });

  it("nada marcado e nada preenchido: pede pelo menos uma série", () => {
    expect(finishGate(session([ex("a", [set(null), set(null)])]))).toEqual({ kind: "nothing" });
    expect(finishGate(session([]))).toEqual({ kind: "nothing" });
  });

  it("pendentes contam só as vazias (preenchidas não são 'faltam'); tudo marcado finaliza direto", () => {
    expect(finishGate(session([ex("a", [set(10, true), set(null), set(null)])]))).toEqual({ kind: "pending", count: 2 });
    expect(finishGate(session([ex("a", [set(10, true)]), ex("b", [set(8, true)])]))).toEqual({ kind: "ok" });
  });

  it("título no singular e no plural", () => {
    expect(filledUnmarkedTitle(3)).toBe("Você preencheu 3 séries sem marcar");
    expect(filledUnmarkedTitle(1)).toBe("Você preencheu 1 série sem marcar");
  });
});

describe("markFilledDone ('Marcar e finalizar')", () => {
  it("marca só as preenchidas, sem mexer em carga, reps ou séries vazias", () => {
    const s = session([ex("a", [set(10, true), set(9, false, 42.5), set(null)]), ex("b", [set(null), set(null)])]);
    const out = markFilledDone(s);
    expect(out.exercises[0]!.sets).toEqual([set(10, true), set(9, true, 42.5), set(null)]);
    expect(filledUnmarked(out)).toBe(0);
    expect(finishGate(out)).toEqual({ kind: "pending", count: 3 });
    // Não muta o original; exercício sem nada a marcar é o mesmo objeto; mantém os outros campos da sessão.
    expect(s.exercises[0]!.sets[1]!.done).toBe(false);
    expect(out.exercises[1]).toBe(s.exercises[1]);
    expect(out.id).toBe("s");
  });

  it("sem nada a marcar devolve o mesmo objeto", () => {
    const s = session([ex("a", [set(10, true)])]);
    expect(markFilledDone(s)).toBe(s);
  });
});

describe("setRowState e setRowDescription (U1a)", () => {
  it("pendente: reps vazias ou 0, mesmo com carga pré-preenchida", () => {
    expect(setRowState(set(null))).toBe("pendente");
    expect(setRowState(set(0))).toBe("pendente");
    expect(setRowState(set(null, false, null))).toBe("pendente");
  });

  it("preenchida: reps digitadas sem ✓", () => {
    expect(setRowState(set(8))).toBe("preenchida");
    expect(setRowState(set(8, false, null))).toBe("preenchida");
  });

  it("concluída: com ✓, também com reps null", () => {
    expect(setRowState(set(8, true))).toBe("concluida");
    expect(setRowState(set(null, true))).toBe("concluida");
    expect(setRowState(set(0, true))).toBe("concluida");
  });

  it("série por tempo segue a mesma regra (segundos no lugar das reps)", () => {
    expect(setRowState({ reps: 45, done: false })).toBe("preenchida");
    expect(setRowState({ reps: null, done: false })).toBe("pendente");
    expect(setRowState({ reps: 45, done: true })).toBe("concluida");
  });

  it("descrição: os 2 textos e null", () => {
    expect(setRowDescription("preenchida", false)).toBe("Preenchida, falta marcar");
    expect(setRowDescription("concluida", true)).toBe("Recorde neste treino");
    expect(setRowDescription("concluida", false)).toBeNull();
    expect(setRowDescription("pendente", false)).toBeNull();
    // Recorde só existe em série concluída.
    expect(setRowDescription("pendente", true)).toBeNull();
    expect(setRowDescription("preenchida", true)).toBe("Preenchida, falta marcar");
  });
});
