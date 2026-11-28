import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DietDemo, rotuloParcial } from "@/components/landing/diet-demo";
import { ItemLido } from "@/components/views/diet-view";
import { itensAConferir, parseDietText } from "@/lib/domain/nutrition";
import type { DietItem } from "@/lib/domain/types";

/**
 * Rodada 3, telas da trilha N: R3-12 (placeholder das orientações) e R3-5 (revisão dos itens lidos na Dieta e rótulo
 * "parcial" na demo da landing). O item lido é renderizado de verdade; a ordem dentro do analisador (que depende de
 * estado e do contexto do app) é conferida no fonte.
 */

const fonte = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const dietView = fonte("./diet-view.tsx");
/** Texto visível: sem tags, entidades comuns resolvidas, espaços normalizados. */
const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Primeiro item lido de um texto, com a leitura dele. */
function lido(t: string) {
  const l = parseDietText(t);
  const item = l.meals.flatMap((m) => m.items)[0]!;
  return { item, leitura: l.leitura[item.uid] };
}

function render(item: DietItem, leitura?: ReturnType<typeof lido>["leitura"]) {
  return renderToStaticMarkup(createElement(ItemLido, { item, leitura, inputId: "q1", onGrams: () => {}, onRemove: () => {}, onConferido: () => {} }));
}

describe("R3-12: orientações do cardápio", () => {
  it("o placeholder não manda trocar na mesma quantidade", () => {
    expect(dietView).toContain('const NOTAS_PLACEHOLDER = "Ex.: horários, preferências, o que evitar";');
    expect(dietView).toContain("placeholder={NOTAS_PLACEHOLDER}");
    expect(dietView).not.toMatch(/mesma quantidade|mantendo a quantidade/);
  });
});

describe("R3-5: item lido na revisão", () => {
  it("quantidade ambígua: Confira com as duas leituras como botões", () => {
    const { item, leitura } = lido("2 scoops de whey 40g");
    const h = render(item, leitura);
    const t = texto(h);
    expect(t).toContain("Confira: 40 g no total ou cada um?");
    expect(t).toContain("40 g no total");
    expect(t).toContain("40 g cada (2 × 40 g = 80 g)");
    expect(h).toContain(`aria-label="Quantidade de ${item.name}, em gramas"`);
    expect(h).toContain(`aria-label="Remover ${item.name}"`);
    expect(h).toContain(`aria-label="Conferir ${item.name}"`);
    expect(h).toContain('value="40"');
    // Com opções, a escolha é a confirmação: não há "Está certo".
    expect(t).not.toContain("Está certo");
  });

  it("conferência sem opções oferece Está certo (cru lido como cozido)", () => {
    const { item, leitura } = lido("100 g de feijão preto cru");
    const t = texto(render(item, leitura));
    expect(t).toMatch(/Confira: Você escreveu “cru”/);
    expect(t).toContain("Está certo");
  });

  it("ml com 1 ml ≈ 1 g: campo em ml e conversão à vista", () => {
    const { item, leitura } = lido("200 ml de leite");
    const h = render(item, leitura);
    expect(h).toContain(`aria-label="Quantidade de ${item.name}, em ml"`);
    expect(texto(h)).toContain("200 ml ≈ 200 g (leite integral: 1 ml ≈ 1 g)");
    expect(texto(h)).not.toContain("Confira");
  });

  it("aproximação aparece: frango frito", () => {
    const { item, leitura } = lido("frango frito");
    expect(texto(render(item, leitura))).toContain("Você escreveu “frango frito”. É o mais próximo na base.");
  });

  it("1 pacote de bolacha 100g entra com 100 g e sem conferir", () => {
    const { item, leitura } = lido("1 pacote de bolacha 100g");
    const h = render(item, leitura);
    expect(item.grams).toBe(100);
    expect(h).toContain('value="100"');
    expect(texto(h)).not.toContain("Confira");
  });

  it("item da IA (sem leitura): nome, quantidade e remover, sem avisos inventados", () => {
    const item: DietItem = { uid: "ia1", name: "Arroz com feijão", grams: 200, kcal: 260, proteinG: 7.5, carbsG: 50, fatG: 1.2 };
    const t = texto(render(item));
    expect(t).toContain("Arroz com feijão");
    expect(t).toContain("260 kcal · 7,5 g de proteína");
    expect(t).not.toMatch(/Confira|Você escreveu|≈/);
  });
});

describe("R3-5: ordem no analisador da Dieta", () => {
  const analisador = dietView.slice(dietView.indexOf("function Analyzer("));

  it("Não reconheci logo abaixo do resumo, itens lidos antes das dicas", () => {
    const resumo = analisador.indexOf("{res.summary}");
    const naoLi = analisador.indexOf("Não reconheci este trecho");
    const itens = analisador.indexOf("O que eu li");
    const dicas = analisador.indexOf("res.highlights.map");
    expect(resumo).toBeGreaterThan(0);
    expect(naoLi).toBeGreaterThan(resumo);
    expect(itens).toBeGreaterThan(naoLi);
    expect(dicas).toBeGreaterThan(itens);
    // O detalhe só leitura, depois das dicas, saiu.
    expect(analisador).not.toContain("O que foi reconhecido");
  });

  it("totais só com alimento lido, e com (parcial) quando o total é parcial", () => {
    expect(analisador).toMatch(/\{res\.meals\.length \? \(\s*<>\s*<p className="num text-sm text-steel">/);
    expect(analisador).toContain('kcal{res.parcial ? " (parcial)" : ""}');
  });

  it("cada correção refaz a conta e é anunciada numa região viva", () => {
    expect(analisador).toContain("revisarAnalise(l, targets, owner.weightKg, res.source === \"ia\")");
    expect(analisador).toMatch(/<p role="status" className="sr-only">\s*\{aviso \?\? ""\}/);
  });
});

describe("R3-5: rótulo parcial na demo da landing", () => {
  const rotulo = (t: string) => {
    const l = parseDietText(t);
    return rotuloParcial(l.unknown.length, itensAConferir(l).length);
  };

  it("tudo lido: sem rótulo (o exemplo da landing e a bolacha de 100 g)", () => {
    expect(rotulo("1 pacote de bolacha 100g")).toBe("");
    expect(rotulo("2 pacotes de 100 g cada de bolacha")).toBe("");
    const h = renderToStaticMarkup(createElement(DietDemo));
    expect(texto(h)).not.toContain("parcial");
    // A região existe desde o início (para o leitor de tela ouvir quando o rótulo aparece).
    expect(h).toMatch(/<p role="status" class="sr-only"><\/p>/);
  });

  it("não reconhecido ou item a conferir: total parcial com o motivo", () => {
    expect(rotulo("200 g de jabuticabaçu\n2 ovos")).toBe("Total parcial: 1 item não reconhecido.");
    expect(rotulo("2 scoops de whey 40g")).toBe("Total parcial: 1 item para conferir.");
    expect(rotulo("2 scoops de whey 40g\njabuticabaçu")).toBe("Total parcial: 1 item não reconhecido e 1 item para conferir.");
    expect(rotulo("jabuticabaçu\nCeia: pitombaçu")).toBe("Total parcial: 2 itens não reconhecidos.");
  });
});
