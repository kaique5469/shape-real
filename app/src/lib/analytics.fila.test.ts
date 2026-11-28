import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-js";
import type { ErroCedo, InicioDaPagina } from "./analytics";

/**
 * Rodada M, RM-03: o posthog-js chega depois do primeiro carregamento. A fila de analytics.ts guarda as chamadas até o
 * SDK iniciar e as aplica na ordem, com o horário e a página da ação; instrumentation-client.ts pede o SDK só depois do
 * load + 3 s + ocioso, e de novo quando a rede volta; posthog-init.ts faz o mesmo init de antes.
 */

type Registro = { metodo: string; args: unknown[] };

/** PostHog falso: registra cada chamada, na ordem. */
function phFalso() {
  const log: Registro[] = [];
  const anota =
    (metodo: string) =>
    (...args: unknown[]) => {
      log.push({ metodo, args });
    };
  const p = { capture: anota("capture"), identify: anota("identify"), reset: anota("reset"), register: anota("register"), captureException: anota("captureException") };
  return { p: p as unknown as PostHog, log };
}

/** Janela mínima: só a URL (a fila lê `window.location`). */
const janela = { location: new URL("https://app.test/hoje") };
const irPara = (url: string) => {
  janela.location = new URL(url);
};

async function carregarAnalytics(token = "phc_teste") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", token);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
  return import("./analytics");
}

const T0 = new Date("2026-11-27T12:00:00.000Z");
const inicioEm = (url: string, em = T0, referrer = ""): InicioDaPagina => ({ url, pathname: new URL(url).pathname, referrer, em });

beforeEach(() => {
  vi.stubGlobal("window", janela);
  irPara("https://app.test/hoje");
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/posthog-init");
  vi.doUnmock("posthog-js");
});

