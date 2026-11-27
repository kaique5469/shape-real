import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GUARDAR_ESTA_MAX_ARQUIVOS,
  MARCA_DO_AQUECIMENTO,
  REAQUECER_A_CADA_MS,
  bloqueioDoAquecimento,
  pedidoGuardarEsta,
  precisaDosPerfis,
  proximoPasso,
  type EventoAquecimento,
  type FaseAquecimento,
  type Gatilho,
  type SituacaoAquecimento,
} from "./aquecimento";

/**
 * Rodada M (celular), trilha A-SW: quando aquecer (RM-01), o que mandar para guardar a tela aberta (RM-04) e o próprio
 * service worker (public/sw.js) rodando com caches e rede falsos (RM-01, RM-02 e RM-04).
 */

describe("proximoPasso: gatilhos do aquecimento", () => {
  it("primeira navegação terminada: começa a espera por ocioso + 3 s, sem pedir ainda", () => {
    expect(proximoPasso("esperando", "navegacao-terminada")).toEqual({ fase: "navegou", esperarOcioso: true, gatilho: null });
    expect(proximoPasso("navegou", "ocioso-depois-da-navegacao")).toEqual({ fase: "pedido", esperarOcioso: false, gatilho: "navegacao" });
  });

  it("navegações seguintes não reiniciam a espera", () => {
    expect(proximoPasso("navegou", "navegacao-terminada")).toEqual({ fase: "navegou", esperarOcioso: false, gatilho: null });
  });

  it("20 s sem navegação pede; com navegação, quem decide é a espera de (a)", () => {
    expect(proximoPasso("esperando", "tempo-sem-navegacao")).toEqual({ fase: "pedido", esperarOcioso: false, gatilho: "sem-navegacao" });
    expect(proximoPasso("navegou", "tempo-sem-navegacao")).toEqual({ fase: "navegou", esperarOcioso: false, gatilho: null });
  });

  it("página oculta pede na hora, antes ou depois da navegação", () => {
    expect(proximoPasso("esperando", "pagina-oculta").gatilho).toBe("oculta");
    expect(proximoPasso("navegou", "pagina-oculta").gatilho).toBe("oculta");
  });

  it("ocioso sem navegação não pede", () => {
    expect(proximoPasso("esperando", "ocioso-depois-da-navegacao")).toEqual({ fase: "esperando", esperarOcioso: false, gatilho: null });
  });

  it("depois de um pedido, nada mais nesta página", () => {
    for (const e of ["navegacao-terminada", "ocioso-depois-da-navegacao", "tempo-sem-navegacao", "pagina-oculta"] as const) {
      expect(proximoPasso("pedido", e)).toEqual({ fase: "pedido", esperarOcioso: false, gatilho: null });
    }
  });

  it("vale o que vier primeiro, e só um pedido por carregamento", () => {
    const rodar = (eventos: EventoAquecimento[]) => {
      let fase: FaseAquecimento = "esperando";
      const pedidos: Gatilho[] = [];
      let esperas = 0;
      for (const e of eventos) {
        const p = proximoPasso(fase, e);
        fase = p.fase;
        if (p.esperarOcioso) esperas++;
        if (p.gatilho) pedidos.push(p.gatilho);
      }
      return { pedidos, esperas };
    };
    // /abrir: "Salvar no meu celular" leva ao /hoje; aquece depois do ocioso + 3 s, não no load.
    expect(rodar(["navegacao-terminada", "navegacao-terminada", "ocioso-depois-da-navegacao", "tempo-sem-navegacao", "pagina-oculta"])).toEqual({ pedidos: ["navegacao"], esperas: 1 });
    // Fechou o app antes: a página oculta pede.
    expect(rodar(["navegacao-terminada", "pagina-oculta", "ocioso-depois-da-navegacao"])).toEqual({ pedidos: ["oculta"], esperas: 1 });
    // Ficou parada na tela do link.
    expect(rodar(["tempo-sem-navegacao", "navegacao-terminada", "ocioso-depois-da-navegacao"])).toEqual({ pedidos: ["sem-navegacao"], esperas: 0 });
  });
});

