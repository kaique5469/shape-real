import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-js";
import type { InicioDaPagina } from "./analytics";
import { ALLOWED_PROPS, filtrarProps, MAX_TEXTO_PROP } from "./analytics-props";

/**
 * Rodada 3, Fundação (R3-19): as propriedades de cada evento são conferidas em tempo de execução. O filtro chega com o
 * SDK (posthog-init.ts → anexarPosthog) e vale para a fila e para as chamadas seguintes; as listas ficam fora do
 * primeiro carregamento.
 */

type Registro = { metodo: string; args: unknown[] };
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
const janela = { location: new URL("https://app.test/hoje") };
const inicio: InicioDaPagina = { url: "https://app.test/hoje", pathname: "/hoje", referrer: "", em: new Date("2026-11-27T12:00:00.000Z") };

async function carregarAnalytics() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_teste");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
  return import("./analytics");
}
/** Propriedades de produto do capture (sem os campos do SDK que a fila acrescenta). */
const deProduto = (r: Registro) => Object.fromEntries(Object.entries((r.args[1] ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith("$")));
const eventos = (log: Registro[], nome: string) => log.filter((r) => r.metodo === "capture" && r.args[0] === nome).map(deProduto);

let avisos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal("window", janela);
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("posthog-js");
});

describe("filtro por evento (posthog mockado)", () => {
  it("chave fora da lista não sai: na fila e depois do init", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    a.track("diet_shared", { via: "whatsapp", direct: true, nome: "X" });
    a.anexarPosthog(p, inicio, [], filtrarProps);
    a.track("diet_shared", { via: "copy", direct: false, nome: "Juliana Prado" });
    expect(eventos(log, "diet_shared")).toEqual([
      { via: "whatsapp", direct: true },
      { via: "copy", direct: false },
    ]);
  });

  it("texto acima de 64 caracteres em chave permitida é descartado; até 64 passa", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    a.anexarPosthog(p, inicio, [], filtrarProps);
    a.track("error_screen_shown", { where: "x".repeat(200) });
    a.track("error_screen_shown", { where: "y".repeat(MAX_TEXTO_PROP) });
    expect(eventos(log, "error_screen_shown")).toEqual([{}, { where: "y".repeat(64) }]);
  });

  it("evento com propriedades fechadas perde a chave extra (mesmo passada à força)", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    a.anexarPosthog(p, inicio, [], filtrarProps);
    a.track("workout_resumed", { origem: "conflito", mudou_exercicio: true, instalado: false, nome: "Juliana" } as unknown as { origem: "conflito"; mudou_exercicio: boolean; instalado: boolean });
    expect(eventos(log, "workout_resumed")).toEqual([{ origem: "conflito", mudou_exercicio: true, instalado: false }]);
  });

  it("workout_completed: chave de dor e a duração bruta (`minutes`) saem; a faixa de minutos ativos fica", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    a.anexarPosthog(p, inicio, [], filtrarProps);
    a.track("workout_completed", { sets: 12, prs: 1, dor: true, pain: true, dor_exercicios: 2, minutes: 95, minutos_ativos: "45-60" });
    expect(eventos(log, "workout_completed")).toEqual([{ sets: 12, prs: 1, minutos_ativos: "45-60" }]);
  });

  it("evento só com chaves permitidas chega idêntico; booleanos permitidos (has_phone, has_cref) passam", async () => {
    const a = await carregarAnalytics();
    const { p, log } = phFalso();
    const ficha = { via: "whatsapp", direct: false, has_program: true, has_diet: false, where: "pagina_aluno", situacao: "nunca_enviada", primeira: true, horas_desde_cadastro: null, questionario: "nenhum", aluno_novo: true };
    a.track("ficha_link_sent", ficha);
    a.anexarPosthog(p, inicio, [], filtrarProps);
    a.track("student_created", { consent: true, has_phone: true, modo: "agora" });
    a.track("student_coach_whatsapp_clicked", { has_cref: true, where: "hoje" });
    expect(eventos(log, "ficha_link_sent")).toEqual([ficha]);
    expect(eventos(log, "student_created")).toEqual([{ consent: true, has_phone: true, modo: "agora" }]);
    expect(eventos(log, "student_coach_whatsapp_clicked")).toEqual([{ has_cref: true, where: "hoje" }]);
    expect(avisos).not.toHaveBeenCalled();
  });

  it("valor que não é número, booleano, null ou texto curto sai; o aviso cita a chave, nunca o valor", () => {
    const fora = filtrarProps("diet_shared", { via: "copy", direct: { a: 1 } as unknown as boolean, telefone: "11999990000" });
    expect(fora).toEqual({ via: "copy" });
    const textos = avisos.mock.calls.map((c) => c.join(" "));
    expect(textos.some((t) => t.includes('"telefone"'))).toBe(true);
    expect(textos.join(" ")).not.toContain("11999990000");
  });

  it("evento fora da união (em tempo de execução) não leva nenhuma propriedade", () => {
    expect(filtrarProps("evento_inventado" as never, { via: "copy" })).toEqual({});
  });
});

