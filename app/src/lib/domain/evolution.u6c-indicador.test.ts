import { describe, expect, it } from "vitest";
import { strengthIndicator, type ExerciseComparison, type SessionMark } from "./evolution";

/** R-12 com marcas idênticas: "Mesma carga e mesmas reps" já diz tudo; "menos de 1% de diferença" sugeriria diferença. */
const mark = (loadKg: number, reps: number, date: string): SessionMark => ({ sessionId: date, startedAt: `${date}T18:00:00.000Z`, date, mark: { loadKg, reps }, e1rm: null, record: false, suspect: false });
const cmp = (first: SessionMark, last: SessionMark, deltaPct: number | null): Pick<ExerciseComparison, "deltaPct" | "first" | "last"> => ({ first, last, deltaPct });

describe("strengthIndicator com a primeira e a última marca iguais (U6c)", () => {
  it("15 kg × 12 → 15 kg × 12: sem linha de força", () => {
    expect(strengthIndicator(cmp(mark(15, 12, "2026-10-20"), mark(15, 12, "2026-11-20"), 0))).toBeNull();
    expect(strengthIndicator(cmp(mark(8, 10, "2026-10-20"), mark(8, 10, "2026-11-20"), 0))).toBeNull();
  });
  it("marcas diferentes que arredondam para 0 continuam com 'menos de 1% de diferença'", () => {
    expect(strengthIndicator(cmp(mark(100, 10, "2026-10-20"), mark(102.5, 9, "2026-11-20"), 0))).toBe("Força estimada (1RM): menos de 1% de diferença");
  });
  it("com variação, como antes; sem first/last (chamada antiga), só olha deltaPct", () => {
    expect(strengthIndicator(cmp(mark(20, 10, "2026-10-20"), mark(25, 10, "2026-11-20"), 25))).toBe("Força estimada (1RM): +25%");
    expect(strengthIndicator({ deltaPct: 0 })).toBe("Força estimada (1RM): menos de 1% de diferença");
    expect(strengthIndicator({ deltaPct: null })).toBeNull();
  });
});