describe("bloqueioDoAquecimento", () => {
  const AGORA = Date.parse("2026-11-27T12:00:00Z");
  const base: SituacaoAquecimento = {
    agora: AGORA,
    ultimoAquecimento: 0,
    online: true,
    conexao: { saveData: false, effectiveType: "4g" },
    pagina: { pathname: "/hoje", hash: "" },
    perfis: null,
  };
  const com = (o: Partial<SituacaoAquecimento>) => bloqueioDoAquecimento({ ...base, ...o });

  it("sem impedimento: pode aquecer", () => {
    expect(com({})).toBeNull();
    expect(com({ conexao: null })).toBeNull();
    expect(com({ conexao: undefined })).toBeNull();
    expect(com({ conexao: { effectiveType: "3g" } })).toBeNull();
  });

  it("uma vez a cada 6 h; relógio que voltou e valor ilegível não travam", () => {
    expect(com({ ultimoAquecimento: AGORA - 3_600_000 })).toBe("aquecido-ha-pouco");
    expect(com({ ultimoAquecimento: AGORA - REAQUECER_A_CADA_MS + 1 })).toBe("aquecido-ha-pouco");
    expect(com({ ultimoAquecimento: AGORA - REAQUECER_A_CADA_MS })).toBeNull();
    expect(com({ ultimoAquecimento: AGORA + 86_400_000 })).toBeNull();
    expect(com({ ultimoAquecimento: Number.NaN })).toBeNull();
  });

  it("nunca sem rede, com economia de dados ou em 2g/slow-2g", () => {
    expect(com({ online: false })).toBe("sem-rede");
    expect(com({ conexao: { saveData: true, effectiveType: "4g" } })).toBe("economia-de-dados");
    expect(com({ conexao: { effectiveType: "2g" } })).toBe("rede-2g");
    expect(com({ conexao: { effectiveType: "slow-2g" } })).toBe("rede-2g");
  });

  it("mantém a regra do questionário: sem perfil no aparelho, não aquece", () => {
    const q = { pathname: "/questionario", hash: "" };
    expect(com({ pagina: q, perfis: null })).toBe("questionario-sem-perfil");
    expect(com({ pagina: q, perfis: { temPerfil: false, temPerfilPersonal: false } })).toBe("questionario-sem-perfil");
    expect(com({ pagina: { pathname: "/questionario/", hash: "#d=1.abc" }, perfis: null })).toBe("questionario-sem-perfil");
    expect(com({ pagina: q, perfis: { temPerfil: true, temPerfilPersonal: true } })).toBeNull();
    expect(com({ pagina: q, perfis: { temPerfil: true, temPerfilPersonal: false } })).toBeNull();
    // Fora do questionário os perfis nem são lidos.
    expect(com({ pagina: { pathname: "/abrir", hash: "#d=1.abc" }, perfis: null })).toBeNull();
  });

  it("perfis só são lidos quando a página do gatilho ou a do load é /questionario", () => {
    expect(precisaDosPerfis("/questionario")).toBe(true);
    expect(precisaDosPerfis("/questionario/")).toBe(true);
    expect(precisaDosPerfis("/hoje")).toBe(false);
    expect(precisaDosPerfis("/receber")).toBe(false);
    expect(precisaDosPerfis("/privacidade", "/questionario")).toBe(true);
    expect(precisaDosPerfis("/hoje", "/abrir")).toBe(false);
    expect(precisaDosPerfis("/hoje", null)).toBe(false);
  });

  it("aluno sem perfil que saiu do questionário por navegação interna (\"Saiba mais\" → /privacidade): continua sem aquecer", () => {
    const q = { pathname: "/questionario", hash: "" };
    const privacidade = { pathname: "/privacidade", hash: "" };
    expect(com({ pagina: privacidade, paginaDoLoad: q, perfis: null })).toBe("questionario-sem-perfil");
    expect(com({ pagina: privacidade, paginaDoLoad: q, perfis: { temPerfil: false, temPerfilPersonal: false } })).toBe("questionario-sem-perfil");
    // Criou um perfil depois (ou é o personal no modo junto): aquece.
    expect(com({ pagina: { pathname: "/hoje", hash: "" }, paginaDoLoad: q, perfis: { temPerfil: true, temPerfilPersonal: false } })).toBeNull();
    // Carregou fora do questionário: a regra não se aplica.
    expect(com({ pagina: privacidade, paginaDoLoad: { pathname: "/abrir", hash: "" }, perfis: null })).toBeNull();
    expect(com({ pagina: privacidade, paginaDoLoad: null, perfis: null })).toBeNull();
  });

  it("pedido recente sem a marca do aquecimento completo (SW encerrado no meio) não trava 6 h", () => {
    const recente = AGORA - 60_000;
    expect(com({ ultimoAquecimento: recente, aquecimentoCompleto: false })).toBeNull();
    expect(com({ ultimoAquecimento: recente, aquecimentoCompleto: true })).toBe("aquecido-ha-pouco");
    // Sem dar para ler o cache: a trava de sempre.
    expect(com({ ultimoAquecimento: recente, aquecimentoCompleto: null })).toBe("aquecido-ha-pouco");
    expect(com({ ultimoAquecimento: recente })).toBe("aquecido-ha-pouco");
    // As outras condições continuam valendo.
    expect(com({ ultimoAquecimento: recente, aquecimentoCompleto: false, online: false })).toBe("sem-rede");
  });

  it("a marca lida pelo app é a que o service worker grava", () => {
    expect(MARCA_DO_AQUECIMENTO).toBe("/hoje?aquecimento");
    expect(SW_CODE).toContain("const MARCA_DO_AQUECIMENTO = `${CORE[0]}?aquecimento`;");
    expect(SW_CODE).toMatch(/const CORE = \["\/hoje",/);
  });
});

describe("pedidoGuardarEsta (RM-04)", () => {
  const O = "https://app.test";

  it("só arquivos do build e fontes, de mesma origem, sem # e sem repetição; o caminho vai sem busca", () => {
    const p = pedidoGuardarEsta(
      "/questionario",
      [
        `${O}/_next/static/immutable/chunks/a.js`,
        `${O}/_next/static/immutable/chunks/a.js#x`,
        `${O}/_next/static/immutable/chunks/b.css?dpl=dpl_1`,
        `${O}/_next/static/media/archivo-latin.woff2`,
        `${O}/fonts/outra.woff2`,
        `${O}/icons/icon-192.png`,
        `${O}/ingest/e/?ip=1`,
        `${O}/api/coach`,
        `${O}/questionario`,
        "https://us-assets.i.posthog.com/static/array.js",
        "https://cdn.exemplo.com/_next/static/chunks/c.js",
        "não é endereço ::",
      ],
      O,
    );
    expect(p).toEqual({
      tipo: "guardar-esta",
      path: "/questionario",
      assets: ["/_next/static/immutable/chunks/a.js", "/_next/static/immutable/chunks/b.css?dpl=dpl_1", "/_next/static/media/archivo-latin.woff2", "/fonts/outra.woff2"],
    });
  });

  it("teto de arquivos", () => {
    const muitos = Array.from({ length: GUARDAR_ESTA_MAX_ARQUIVOS + 50 }, (_, i) => `${O}/_next/static/chunks/c${i}.js`);
    expect(pedidoGuardarEsta("/hoje", muitos, O).assets).toHaveLength(GUARDAR_ESTA_MAX_ARQUIVOS);
  });
});

// ---- public/sw.js com caches e rede falsos ---------------------------------------------------------------------------

const SW_CODE = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
const ORIGEM = "https://app.test";
const CORE = ["/hoje", "/sessao", "/treinos", "/treinos/novo", "/historico", "/evolucao", "/dieta", "/conta", "/alunos", "/abrir", "/receber", "/questionario", "/entrar", "/onboarding"];

type Guardado = { body: string; status: number; headers: [string, string][] };
const chave = (r: string | { url: string }) => new URL(typeof r === "string" ? r : r.url, ORIGEM).href;

class CacheFalso {
  m = new Map<string, Guardado>();
  async match(r: string | { url: string }) {
    const e = this.m.get(chave(r));
    return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined;
  }
  async put(r: string | { url: string }, res: Response) {
    this.m.set(chave(r), { body: await res.text(), status: res.status, headers: [...res.headers] });
  }
  async keys() {
    return [...this.m.keys()].map((url) => ({ url }));
  }
  async delete(r: string | { url: string }) {
    return this.m.delete(chave(r));
  }
  caminhos() {
    return [...this.m.keys()].map((k) => new URL(k).pathname + new URL(k).search);
  }
}

class CachesFalsos {
  porNome = new Map<string, CacheFalso>();
  async open(nome: string) {
    if (!this.porNome.has(nome)) this.porNome.set(nome, new CacheFalso());
    return this.porNome.get(nome)!;
  }
  async keys() {
    return [...this.porNome.keys()];
  }
  async delete(nome: string) {
    return this.porNome.delete(nome);
  }
}

function resposta(body: string, o: { status?: number; type?: string; redirected?: boolean; contentType?: string } = {}) {
  const r = new Response(body, { status: o.status ?? 200, headers: { "Content-Type": o.contentType ?? "text/html; charset=utf-8" } });
  Object.defineProperty(r, "type", { value: o.type ?? "basic" });
  Object.defineProperty(r, "redirected", { value: o.redirected ?? false });
  return r;
}

type Pedido = { method: string; url: string; mode: string; headers: Headers; signal: AbortSignal };
const pedido = (caminho: string, o: { mode?: string; headers?: Record<string, string> } = {}): Pedido => ({
  method: "GET",
  url: new URL(caminho, ORIGEM).href,
  mode: o.mode ?? "cors",
  headers: new Headers(o.headers),
  signal: new AbortController().signal,
});

type Init = { signal?: AbortSignal; priority?: string; credentials?: string };
type Rede = (url: string, init: Init | undefined) => Promise<Response>;
type Evento = Record<string, unknown>;

/** `clientes`: id da página → endereço dela (o `clients.get` do service worker). */
function carregarSw(rede: Rede, clientes: Record<string, string> = {}) {
  const ouvintes: Record<string, (e: Evento) => void> = {};
  const caches = new CachesFalsos();
  const chamadas: { url: string; init: Init | undefined }[] = [];
  const self = {
    location: { origin: ORIGEM },
    addEventListener: (tipo: string, fn: (e: Evento) => void) => {
      ouvintes[tipo] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {}, get: async (id: string) => (clientes[id] ? { url: new URL(clientes[id], ORIGEM).href } : undefined) },
  };
  const fetchFalso = (entrada: string | { url: string }, init?: Init) => {
    const url = chave(entrada);
    chamadas.push({ url: new URL(url).pathname + new URL(url).search, init });
    return rede(url, init);
  };
  // Lidos na hora da chamada: os relógios falsos do vitest valem também dentro do service worker.
  const st = (fn: () => void, ms: number) => setTimeout(fn, ms);
  const ct = (t: ReturnType<typeof setTimeout>) => clearTimeout(t);
  new Function("self", "caches", "fetch", "setTimeout", "clearTimeout", SW_CODE)(self, caches, fetchFalso, st, ct);
  const ouvinte = (tipo: string) => {
    const fn = ouvintes[tipo];
    if (!fn) throw new Error(`sw.js sem ouvinte de ${tipo}`);
    return fn;
  };

  const mensagem = async (data: unknown) => {
    const esperas: Promise<unknown>[] = [];
    ouvinte("message")({ data, waitUntil: (p: Promise<unknown>) => void esperas.push(p) });
    await Promise.all(esperas);
    return esperas.length;
  };
  const buscar = (req: Pedido, clientId = "") => {
    let respondeu: Promise<Response> | null = null;
    const esperas: Promise<unknown>[] = [];
    ouvinte("fetch")({
      request: req,
      clientId,
      respondWith: (p: Promise<Response>) => {
        respondeu = Promise.resolve(p);
      },
      waitUntil: (p: Promise<unknown>) => void esperas.push(p),
    });
    return { resposta: respondeu as Promise<Response> | null, esperas };
  };
  return { caches, chamadas, mensagem, buscar, paginas: () => caches.open("sr-pages-v5"), arquivos: () => caches.open("sr-assets-v5") };
}

const pendente = (init: Init | undefined) =>
  new Promise<Response>((_, rejeita) => init?.signal?.addEventListener("abort", () => rejeita(new DOMException("abortado", "AbortError"))));

/** Cabeçalho na hora e corpo preso depois do primeiro pacote (perda depois do 1º pacote); o abort derruba o corpo. */
function corpoPreso(init: Init | undefined, contentType = "text/html; charset=utf-8") {
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("<!doctype html><html><head>"));
      init?.signal?.addEventListener("abort", () => c.error(new DOMException("abortado", "AbortError")));
    },
  });
  const r = new Response(corpo, { status: 200, headers: { "Content-Type": contentType } });
  Object.defineProperty(r, "type", { value: "basic" });
  Object.defineProperty(r, "redirected", { value: false });
  return r;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("sw.js: constantes da rodada M", () => {
  it("VERSION continua v5; HTML em 400 ms; RSC em 1,5 s; 3 downloads por vez", () => {
    expect(SW_CODE).toMatch(/const VERSION = "v5";/);
    expect(SW_CODE).toMatch(/const HTML_ESPERA_MS = 400;/);
    expect(SW_CODE).toMatch(/const RSC_ESPERA_MS = 1500;/);
    expect(SW_CODE).toMatch(/const SIMULTANEOS = 3;/);
    expect(SW_CODE).toContain(`const CORE = ${JSON.stringify(CORE).replace(/,/g, ", ")};`);
  });
});

