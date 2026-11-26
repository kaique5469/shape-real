import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/domain/types";
import { anamneseBase } from "@/lib/domain/anamnese-fixtures";

/**
 * Armazenamento do questionário (track D): rascunhos, "enviado" e "apagado" sob `sr:v1:`, sem conteúdo nos registros de
 * data, leitura que nunca lança e limpeza por prazo. Storage em memória no globalThis (testes sem navegador).
 */
class MemStorage {
  m = new Map<string, string>();
  bloqueado = false;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.bloqueado) throw new Error("SecurityError");
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.bloqueado) throw new Error("QuotaExceededError");
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
vi.stubGlobal("indexedDB", {
  open: () => {
    throw new Error("sem IndexedDB no teste");
  },
});

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ reportError }));

const qc = await import("./questionario-client");
const { LocalRepository } = await import("./data/local");

const AGORA = new Date("2026-11-26T12:00:00Z");
const diasAntes = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
const rascunho = (over: Partial<import("./questionario-client").Rascunho> = {}) => ({
  a: { nome: "Ana Souza", sexo: "F" as const, parq: [0, 1, 0, 0, 0, 0, 0] as import("@/lib/domain/anamnese-types").Parq },
  parte: 2,
  at: diasAntes(1),
  iniciadoEm: diasAntes(2),
  ...over,
});

beforeEach(async () => {
  // O aviso de rascunho ilegível carrega a medição por import tardio: espera os pendentes antes de zerar o espião.
  await vi.dynamicImportSettled();
  storage.clear();
  storage.bloqueado = false;
  reportError.mockClear();
});

describe("chaveRascunho", () => {
  it("link: sr:v1:qrascunho:{pedidoId}; junto: sr:v1:qrascunho:aluno-{studentId}", () => {
    expect(qc.chaveRascunho({ pedidoId: "p-123" })).toBe("sr:v1:qrascunho:p-123");
    expect(qc.chaveRascunho({ studentId: "s-9" })).toBe("sr:v1:qrascunho:aluno-s-9");
  });
  it("com os dois, vale o pedido; sem nenhum, lança (nunca grava rascunho sem dono)", () => {
    expect(qc.chaveRascunho({ pedidoId: "p-1", studentId: "s-1" })).toBe("sr:v1:qrascunho:p-1");
    expect(() => qc.chaveRascunho({})).toThrow("rascunho_sem_chave");
  });
  it("as chaves ficam sob sr:v1: ('Apagar dados' leva junto)", () => {
    for (const k of [qc.RASCUNHO_PREFIXO, qc.ENVIADO_PREFIXO, qc.APAGADO_PREFIXO]) expect(k.startsWith("sr:v1:")).toBe(true);
  });
});

describe("salvar, ler e apagar o rascunho", () => {
  it("ida e volta sem perder nada", () => {
    const chave = qc.chaveRascunho({ pedidoId: "p-1" });
    const r = rascunho({ enviarTocadoEm: diasAntes(0), declaro: true, termo: true, consent: false, responsavelOk: true });
    expect(qc.salvarRascunho(chave, r)).toBe(true);
    expect(qc.lerRascunho(chave)).toEqual(r);
    qc.apagarRascunho(chave);
    expect(qc.lerRascunho(chave)).toBeNull();
    expect(storage.m.has(chave)).toBe(false);
  });
  it("chave que não existe: null, sem reportar erro", () => {
    expect(qc.lerRascunho("sr:v1:qrascunho:nada")).toBeNull();
    expect(reportError).not.toHaveBeenCalled();
  });
  it("armazenamento cheio ou bloqueado: salvar devolve false e ler devolve null, sem lançar", () => {
    storage.bloqueado = true;
    expect(qc.salvarRascunho("sr:v1:qrascunho:p-1", rascunho())).toBe(false);
    expect(qc.lerRascunho("sr:v1:qrascunho:p-1")).toBeNull();
    expect(() => qc.apagarRascunho("sr:v1:qrascunho:p-1")).not.toThrow();
  });
});