describe("fila de analytics.ts (antes de o SDK chegar)", () => {
  it("nada vai antes do init; depois, tudo na ordem em que aconteceu", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    a.track("tester_started", {});
    a.setContext({ app_mode: "teste" });
    a.identify("u1", { role: "coach" });
    a.track("demo_started", { role: "coach" });
    a.reportError(new Error("falha_ao_salvar"), "conta");
    a.resetIdentity();
    expect(log).toEqual([]);

    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), []);
    expect(log.map((r) => (r.metodo === "capture" ? `capture:${r.args[0]}` : r.metodo))).toEqual([
      "capture:$pageview",
      "capture:tester_started",
      "register",
      "identify",
      "capture:demo_started",
      "captureException",
      "reset",
    ]);

    // Depois do init, direto no SDK e exatamente como antes (sem horário nem página: o SDK lê os atuais).
    log.length = 0;
    a.track("demo_started", { role: "athlete" });
    expect(log).toEqual([{ metodo: "capture", args: ["demo_started", { role: "athlete" }] }]);
  });

  it("cada chamada leva o horário da ação no capture; a $pageview da abertura, o horário do módulo", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    const t1 = new Date(T0.getTime() + 1200);
    const t2 = new Date(T0.getTime() + 5300);
    vi.setSystemTime(t1);
    a.track("tester_started", {});
    vi.setSystemTime(t2);
    a.track("demo_started", { role: "coach" });
    vi.setSystemTime(new Date(T0.getTime() + 9000));
    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), []);

    const opcoes = log.map((r) => (r.args[2] as { timestamp?: Date } | undefined)?.timestamp?.getTime());
    expect(opcoes).toEqual([T0.getTime(), t1.getTime(), t2.getTime()]);
  });

  it("teto de 200 chamadas: as primeiras ficam, o resto se perde", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    expect(a.MAX_FILA).toBe(200);
    for (let i = 0; i < 250; i++) a.track("session_feature_used", { feature: "som", feitas: i });
    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), []);
    const eventos = log.filter((r) => r.args[0] === "session_feature_used");
    expect(eventos).toHaveLength(200);
    expect((eventos[0]!.args[1] as { feitas: number }).feitas).toBe(0);
    expect((eventos[199]!.args[1] as { feitas: number }).feitas).toBe(199);
  });

  it("o teto vale só para os eventos: identify, reset e register entram mesmo com a fila cheia (teto próprio de 50)", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    expect(a.MAX_FILA_ESTADO).toBe(50);
    for (let i = 0; i < 250; i++) a.track("session_feature_used", { feature: "som", feitas: i });
    a.setContext({ viewing_as_student: true });
    a.identify("u1");
    a.resetIdentity();
    for (let i = 0; i < 60; i++) a.setContext({ n: i });
    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), []);
    expect(log.filter((r) => r.args[0] === "session_feature_used")).toHaveLength(200);
    expect(log.filter((r) => r.metodo !== "capture").map((r) => r.metodo).slice(0, 3)).toEqual(["register", "identify", "reset"]);
    expect(log.filter((r) => r.metodo === "register")).toHaveLength(48);

    // Os contadores zeram depois do init: uma página nova (outro carregamento) começa do zero.
    const b = await carregarAnalytics();
    const outro = phFalso();
    b.identify("u2");
    b.anexarPosthog(outro.p, inicioEm("https://app.test/hoje"), []);
    expect(outro.log.map((r) => r.metodo)).toEqual(["capture", "identify"]);
  });

  it("exceções que esperaram na fila saem com o horário da ação (o capture do $exception leva o timestamp)", async () => {
    const a = await carregarAnalytics();
    // Como o SDK publicado: captureException chama this.capture("$exception", …) na hora.
    const enviados: { evento: string; opcoes: Record<string, unknown> | undefined }[] = [];
    const sdk = {
      capture(evento: string, _props?: unknown, opcoes?: Record<string, unknown>) {
        enviados.push({ evento, opcoes });
      },
      captureException(this: { capture: (e: string, p: unknown, o: unknown) => void }, _erro: unknown, props: Record<string, unknown>) {
        this.capture("$exception", props, { _noTruncate: true, _batchKey: "exceptionEvent" });
      },
      identify() {},
      reset() {},
      register() {},
    };
    const tReport = new Date(T0.getTime() + 400);
    const tCrash = new Date(T0.getTime() + 900);
    vi.setSystemTime(tReport);
    a.reportError(new Error("falha_ao_salvar"), "conta");
    vi.setSystemTime(tCrash);
    a.reportCrash(new Error("tela_quebrou"), "hoje");
    vi.setSystemTime(new Date(T0.getTime() + 3100));
    const cedo: ErroCedo[] = [{ erro: new Error("boom"), em: new Date(T0.getTime() + 200), url: "https://app.test/hoje", pathname: "/hoje" }];
    a.anexarPosthog(sdk as unknown as PostHog, inicioEm("https://app.test/hoje"), cedo);

    const excecoes = enviados.filter((e) => e.evento === "$exception");
    expect(excecoes.map((e) => (e.opcoes?.timestamp as Date).getTime())).toEqual([T0.getTime() + 200, tReport.getTime(), tCrash.getTime()]);
    expect(excecoes[0]!.opcoes).toMatchObject({ _noTruncate: true, _batchKey: "exceptionEvent" });
    // O capture volta a ser o do SDK: o que vem depois do init não ganha horário.
    a.reportError(new Error("depois_do_init"), "conta");
    expect(enviados.at(-1)).toEqual({ evento: "$exception", opcoes: { _noTruncate: true, _batchKey: "exceptionEvent" } });
    expect(Object.prototype.hasOwnProperty.call(sdk, "capture")).toBe(true);
  });

  it("nenhuma propriedade nova: só os campos do próprio SDK com a página da ação, sem ?k= nem #", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    irPara("https://app.test/entrar?k=SEGREDO&x=1#d=1.FICHA");
    const props = { where: "resumo", resend: false, novos: 2 };
    a.track("treinos_link_sent", props);
    // DROP_PROPS continua valendo na fila.
    a.track("diet_analyzed", { source: "motor", score: 82, where: "self", itens: "1-5" });
    a.reportError(new Error("falha_ao_salvar"), "entrar", { tentativa: 2 });
    a.reportCrash(new Error("quebrou"), "entrar");
    a.anexarPosthog(p, inicioEm("https://app.test/entrar?x=1", T0, "https://wa.me/"), []);

    const pagina = { $current_url: "https://app.test/entrar?x=1", $pathname: "/entrar" };
    const [vista, enviado, dieta, erro, falha] = log;
    expect(vista!.args[1]).toEqual({ ...pagina, $referrer: "https://wa.me/" });
    expect(enviado!.args[1]).toEqual({ ...props, ...pagina });
    expect(dieta!.args[1]).toEqual({ source: "motor", where: "self", itens: "1-5", ...pagina });
    expect(erro!.args[1]).toEqual({ where: "entrar", handled: true, tentativa: 2, ...pagina });
    expect(falha!.args[1]).toEqual({ where: "entrar", handled: false, ...pagina });
    for (const r of log) expect(JSON.stringify(r.args[1])).not.toMatch(/k=|SEGREDO|#|FICHA/);
    expect(log).toHaveLength(5);
  });

  it("$pageview da abertura com a URL do módulo, não a de depois do redirecionamento; a atual vem depois", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    irPara("https://app.test/entrar");
    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), []);
    expect(log).toEqual([
      { metodo: "capture", args: ["$pageview", { $current_url: "https://app.test/hoje", $pathname: "/hoje" }, { timestamp: T0 }] },
      { metodo: "capture", args: ["$pageview", { $current_url: "https://app.test/entrar", $pathname: "/entrar" }, undefined] },
    ]);
  });

  it("página que mudou na fila ganha a $pageview antes da primeira chamada dela", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    irPara("https://app.test/receber");
    a.track("treinos_link_received", { same: false });
    irPara("https://app.test/alunos/a1");
    vi.setSystemTime(new Date(T0.getTime() + 2000));
    a.track("coach_list_viewed", {});
    a.anexarPosthog(p, inicioEm("https://app.test/receber"), []);
    expect(log.map((r) => `${r.args[0]}${r.args[0] === "$pageview" ? ` ${(r.args[1] as { $pathname: string }).$pathname}` : ""}`)).toEqual([
      "$pageview /receber",
      "treinos_link_received",
      "$pageview /alunos/a1",
      "coach_list_viewed",
    ]);
    expect((log[2]!.args[2] as { timestamp: Date }).timestamp.getTime()).toBe(T0.getTime() + 2000);
  });

  it("erro de /receber enviado depois de sair da tela: só o tipo e o código, sem a mensagem nem a pilha", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    irPara("https://app.test/receber");
    a.reportError(new TypeError("Marina sente dor no joelho"), "receber");
    a.reportError(new Error("rascunho_invalido"), "receber");
    irPara("https://app.test/alunos/a1");
    a.anexarPosthog(p, inicioEm("https://app.test/receber"), []);
    const erros = log.filter((r) => r.metodo === "captureException").map((r) => r.args[0] as Error);
    expect(erros.map((e) => [e.name, e.message, e.stack])).toEqual([
      ["TypeError", "", "TypeError"],
      ["Error", "rascunho_invalido", "Error: rascunho_invalido"],
    ]);
  });

  it("erro de /questionario enviado ainda em /questionario vai inteiro (o before_send limpa lá)", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    irPara("https://app.test/questionario");
    const original = new TypeError("qualquer coisa");
    a.reportError(original, "questionario");
    a.anexarPosthog(p, inicioEm("https://app.test/questionario"), []);
    expect(log.find((r) => r.metodo === "captureException")!.args[0]).toBe(original);
  });

  it("erros de antes do SDK entram na ordem dos horários, com a página deles e sem propriedade nova", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    vi.setSystemTime(new Date(T0.getTime() + 3000));
    a.track("tester_started", {});
    const cedo: ErroCedo[] = [
      { erro: new Error("boom"), em: new Date(T0.getTime() + 1000), url: "https://app.test/hoje", pathname: "/hoje" },
      { erro: "texto solto", em: new Date(T0.getTime() + 4000), url: "https://app.test/hoje", pathname: "/hoje" },
    ];
    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), cedo);
    expect(log.map((r) => r.metodo + (r.metodo === "capture" ? `:${r.args[0]}` : ""))).toEqual(["capture:$pageview", "captureException", "capture:tester_started", "captureException"]);
    const [, primeiro, , segundo] = log;
    expect((primeiro!.args[0] as Error).message).toBe("boom");
    expect(primeiro!.args[1]).toEqual({ handled: false, $current_url: "https://app.test/hoje", $pathname: "/hoje" });
    expect((segundo!.args[0] as Error).message).toBe("texto solto");
  });

  it("sem token, nada entra na fila", async () => {
    const a = await carregarAnalytics("");
    const { p, log } = phFalso();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    a.track("tester_started", {});
    a.identify("u1");
    a.anexarPosthog(p, inicioEm("https://app.test/hoje"), []);
    expect(log.map((r) => r.args[0])).toEqual(["$pageview"]);
  });

  it("semChaveNemFragmento tira só a chave do link de teste e o #", async () => {
    const a = await carregarAnalytics();
    expect(a.semChaveNemFragmento("https://app.test/testar?k=abc")).toBe("https://app.test/testar");
    expect(a.semChaveNemFragmento("https://app.test/questionario?aluno=s1&k=abc#d=1.X")).toBe("https://app.test/questionario?aluno=s1");
    expect(a.semChaveNemFragmento("https://app.test/abrir#d=1.X")).toBe("https://app.test/abrir");
    expect(a.semChaveNemFragmento("/abrir?k=1#d=1.X")).toBe("https://app.test/abrir");
  });
});

