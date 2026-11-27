import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/domain/types";

/**
 * Rodada 3, Fundação (R3-6 A): `comFotoDoArmazenamento`. Armazenamento em memória com teto em caracteres (como a cota
 * do navegador) e falha injetável por chave. Mede pelo conteúdo (Map antes × depois), nunca contando setItem.
 */
class CotaExcedida extends Error {
  constructor() {
    super("The quota has been exceeded.");
    this.name = "QuotaExceededError";
  }
}

class MemStorage {
  m = new Map<string, string>();
  teto = Infinity;
  /** Chaves cuja PRÓXIMA gravação falha com cota (uma vez: a coleção que não cabe; a volta, com espaço liberado, cabe). */
  falharEm = new Set<string>();
  /** Toda gravação falha (para a volta também falhar). */
  travado = false;
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
    const valor = String(v);
    if (this.travado) throw new CotaExcedida();
    if (this.falharEm.delete(k)) throw new CotaExcedida();
    const uso = [...this.m.entries()].reduce((n, [kk, vv]) => n + (kk === k ? 0 : vv.length), 0) + valor.length;
    if (uso > this.teto) throw new CotaExcedida();
    this.m.set(k, valor);
  }
  removeItem(k: string) {
    if (this.travado) throw new CotaExcedida();
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);

const { ArmazenamentoIncompleto, comFotoDoArmazenamento, ehErroDeCota, LocalRepository, TEXTO_COTA_LOCAL, TEXTO_RESTAURACAO_INCOMPLETA } = await import("./local");
const { DataError } = await import("./repository");
const repo = new LocalRepository();

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z", phone: "11999990000", cref: "012345-G/SP" };

function estadoInicial() {
  storage.clear();
  storage.teto = Infinity;
  storage.falharEm.clear();
  storage.travado = false;
  storage.setItem("sr:v1:profiles", JSON.stringify([coach]));
  storage.setItem("sr:v1:programs", JSON.stringify([{ id: "p1", ownerId: "s1" }]));
  storage.setItem("sr:v1:sessions", JSON.stringify([{ id: "t1", userId: "s1" }]));
  storage.setItem("sr:sent:s1", JSON.stringify(["t1"]));
  storage.setItem("sr:sent:@desde", "2026-11-01T00:00:00.000Z");
  storage.setItem("sr:draft:s1", JSON.stringify({ session: { id: "rascunho" } }));
  storage.setItem("sr:tester", "1");
}
const foto = () => new Map(storage.m);

beforeEach(estadoInicial);

