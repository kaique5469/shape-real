import { describe, expect, it } from "vitest";
import { markDeltaPct } from "./evolution";
import { e1rm, e1rmRaw } from "./progression";
import { buildReport } from "./report";
import type { ExerciseLog, Session } from "./types";

/**
 * Mesmo progresso, mesma %: +1 rep com a mesma carga a partir de 10 é sempre +2,5% no Epley (11/30 ÷ 10/30 → 41/40).
 * A % e a ordem do relatório saem do 1RM sem arredondar; o "1RM ~27,3" mostrado continua arredondado a 0,1 kg.
 */
describe("variação do 1RM sem arredondamento intermediário (U6a)", () => {
  it("8, 15, 20 e 25 kg de ×10 para ×11 dão o mesmo deltaPct (+3%)", () => {
    for (const kg of [8, 15, 20, 25]) expect(markDeltaPct({ loadKg: kg, reps: 10 }, { loadKg: kg, reps: 11 })).toBe(3);
  });

  it("e1rm continua arredondado para mostrar; e1rmRaw não", () => {
    expect(e1rm(20, 10)).toBe(26.7);
    expect(e1rmRaw(20, 10)).toBeCloseTo(26.6667, 4);
    expect(e1rm(20, 1)).toBe(20);
    expect(e1rmRaw(0, 10)).toBe(0);
  });

  it("variações iguais (+0) e quedas não mudam de sinal", () => {
    expect(markDeltaPct({ loadKg: 20, reps: 10 }, { loadKg: 20, reps: 10 })).toBe(0);
    expect(markDeltaPct({ loadKg: 20, reps: 11 }, { loadKg: 20, reps: 10 })).toBe(-2);
    expect(markDeltaPct({ loadKg: 20, reps: 10 }, { loadKg: 20, reps: 13 })).toBeNull();
  });

  it("no relatório, o mesmo progresso empata no ganho e desempata pelo número de treinos", () => {
    const NOW = new Date(2026, 10, 20, 15, 0);
    let n = 0;
    const log = (exerciseId: string, name: string, loadKg: number, reps: number): ExerciseLog => ({
      uid: `l${n++}`,
      exerciseId,
      name,
      sets: [{ loadKg, reps, done: true }],
    });
    const session = (daysAgo: number, exercises: ExerciseLog[]): Session => {
      const start = new Date(2026, 10, 20 - daysAgo, 18, 0);
      return { id: `s${n++}`, userId: "u1", startedAt: start.toISOString(), finishedAt: new Date(start.getTime() + 50 * 60000).toISOString(), exercises, volumeKg: 0, prs: [] };
    };
    // Base antes do período (×10) e, no período, ×11 com a mesma carga. O de 8 kg aparece em 2 treinos; o de 25 kg em 1.
    const sessions = [
      session(40, [log("supino_reto_barra", "Supino reto com barra", 25, 10), log("remada_baixa", "Remada baixa", 8, 10), log("puxada_frente", "Puxada frontal", 20, 10), log("remada_maquina", "Remada na máquina", 15, 10)]),
      session(10, [log("supino_reto_barra", "Supino reto com barra", 25, 11), log("remada_baixa", "Remada baixa", 8, 11), log("puxada_frente", "Puxada frontal", 20, 11), log("remada_maquina", "Remada na máquina", 15, 11)]),
      session(5, [log("remada_baixa", "Remada baixa", 8, 11)]),
    ];
    const r = buildReport({ profile: { name: "Beatriz", daysPerWeek: 3 }, sessions, metrics: [], days: 30, now: NOW });
    expect(r.strength.map((s) => s.deltaPct)).toEqual([3, 3, 3, 3]);
    // Com o 1RM arredondado, o de 25 kg (+2,70%) vinha antes do de 8 kg (+1,87%); agora empatam e vale o nº de treinos.
    expect(r.strength[0]!.exerciseId).toBe("remada_baixa");
  });
});
