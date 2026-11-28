import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * R3-11, tela: com cuidado azul para revisar, a frase do bloco 1 leva o ícone de informação neutro, nunca o check
 * verde de "tudo certo". O componente depende do contexto do app; a escolha do ícone é conferida no fonte, e a regra
 * (`casoSemAlertas`) tem os testes dela em resumo.test.ts.
 */
const src = readFileSync(fileURLToPath(new URL("./resumo-aluno.tsx", import.meta.url)), "utf8");

describe("ícone da frase sem alertas fortes (R3-11)", () => {
  it("o caso vem de casoSemAlertas, a mesma função que escolhe a frase", () => {
    expect(src).toMatch(/import \{[^}]*\bcasoSemAlertas\b[^}]*\} from "@\/lib\/domain\/resumo"/);
  });

  it("cuidado → Info em steel; senão o check verde", () => {
    const bloco = src.slice(src.indexOf("{resumo.semAlertasTexto ? ("), src.indexOf("{resumo.semAlertasTexto}</span>"));
    expect(bloco).toMatch(/casoSemAlertas\(resumo\.alertas\) === "cuidado" \? \(\s*<Info className="[^"]*text-steel"/);
    expect(bloco).toMatch(/: \(\s*<CircleCheck className="[^"]*text-done"/);
  });
});
