import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Nuvem, TelaDaEntrada } from "./app-context";
import type { Profile } from "./domain/types";

/**
 * Rodada M, RM-05: supabase-js só é baixado com a nuvem configurada. Aqui a nuvem é simulada (módulo falso no lugar de
 * data/supabase.ts); nenhum teste baixa supabase-js nem usa rede.
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
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
let storage = new MemStorage();
/** `Object.keys(localStorage)` (clearCloudCache) enxerga as chaves guardadas, como no navegador. */
const comoStorage = (s: MemStorage) =>
  new Proxy(s, {
    ownKeys: (alvo) => [...Array(alvo.length).keys()].map((i) => alvo.key(i)!),
    getOwnPropertyDescriptor: (alvo, k) => (typeof k === "string" && alvo.getItem(k) !== null ? { enumerable: true, configurable: true, value: alvo.getItem(k) } : undefined),
  });

vi.mock("@/lib/analytics", () => ({ track: vi.fn(), identify: vi.fn(), resetIdentity: vi.fn(), setContext: vi.fn() }));

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };

async function carregar(nuvemLigada = true) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", nuvemLigada ? "https://nuvem.test" : "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", nuvemLigada ? "pk_teste" : "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  return import("./app-context");
}

/** Tela falsa: registra o que a entrada pediu. */
function telaFalsa(local = false) {
  const t = {
    loadLocal: vi.fn(async () => local),
    enterCloud: vi.fn(async (_p: Profile, _r: unknown) => {}),
    signedOut: vi.fn(),
    semSessao: vi.fn(),
  };
  return t as typeof t & TelaDaEntrada;
}

/** Módulo da nuvem simulado: sessão, perfil e eventos de login controlados pelo teste. */
function nuvemFalsa(opcoes: { sessao?: string | null; perfil?: Profile | null } = {}) {
  const ouvintes: ((event: string, session: unknown) => Promise<void>)[] = [];
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: opcoes.sessao ? { user: { id: opcoes.sessao } } : null } })),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => Promise<void>) => {
      ouvintes.push(cb);
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  const repo = { mode: "supabase", getProfile: vi.fn(async () => opcoes.perfil ?? null), flushPending: vi.fn(async () => 0) };
  const nuvem = { mod: { getSupabase: () => ({ auth }) }, repo } as unknown as Nuvem;
  return { nuvem, repo, auth, ouvintes, unsubscribe };
}

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", comoStorage(storage));
  vi.stubGlobal("sessionStorage", new MemStorage());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("loadCloud", () => {
  it("falha do import não fica guardada; com sucesso, um repositório só por aba", async () => {
    const { loadCloud } = await carregar();
    await expect(loadCloud(() => Promise.reject(new Error("Failed to load chunk")))).rejects.toThrow("Failed to load chunk");

    class SupabaseRepository {}
    const importar = vi.fn(async () => ({ SupabaseRepository }) as never);
    const a = await loadCloud(importar);
    const b = await loadCloud(importar);
    expect(a.repo).toBeInstanceOf(SupabaseRepository);
    expect(b.repo).toBe(a.repo);
    expect(importar).toHaveBeenCalledTimes(1);
  });
});