describe("lerRascunho com dado danificado", () => {
  it("JSON corrompido devolve null sem lançar e reporta só o código, sem conteúdo", async () => {
    storage.setItem("sr:v1:qrascunho:p-1", '{"a":{"nome":"Ana Souza","parq":[1');
    expect(qc.lerRascunho("sr:v1:qrascunho:p-1")).toBeNull();
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    const [erro, onde, extra] = reportError.mock.calls[0] as unknown[];
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe("rascunho_invalido");
    expect(onde).toBe("questionario:rascunho");
    expect(extra).toBeUndefined();
    expect(JSON.stringify(reportError.mock.calls)).not.toContain("Ana");
  });
  it("forma errada (sem respostas, parte negativa, data ilegível) também é inválida", async () => {
    const base = rascunho();
    const ruins = [{ ...base, a: [] }, { ...base, parte: -1 }, { ...base, parte: 1.5 }, { ...base, at: "ontem" }, { ...base, iniciadoEm: undefined }, [base], "texto", 42];
    for (const ruim of ruins) {
      storage.setItem("sr:v1:qrascunho:x", JSON.stringify(ruim));
      expect(qc.lerRascunho("sr:v1:qrascunho:x")).toBeNull();
    }
    await vi.dynamicImportSettled();
  });
  it("campos opcionais com tipo errado somem; o resto fica", () => {
    storage.setItem(
      "sr:v1:qrascunho:x",
      JSON.stringify({ ...rascunho(), consent: "sim", declaro: 1, termo: true, modulos: ["rotina", "inventado", "dorMais"], pulados: "rotina", enviarTocadoEm: "depois", extras: ["Qual seu horário?", 7], respostasExtras: ["De manhã", 3] }),
    );
    const r = qc.lerRascunho("sr:v1:qrascunho:x")!;
    expect(r.consent).toBeUndefined();
    expect(r.declaro).toBeUndefined();
    expect(r.termo).toBe(true);
    expect(r.modulos).toEqual(["rotina", "dorMais"]);
    expect(r.pulados).toBeUndefined();
    expect(r.enviarTocadoEm).toBeUndefined();
    expect(r.extras).toEqual(["Qual seu horário?"]);
    expect(r.respostasExtras).toEqual(["De manhã", undefined]);
    expect(r.parte).toBe(2);
  });
});

describe("enviado e apagado: só a data", () => {
  it("marcarEnviado grava { at } e enviadoEm lê", () => {
    qc.marcarEnviado("p-1", "2026-11-26T10:00:00Z");
    expect(storage.getItem("sr:v1:qenviado:p-1")).toBe(JSON.stringify({ at: "2026-11-26T10:00:00Z" }));
    expect(qc.enviadoEm("p-1")).toBe("2026-11-26T10:00:00Z");
    expect(qc.enviadoEm("p-2")).toBeNull();
  });
  it("marcarApagado grava { at } e apagadoEm lê", () => {
    qc.marcarApagado("an-7", "2026-11-25T09:00:00Z");
    expect(JSON.parse(storage.getItem("sr:v1:qapagado:an-7")!)).toEqual({ at: "2026-11-25T09:00:00Z" });
    expect(qc.apagadoEm("an-7")).toBe("2026-11-25T09:00:00Z");
    expect(qc.apagadoEm("an-8")).toBeNull();
  });
  it("registro danificado ou bloqueado: null, sem lançar", () => {
    storage.setItem("sr:v1:qenviado:p-1", "{nada");
    storage.setItem("sr:v1:qapagado:an-1", JSON.stringify({ at: "quando?" }));
    expect(qc.enviadoEm("p-1")).toBeNull();
    expect(qc.apagadoEm("an-1")).toBeNull();
    storage.bloqueado = true;
    expect(qc.enviadoEm("p-1")).toBeNull();
    expect(() => qc.marcarEnviado("p-1", "2026-11-26T10:00:00Z")).not.toThrow();
  });
});