describe("comFotoDoArmazenamento", () => {
  it("sem falha: devolve o resultado e o armazenamento fica com as gravações (nenhum resto da foto)", async () => {
    const r = await comFotoDoArmazenamento(async () => {
      await repo.saveProfile({ ...coach, name: "Rafael" });
      storage.setItem("sr:sent:s1:log", "{}");
      return 7;
    });
    expect(r).toBe(7);
    expect(JSON.parse(storage.getItem("sr:v1:profiles")!)[0].name).toBe("Rafael");
    expect(storage.getItem("sr:sent:s1:log")).toBe("{}");
    expect([...storage.m.keys()].sort()).toEqual(["sr:draft:s1", "sr:sent:@desde", "sr:sent:s1", "sr:sent:s1:log", "sr:tester", "sr:v1:profiles", "sr:v1:programs", "sr:v1:sessions"]);
  });

  it.each(["sr:v1:custom_exercises", "sr:v1:profiles", "sr:v1:programs", "sr:v1:sessions", "sr:v1:metrics", "sr:v1:diets", "sr:v1:links", "sr:sent:s1:log"])(
    "cota estourando em %s no meio: tudo volta ao que era e a mensagem é a do modo local",
    async (alvo) => {
      const antes = foto();
      storage.falharEm.add(alvo);
      const erro = await comFotoDoArmazenamento(async () => {
        // Várias gravações, como a restauração: muda, cria e apaga chaves antes de chegar na que não cabe.
        storage.setItem("sr:v1:profiles", JSON.stringify([{ ...coach, phone: undefined, cref: undefined }]));
        storage.removeItem("sr:v1:programs");
        storage.setItem("sr:v1:sessions", JSON.stringify([{ id: "t1", userId: "s1" }, { id: "t2", userId: "s1" }]));
        storage.setItem("sr:sent:s1", JSON.stringify(["t1", "t2"]));
        storage.setItem("sr:v1:last-backup-at", "2026-11-27T00:00:00.000Z");
        for (const k of ["sr:v1:custom_exercises", "sr:v1:metrics", "sr:v1:diets", "sr:v1:links", "sr:sent:s1:log"]) storage.setItem(k, "[]");
        storage.setItem(alvo, "[1]");
      }).catch((e: unknown) => e);
      storage.falharEm.clear();
      expect(erro).toBeInstanceOf(DataError);
      expect((erro as InstanceType<typeof DataError>).code).toBe("limit");
      expect((erro as Error).message).toBe(TEXTO_COTA_LOCAL);
      expect((erro as Error).message).not.toMatch(/nuvem/);
      expect(foto()).toEqual(antes);
    },
  );

  it("a cota do repositório (DataError de write) também volta tudo", async () => {
    const antes = foto();
    storage.falharEm.add("sr:v1:metrics");
    const erro = await comFotoDoArmazenamento(async () => {
      await repo.saveProfile({ ...coach, phone: "" });
      await repo.saveMetric({ id: "m1", userId: "c1", date: "2026-11-20", weightKg: 80 });
    }).catch((e: unknown) => e);
    storage.falharEm.clear();
    expect((erro as Error).message).toBe(TEXTO_COTA_LOCAL);
    expect(foto()).toEqual(antes);
  });

  it("erro que não é de cota: tudo volta e o MESMO erro sobe (erros tipados de quem chama continuam reconhecíveis)", async () => {
    class ObjetoDeOutroPerfil extends Error {}
    const antes = foto();
    const original = new ObjetoDeOutroPerfil("x");
    const erro = await comFotoDoArmazenamento(() => {
      storage.setItem("sr:v1:programs", "[]");
      storage.setItem("sr:sent:s9", "[]");
      throw original;
    }).catch((e: unknown) => e);
    expect(erro).toBe(original);
    expect(foto()).toEqual(antes);
  });

  it("o rascunho do treino (sr:draft:*) e chaves fora de sr:v1/sr:sent não entram na foto", async () => {
    await comFotoDoArmazenamento(() => {
      storage.setItem("sr:draft:s1", "novo");
      storage.setItem("sr:outra", "x");
      storage.setItem("sr:v1:profiles", "[]");
      throw new Error("falhou");
    }).catch(() => undefined);
    expect(storage.getItem("sr:draft:s1")).toBe("novo");
    expect(storage.getItem("sr:outra")).toBe("x");
    expect(JSON.parse(storage.getItem("sr:v1:profiles")!)).toEqual([coach]);
  });

  it("com o teto apertado, a chave que cresceu volta antes da que encolheu (a volta cabe)", async () => {
    storage.clear();
    storage.setItem("sr:v1:a", "a".repeat(10));
    storage.setItem("sr:v1:d", "d".repeat(10));
    storage.teto = 30;
    const antes = foto();
    const erro = await comFotoDoArmazenamento(() => {
      storage.removeItem("sr:v1:d");
      storage.setItem("sr:v1:a", "a".repeat(28));
      storage.setItem("sr:v1:b", "b".repeat(5));
    }).catch((e: unknown) => e);
    expect((erro as Error).message).toBe(TEXTO_COTA_LOCAL);
    expect(foto()).toEqual(antes);
  });

  it("a volta também falha: ArmazenamentoIncompleto, nunca sucesso; a causa é o erro original", async () => {
    const causa = new CotaExcedida();
    const erro = await comFotoDoArmazenamento(() => {
      storage.setItem("sr:v1:programs", "[]");
      storage.travado = true;
      throw causa;
    }).catch((e: unknown) => e);
    storage.travado = false;
    expect(erro).toBeInstanceOf(ArmazenamentoIncompleto);
    expect((erro as Error).message).toBe(TEXTO_RESTAURACAO_INCOMPLETA);
    expect((erro as InstanceType<typeof ArmazenamentoIncompleto>).causa).toBe(causa);
    const outra = await comFotoDoArmazenamento(
      () => {
        storage.setItem("sr:sent:s1", "[]");
        storage.travado = true;
        throw new Error("y");
      },
      "O link ficou pela metade neste aparelho. Abra o link de novo.",
    ).catch((e: unknown) => e);
    storage.travado = false;
    expect((outra as Error).message).toBe("O link ficou pela metade neste aparelho. Abra o link de novo.");
  });

  it("aninhada: a de fora volta à foto dela e a cota continua com o texto do modo local", async () => {
    const antes = foto();
    storage.falharEm.add("sr:v1:diets");
    const erro = await comFotoDoArmazenamento(async () => {
      storage.setItem("sr:v1:programs", "[]");
      await comFotoDoArmazenamento(() => {
        storage.setItem("sr:v1:sessions", "[]");
        storage.setItem("sr:v1:diets", "[]");
      });
    }).catch((e: unknown) => e);
    storage.falharEm.clear();
    expect((erro as Error).message).toBe(TEXTO_COTA_LOCAL);
    expect(foto()).toEqual(antes);
  });
});

describe("cota no modo local", () => {
  it("write do repositório: o texto único, sem 'nuvem'", async () => {
    storage.falharEm.add("sr:v1:profiles");
    const erro = await repo.saveProfile(coach).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(DataError);
    expect((erro as Error).message).toBe("Não coube neste aparelho. Nada foi alterado. Libere espaço e tente de novo.");
  });

  it("ehErroDeCota reconhece as exceções dos navegadores e o DataError 'limit'", () => {
    expect(ehErroDeCota(new CotaExcedida())).toBe(true);
    expect(ehErroDeCota({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(ehErroDeCota({ code: 22 })).toBe(true);
    expect(ehErroDeCota(new DataError("x", "limit"))).toBe(true);
    expect(ehErroDeCota(new DataError("x", "invalid"))).toBe(false);
    expect(ehErroDeCota(new Error("x"))).toBe(false);
    expect(ehErroDeCota(null)).toBe(false);
  });
});