describe("abrirComNuvem: import que falha (nuvem ligada e sem rede)", () => {
  it("com perfil guardado, abre com cachedSelf e um repositório que só responde 'Sem conexão'", async () => {
    storage.setItem("sr:cloud:me", JSON.stringify(coach));
    const { abrirComNuvem } = await carregar();
    const tela = telaFalsa(true);
    const r = await abrirComNuvem(tela, () => Promise.reject(new Error("Failed to load chunk")));

    expect(r).toBe("semNuvem");
    expect(tela.loadLocal).not.toHaveBeenCalled();
    expect(tela.enterCloud).toHaveBeenCalledTimes(1);
    const [perfil, repo] = tela.enterCloud.mock.calls[0]! as [Profile, import("./data/repository").Repository];
    expect(perfil).toEqual(coach);
    expect(repo.mode).toBe("supabase");
    expect(repo.pendingCount?.()).toBe(0);
    expect((repo as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(repo.listPrograms("c1")).rejects.toMatchObject({ code: "network", message: "Sem conexão. Verifique a internet e tente de novo." });
    await expect(repo.saveProfile(coach)).rejects.toMatchObject({ code: "network" });
  });

  it("sem perfil guardado, fica a sessão local (ou visitante)", async () => {
    const { abrirComNuvem } = await carregar();
    const falha = () => Promise.reject(new Error("Failed to load chunk"));

    const comLocal = telaFalsa(true);
    expect(await abrirComNuvem(comLocal, falha)).toBe("semNuvem");
    expect(comLocal.loadLocal).toHaveBeenCalledTimes(1);
    expect(comLocal.enterCloud).not.toHaveBeenCalled();
    expect(comLocal.semSessao).not.toHaveBeenCalled();

    const visitante = telaFalsa(false);
    await abrirComNuvem(visitante, falha);
    expect(visitante.semSessao).toHaveBeenCalledTimes(1);
  });
});

describe("abrirComNuvem: nuvem simulada (import ok)", () => {
  it("com sessão, entra com o perfil da nuvem e o repositório carregado; desligar solta login e 'online'", async () => {
    const { abrirComNuvem } = await carregar();
    const n = nuvemFalsa({ sessao: "c1", perfil: coach });
    const tela = telaFalsa();
    const r = await abrirComNuvem(tela, async () => n.nuvem);

    expect(tela.enterCloud).toHaveBeenCalledWith(coach, n.repo);
    expect(r).not.toBe("semNuvem");
    window.dispatchEvent(new Event("online"));
    expect(n.repo.flushPending).toHaveBeenCalledTimes(1);
    (r as { desligar: () => void }).desligar();
    expect(n.unsubscribe).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    expect(n.repo.flushPending).toHaveBeenCalledTimes(1);
  });

  it("com sessão e sem rede para o perfil, vale a cópia guardada (cachedSelf)", async () => {
    storage.setItem("sr:cloud:me", JSON.stringify(coach));
    const { abrirComNuvem } = await carregar();
    const n = nuvemFalsa({ sessao: "c1", perfil: null });
    const tela = telaFalsa();
    await abrirComNuvem(tela, async () => n.nuvem);
    expect(tela.enterCloud).toHaveBeenCalledWith(coach, n.repo);
  });

  it("sem sessão e sem rede, abre com quem estava logado; com rede e sem sessão local, visitante", async () => {
    storage.setItem("sr:cloud:me", JSON.stringify(coach));
    const { abrirComNuvem } = await carregar();
    vi.stubGlobal("navigator", { onLine: false });
    const semRede = telaFalsa();
    const n1 = nuvemFalsa({ sessao: null });
    await abrirComNuvem(semRede, async () => n1.nuvem);
    expect(semRede.enterCloud).toHaveBeenCalledWith(coach, n1.repo);

    // Nova tentativa quando a rede volta, já sem sessão: sai do perfil guardado.
    vi.stubGlobal("navigator", { onLine: true });
    const comRede = telaFalsa(false);
    await abrirComNuvem(comRede, async () => nuvemFalsa({ sessao: null }).nuvem);
    expect(comRede.enterCloud).not.toHaveBeenCalled();
    expect(comRede.loadLocal).toHaveBeenCalledTimes(1);
    expect(comRede.semSessao).toHaveBeenCalledTimes(1);
  });

  it("SIGNED_OUT (aqui ou em outra aba): apaga a cópia da nuvem e sai", async () => {
    storage.setItem("sr:cloud:me", JSON.stringify(coach));
    storage.setItem("sr:cloud:programs:c1", "[]");
    storage.setItem("sr:session", "local-1");
    const { abrirComNuvem } = await carregar();
    const n = nuvemFalsa({ sessao: "c1", perfil: coach });
    const tela = telaFalsa();
    await abrirComNuvem(tela, async () => n.nuvem);
    await n.ouvintes[0]!("SIGNED_OUT", null);
    expect(tela.signedOut).toHaveBeenCalledTimes(1);
    expect(storage.getItem("sr:cloud:me")).toBeNull();
    expect(storage.getItem("sr:cloud:programs:c1")).toBeNull();
    expect(storage.getItem("sr:session")).toBe("local-1");
  });
});

describe("cloud-config e grafo", () => {
  it("supabaseConfigured lê só as variáveis", async () => {
    const ligada = await import("./data/cloud-config");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://nuvem.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk_teste");
    expect(ligada.supabaseConfigured()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(ligada.supabaseConfigured()).toBe(false);
  });

  it("cachedSelf: perfil guardado ou null (dado danificado também)", async () => {
    const { cachedSelf } = await import("./data/cloud-config");
    expect(cachedSelf()).toBeNull();
    storage.setItem("sr:cloud:me", JSON.stringify(coach));
    expect(cachedSelf()).toEqual(coach);
    storage.setItem("sr:cloud:me", "{quebrado");
    expect(cachedSelf()).toBeNull();
  });

  it("nada que entra em toda rota importa @supabase/* ou data/supabase de forma estática", () => {
    const ler = (f: string) => readFileSync(path.resolve(__dirname, f), "utf8");
    const imports = (codigo: string) => [...codigo.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(imports(ler("data/cloud-config.ts")).filter((m) => /supabase/.test(m!))).toEqual([]);
    expect(imports(ler("app-context.tsx")).filter((m) => /supabase/.test(m!))).toEqual([]);
    // O único caminho para o módulo da nuvem é o import dinâmico de loadCloud.
    expect(ler("app-context.tsx").match(/(?<!typeof )import\("@\/lib\/data\/supabase"\)/g)).toHaveLength(1);
  });
});