describe("limparRascunhosVencidos", () => {
  it("apaga com 31 dias sem edição e com 8 dias depois de enviarTocadoEm; mantém os outros", () => {
    const k = (id: string) => qc.chaveRascunho({ pedidoId: id });
    qc.salvarRascunho(k("velho"), rascunho({ at: diasAntes(31), iniciadoEm: diasAntes(40) }));
    qc.salvarRascunho(k("tocado"), rascunho({ at: diasAntes(8), enviarTocadoEm: diasAntes(8) }));
    qc.salvarRascunho(k("recente"), rascunho({ at: diasAntes(29), iniciadoEm: diasAntes(29) }));
    qc.salvarRascunho(k("tocado-ontem"), rascunho({ at: diasAntes(6), enviarTocadoEm: diasAntes(6) }));
    qc.salvarRascunho(qc.chaveRascunho({ studentId: "s-1" }), rascunho({ at: diasAntes(3) }));
    storage.setItem("sr:v1:qenviado:velho", JSON.stringify({ at: diasAntes(90) }));
    storage.setItem("sr:v1:profiles", "[]");

    expect(qc.limparRascunhosVencidos(AGORA)).toBe(2);
    expect(qc.lerRascunho(k("velho"))).toBeNull();
    expect(qc.lerRascunho(k("tocado"))).toBeNull();
    expect(qc.lerRascunho(k("recente"))).not.toBeNull();
    expect(qc.lerRascunho(k("tocado-ontem"))).not.toBeNull();
    expect(qc.lerRascunho(qc.chaveRascunho({ studentId: "s-1" }))).not.toBeNull();
    expect(storage.getItem("sr:v1:qenviado:velho")).not.toBeNull();
    expect(storage.getItem("sr:v1:profiles")).toBe("[]");
  });
  it("rascunho ilegível também sai (pode ter saúde e não serve para continuar)", () => {
    storage.setItem("sr:v1:qrascunho:quebrado", "{");
    expect(qc.limparRascunhosVencidos(AGORA)).toBe(1);
    expect(storage.m.size).toBe(0);
    expect(reportError).not.toHaveBeenCalled();
  });
  it("armazenamento bloqueado: 0, sem lançar", () => {
    qc.salvarRascunho("sr:v1:qrascunho:velho", rascunho({ at: diasAntes(40) }));
    storage.bloqueado = true;
    expect(qc.limparRascunhosVencidos(AGORA)).toBe(0);
  });
});

describe("aluno removido do aparelho (deleteAccount)", () => {
  const personal: Profile = { id: "c1", name: "Carlos Lima", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-10-01T10:00:00Z" };
  const aluna: Profile = {
    id: "s1",
    name: "Ana Souza",
    role: "athlete",
    plan: "free",
    onboarded: true,
    createdAt: "2026-11-01T10:00:00Z",
    managedBy: "c1",
    anamnese: anamneseBase({}, { id: "rodada-2" }),
    anamnesePrev: anamneseBase({}, { id: "rodada-1", answeredAt: "2026-06-01T10:00:00Z" }),
  };

  it("apaga o rascunho do junto e grava qapagado de cada rodada, só com a data", async () => {
    const repo = new LocalRepository();
    await repo.saveProfile(personal);
    await repo.saveProfile(aluna);
    await repo.saveProfile({ ...aluna, id: "s2", anamnese: undefined, anamnesePrev: undefined });
    qc.salvarRascunho(qc.chaveRascunho({ studentId: "s1" }), rascunho());
    qc.salvarRascunho(qc.chaveRascunho({ studentId: "s2" }), rascunho());

    await repo.deleteAccount("s1");

    expect(qc.lerRascunho(qc.chaveRascunho({ studentId: "s1" }))).toBeNull();
    expect(qc.lerRascunho(qc.chaveRascunho({ studentId: "s2" }))).not.toBeNull();
    for (const id of ["rodada-1", "rodada-2"]) {
      const raw = storage.getItem(`sr:v1:qapagado:${id}`)!;
      expect(Object.keys(JSON.parse(raw))).toEqual(["at"]);
      expect(qc.apagadoEm(id)).not.toBeNull();
    }
    expect(repo.listLocalProfiles().map((p) => p.id)).toEqual(["c1", "s2"]);
  });

  it("idsDasRodadas lê só o id, inclusive de rodada danificada; sem rodadas, nada", () => {
    expect(qc.idsDasRodadas(aluna)).toEqual(["rodada-2", "rodada-1"]);
    expect(qc.idsDasRodadas({ anamnese: { id: "x", a: "danificado" } as unknown as Profile["anamnese"] })).toEqual(["x"]);
    expect(qc.idsDasRodadas({ anamnese: aluna.anamnese, anamnesePrev: aluna.anamnese })).toEqual(["rodada-2"]);
    expect(qc.idsDasRodadas(null)).toEqual([]);
    expect(qc.idsDasRodadas({ anamnese: { id: 7 } as unknown as Profile["anamnese"] })).toEqual([]);
  });
});