// ---- instrumentation-client.ts: quando o SDK é pedido ---------------------------------------------------------------

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

const estado = vi.hoisted(() => ({ falhar: false, pedidos: 0 }));
const iniciarPosthog = vi.fn();
const enviarErro = vi.fn();

/** Abre uma página com o instrumentation-client: janela com eventos, documento ainda carregando, SDK falso. */
async function abrir(url: string, opcoes: { semOcioso?: boolean; storage?: MemStorage } = {}) {
  vi.resetModules();
  iniciarPosthog.mockReset();
  iniciarPosthog.mockReturnValue(enviarErro);
  enviarErro.mockReset();
  estado.pedidos = 0;
  vi.doMock("@/lib/posthog-init", () => {
    estado.pedidos++;
    if (estado.falhar) throw new Error("Failed to load chunk");
    return { iniciarPosthog };
  });
  const win = Object.assign(new EventTarget(), { location: new URL(url) }) as EventTarget & { location: URL; requestIdleCallback?: unknown };
  const ocioso = vi.fn((cb: () => void, _o: { timeout: number }) => setTimeout(cb, 50));
  if (!opcoes.semOcioso) win.requestIdleCallback = ocioso;
  const doc = Object.assign(new EventTarget(), { readyState: "loading", referrer: "https://l.wa.me/?k=1#x", visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("localStorage", opcoes.storage ?? new MemStorage());
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_teste");
  await import("@/instrumentation-client");
  const carregou = () => {
    doc.readyState = "complete";
    win.dispatchEvent(new Event("load"));
  };
  return { win, doc, ocioso, carregou };
}

/** Deixa o import dinâmico (e o then dele) terminar. */
const assentar = async () => {
  await vi.dynamicImportSettled();
  await Promise.resolve();
};

describe("instrumentation-client.ts (quando o SDK é pedido)", () => {
  beforeEach(() => {
    estado.falhar = false;
  });

  it("nunca antes do load + 3 s; depois, no ocioso com limite de 4 s", async () => {
    const { ocioso, carregou } = await abrir("https://app.test/hoje");
    await vi.advanceTimersByTimeAsync(10_000);
    await assentar();
    expect(estado.pedidos).toBe(0);

    carregou();
    await vi.advanceTimersByTimeAsync(2999);
    await assentar();
    expect(ocioso).not.toHaveBeenCalled();
    expect(estado.pedidos).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(ocioso).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 });
    await vi.advanceTimersByTimeAsync(50);
    await assentar();
    expect(iniciarPosthog).toHaveBeenCalledTimes(1);
  });

  it("Safari, sem requestIdleCallback: setTimeout, ainda depois dos 3 s", async () => {
    const { carregou } = await abrir("https://app.test/hoje", { semOcioso: true });
    carregou();
    await vi.advanceTimersByTimeAsync(2999);
    await assentar();
    expect(iniciarPosthog).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await assentar();
    expect(iniciarPosthog).toHaveBeenCalledTimes(1);
  });

  it("na avaliação do módulo: persistência memory no /questionario do aluno, URL e referrer já sem ?k= e #", async () => {
    const { win, carregou } = await abrir("https://app.test/questionario?k=abc#d=1.PEDIDO");
    // A página limpa a barra e o SDK chega bem depois: a decisão já foi tomada.
    win.location = new URL("https://app.test/questionario");
    carregou();
    await vi.advanceTimersByTimeAsync(3100);
    await assentar();
    const [token, abertura, persistencia, inicio, cedo] = iniciarPosthog.mock.calls[0]!;
    expect(token).toBe("phc_teste");
    expect(abertura).toEqual({ pathname: "/questionario", hash: "#d=1.PEDIDO", temPerfilPersonal: false });
    expect(persistencia).toBe("memory");
    expect(inicio).toEqual({ url: "https://app.test/questionario", pathname: "/questionario", referrer: "https://l.wa.me/", em: T0 });
    expect(cedo).toEqual([]);
  });

  it("personal no /questionario (modo junto): localStorage, como antes", async () => {
    const storage = new MemStorage();
    storage.setItem("sr:v1:profiles", JSON.stringify([{ id: "c1", role: "coach" }]));
    storage.setItem("sr:session", "c1");
    const { carregou } = await abrir("https://app.test/questionario?aluno=s1", { storage });
    carregou();
    await vi.advanceTimersByTimeAsync(3100);
    await assentar();
    expect(iniciarPosthog.mock.calls[0]![2]).toBe("localStorage");
  });

  it("erros não tratados antes do SDK: até 20, com horário e página; depois do init, o SDK cuida", async () => {
    const { win, carregou } = await abrir("https://app.test/hoje");
    for (let i = 0; i < 24; i++) win.dispatchEvent(Object.assign(new Event("error"), { error: new Error(`e${i}`) }));
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "rejeitada" }));
    carregou();
    await vi.advanceTimersByTimeAsync(3100);
    await assentar();
    const cedo = iniciarPosthog.mock.calls[0]![4] as ErroCedo[];
    expect(cedo).toHaveLength(20);
    expect(cedo[0]).toEqual({ erro: expect.any(Error), em: T0, url: "https://app.test/hoje", pathname: "/hoje" });
    expect((cedo[19]!.erro as Error).message).toBe("e19");
    // Depois do init, até a captura automática do SDK chegar (arquivo à parte): direto para o SDK, não para a lista.
    const depois = new Error("depois");
    win.dispatchEvent(Object.assign(new Event("error"), { error: depois }));
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "rejeitada_depois" }));
    expect(cedo).toHaveLength(20);
    expect(enviarErro.mock.calls.map((c) => c[0])).toEqual([depois, "rejeitada_depois"]);

    // A captura do SDK chegou (ela embrulha o window.onerror): os ouvintes saem, sem mandar duas vezes.
    (win as unknown as { __PosthogExtensions__: unknown }).__PosthogExtensions__ = { errorWrappingFunctions: {} };
    win.dispatchEvent(Object.assign(new Event("error"), { error: new Error("o_sdk_pega") }));
    win.dispatchEvent(Object.assign(new Event("error"), { error: new Error("o_sdk_pega_2") }));
    expect(enviarErro).toHaveBeenCalledTimes(2);
  });

  it("captura do SDK já ligada no init: os ouvintes saem na hora", async () => {
    const { win, carregou } = await abrir("https://app.test/hoje");
    (win as unknown as { __PosthogExtensions__: unknown }).__PosthogExtensions__ = { errorWrappingFunctions: {} };
    carregou();
    await vi.advanceTimersByTimeAsync(3100);
    await assentar();
    win.dispatchEvent(Object.assign(new Event("error"), { error: new Error("x") }));
    expect(enviarErro).not.toHaveBeenCalled();
  });

  it("import que falha com a rede ligada: pede de novo em 15 s, 60 s e 5 min, e quando a página volta a ficar visível", async () => {
    estado.falhar = true;
    const { doc, carregou } = await abrir("https://app.test/hoje");
    carregou();
    // load + 3 s + ocioso (50 ms no falso): o pedido falha aos 3,05 s.
    await vi.advanceTimersByTimeAsync(3050);
    await assentar();
    expect(estado.pedidos).toBe(1);

    await vi.advanceTimersByTimeAsync(14_999);
    await assentar();
    expect(estado.pedidos).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await assentar();
    expect(estado.pedidos).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    await assentar();
    expect(estado.pedidos).toBe(3);

    // A página volta a ficar visível antes dos 5 min: pede na hora (e o arquivo vem).
    estado.falhar = false;
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await assentar();
    expect(estado.pedidos).toBe(3);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await assentar();
    expect(estado.pedidos).toBe(4);
    expect(iniciarPosthog).toHaveBeenCalledTimes(1);

    // Iniciado: nada mais é pedido, nem pela espera de 5 min que estava correndo nem por evento.
    await vi.advanceTimersByTimeAsync(600_000);
    doc.dispatchEvent(new Event("visibilitychange"));
    await assentar();
    expect(estado.pedidos).toBe(4);
  });

  it("depois das esperas, só os eventos pedem de novo", async () => {
    estado.falhar = true;
    const { win, carregou } = await abrir("https://app.test/hoje");
    carregou();
    await vi.advanceTimersByTimeAsync(3100 + 15_000 + 60_000 + 300_000);
    await assentar();
    expect(estado.pedidos).toBe(4);
    await vi.advanceTimersByTimeAsync(3_600_000);
    await assentar();
    expect(estado.pedidos).toBe(4);
    win.dispatchEvent(new Event("online"));
    await assentar();
    expect(estado.pedidos).toBe(5);
  });

  it("import que falha (sem rede): nada quebra, e o SDK é pedido de novo no evento online", async () => {
    estado.falhar = true;
    const { win, carregou } = await abrir("https://app.test/hoje");
    carregou();
    await vi.advanceTimersByTimeAsync(3100);
    await assentar();
    expect(estado.pedidos).toBe(1);
    expect(iniciarPosthog).not.toHaveBeenCalled();

    // Erro com o SDK ainda fora: continua guardado.
    win.dispatchEvent(Object.assign(new Event("error"), { error: new Error("sem_rede") }));
    estado.falhar = false;
    win.dispatchEvent(new Event("online"));
    await assentar();
    expect(estado.pedidos).toBe(2);
    expect(iniciarPosthog).toHaveBeenCalledTimes(1);
    expect((iniciarPosthog.mock.calls[0]![4] as ErroCedo[]).map((e) => (e.erro as Error).message)).toEqual(["sem_rede"]);

    // Um segundo "online" não pede de novo.
    win.dispatchEvent(new Event("online"));
    await assentar();
    expect(estado.pedidos).toBe(2);
  });
});

