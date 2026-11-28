import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/domain/types";

// R3-3: a pendência não some só porque copiou. "Para enviar", "preparado sem confirmação" e "enviado (declarado)" no
// aparelho do aluno, gravados e lidos de verdade (localStorage em memória). Dados fictícios.

class MemStorage {
  m = new Map<string, string>();
  quebrado = false;
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
    if (this.quebrado) throw new DOMException("cota", "QuotaExceededError");
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
const { lembreteDeCopia, pendenciaDeEnvio, sessionDelivery } = await import("@/lib/domain/delivery");
const { MAX_SESSIONS_PER_LINK } = await import("@/lib/domain/transfer");
const T = await import("./transfer-client");

const treino = (i: number): Session => ({ id: `t${i}`, userId: "a1", startedAt: new Date(Date.UTC(2026, 10, 1 + i, 18)).toISOString(), exercises: [], volumeKg: 0, prs: [] });
/** O que o Hoje e o Histórico leem ao abrir (sempre do aparelho, como o hook). */
const ler = (sessions: Session[]) => pendenciaDeEnvio(sessions, { legacySent: T.sentSessionIds("a1"), log: T.prepLog("a1"), decl: T.declaracoesDeEnvio("a1") });
const estado = (id: string) => sessionDelivery({ id, legacySent: T.sentSessionIds("a1"), log: T.prepLog("a1"), decl: T.declaracoesDeEnvio("a1") });

beforeEach(() => {
  storage.clear();
  storage.quebrado = false;
});

describe("três estados no aparelho do aluno", () => {
  it("copiar: sai de 'para enviar', vira 'preparado' e aparece no lembrete discreto do Hoje", () => {
    const ss = [treino(1), treino(2)];
    expect(ler(ss).toSend.map((s) => s.id)).toEqual(["t1", "t2"]);
    expect(T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z")).toBe(true);
    const p = ler(ss);
    expect(p.toSend.map((s) => s.id)).toEqual(["t2"]);
    expect(p.prepared).toEqual([{ session: ss[0], via: "copy", at: "2026-11-23T21:40:00.000Z" }]);
    expect(lembreteDeCopia(p.prepared.map((x) => ({ id: x.session.id, via: x.via, at: x.at })))?.texto).toBe("Você copiou 1 treino. Já colou na conversa?");
  });

  it("envio iniciado no WhatsApp: 'preparado', mas não cobra no Hoje (o Histórico mostra o estado)", () => {
    T.markSessionsPrepared("a1", ["t1"], "whatsapp", "2026-11-23T21:40:00.000Z");
    const p = ler([treino(1)]);
    expect(p.toSend).toEqual([]);
    expect(p.prepared.map((x) => x.via)).toEqual(["whatsapp"]);
    expect(lembreteDeCopia(p.prepared.map((x) => ({ id: x.session.id, via: x.via, at: x.at })))).toBeNull();
    expect(estado("t1").kind).toBe("iniciado");
  });

  it("'Já enviei': declarado (rotulado como declaração), sai das duas listas e entra na lista antiga", () => {
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z");
    expect(T.declareSessionsSent("a1", ["t1"], "2026-11-23T22:00:00.000Z")).toBe(true);
    expect(estado("t1")).toEqual({ kind: "declarado", at: "2026-11-23T22:00:00.000Z", prep: { via: "copy", at: "2026-11-23T21:40:00.000Z" } });
    expect(ler([treino(1)])).toEqual({ toSend: [], prepared: [] });
    expect(T.sentSessionIds("a1").has("t1")).toBe(true);
  });

  it("dispensar nunca vira confirmação: some do lembrete e continua 'preparado' no Histórico", () => {
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z");
    expect(T.dismissSessionsReminder("a1", ["t1"], "2026-11-23T22:00:00.000Z")).toBe(true);
    expect(ler([treino(1)])).toEqual({ toSend: [], prepared: [] });
    expect(estado("t1")).toEqual({ kind: "iniciado", via: "copy", at: "2026-11-23T21:40:00.000Z" });
    expect(T.declaracoesDeEnvio("a1").t1).toEqual({ dispensei: "2026-11-23T22:00:00.000Z" });
    // Copiar de novo depois de dispensar: o lembrete volta.
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-24T10:00:00.000Z");
    expect(ler([treino(1)]).prepared.map((x) => x.session.id)).toEqual(["t1"]);
  });

  it("o Histórico mantém o estado ao reabrir (tudo vem do aparelho)", () => {
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z");
    T.declareSessionsSent("a1", ["t2"], "2026-11-23T22:00:00.000Z");
    const primeiro = [estado("t1"), estado("t2"), estado("t3")];
    // "Reabrir": nada em memória, só o que está gravado.
    const copia = new Map(storage.m);
    storage.clear();
    for (const [k, v] of copia) storage.setItem(k, v);
    expect([estado("t1"), estado("t2"), estado("t3")]).toEqual(primeiro);
    expect(primeiro.map((d) => d.kind)).toEqual(["iniciado", "declarado", "nao_enviado"]);
  });

  it("toque de uma versão anterior (só na lista antiga): não é 'para enviar' nem entra no lembrete", () => {
    T.markSessionsSent("a1", ["t1"]);
    expect(ler([treino(1)])).toEqual({ toSend: [], prepared: [] });
    expect(estado("t1").kind).toBe("iniciado_antigo");
  });
});

describe("lote acima do limite (QA-07)", () => {
  it("23 pendentes, link com 20: os 20 da mensagem viram 'preparado' e os 3 continuam 'para enviar'", () => {
    const ss = Array.from({ length: 23 }, (_, i) => treino(i + 1));
    expect(MAX_SESSIONS_PER_LINK).toBe(20);
    // O diálogo leva os 20 mais recentes (SendToCoach) e o toque marca só eles.
    const naMensagem = [...ss].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SESSIONS_PER_LINK);
    T.markSessionsPrepared("a1", naMensagem.map((s) => s.id), "copy", "2026-11-25T10:00:00.000Z");
    const p = ler(ss);
    expect(p.toSend.map((s) => s.id)).toEqual(["t1", "t2", "t3"]);
    expect(p.prepared).toHaveLength(20);
  });
});

describe("falha ao registrar o toque", () => {
  it("markSessionsPrepared com setItem lançando → false, e a lista antiga e o log ficam como estavam", () => {
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z");
    const antes = new Map(storage.m);
    storage.quebrado = true;
    expect(T.markSessionsPrepared("a1", ["t2"], "whatsapp", "2026-11-23T22:00:00.000Z")).toBe(false);
    storage.quebrado = false;
    expect(storage.m).toEqual(antes);
    expect([...T.sentSessionIds("a1")]).toEqual(["t1"]);
    expect(estado("t2").kind).toBe("nao_enviado");
  });

  it("'Já enviei' e dispensar que não gravam devolvem false e não afirmam nada", () => {
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z");
    storage.quebrado = true;
    expect(T.declareSessionsSent("a1", ["t1"])).toBe(false);
    expect(T.dismissSessionsReminder("a1", ["t1"])).toBe(false);
    storage.quebrado = false;
    expect(estado("t1").kind).toBe("iniciado");
    expect(T.declaracoesDeEnvio("a1")).toEqual({});
  });

  it("declarações ilegíveis no armazenamento não quebram nem inventam envio", () => {
    storage.setItem("sr:sent:a1:decl", "{quebrado");
    expect(T.declaracoesDeEnvio("a1")).toEqual({});
    storage.setItem("sr:sent:a1:decl", JSON.stringify({ t1: { enviei: "ontem" } }));
    expect(estado("t1").kind).toBe("nao_enviado");
  });
});

describe("as declarações seguem as chaves de envio", () => {
  it("vão na cópia de segurança, voltam ao restaurar e somem com o perfil", async () => {
    const aluna = { id: "a1", name: "Marina Costa", role: "athlete" as const, plan: "free" as const, onboarded: true, createdAt: "2026-11-01T10:00:00Z" };
    await localRepo.saveProfile(aluna);
    T.markSessionsPrepared("a1", ["t1"], "copy", "2026-11-23T21:40:00.000Z");
    T.declareSessionsSent("a1", ["t1"], "2026-11-23T22:00:00.000Z");
    const backup = await T.collectBackup(localRepo, aluna, new Date("2026-11-24T12:00:00Z"));
    expect(Object.keys(backup.sent ?? {})).toContain("sr:sent:a1:decl");
    storage.clear();
    await T.restoreBackup(T.parseBackup(JSON.stringify(backup))!);
    expect(T.declaracoesDeEnvio("a1").t1?.enviei).toBe("2026-11-23T22:00:00.000Z");
    T.clearDeliveryKeys("a1");
    expect(storage.getItem("sr:sent:a1:decl")).toBeNull();
  });
});