describe("posthog-init.ts entrega o filtro", () => {
  it("depois do init, track passa pelo filtro (listas vindas com o SDK)", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_teste");
    vi.stubGlobal("window", { location: new URL("https://app.test/hoje") });
    const sdk = { init: vi.fn(), capture: vi.fn(), captureException: vi.fn(), identify: vi.fn(), reset: vi.fn(), register: vi.fn() };
    // O init troca o `capture` da instância (trava da $pageview do SDK): as chamadas chegam ao mock original.
    const capture = sdk.capture;
    vi.doMock("posthog-js", () => ({ default: sdk }));
    const a = await import("./analytics");
    a.track("diet_shared", { via: "whatsapp", direct: true, nome: "na fila" });
    const { iniciarPosthog } = await import("./posthog-init");
    iniciarPosthog("phc_teste", { pathname: "/hoje", hash: "", temPerfilPersonal: true }, "localStorage", inicio, []);
    a.track("diet_shared", { via: "copy", direct: false, nome: "depois" });
    const enviados = capture.mock.calls.filter((c) => c[0] === "diet_shared").map((c) => deProduto({ metodo: "capture", args: c }));
    expect(enviados).toEqual([
      { via: "whatsapp", direct: true },
      { via: "copy", direct: false },
    ]);
  });
});

