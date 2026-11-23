import { describe, expect, it, vi } from "vitest";
import type { Profile, Program } from "@/lib/domain/types";

// U5a: reenvio da ficha com o MESMO id apaga o ajuste feito no aparelho do aluno (o registro é substituído inteiro).
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
vi.stubGlobal("localStorage", new MemStorage());
vi.stubGlobal("window", globalThis);

vi.mock("@/lib/app-context", async () => {
  const { LocalRepository } = await import("@/lib/data/local");
  return { localRepo: new LocalRepository() };
});
vi.mock("@/lib/analytics", () => ({ track: () => {}, reportError: () => {} }));

const { localRepo } = await import("@/lib/app-context");
const { buildFichaPacket } = await import("@/lib/domain/transfer");
const { importFicha } = await import("./transfer-client");

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
const packet = (p: Program) => buildFichaPacket({ coach, student, program: p, diet: null, customExercises: [], customFoods: [] });

describe("reenvio da ficha e adjustedAt (U5a)", () => {
  it("depois de gravar adjustedAt, um novo importFicha com o mesmo id deixa a ficha sem adjustedAt", async () => {
    const aluna = await importFicha(packet(program), null);
    const mine = (await localRepo.listPrograms(aluna.id)).find((p) => p.id === "p1")!;
    // A aluna ajusta a ficha do personal neste aparelho (o "Salvar ficha" grava adjustedAt e mantém createdBy).
    await localRepo.saveProgram({ ...mine, days: [{ ...mine.days[0]!, exercises: [{ ...mine.days[0]!.exercises[0]!, sets: 5 }] }], adjustedAt: "2026-11-24T15:00:00Z" });
    expect((await localRepo.getProgram("p1"))?.adjustedAt).toBe("2026-11-24T15:00:00Z");

    await importFicha(packet({ ...program, updatedAt: "2026-11-25T09:00:00Z" }), aluna);
    const after = await localRepo.getProgram("p1");
    expect(after).toBeTruthy();
    expect(after).not.toHaveProperty("adjustedAt");
    expect(after!.createdBy).toBe("c1");
    expect(after!.days[0]!.exercises[0]!.sets).toBe(3);
  });

  it("ficha nova com OUTRO id: a ajustada continua no aparelho, inativa, com o ajuste", async () => {
    const aluna = await importFicha(packet({ ...program, id: "p10" }), null);
    const mine = (await localRepo.getProgram("p10"))!;
    await localRepo.saveProgram({ ...mine, adjustedAt: "2026-11-24T15:00:00Z" });
    await importFicha(packet({ ...program, id: "p11" }), aluna);
    const old = await localRepo.getProgram("p10");
    expect(old).toMatchObject({ adjustedAt: "2026-11-24T15:00:00Z", active: false });
    expect((await localRepo.getProgram("p11"))?.active).toBe(true);
  });
});