describe("sw.js: warm() (RM-01)", () => {
  const html = (pagina: string) =>
    `<!doctype html><html><head><link rel="stylesheet" href="/_next/static/immutable/chunks/estilo.css" data-precedence="next"/>` +
    `<script src="/_next/static/immutable/chunks/0c0hxoamwjsbw.js" noModule=""></script>` +
    Array.from({ length: 8 }, (_, i) => `<script src="/_next/static/immutable/chunks/c${i}.js" async=""></script>`).join("") +
    `</head><body>${pagina}<script>self.__next_f.push([1,"0:{\\"P\\":null,\\"c\\":[\\"/_next/static/immutable/chunks/c9.js\\"]}"])</script></body></html>`;
  const css = "@font-face{src:url(../media/archivo-latin.woff2) format('woff2')}@font-face{src:url(../media/archivo-cyrillic.woff2) format('woff2')}";

  function redeDoBuild(o: { versao?: string } = {}) {
    let emAndamento = 0;
    let pico = 0;
    const rede: Rede = async (url) => {
      const { pathname } = new URL(url);
      if (!pathname.startsWith("/_next/")) return resposta(html(`${pathname} ${o.versao ?? "build-1"}`));
      emAndamento++;
      pico = Math.max(pico, emAndamento);
      await new Promise((r) => setTimeout(r, 2));
      emAndamento--;
      return resposta(pathname.endsWith(".css") ? css : "x", { contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript" });
    };
    return { rede, pico: () => pico };
  }

  it("guarda as 14 telas sem o polyfill noModule, 3 arquivos por vez, com prioridade baixa", async () => {
    const r = redeDoBuild();
    const sw = carregarSw(r.rede);
    expect(await sw.mensagem("warm")).toBe(1);

    // As 14 telas e a marca do aquecimento completo (busca no endereço: nunca entregue como tela).
    expect((await sw.paginas()).caminhos().sort()).toEqual([...CORE, "/hoje?aquecimento"].sort());
    const arquivos = (await sw.arquivos()).caminhos();
    expect(arquivos).not.toContain("/_next/static/immutable/chunks/0c0hxoamwjsbw.js");
    expect(arquivos).toEqual(expect.arrayContaining(["/_next/static/immutable/chunks/estilo.css", "/_next/static/immutable/chunks/c0.js", "/_next/static/immutable/chunks/c9.js"]));
    // Fontes do CSS: latin sim, cyrillic não (como antes).
    expect(arquivos).toContain("/_next/static/immutable/media/archivo-latin.woff2");
    expect(arquivos).not.toContain("/_next/static/immutable/media/archivo-cyrillic.woff2");

    expect(sw.chamadas.some((c) => c.url.includes("0c0hxoamwjsbw"))).toBe(false);
    expect(r.pico()).toBeGreaterThan(1);
    expect(r.pico()).toBeLessThanOrEqual(3);
    expect(sw.chamadas.every((c) => c.init?.priority === "low")).toBe(true);
    // Cada arquivo uma vez só, mesmo citado por todas as telas.
    const doBuild = sw.chamadas.filter((c) => c.url.startsWith("/_next/"));
    expect(new Set(doBuild.map((c) => c.url)).size).toBe(doBuild.length);
  });

  it("CSS já guardado pelo guardar-esta (sem as fontes): o aquecimento guarda as fontes dele mesmo assim", async () => {
    const r = redeDoBuild();
    const sw = carregarSw(r.rede);
    await sw.mensagem({ tipo: "guardar-esta", path: "/abrir", assets: ["/_next/static/immutable/chunks/estilo.css"] });
    expect((await sw.arquivos()).caminhos()).toEqual(["/_next/static/immutable/chunks/estilo.css"]);
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    const arquivos = (await sw.arquivos()).caminhos();
    expect(arquivos).toContain("/_next/static/immutable/media/archivo-latin.woff2");
    expect(arquivos).not.toContain("/_next/static/immutable/media/archivo-cyrillic.woff2");
    // o CSS não é baixado de novo; a fonte, uma vez só
    expect(sw.chamadas.filter((c) => c.url.endsWith("estilo.css"))).toHaveLength(0);
    expect(sw.chamadas.filter((c) => c.url.endsWith("archivo-latin.woff2"))).toHaveLength(1);
  });

  it("reaquecimento sem deploy: baixa só a primeira tela e para", async () => {
    const r = redeDoBuild();
    const sw = carregarSw(r.rede);
    await sw.mensagem("warm");
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.map((c) => c.url)).toEqual(["/hoje"]);
  });

  it("reaquecimento depois de um deploy: a primeira tela mudou, baixa todas de novo", async () => {
    let versao = "build-1";
    const sw = carregarSw((url, init) => redeDoBuild({ versao }).rede(url, init));
    await sw.mensagem("warm");
    versao = "build-2";
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.filter((c) => !c.url.startsWith("/_next/")).map((c) => c.url)).toEqual(CORE);
    expect(await (await (await sw.paginas()).match("/conta"))!.text()).toContain("build-2");
  });

  it("deploy novo com /hoje já atualizada pela navegação: a marca do aquecimento denuncia, e baixa todas", async () => {
    let versao = "build-1";
    const sw = carregarSw((url, init) => redeDoBuild({ versao }).rede(url, init));
    await sw.mensagem("warm");
    versao = "build-2";
    // A aluna abriu /hoje depois do deploy: a cópia de /hoje (rede primeiro) já é a nova; as outras 13 não.
    const { resposta: r, esperas } = sw.buscar(pedido("/hoje", { mode: "navigate" }));
    await r;
    await Promise.all(esperas);
    expect(await (await (await sw.paginas()).match("/hoje"))!.text()).toContain("build-2");
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.filter((c) => !c.url.startsWith("/_next/")).map((c) => c.url)).toEqual(CORE);
    expect(await (await (await sw.paginas()).match("/conta"))!.text()).toContain("build-2");
  });

  it("aquecimento incompleto não deixa marca: o próximo pedido baixa todas de novo", async () => {
    let falhar = true;
    const r = redeDoBuild();
    const sw = carregarSw((url, init) => (falhar && url.endsWith("/dieta") ? Promise.reject(new TypeError("Failed to fetch")) : r.rede(url, init)));
    await sw.mensagem("warm");
    expect((await sw.paginas()).caminhos()).not.toContain("/dieta");
    falhar = false;
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.filter((c) => !c.url.startsWith("/_next/")).map((c) => c.url)).toEqual(CORE);
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.map((c) => c.url)).toEqual(["/hoje"]);
  });

  it("dois pedidos ao mesmo tempo (outra aba, página oculta): um aquecimento só", async () => {
    const r = redeDoBuild();
    const sw = carregarSw(r.rede);
    await Promise.all([sw.mensagem("warm"), sw.mensagem("warm")]);
    expect(sw.chamadas.filter((c) => !c.url.startsWith("/_next/")).map((c) => c.url)).toEqual(CORE);
    // Terminado, o pedido seguinte é um reaquecimento normal.
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.map((c) => c.url)).toEqual(["/hoje"]);
  });

  it("trim: com o cache cheio, sai o arquivo que nenhuma tela guardada usa, do mais antigo; o que as telas citam fica", async () => {
    const r = redeDoBuild();
    const sw = carregarSw(r.rede);
    const arquivos = await sw.arquivos();
    await arquivos.put("/icons/icon-192.png", resposta("png", { contentType: "image/png" }));
    await sw.mensagem("warm");
    const emUso = (await sw.arquivos()).caminhos().filter((c) => c.startsWith("/_next/"));
    expect(emUso).toHaveLength(11); // c0–c7 e c9, o CSS e a fonte latin
    // Deploys seguintes: arquivos que nenhuma tela guardada cita (os mais antigos primeiro).
    for (let i = 0; i < 330; i++) await arquivos.put(`/_next/static/immutable/chunks/deploy-${i}.js`, resposta("x", { contentType: "text/javascript" }));
    await sw.mensagem({ tipo: "guardar-esta", path: "/hoje", assets: [] });
    const depois = (await sw.arquivos()).caminhos();
    expect(depois).toHaveLength(320);
    expect(depois).toEqual(expect.arrayContaining([...emUso, "/icons/icon-192.png"]));
    // 342 entradas: saem as 22 mais antigas entre as que nada cita.
    expect(depois.filter((c) => c.includes("/deploy-")).map((c) => Number(/deploy-(\d+)/.exec(c)![1]))[0]).toBe(22);
  });

  it("trim: tudo em uso pelas telas guardadas, o cache passa do teto em vez de quebrar uma tela", async () => {
    const muitos = Array.from({ length: 330 }, (_, i) => `/_next/static/immutable/chunks/m${i}.js`);
    const sw = carregarSw(async () => resposta(`<html>${muitos.map((u) => `<script src="${u}"></script>`).join("")}</html>`));
    const arquivos = await sw.arquivos();
    for (const u of muitos) await arquivos.put(u, resposta("x", { contentType: "text/javascript" }));
    await sw.mensagem({ tipo: "guardar-esta", path: "/alunos/a1", assets: [] });
    expect((await sw.arquivos()).caminhos()).toHaveLength(330);
  });

  it("a marca do aquecimento nunca é entregue como tela", async () => {
    const r = redeDoBuild();
    let semRede = false;
    const sw = carregarSw((url, init) => (semRede ? Promise.reject(new TypeError("Failed to fetch")) : r.rede(url, init)));
    await sw.mensagem("warm");
    expect((await sw.paginas()).caminhos()).toContain("/hoje?aquecimento");
    await (await sw.paginas()).delete("/hoje");
    semRede = true;
    const res = await sw.buscar(pedido("/hoje?aquecimento", { mode: "navigate" })).resposta!;
    expect(res.status).toBe(503);
  });

  it("reaquecimento sem rede na primeira tela: para sem tentar as outras", async () => {
    let semRede = false;
    const r = redeDoBuild();
    const sw = carregarSw((url, init) => (semRede ? Promise.reject(new TypeError("Failed to fetch")) : r.rede(url, init)));
    await sw.mensagem("warm");
    semRede = true;
    sw.chamadas.length = 0;
    await sw.mensagem("warm");
    expect(sw.chamadas.map((c) => c.url)).toEqual(["/hoje"]);
  });

  it("primeiro aquecimento com só a tela do link guardada: baixa todas", async () => {
    const r = redeDoBuild();
    const sw = carregarSw(r.rede);
    await (await sw.paginas()).put("/questionario", resposta("cópia"));
    await sw.mensagem("warm");
    expect(sw.chamadas.filter((c) => !c.url.startsWith("/_next/")).map((c) => c.url)).toEqual(CORE);
  });
});

