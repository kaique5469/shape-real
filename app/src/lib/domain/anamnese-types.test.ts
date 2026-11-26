import { describe, expect, it } from "vitest";
import * as T from "./anamnese-types";

describe("tipos do questionário (fundação)", () => {
  it("ehExemplo: aluno de exemplo do /testar (sample) ou da demonstração (demo-*)", () => {
    expect(T.ehExemplo({ id: "demo-aluna-1" })).toBe(true);
    expect(T.ehExemplo({ id: "teste-ex-1", sample: true })).toBe(true);
    expect(T.ehExemplo({ id: "s1" })).toBe(false);
    expect(T.ehExemplo({ id: "s1", sample: false })).toBe(false);
    expect(T.ehExemplo({ id: "aluno-demo-1" })).toBe(false);
  });

  it("constantes de versão e textos", () => {
    expect(T.ANAMNESE_V).toBe(1);
    expect(T.RULES_VERSION).toBe(1);
    expect(T.PARQ_TEXT_ID).toBe("sp-16724-2018");
    expect(T.CONSENT_TEXT_ID).toBe("c1");
    expect(T.QUESTIONARIO_DESDE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("listas de códigos sem repetição; partes extras são seções; minutos para cada módulo", () => {
    const listas = Object.entries(T).filter(([k, v]) => /^[A-Z_]+$/.test(k) && Array.isArray(v)) as [string, readonly string[]][];
    expect(listas.length).toBeGreaterThan(30);
    for (const [nome, l] of listas) expect(new Set(l).size, nome).toBe(l.length);
    for (const m of T.MODULOS) expect(T.SECOES).toContain(m);
    expect(Object.keys(T.MODULO_MINUTOS).sort()).toEqual([...T.MODULOS].sort());
    for (const r of T.REGIOES_COM_LADO) expect(T.REGIOES).toContain(r);
  });
});
