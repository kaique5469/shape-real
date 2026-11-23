import { describe, expect, it } from "vitest";
import { buildFichaPacket, parsePacket, type FichaPacket } from "./transfer";
import type { Profile, Program } from "./types";

// U5a: `adjustedAt` existe só no aparelho do aluno. Se um link trouxer o campo (app adulterado ou versão futura),
// ele não entra: o esquema do pacote descarta campos desconhecidos da ficha.
const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const student: Profile = { id: "s1", name: "Juliana Prado", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1" };
const program: Program = {
  id: "p1",
  ownerId: "s1",
  createdBy: "c1",
  name: "ABCD inferiores",
  system: "abcd_inferiores",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 4,
  days: [{ key: "A", title: "Quadríceps", focus: ["quadriceps"], exercises: [{ uid: "u1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: 3, repsMin: 8, repsMax: 12, restSec: 90, loadKg: 25, technique: "normal" }] }],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};

describe("parsePacket e adjustedAt (U5a)", () => {
  it("um pacote com program.adjustedAt devolve a ficha sem o campo", () => {
    const packet = buildFichaPacket({ coach, student, program: { ...program, adjustedAt: "2026-11-20T10:00:00Z" }, diet: null, customExercises: [], customFoods: [] });
    const back = parsePacket(JSON.parse(JSON.stringify(packet))) as FichaPacket | null;
    expect(back?.program).toBeTruthy();
    expect(back!.program).not.toHaveProperty("adjustedAt");
    expect(back!.program!.updatedAt).toBe(program.updatedAt);
  });
});
