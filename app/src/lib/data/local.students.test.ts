import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyMetric, Profile, Program, Session } from "@/lib/domain/types";

/**
 * Rodada 3 (R3-6, "painel com 100 alunos"): `listStudents` do modo local lê cada coleção UMA vez. Equivalência com o
 * jeito antigo (listSessions + listPrograms + listMetrics por aluno, mais summarizeStudent), com relógio parado:
 * 0, 1 e 100 alunos, alunos de outro personal, perfil sumido, empates de ordem e coleção ausente ou estragada.
 */
class MemStorage {
  m = new Map<string, string>();
  leituras = new Map<string, number>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.leituras.set(k, (this.leituras.get(k) ?? 0) + 1);
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
    this.leituras.clear();
  }
}

const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);

const { LocalRepository } = await import("./local");
const { summarizeStudent } = await import("./repository");
const repo = new LocalRepository();

const NOW = new Date(2026, 10, 19, 12);
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

const put = (name: string, rows: unknown) => storage.setItem(`sr:v1:${name}`, typeof rows === "string" ? rows : JSON.stringify(rows));
const day = (n: number, hour = 10) => new Date(2026, 10, n, hour).toISOString();

const perfil = (id: string, extra: Partial<Profile> = {}): Profile => ({ id, name: `Aluno ${id}`, role: "athlete", plan: "free", onboarded: true, createdAt: day(1), managedBy: "c1", daysPerWeek: 3, weightKg: 70, ...extra });
const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: day(1) };
const sessao = (id: string, userId: string, startedAt: string): Session => ({ id, userId, startedAt, finishedAt: startedAt, exercises: [], volumeKg: 0, prs: [] });
const ficha = (id: string, ownerId: string, active: boolean, updatedAt: string, daysPerWeek = 4): Program => ({
  id,
  ownerId,
  createdBy: "c1",
  name: `Ficha ${id}`,
  system: "abc" as Program["system"],
  goal: "hipertrofia" as Program["goal"],
  level: "iniciante" as Program["level"],
  daysPerWeek,
  days: [{ key: "A", title: "A", focus: [], exercises: [] }],
  active,
  source: "personal",
  createdAt: day(1),
  updatedAt,
});
const medida = (id: string, userId: string, date: string, weightKg: number | null): BodyMetric => ({ id, userId, date, weightKg });

/** O jeito antigo, linha por linha: uma leitura de cada coleção POR aluno. */
async function listStudentsAntigo(coachId: string) {
  const links = JSON.parse(storage.m.get("sr:v1:links") ?? "[]") as { coachId: string; studentId: string; since: string }[];
  const profiles = JSON.parse(storage.m.get("sr:v1:profiles") ?? "[]") as Profile[];
  const out = [];
  for (const l of links.filter((x) => x.coachId === coachId)) {
    const p = profiles.find((x) => x.id === l.studentId);
    if (!p) continue;
    out.push(summarizeStudent(p, l.since, await repo.listSessions(p.id), await repo.listPrograms(p.id), await repo.listMetrics(p.id)));
  }
  return out;
}

/** Painel com `n` alunos de c1 (dados variados), 5 de outro personal e linhas soltas de quem não é aluno. */
function carteira(n: number) {
  const alunos = Array.from({ length: n }, (_, i) => perfil(`s${i}`, i % 7 === 0 ? { daysPerWeek: undefined, weightKg: undefined } : {}));
  const outros = Array.from({ length: 5 }, (_, i) => perfil(`o${i}`, { managedBy: "c2" }));
  put("profiles", [coach, ...alunos, ...outros, { ...coach, id: "c2", name: "Outra Personal" }]);
  put("links", [...alunos.map((a, i) => ({ coachId: "c1", studentId: a.id, since: day(1 + (i % 10)) })), ...outros.map((o) => ({ coachId: "c2", studentId: o.id, since: day(2) }))]);
  const sessions: Session[] = [];
  const programs: Program[] = [];
  const metrics: BodyMetric[] = [];
  // Ordem gravada embaralhada de propósito (intercalando alunos), como fica depois de meses de uso.
  for (let k = 0; k < 12; k++) {
    alunos.forEach((a, i) => {
      if ((i + k) % 3 === 0) sessions.push(sessao(`${a.id}-t${k}`, a.id, day(1 + ((i * 7 + k * 5) % 19), 6 + (k % 12))));
      if (k === 0 && i % 4 !== 3) programs.push(ficha(`${a.id}-f1`, a.id, i % 2 === 0, day(2)), ficha(`${a.id}-f2`, a.id, i % 2 === 1, day(2)));
      if (k < 3 && i % 5 !== 4) metrics.push(medida(`${a.id}-m${k}`, a.id, `2026-1${k === 0 ? "0-05" : k === 1 ? "0-25" : "1-15"}`, k === 1 && i % 3 === 0 ? null : 70 + i * 0.1 - k));
    });
    outros.forEach((o) => sessions.push(sessao(`${o.id}-t${k}`, o.id, day(18))));
  }
  // Empate exato de início (mesmo instante) e de edição: a ordem gravada decide, igual antes.
  if (n) sessions.push(sessao("empate-1", "s0", day(18, 9)), sessao("empate-2", "s0", day(18, 9)));
  sessions.push(sessao("solto", "ninguem", day(18)), sessao("do-personal", "c1", day(18)));
  programs.push(ficha("do-personal", "c1", true, day(3)));
  put("sessions", sessions);
  put("programs", programs);
  put("metrics", metrics);
}

