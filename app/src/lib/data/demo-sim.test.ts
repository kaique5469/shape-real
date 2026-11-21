import { describe, expect, it } from "vitest";
import { simulateSessions } from "./demo";
import { getExercise } from "@/lib/domain/exercises";
import { generateProgram, type GenerateInput } from "@/lib/domain/generator";
import { e1rmSeries, loadIncrement } from "@/lib/domain/progression";

const owner = { ownerId: "u", createdBy: "u" };
const abc: GenerateInput = { goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", seed: 42 };

describe("simulação da demonstração", () => {
  it("cargas e reps progridem ao longo das semanas", () => {
    const program = generateProgram(abc, owner);
    const sessions = simulateSessions("u", program, 8, 3, 42, 0.1);
    // O levantamento principal do dia de costas (a remada pesada, 4×6–8).
    const main = program.days[1]!.exercises.find((e) => e.repsMax <= 8)!;
    expect(getExercise(main.exerciseId)?.compound).toBe(true);
    const series = e1rmSeries(sessions, main.exerciseId);
    expect(series.length).toBeGreaterThan(3);
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value);
  });

  it("registra cargas que existem na academia e nunca carga em exercício sem peso", () => {
    // As fichas dos alunos de exemplo: emagrecimento com prioridade em glúteos, 5×5 e full body de iniciante.
    const samples: [GenerateInput, number][] = [
      [{ ...abc, goal: "emagrecimento", system: "abcd_inferiores", daysPerWeek: 4, emphasis: ["gluteos"], seed: 11 }, 0.55],
      [{ ...abc, goal: "forca", level: "avancado", system: "forca_5x5", seed: 23 }, 1.25],
      [{ ...abc, level: "iniciante", system: "fullbody", seed: 37 }, 0.55 * 0.7],
    ];
    for (const [input, factor] of samples) {
      const program = generateProgram(input, owner);
      const sessions = simulateSessions("u", program, 6, input.daysPerWeek, input.seed ?? 1, 0.1, factor);
      expect(sessions.length).toBeGreaterThan(8);
      for (const s of sessions) {
        expect(s.volumeKg).toBeGreaterThan(0);
        for (const log of s.exercises) {
          const ex = getExercise(log.exerciseId)!;
          for (const set of log.sets) {
            expect(set.reps).toBeGreaterThan(0);
            if (loadIncrement(ex.id, 20) === 0 || ex.unit === "min") expect(set.loadKg).toBeNull();
            else {
              expect(set.loadKg).toBeGreaterThan(0);
              // Caneleira de exemplo não passa de 10 kg; halter feminino de isolado não começa em 20 kg.
              if (ex.implement === "caneleira") expect(set.loadKg!).toBeLessThanOrEqual(10);
            }
          }
          if (ex.unit && ex.unit !== "reps") expect(log.unit).toBe(ex.unit);
        }
      }
      // A ficha fica com a carga atual de cada exercício com peso.
      const loaded = program.days.flatMap((d) => d.exercises).filter((p) => loadIncrement(p.exerciseId, 20) > 0 && getExercise(p.exerciseId)?.unit !== "min");
      expect(loaded.every((p) => (p.loadKg ?? 0) > 0)).toBe(true);
    }
  });
});