// ---- posthog-init.ts: o init é o mesmo de antes ---------------------------------------------------------------------

describe("posthog-init.ts", () => {
  it("o pacote publicado do SDK ainda dispara a $pageview do init com { title } e send_instantly (a forma que a trava reconhece)", () => {
    for (const arquivo of ["module.mjs", "main.js"]) {
      const pacote = readFileSync(path.resolve(__dirname, "../../node_modules/posthog-js/dist", arquivo), "utf8");
      expect(pacote, arquivo).toMatch(/\.capture\([\w$]+,\{title:[\w$]+\.title\},\{send_instantly:!0\}\)/);
    }
  });

  it("o pacote publicado ainda manda a exceção pelo capture da instância, na mesma chamada (o horário da fila depende disso)", () => {
    for (const arquivo of ["module.mjs", "main.js"]) {
      const pacote = readFileSync(path.resolve(__dirname, "../../node_modules/posthog-js/dist", arquivo), "utf8");
      expect(pacote, arquivo).toMatch(/captureException\([\w$]+,[\w$]+\)\{try\{if\(!this\.exceptions\)return;const [\w$]+=this\.exceptions\.buildProperties\([^;]+;return this\.exceptions\.sendExceptionEvent\(/);
      expect(pacote, arquivo).toMatch(/this\._instance\.capture\("\$exception",[\w$]+,\{/);
    }
  });

  it("init com as mesmas opções de antes; a $pageview do SDK fica de fora e a fila entra depois do init", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_teste");
    vi.stubGlobal("window", { location: new URL("https://app.test/questionario") });
    const ordem: string[] = [];
    const sdk = {
      init: vi.fn(() => ordem.push("init")),
      capture: vi.fn((ev: string, props?: Record<string, unknown>, _opcoes?: unknown) => ordem.push(`${ev} ${Object.keys(props ?? {}).join(",")}`)),
      captureException: vi.fn(),
      identify: vi.fn(),
      reset: vi.fn(),
      register: vi.fn(),
    };
    vi.doMock("posthog-js", () => ({ default: sdk }));
    const { iniciarPosthog: iniciar } = await import("./posthog-init");
    iniciar("phc_teste", { pathname: "/questionario", hash: "#d=1.X", temPerfilPersonal: false }, "memory", inicioEm("https://app.test/questionario"), []);

    expect(ordem).toEqual(["init", "$pageview $current_url,$pathname"]);
    // Um tique depois do init o SDK dispara a $pageview dele: descartada uma vez; as de navegação e as nossas passam.
    sdk.capture("$pageview", { title: "Shape Real" }, { send_instantly: true });
    sdk.capture("$pageview", { navigation_type: "pushState" });
    sdk.capture("$pageview", { title: "Shape Real" }, { send_instantly: true });
    expect(ordem.slice(2)).toEqual(["$pageview navigation_type", "$pageview title"]);
    const [token, config] = sdk.init.mock.calls[0]! as unknown as [string, Record<string, unknown>];
    expect(token).toBe("phc_teste");
    const { before_send, ...resto } = config;
    expect(resto).toEqual({
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      defaults: "2026-08-30",
      capture_exceptions: true,
      person_profiles: "identified_only",
      persistence: "memory",
      disable_session_recording: true,
      // Correção da revisão: web vitals, mapa de calor e clique morto desligados no código (não dependem do painel).
      capture_performance: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      autocapture: { element_attribute_ignorelist: ["href", "aria-label", "title", "placeholder", "alt", "value", "name"] },
    });

    // before_send: sem ?k=, sem #, sem destino de link e, no aluno do link (memory), sem IP.
    const saida = (before_send as (e: unknown) => { properties: Record<string, unknown> })({
      event: "$autocapture",
      properties: {
        $current_url: "https://app.test/questionario?k=abc#d=1.X",
        $referrer: "https://app.test/testar?k=abc",
        $external_click_url: "https://wa.me/5511999999999?text=oi",
        $elements_chain: 'a:href="https://wa.me/5511999999999"nth-child="1"',
      },
    });
    expect(saida.properties).toEqual({
      $current_url: "https://app.test/questionario",
      $referrer: "https://app.test/testar",
      $elements_chain: 'a:nth-child="1"',
      $ip: null,
      $geoip_disable: true,
    });

    // Correção da revisão: URLs aninhadas (web vitals) também saem sem ?k= e sem #; mapa de calor e clique morto nunca saem.
    const vitals = (before_send as (e: unknown) => { properties: Record<string, unknown> })({
      event: "$web_vitals",
      properties: {
        $current_url: "https://app.test/testar",
        $web_vitals_FCP_event: { name: "FCP", value: 812, navigationURL: "https://app.test/testar?k=X#d=Y", $current_url: "https://app.test/testar?k=X#d=Y", attribution: { urls: ["https://app.test/testar?k=X"] } },
      },
    });
    expect(JSON.stringify(vitals.properties)).not.toMatch(/k=|#/);
    expect(vitals.properties.$web_vitals_FCP_event).toMatchObject({ name: "FCP", value: 812, navigationURL: "https://app.test/testar", $current_url: "https://app.test/testar" });
    const descartar = before_send as (e: unknown) => unknown;
    expect(descartar({ event: "$$heatmap", properties: { $heatmap_data: { "https://app.test/questionario": [{ x: 180, y: 552 }] } } })).toBeNull();
    expect(descartar({ event: "$dead_click", properties: { $current_url: "https://app.test/sessao" } })).toBeNull();
  });
});