beforeEach(() => storage.clear());

describe("listStudents lê cada coleção uma vez (R3-6)", () => {
  it("100 alunos: resultado igual ao jeito antigo (deep-equal, mesma ordem)", async () => {
    carteira(100);
    const antigo = await listStudentsAntigo("c1");
    storage.leituras.clear();
    const novo = await repo.listStudents("c1");
    expect(novo).toHaveLength(100);
    expect(novo).toEqual(antigo);
    expect(novo.map((s) => s.profile.id)).toEqual(Array.from({ length: 100 }, (_, i) => `s${i}`));
  });

  it("100 alunos: cada coleção é lida uma vez só (antes: 100 vezes cada)", async () => {
    carteira(100);
    storage.leituras.clear();
    await repo.listStudents("c1");
    for (const nome of ["links", "profiles", "sessions", "programs", "metrics"]) expect(storage.leituras.get(`sr:v1:${nome}`), nome).toBe(1);
  });

  it("1 aluno e 0 aluno: iguais ao antigo; sem aluno, nenhuma coleção de treino é lida", async () => {
    carteira(1);
    expect(await repo.listStudents("c1")).toEqual(await listStudentsAntigo("c1"));
    storage.clear();
    carteira(0);
    storage.leituras.clear();
    expect(await repo.listStudents("c1")).toEqual([]);
    expect(storage.leituras.get("sr:v1:sessions")).toBeUndefined();
  });

  it("só os alunos deste personal; o personal e linhas soltas não entram", async () => {
    carteira(3);
    const out = await repo.listStudents("c1");
    expect(out.map((s) => s.profile.id)).toEqual(["s0", "s1", "s2"]);
    expect((await repo.listStudents("c2")).map((s) => s.profile.id)).toEqual(["o0", "o1", "o2", "o3", "o4"]);
    expect(await repo.listStudents("c2")).toEqual(await listStudentsAntigo("c2"));
  });

  it("os números do painel batem: treinos na semana, última sessão, ficha ativa e meta", async () => {
    carteira(10);
    const novo = await repo.listStudents("c1");
    const antigo = await listStudentsAntigo("c1");
    const campos = (xs: typeof novo) => xs.map((s) => [s.lastSessionAt, s.sessions7d, s.sessions28d, s.sessionsWeek, s.weeklyGoal, s.activeProgram?.id ?? null, s.latestWeightKg, s.weightDelta28d]);
    expect(campos(novo)).toEqual(campos(antigo));
  });

  it("vínculo com perfil sumido é pulado (como antes); perfil repetido: vale o primeiro", async () => {
    carteira(2);
    const links = JSON.parse(storage.m.get("sr:v1:links")!) as unknown[];
    put("links", [...links, { coachId: "c1", studentId: "fantasma", since: day(3) }]);
    const profiles = JSON.parse(storage.m.get("sr:v1:profiles")!) as Profile[];
    put("profiles", [...profiles, perfil("s1", { name: "Duplicado depois" })]);
    const novo = await repo.listStudents("c1");
    expect(novo.map((s) => s.profile.id)).toEqual(["s0", "s1"]);
    expect(novo[1]!.profile.name).toBe("Aluno s1");
    expect(novo).toEqual(await listStudentsAntigo("c1"));
  });

  it("coleção de treinos ausente ou estragada: lista vazia para todos, sem erro (como antes)", async () => {
    carteira(3);
    storage.m.delete("sr:v1:sessions");
    put("metrics", "{não é json");
    const novo = await repo.listStudents("c1");
    // Sem medidas legíveis, o peso vem do perfil (s0 não tem peso no perfil).
    expect(novo.map((s) => [s.lastSessionAt, s.latestWeightKg])).toEqual([
      [null, null],
      [null, 70],
      [null, 70],
    ]);
    expect(novo).toEqual(await listStudentsAntigo("c1"));
  });

  it("não grava nada: o formato dos dados fica igual", async () => {
    carteira(5);
    const antes = new Map(storage.m);
    await repo.listStudents("c1");
    expect(storage.m).toEqual(antes);
  });
});
