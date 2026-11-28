import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/domain/types";

// Integração da rodada 3 (passo 4 do adendo): links e cópias de segurança gerados ANTES da rodada 3 continuam abrindo
// com o código de agora, e o schema aceita pacote sem `plannedSets` e sem dor. As fixtures vêm do código da M-A
// (produção antes da R3) e da interface do 11de1ab: integracao.r3.fixtures.ts. Grava no repositório local de verdade
// sobre um localStorage em memória. Dados fictícios.

class MemStorage {
  m = new Map<string, string>();
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
const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);
vi.mock("@/lib/app-context", async () => {
  const { LocalRepository } = await import("@/lib/data/local");
  return { localRepo: new LocalRepository() };
});
vi.mock("@/lib/analytics", () => ({ track: () => {}, reportError: () => {} }));

const { localRepo } = await import("@/lib/app-context");
const { unpackData, packedFromHash } = await import("@/lib/share-link");
const { parsePacket, ehLinkDeVersaoNova, sessionToText } = await import("@/lib/domain/transfer");
const { parsePedido, parseRespostas, packetProblem } = await import("@/lib/domain/questionario-link");
const { fichaLinkMatch } = await import("@/lib/domain/link-identity");
const { completude, activeMinutes } = await import("@/lib/domain/session-time");
const { volumeDaSessao } = await import("@/lib/domain/progression");
const { importFicha, importTreinos, lerCopia, restoreBackup } = await import("./transfer-client");
const F = await import("./integracao.r3.fixtures");

const abrir = async (link: string) => unpackData(packedFromHash(link.slice(link.indexOf("#")))!);
const ficha = async (link: string) => {
  const p = parsePacket(await abrir(link));
  if (!p || p.kind !== "ficha") throw new Error("ficha não abriu");
  return p;
};
const treinos = async (link: string) => {
  const p = parsePacket(await abrir(link));
  if (!p || p.kind !== "treinos") throw new Error("treinos não abriu");
  return p;
};
const copia = (texto: string) => {
  const r = lerCopia(texto);
  if (!("copia" in r)) throw new Error(`cópia recusada: ${r.problema}`);
  return r.copia;
};

/** Tamanho de cada coleção `sr:v1:*` que é lista (as outras chaves, como datas, ficam de fora). */
const contagens = () =>
  [...storage.m.keys()]
    .filter((k) => k.startsWith("sr:v1:"))
    .sort()
    .flatMap((k) => {
      try {
        const v: unknown = JSON.parse(storage.m.get(k)!);
        return Array.isArray(v) ? [[k, v.length] as const] : [];
      } catch {
        return [];
      }
    });

beforeEach(() => storage.clear());