describe("sw.js: navegação interna e HTML com sinal fraco (RM-02)", () => {
  it("RSC com cópia e rede pendurada: erro de rede em 1,5 s, e a rede é abortada", async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | undefined;
    const sw = carregarSw((url, init) => {
      sinal = init?.signal;
      return pendente(init);
    });
    await (await sw.paginas()).put("/sessao", resposta("cópia da sessão"));
    const { resposta: r } = sw.buscar(pedido("/sessao?treino=a&_rsc=1x2y", { headers: { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } }));
    expect(r).not.toBeNull();
    let fim: Response | null = null;
    void r!.then((x) => (fim = x));
    await vi.advanceTimersByTimeAsync(1499);
    expect(fim).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(fim).not.toBeNull();
    expect(fim!.type).toBe("error");
    expect(sinal?.aborted).toBe(true);
  });

  it("RSC com cópia e rede que responde: devolve a própria resposta da rede", async () => {
    vi.useFakeTimers();
    const daRede = resposta("1:rsc", { contentType: "text/x-component" });
    const sw = carregarSw(async () => daRede);
    await (await sw.paginas()).put("/treinos", resposta("cópia"));
    const { resposta: r } = sw.buscar(pedido("/treinos?_rsc=abc", { headers: { RSC: "1" } }));
    expect(await r).toBe(daRede);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("RSC com cópia, cabeçalho na hora e corpo preso: erro de rede em 1,5 s (o limite vale até o fim do corpo)", async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | undefined;
    const sw = carregarSw(async (url, init) => {
      sinal = init?.signal;
      return corpoPreso(init, "text/x-component");
    });
    await (await sw.paginas()).put("/sessao", resposta("cópia da sessão"));
    const { resposta: r } = sw.buscar(pedido("/sessao?_rsc=1", { headers: { RSC: "1" } }), "aba-hoje");
    let fim: Response | null = null;
    void r!.then((x) => (fim = x));
    await vi.advanceTimersByTimeAsync(1499);
    expect(fim).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(fim!.type).toBe("error");
    expect(sinal?.aborted).toBe(true);
  });

  it("RSC da mesma tela (só a busca muda, ex.: router.replace na sessão): rede sem limite, nunca vira recarga", async () => {
    vi.useFakeTimers();
    let soltar: (r: Response) => void = () => {};
    let iniciado: Init | undefined;
    const sw = carregarSw(
      (url, init) => {
        iniciado = init;
        return new Promise<Response>((r) => (soltar = r));
      },
      { "aba-sessao": "/sessao?p=ontem", "aba-hoje": "/hoje" },
    );
    await (await sw.paginas()).put("/sessao", resposta("cópia da sessão"));
    const { resposta: r } = sw.buscar(pedido("/sessao?p=ontem&d=a&_rsc=9", { headers: { RSC: "1" } }), "aba-sessao");
    let fim: Response | null = null;
    void r!.then((x) => (fim = x));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fim).toBeNull();
    expect(iniciado).toBeUndefined();
    const daRede = resposta("1:rsc", { contentType: "text/x-component" });
    soltar(daRede);
    await vi.advanceTimersByTimeAsync(0);
    expect(fim).toBe(daRede);

    // De outra tela para a sessão: o limite continua.
    const outra = sw.buscar(pedido("/sessao?_rsc=2", { headers: { RSC: "1" } }), "aba-hoje");
    let fim2: Response | null = null;
    void outra.resposta!.then((x) => (fim2 = x));
    await vi.advanceTimersByTimeAsync(1500);
    expect(iniciado?.signal).toBeDefined();
    soltar(resposta("tarde"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fim2).not.toBeNull();
  });

  it("RSC sem cópia daquele caminho: rede sem limite", async () => {
    vi.useFakeTimers();
    let soltar: (r: Response) => void = () => {};
    const sw = carregarSw((url, init) => {
      expect(init).toBeUndefined();
      return new Promise<Response>((r) => (soltar = r));
    });
    await (await sw.paginas()).put("/alunos", resposta("cópia da lista"));
    const { resposta: r } = sw.buscar(pedido("/alunos/abc?_rsc=1", { headers: { RSC: "1" } }));
    let fim: Response | null = null;
    void r!.then((x) => (fim = x));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fim).toBeNull();
    soltar(resposta("1:rsc", { contentType: "text/x-component" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fim!.type).toBe("basic");
  });

  it("reconhece o RSC pelo cabeçalho ou pelo _rsc; outros pedidos comuns seguem direto para a rede", async () => {
    const sw = carregarSw(async () => resposta("ok"));
    expect(sw.buscar(pedido("/hoje", { headers: { RSC: "1" } })).resposta).not.toBeNull();
    expect(sw.buscar(pedido("/hoje?_rsc=zz")).resposta).not.toBeNull();
    expect(sw.buscar(pedido("/hoje")).resposta).toBeNull();
    expect(sw.buscar(pedido("/api/coach?_rsc=1", { headers: { RSC: "1" } })).resposta).toBeNull();
    expect(sw.buscar({ ...pedido("/hoje?_rsc=1", { headers: { RSC: "1" } }), method: "POST" }).resposta).toBeNull();
  });

  it("prefetch do roteador (Next-Router-Prefetch) segue direto para a rede, com ou sem cópia", async () => {
    const sw = carregarSw(async () => resposta("ok"));
    await (await sw.paginas()).put("/treinos", resposta("cópia"));
    for (const valor of ["1", "2", "3"]) {
      expect(sw.buscar(pedido("/treinos?_rsc=pf", { headers: { RSC: "1", "Next-Router-Prefetch": valor } })).resposta).toBeNull();
      expect(sw.buscar(pedido("/alunos/abc?_rsc=pf", { headers: { RSC: "1", "Next-Router-Prefetch": valor, "Next-Router-Segment-Prefetch": "/_tree" } })).resposta).toBeNull();
    }
    expect(sw.chamadas).toHaveLength(0);
    // a navegação para a mesma tela continua com o limite
    expect(sw.buscar(pedido("/treinos?_rsc=nav", { headers: { RSC: "1" } })).resposta).not.toBeNull();
  });

  it("página oculta pela página antes do limite: o SW desiste da rede também", async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | undefined;
    const sw = carregarSw((url, init) => {
      sinal = init?.signal;
      return pendente(init);
    });
    await (await sw.paginas()).put("/dieta", resposta("cópia"));
    const daPagina = new AbortController();
    const req = { ...pedido("/dieta?_rsc=1", { headers: { RSC: "1" } }), signal: daPagina.signal };
    const { resposta: r } = sw.buscar(req);
    await vi.advanceTimersByTimeAsync(100);
    daPagina.abort();
    expect((await r!).type).toBe("error");
    expect(sinal?.aborted).toBe(true);
  });

  it("HTML com cópia e rede lenta: a cópia sai em 400 ms, e a resposta atrasada atualiza a cópia", async () => {
    vi.useFakeTimers();
    const sw = carregarSw(() => new Promise((r) => setTimeout(() => r(resposta("hoje nova")), 1000)));
    await (await sw.paginas()).put("/hoje", resposta("hoje guardada"));
    const { resposta: r, esperas } = sw.buscar(pedido("/hoje", { mode: "navigate" }));
    let fim: Response | null = null;
    void r!.then((x) => (fim = x));
    await vi.advanceTimersByTimeAsync(399);
    expect(fim).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await fim!.text()).toBe("hoje guardada");
    expect(esperas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600);
    await Promise.all(esperas);
    expect(await (await (await sw.paginas()).match("/hoje"))!.text()).toBe("hoje nova");
  });

  it("HTML com cópia, cabeçalho na hora e corpo preso: a cópia sai em 400 ms", async () => {
    vi.useFakeTimers();
    const sw = carregarSw(async (url, init) => corpoPreso(init));
    await (await sw.paginas()).put("/hoje", resposta("hoje guardada"));
    const { resposta: r } = sw.buscar(pedido("/hoje", { mode: "navigate" }));
    let fim: Response | null = null;
    void r!.then((x) => (fim = x));
    await vi.advanceTimersByTimeAsync(399);
    expect(fim).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await fim!.text()).toBe("hoje guardada");
  });

  it("HTML com cópia e rede rápida: a rede ganha e atualiza a cópia", async () => {
    const sw = carregarSw(async () => resposta("hoje nova"));
    await (await sw.paginas()).put("/hoje", resposta("hoje guardada"));
    const { resposta: r, esperas } = sw.buscar(pedido("/hoje?ficha=1", { mode: "navigate" }));
    expect(await (await r!).text()).toBe("hoje nova");
    await Promise.all(esperas);
    expect(await (await (await sw.paginas()).match("/hoje"))!.text()).toBe("hoje nova");
  });

  it("HTML sem cópia e sem rede: página de sem internet", async () => {
    const sw = carregarSw(() => Promise.reject(new TypeError("Failed to fetch")));
    const { resposta: r } = sw.buscar(pedido("/alunos/abc", { mode: "navigate" }));
    const res = await r!;
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("Esta tela ainda não foi aberta neste aparelho");
  });

  it("HTML redirecionado não vira cópia", async () => {
    const sw = carregarSw(async () => resposta("entrar", { redirected: true }));
    const { resposta: r, esperas } = sw.buscar(pedido("/hoje", { mode: "navigate" }));
    await r;
    await Promise.all(esperas);
    expect(await (await sw.paginas()).match("/hoje")).toBeUndefined();
  });
});

