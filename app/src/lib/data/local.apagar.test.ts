import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/domain/types";

/**
 * "Apagar dados deste aparelho" no modo local usa `wipe()`: no aparelho do personal ficam os alunos dele (perfis,
 * fichas, treinos, medidas, dietas) e o registro de envio; no da aluna, o rascunho do treino em andamento e o perfil
 * do personal. Nada disso pode sobrar.
 */
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
  keys() {
    return [...this.m.keys()];
  }
}
const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);
vi.stubGlobal("indexedDB", {
  deleteDatabase: () => {
    const req: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  },
});

const { LocalRepository } = await import("./local");
const repo = new LocalRepository();

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z", phone: "11999990000" };
const aluna: Profile = { id: "s1", name: "Juliana", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1" };

beforeEach(() => storage.clear());

describe("apagar dados deste aparelho (modo local)", () => {
  it("aparelho do personal: não sobra aluno, ficha, treino, dieta nem chave sr:sent*", async () => {
    await repo.saveProfile(coach);
    await repo.saveProfile(aluna);
    storage.setItem("sr:v1:programs", JSON.stringify([{ id: "p1", ownerId: "s1", createdBy: "c1" }]));
    storage.setItem("sr:v1:sessions", JSON.stringify([{ id: "t1", userId: "s1" }]));
    storage.setItem("sr:v1:metrics", JSON.stringify([{ id: "m1", userId: "s1" }]));
    storage.setItem("sr:v1:diets", JSON.stringify([{ id: "d1", ownerId: "s1" }]));
    storage.setItem("sr:sent:s1:ficha", "{}");
    storage.setItem("sr:sent:s1:ack", "{}");
    storage.setItem("sr:sent:@desde", "2026-11-01T00:00:00Z");
    storage.setItem("outra:chave", "fica");

    await repo.wipe();

    expect(storage.keys().filter((k) => k.startsWith("sr:"))).toEqual([]);
    expect(repo.listLocalProfiles()).toEqual([]);
    expect(storage.getItem("outra:chave")).toBe("fica");
  });

  it("aparelho da aluna: o rascunho do treino (com cargas) e o perfil do personal também saem", async () => {
    await repo.saveProfile({ ...aluna, managedBy: undefined });
    await repo.saveProfile({ ...coach, id: "teste-personal" });
    storage.setItem("sr:draft:s1", JSON.stringify({ programName: "ABCD Glúteos", exercises: [{ loadKg: 42.5 }] }));

    await repo.wipe();

    expect(storage.keys().filter((k) => k.startsWith("sr:draft:"))).toEqual([]);
    expect(repo.listLocalProfiles()).toEqual([]);
  });
});