describe("links antigos (M-A e 11de1ab) abrem com o código da rodada 3", () => {
  it("ficha: o schema aceita, não é 'versão nova' e, num aparelho sem perfil, entra como perfil novo com ficha e dieta", async () => {
    for (const link of [F.MA_LINK_FICHA, F.UI_LINK_FICHA]) {
      storage.clear();
      const raw = await abrir(link);
      expect(ehLinkDeVersaoNova(raw)).toBe(false);
      const p = await ficha(link);
      expect(fichaLinkMatch(p, null)).toBe("novo");
      const perfil = await importFicha(p, null, { consent: true });
      expect(perfil.role).toBe("athlete");
      expect(perfil.remoteCoach?.id).toBe(p.coach.id);
      expect(await localRepo.listPrograms(perfil.id)).toHaveLength(1);
      if (p.diet) expect(await localRepo.getDiet(perfil.id)).not.toBeNull();
    }
  });

  it("ficha: reabrir o mesmo link antigo com o perfil criado por ele atualiza sem duplicar (estado 'mesmo')", async () => {
    const p = await ficha(F.MA_LINK_FICHA);
    const perfil = await importFicha(p, null, { consent: true });
    expect(fichaLinkMatch(p, perfil)).toBe("mesmo");
    await importFicha(p, perfil, { consent: true });
    expect(localRepo.listLocalProfiles().filter((x) => x.role === "athlete")).toHaveLength(1);
    expect(await localRepo.listPrograms(perfil.id)).toHaveLength(1);
  });

  it("treinos: pacote sem plannedSets e sem dor abre; nada de completude inventada e o volume é recalculado pela convenção", async () => {
    for (const link of [F.MA_LINK_TREINOS, F.UI_LINK_TREINOS]) {
      const p = await treinos(link);
      expect(p.sessions.length).toBeGreaterThan(0);
      for (const s of p.sessions) {
        expect(s.plannedSets).toBeUndefined();
        expect(s.exercises.some((e) => e.pain !== undefined)).toBe(false);
        expect(completude(s).texto).toBeNull();
        expect(completude(s).parcial).toBe(false);
        expect(s.volumeKg).toBe(volumeDaSessao(s));
        expect(sessionToText(s)).not.toMatch(/Dor|parcial/);
      }
    }
    // O remetente antigo gravou a prancha com carga no volume (cache); a chegada recalcula: só o supino conta.
    const ma = await treinos(F.MA_LINK_TREINOS);
    const s = ma.sessions.find((x) => x.id === "t-aluno-2")!;
    expect(s.volumeKg).toBe(44 * 30);
    expect(activeMinutes(s)).toBe(52);
  });

  it("treinos: o personal registra o retorno antigo no aluno do link, sem pedir confirmação", async () => {
    const coach: Profile = { id: "c-ma", name: "Paulo Personal Fictício", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-10-01T10:00:00.000Z" };
    const aluno: Profile = { id: "s-ma", name: "Carla Fictícia Souza", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-10-02T10:00:00.000Z", managedBy: "c-ma" };
    await localRepo.saveProfile(coach);
    await localRepo.saveProfile(aluno);
    localRepo.linkDirect("c-ma", "s-ma", "2026-10-02T10:00:00.000Z");
    const r = await importTreinos(await treinos(F.MA_LINK_TREINOS), "s-ma", { coachId: "c-ma" });
    expect(r.added).toBe(2);
    const salvos = await localRepo.listSessions("s-ma");
    expect(salvos).toHaveLength(2);
    expect(salvos.every((s) => s.plannedSets === undefined)).toBe(true);
    // Reabrir o mesmo link: idempotente.
    const de_novo = await importTreinos(await treinos(F.MA_LINK_TREINOS), "s-ma", { coachId: "c-ma" });
    expect(de_novo.added).toBe(0);
    expect(await localRepo.listSessions("s-ma")).toHaveLength(2);
  });

  it("questionário: pedido e respostas antigos abrem (parsePedido / parseRespostas, sem problema de versão)", async () => {
    for (const link of [F.MA_LINK_PEDIDO, F.UI_LINK_PEDIDO]) {
      const raw = await abrir(link);
      expect(packetProblem(raw)).toBeNull();
      expect(parsePedido(raw)).not.toBeNull();
    }
    for (const link of [F.MA_LINK_RESPOSTAS, F.UI_LINK_RESPOSTAS]) {
      const raw = await abrir(link);
      expect(packetProblem(raw)).toBeNull();
      expect(parseRespostas(raw)).not.toBeNull();
    }
  });
});

describe("schema tolerante: campos novos são opcionais e nunca recusam o link", () => {
  it("pacote de treinos com plannedSets e dor malformados abre e descarta só esses campos", async () => {
    const raw = (await abrir(F.MA_LINK_TREINOS)) as { sessions: Record<string, unknown>[] };
    const s0 = raw.sessions[0]! as { plannedSets?: unknown; activeMin?: unknown; exercises: Record<string, unknown>[] };
    s0.plannedSets = "vinte";
    s0.activeMin = -3;
    s0.exercises[0]!.pain = "sim";
    const p = parsePacket(raw);
    expect(p?.kind).toBe("treinos");
    const s = (p as Awaited<ReturnType<typeof treinos>>).sessions.find((x) => x.id === (s0 as unknown as { id: string }).id)!;
    expect(s.plannedSets).toBeUndefined();
    expect(s.activeMin).toBeUndefined();
    expect(s.exercises[0]!.pain).toBeUndefined();
  });

  it("os mesmos campos, bem formados, passam (plannedSets 24 e dor no supino)", async () => {
    const raw = (await abrir(F.MA_LINK_TREINOS)) as { sessions: Record<string, unknown>[] };
    const s0 = raw.sessions[0]! as { id: string; plannedSets?: unknown; exercises: Record<string, unknown>[] };
    s0.plannedSets = 24;
    s0.exercises[0]!.pain = true;
    const p = parsePacket(raw) as Awaited<ReturnType<typeof treinos>>;
    const s = p.sessions.find((x) => x.id === s0.id)!;
    expect(s.plannedSets).toBe(24);
    expect(s.exercises[0]!.pain).toBe(true);
  });
});

describe("cópias de segurança antigas (v1 e v2) abrem e restauram num aparelho limpo", () => {
  it("v2 do personal (M-A): restaura o personal com o aluno, a ficha, o treino e a anamnese", async () => {
    const b = copia(F.MA_BACKUP_COACH_V2);
    const r = await restoreBackup(b);
    expect(r.profile.id).toBe("c-ma");
    expect(r.students).toBe(1);
    const alunos = await localRepo.listStudents("c-ma");
    expect(alunos.map((a) => a.profile.id)).toEqual(["s-ma"]);
    expect(await localRepo.listPrograms("s-ma")).toHaveLength(1);
    expect(await localRepo.listSessions("s-ma")).toHaveLength(1);
    expect((await localRepo.getProfile("s-ma"))?.anamnese?.id).toBe("rodada-ma-1");
    expect((await localRepo.listCustomExercises("c-ma")).map((e) => e.id)).toContain("custom_remada_ma");
  });

  it("v2 do aluno (M-A): restaura o aluno, os 2 treinos, as marcas de envio e cria o contato do personal", async () => {
    const b = copia(F.MA_BACKUP_ALUNO_V2);
    const r = await restoreBackup(b);
    expect(r.profile.role).toBe("athlete");
    expect(await localRepo.listSessions(r.profile.id)).toHaveLength(2);
    expect((await localRepo.getProfile("c-ma"))?.role).toBe("coach");
    expect(storage.getItem(`sr:sent:${r.profile.id}`)).toContain("t-aluno-1");
  });

  it("v1 (sem format nem v): abre e restaura perfil, ficha e treinos", async () => {
    const b = copia(F.MA_BACKUP_ALUNO_V1);
    expect(b.v).toBeUndefined();
    const r = await restoreBackup(b);
    expect(await localRepo.listPrograms(r.profile.id)).toHaveLength(1);
    expect(await localRepo.listSessions(r.profile.id)).toHaveLength(2);
  });

  it("restaurar a mesma cópia antiga 2 vezes dá as mesmas contagens", async () => {
    await restoreBackup(copia(F.MA_BACKUP_COACH_V2));
    const antes = contagens();
    await restoreBackup(copia(F.MA_BACKUP_COACH_V2));
    expect(contagens()).toEqual(antes);
    expect(antes.length).toBeGreaterThan(3);
  });
});