describe("listas (ALLOWED_PROPS)", () => {
  it("contém as chaves de EVENT_PROPS e EXTRA_PROPS; eventos fechados têm exatamente as do contrato", async () => {
    const { EVENT_PROPS, EXTRA_PROPS } = await import("./analytics");
    const permitidas = ALLOWED_PROPS as Record<string, readonly string[]>;
    for (const [e, ks] of Object.entries(EVENT_PROPS)) expect([...permitidas[e]!].sort(), e).toEqual([...ks].sort());
    for (const [e, ks] of Object.entries(EXTRA_PROPS)) for (const k of ks) expect(permitidas[e], `${e}.${k}`).toContain(k);
  });

  // Era o filtro proposto pelo estudo; aqui é teste de regressão (uma allowlist só, sem regex no código).
  const FORBIDDEN = /nome|name|phone|telefone|email|cref|carga|load|kg|peso|weight|altura|height|texto|text|nota|score|kcal|macro|gordura|medida/i;
  /** Booleanos de presença (tem ou não tem), nunca o valor. */
  const PRESENCA = new Set(["has_phone", "has_cref"]);

  it("nenhuma chave com nome de dado pessoal, carga, texto ou saúde (fora os booleanos de presença)", () => {
    const keys = Object.values(ALLOWED_PROPS).flat() as string[];
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => FORBIDDEN.test(k) && !PRESENCA.has(k))).toEqual([]);
  });

  it("nenhuma chave de dor em nenhum evento (R3-7)", () => {
    const keys = Object.values(ALLOWED_PROPS).flat() as string[];
    expect(keys.filter((k) => /(^|_)(dor|dores|pain)(_|$)/i.test(k))).toEqual([]);
  });

  it("workout_completed: a faixa de minutos ativos entra e a duração bruta sai", () => {
    expect(ALLOWED_PROPS.workout_completed).toContain("minutos_ativos");
    expect(ALLOWED_PROPS.workout_completed as readonly string[]).not.toContain("minutes");
  });

  it("as listas não entram no primeiro carregamento: analytics.ts não importa analytics-props.ts estaticamente", () => {
    const fonte = readFileSync(path.resolve(__dirname, "analytics.ts"), "utf8");
    expect(fonte).not.toMatch(/^\s*import\s[^;]*["'](\.\/|@\/lib\/)analytics-props["']/m);
    expect(fonte).not.toMatch(/^\s*export\s[^;]*from\s+["'](\.\/|@\/lib\/)analytics-props["']/m);
    const init = readFileSync(path.resolve(__dirname, "posthog-init.ts"), "utf8");
    expect(init).toMatch(/anexarPosthog\([^)]*filtrarProps\)/);
  });
});

/**
 * Toda chave passada a track() no código (lida pelo verificador de tipos, inclusive em objetos montados por funções)
 * está na lista do evento. Chave nova sem lista: este teste falha apontando arquivo e linha (trilhas: mande a chave em
 * "Para a costura"). `DESCARTADAS` = chaves que uma tela ainda passa e o filtro descarta de propósito.
 */
const DESCARTADAS: Record<string, readonly string[]> = {};

describe("inventário das chamadas a track()", () => {
  it("nenhuma chave fora da ALLOWED_PROPS", () => {
    const raiz = path.resolve(__dirname, "../..");
    const cfg = ts.readConfigFile(path.join(raiz, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, raiz);
    const arquivos = parsed.fileNames.filter((f) => f.includes(`${path.sep}src${path.sep}`) && !/\.test\.tsx?$/.test(f));
    const program = ts.createProgram(arquivos, { ...parsed.options, noEmit: true, incremental: false });
    const checker = program.getTypeChecker();
    const permitidas = ALLOWED_PROPS as Record<string, readonly string[]>;
    const fora: string[] = [];
    let chamadas = 0;
    for (const sf of program.getSourceFiles()) {
      if (!arquivos.includes(sf.fileName)) continue;
      const visitar = (no: ts.Node): void => {
        if (ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === "track" && no.arguments.length) {
          chamadas++;
          const onde = `${path.relative(raiz, sf.fileName)}:${sf.getLineAndCharacterOfPosition(no.getStart()).line + 1}`;
          const t0 = checker.getTypeAtLocation(no.arguments[0]!);
          const nomes = (t0.isUnion() ? t0.types : [t0]).filter((t) => t.isStringLiteral()).map((t) => (t as ts.StringLiteralType).value);
          if (!nomes.length) fora.push(`${onde}: evento sem nome literal`);
          const a1 = no.arguments[1];
          const chaves: string[] = [];
          if (a1) {
            const t1 = checker.getTypeAtLocation(a1);
            for (const parte of t1.isUnion() ? t1.types : [t1]) {
              if (parte.flags & ts.TypeFlags.Undefined) continue;
              if (checker.getIndexInfosOfType(parte).length) fora.push(`${onde}: propriedades sem tipo fechado (${a1.getText().slice(0, 60)})`);
              for (const s of checker.getPropertiesOfType(parte)) chaves.push(s.getName());
            }
          }
          for (const e of nomes) for (const k of chaves) if (!permitidas[e]?.includes(k) && !DESCARTADAS[e]?.includes(k)) fora.push(`${onde}: ${e}.${k}`);
        }
        ts.forEachChild(no, visitar);
      };
      visitar(sf);
    }
    expect(chamadas).toBeGreaterThan(100);
    expect(fora).toEqual([]);
    for (const [e, ks] of Object.entries(DESCARTADAS)) for (const k of ks) expect(permitidas[e] ?? [], `${e}.${k}`).not.toContain(k);
  }, 30_000);
});
