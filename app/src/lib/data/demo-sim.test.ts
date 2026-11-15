import { describe, expect, it } from "vitest";
import { simulateSessions } from "./demo";
import { generateProgram } from "@/lib/domain/generator";
import { e1rmSeries } from "@/lib/domain/progression";

describe("simulação da demonstração", () => {
  it("cargas e reps progridem ao longo das semanas", () => {
    const program = generateProgram({ goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", seed: 42 }, { ownerId: "u", createdBy: "u" });
    const sessions = simulateSessions("u", program, 8, 3, 42, 0.1);
    const main = program.days[1]!.exercises.find((e) => e.exerciseId === "remada_curvada_barra") ?? program.days[1]!.exercises[1]!;
    const series = e1rmSeries(sessions, main.exerciseId);
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value);
  });
});
