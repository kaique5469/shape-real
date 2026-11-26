import { describe, expect, it } from "vitest";
import { estadoChave, FLAG_QUESTIONARIO_KEY, gravarConvite, QUESTIONARIO_PADRAO, questionarioLigado } from "./flags";

function memoria(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
const quebrado = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("bloqueado");
  },
};

describe("chave questionario", () => {
  it("vem ligada para todos por padrão (decisão do dono e do tech lead)", () => {
    expect(QUESTIONARIO_PADRAO).toBe("todos");
    expect(estadoChave(undefined)).toBe("todos");
    expect(estadoChave("")).toBe("todos");
    expect(estadoChave("qualquer")).toBe("todos");
    expect(questionarioLigado("todos", null)).toBe(true);
    expect(questionarioLigado("todos", quebrado)).toBe(true);
  });

  it("desliga rápido pelo build: 'desligada' vale para todos, inclusive /testar e convite", () => {
    expect(estadoChave("desligada")).toBe("desligada");
    expect(questionarioLigado("desligada", memoria({ "sr:tester": "1", [FLAG_QUESTIONARIO_KEY]: "1" }))).toBe(false);
  });

  it("'convite': só no /testar e para quem abriu o convite; leitura bloqueada não quebra", () => {
    expect(estadoChave("convite")).toBe("convite");
    expect(questionarioLigado("convite", memoria())).toBe(false);
    expect(questionarioLigado("convite", memoria({ "sr:tester": "1" }))).toBe(true);
    expect(questionarioLigado("convite", memoria({ [FLAG_QUESTIONARIO_KEY]: "1" }))).toBe(true);
    expect(questionarioLigado("convite", memoria({ [FLAG_QUESTIONARIO_KEY]: "0" }))).toBe(false);
    expect(questionarioLigado("convite", quebrado)).toBe(false);
    expect(questionarioLigado("convite", null)).toBe(false);
  });

  it("o convite ?beta=questionario grava a chave sob sr:v1: (Apagar dados leva junto); outro parâmetro não", () => {
    expect(FLAG_QUESTIONARIO_KEY.startsWith("sr:v1:")).toBe(true);
    const ls = memoria();
    gravarConvite("?modo=criar", ls);
    gravarConvite("?beta=outra", ls);
    expect(ls.m.size).toBe(0);
    gravarConvite("?perfil=personal&beta=questionario", ls);
    expect(ls.m.get(FLAG_QUESTIONARIO_KEY)).toBe("1");
    expect(() => gravarConvite("?beta=questionario", quebrado)).not.toThrow();
    expect(() => gravarConvite("?beta=questionario", null)).not.toThrow();
  });

  it("sem argumentos, fora do navegador, segue o padrão do build", () => {
    expect(questionarioLigado()).toBe(estadoChave() === "todos");
  });
});