describe("sw.js: guardar-esta (RM-04)", () => {
  function redeDaPagina(o: { htmlRedirecionado?: boolean; contentType?: string } = {}) {
    return async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === "/_next/static/chunks/redirecionado.js") return resposta("x", { redirected: true, contentType: "text/javascript" });
      if (pathname.startsWith("/_next/") || pathname.endsWith(".woff2")) return resposta("x", { contentType: "text/javascript" });
      return resposta("<!doctype html>questionario", { redirected: o.htmlRedirecionado, contentType: o.contentType });
    };
  }

  it("guarda a tela e os arquivos de mesma origem que ela já baixou; nada de fora, de redirecionamento ou de /api", async () => {
    const sw = carregarSw(redeDaPagina());
    const n = await sw.mensagem({
      tipo: "guardar-esta",
      path: "/questionario",
      assets: [
        "/_next/static/chunks/a.js",
        `${ORIGEM}/_next/static/chunks/b.css`,
        "/_next/static/media/archivo-latin.woff2",
        "/_next/static/chunks/redirecionado.js",
        "https://cdn.exemplo.com/_next/static/chunks/c.js",
        "/api/coach",
        "/ingest/static/array.js",
        42,
      ],
    });
    expect(n).toBe(1);
    expect((await sw.paginas()).caminhos()).toEqual(["/questionario"]);
    expect((await sw.arquivos()).caminhos().sort()).toEqual(["/_next/static/chunks/a.js", "/_next/static/chunks/b.css", "/_next/static/media/archivo-latin.woff2"]);
    expect(sw.chamadas.map((c) => c.url).sort()).toEqual(["/_next/static/chunks/a.js", "/_next/static/chunks/b.css", "/_next/static/chunks/redirecionado.js", "/_next/static/media/archivo-latin.woff2", "/questionario"]);
    expect(sw.chamadas.every((c) => c.init?.priority === "low")).toBe(true);
  });

  it("só o HTML da tela, sem as fontes do CSS (o aluno do questionário não baixa o app inteiro)", async () => {
    const sw = carregarSw(async (url) => (url.endsWith(".css") ? resposta("@font-face{src:url(../media/x-latin.woff2)}", { contentType: "text/css" }) : resposta("<!doctype html>")));
    await sw.mensagem({ tipo: "guardar-esta", path: "/questionario", assets: ["/_next/static/chunks/b.css"] });
    expect(sw.chamadas.map((c) => c.url).sort()).toEqual(["/_next/static/chunks/b.css", "/questionario"]);
  });

  it("não guarda HTML redirecionado nem resposta que não é HTML; os arquivos continuam", async () => {
    const sw = carregarSw(redeDaPagina({ htmlRedirecionado: true }));
    await sw.mensagem({ tipo: "guardar-esta", path: "/hoje", assets: ["/_next/static/chunks/a.js"] });
    expect((await sw.paginas()).caminhos()).toEqual([]);
    expect((await sw.arquivos()).caminhos()).toEqual(["/_next/static/chunks/a.js"]);

    const sw2 = carregarSw(redeDaPagina({ contentType: "application/json" }));
    await sw2.mensagem({ tipo: "guardar-esta", path: "/hoje", assets: [] });
    expect((await sw2.paginas()).caminhos()).toEqual([]);
  });

  it("guarda pelo caminho, sem a busca", async () => {
    const sw = carregarSw(redeDaPagina());
    await sw.mensagem({ tipo: "guardar-esta", path: "/questionario?aluno=s1", assets: [] });
    expect((await sw.paginas()).caminhos()).toEqual(["/questionario"]);
  });

  it("arquivo já guardado não é baixado de novo", async () => {
    const sw = carregarSw(redeDaPagina());
    await (await sw.arquivos()).put("/_next/static/chunks/a.js", resposta("x"));
    await sw.mensagem({ tipo: "guardar-esta", path: "/abrir", assets: ["/_next/static/chunks/a.js"] });
    expect(sw.chamadas.map((c) => c.url)).toEqual(["/abrir"]);
  });

  it("mensagem com formato inesperado é ignorada", async () => {
    const sw = carregarSw(redeDaPagina());
    for (const data of [
      null,
      undefined,
      "guardar-esta",
      42,
      { tipo: "guardar-esta" },
      { tipo: "guardar-esta", path: "/hoje" },
      { tipo: "guardar-esta", path: "/hoje", assets: "/_next/static/a.js" },
      { tipo: "guardar-esta", path: 1, assets: [] },
      { tipo: "guardar-esta", path: "hoje", assets: [] },
      { tipo: "guardar-esta", path: "//outro.exemplo/x", assets: [] },
      { tipo: "guardar-esta", path: "https://outro.exemplo/hoje", assets: [] },
      { tipo: "guardar-esta", path: "/api/coach", assets: [] },
      { tipo: "guardar-esta", path: "/_next/static/chunks/a.js", assets: [] },
      { tipo: "guardar-esta", path: "/ingest/e/", assets: [] },
      { tipo: "outra", path: "/hoje", assets: [] },
    ]) {
      expect(await sw.mensagem(data)).toBe(0);
    }
    expect(sw.chamadas).toEqual([]);
  });
});
