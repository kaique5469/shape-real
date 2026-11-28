import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Privacidade from "@/app/(site)/privacidade/page";
import Termos from "@/app/(site)/termos/page";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { rotuloAnual } from "@/components/landing/pricing";
import { PLANS, brl } from "@/lib/domain/plans";

/**
 * Rodada 3, R3-9 (textos legais e landing) e R3-18 (a landing não promete que o aluno devolve o treino sozinho).
 * As páginas são renderizadas de verdade (o texto que a pessoa lê); a landing, que tem demo interativa, é lida no fonte.
 */

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const ler = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
/** Texto visível: sem tags, entidades comuns resolvidas, espaços normalizados. */
const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const privHtml = html(createElement(Privacidade));
const privTexto = texto(privHtml);
const termosTexto = texto(html(createElement(Termos)));

/** Conteúdo de um bloco da política (`<section data-bloco="…">`), e o resto da página sem ele. */
function bloco(nome: string): { dentro: string; fora: string } {
  const re = new RegExp(`<section[^>]*data-bloco="${nome}"[^>]*>([\\s\\S]*?)</section>`);
  const m = privHtml.match(re);
  if (!m) throw new Error(`bloco ${nome} não encontrado`);
  return { dentro: texto(m[1]!), fora: texto(privHtml.replace(m[0], " ")) };
}

/** Frases que falam de link (para o aceite "nunca chamar o link de seguro, protegido ou criptografado"). */
const frasesComLink = (t: string) => t.split(/(?<=[.!?:])\s+/).filter((f) => /\blinks?\b/i.test(f));
const ADJETIVO_PROIBIDO = /\b(segur[oa]s?|protegid[oa]s?|criptografad[oa]s?|cifrad[oa]s?|blindad[oa]s?)\b/i;

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) out.push(...arquivos(full));
    else if (/\.(tsx?|md)$/.test(nome) && !nome.includes(".test.")) out.push(full);
  }
  return out;
}

describe("Política de privacidade em três blocos (R3-9 item 1)", () => {
  it("os três blocos, nesta ordem: aparelho, WhatsApp, nuvem (marcada como não disponível)", () => {
    const a = privTexto.indexOf("Beta neste aparelho");
    const w = privTexto.indexOf("O que você manda pelo WhatsApp");
    const n = privTexto.indexOf("Conta na nuvem (quando existir; hoje não disponível)");
    expect(a).toBeGreaterThan(-1);
    expect(w).toBeGreaterThan(a);
    expect(n).toBeGreaterThan(w);
  });

  it("'código de convite', 'links temporários', '30 dias' e a conta com e-mail só aparecem no bloco da nuvem", () => {
    const { dentro, fora } = bloco("nuvem");
    for (const frase of ["código de convite", "links temporários", "30 dias", "e-mail e papel", "enquanto a conta existir"]) {
      expect(dentro, frase).toContain(frase);
      expect(fora, frase).not.toContain(frase);
    }
  });

  it("bloco do aparelho: sem conta, apagar em Conta, limpeza do navegador, sem prazo fixo, fotos fora da cópia", () => {
    const { dentro } = bloco("aparelho");
    expect(dentro).toContain("No beta não há conta nem cadastro");
    expect(dentro).toContain("Conta → Apagar dados deste aparelho");
    expect(dentro).toContain("o navegador limpar os dados do site");
    expect(dentro).toContain("Não existe um prazo fixo");
    expect(dentro).toMatch(/fotos de evolução ficam só no aparelho: não entram na cópia/i);
  });

  it("bloco do WhatsApp: cópia de quem recebe, desfazer vínculo não apaga a cópia, pedir a quem recebeu", () => {
    const { dentro } = bloco("whatsapp");
    expect(dentro).toContain("Quem recebe guarda uma cópia no celular dele e nas cópias de segurança que fizer");
    expect(dentro).toContain("Desfazer o vínculo ou apagar os seus dados não apaga a cópia de quem recebeu");
    expect(dentro).toContain("Para o que você já enviou, peça a quem recebeu");
  });

  it("o aviso de link aparece UMA vez, dentro do bloco que explica os links, valendo para todos os links", () => {
    const aviso = "Quem tiver o link consegue ler o conteúdo (vai compactado, sem senha). Não encaminhe a mensagem. Limpar a barra de endereço não apaga a cópia que ficou no WhatsApp.";
    expect(privTexto.split("Quem tiver o link consegue ler").length - 1).toBe(1);
    expect(bloco("whatsapp").dentro).toContain(aviso);
  });

  it("as frases antigas de nuvem como regra geral sumiram ou foram reescritas (:15, :42-43, :55-56, :73)", () => {
    expect(privTexto).not.toContain("apagando os dados ou a conta");
    expect(privTexto).not.toContain("Somente você e o personal que você aceitou por código de convite");
    expect(privTexto).not.toContain("Mantemos os dados enquanto a conta existir");
    expect(bloco("nuvem").fora).not.toMatch(/Conta: nome, e-mail/);
  });

  it("cópias de segurança feitas antes (R3-9 item 4): texto único na política", () => {
    expect(privTexto).toContain(
      "Apagar ou revogar respostas neste aparelho não apaga cópias de segurança feitas antes. Se uma cópia antiga for restaurada em outro aparelho, as respostas voltam. Apague as cópias antigas se não precisar delas.",
    );
  });

  it("LGPD sem 'em conformidade' (item 2); a nota jurídica fica, em frase separada", () => {
    expect(privTexto).toContain("Esta política explica quais dados o Shape Real trata, para quê e quais são seus direitos pela LGPD (Lei 13.709/2018).");
    expect(privTexto).toContain("Revise este texto com seu assessor jurídico antes da publicação comercial.");
    expect(privTexto).not.toMatch(/conformidade/i);
  });

  it("a frase do IP (item 3) fica como está; controlador e contato não foram inventados", () => {
    expect(privTexto).toContain("na página do questionário contamos só quantas pessoas abrem e terminam, sem nenhuma resposta e sem guardar o endereço IP");
    expect(privTexto).toContain("escreva para o contato do controlador");
    expect(privTexto).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|CNPJ|\(\d{2}\)\s?\d{4,5}-\d{4}/i);
  });

  it("data de atualização nova", () => {
    expect(privTexto).toContain("Atualizado em 27/11/2026");
  });
});

describe("Termos (R3-9 item 6)", () => {
  it("'No beta não há cobrança.' junto dos planos pagos, e a data nova", () => {
    expect(termosTexto).toContain("No beta não há cobrança.");
    expect(termosTexto.indexOf("No beta não há cobrança.")).toBeLessThan(termosTexto.indexOf("cobrados de forma recorrente"));
    expect(termosTexto).toContain("Atualizado em 27/11/2026");
    expect(termosTexto).not.toContain("15/11/2026");
  });

  it("descreve o modo local e a cópia de segurança; nota jurídica mantida", () => {
    expect(termosTexto).toContain("No beta, os dados ficam no aparelho de quem usa, sem conta na nuvem.");
    expect(termosTexto).toContain("Revise este texto com seu assessor jurídico");
  });
});

describe("Nenhum texto chama o link de seguro, protegido ou criptografado", () => {
  it("política, termos e landing", () => {
    const landing = ler("app/(site)/page.tsx");
    for (const [nome, t] of [
      ["privacidade", privTexto],
      ["termos", termosTexto],
      ["landing", landing],
    ] as const) {
      for (const f of frasesComLink(t)) expect(f, `${nome}: ${f}`).not.toMatch(ADJETIVO_PROIBIDO);
    }
  });

  it("'conformidade' não aparece em src/app/(site)", () => {
    for (const f of arquivos(join(SRC, "app/(site)"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/conformidade/i);
  });
});

describe("Menu e rodapé do site (R3-9 itens 8 e 9)", () => {
  const header = html(createElement(SiteHeader));
  const footer = html(createElement(SiteFooter));

  it("âncoras do menu levam a /#como-funciona, /#personal e /#planos (nunca '#planos' relativo, que viraria /privacidade#planos)", () => {
    for (const id of ["como-funciona", "personal", "planos"]) {
      expect(header).toContain(`href="/#${id}"`);
      expect(header).not.toContain(`href="#${id}"`);
    }
  });

  it("os ids existem na landing (section#planos, #personal, #como-funciona)", () => {
    const landing = ler("app/(site)/page.tsx");
    for (const id of ["como-funciona", "personal", "planos"]) expect(landing).toContain(`id="${id}"`);
  });

  it("link do blog fora: nenhum 'Blog' nem href para shapereal.com.br no menu, no rodapé ou no fonte", () => {
    for (const h of [header, footer]) {
      expect(h).not.toMatch(/>\s*Blog\s*</);
      expect(h).not.toContain("https://shapereal.com.br");
    }
    const fonte = ler("components/landing/site-chrome.tsx");
    expect(fonte).not.toMatch(/https?:\/\/shapereal\.com\.br/);
    expect(fonte).not.toMatch(/\bBLOG\b/);
  });

  it("rodapé continua com Privacidade, Termos e Entrar", () => {
    for (const href of ["/privacidade", "/termos", "/entrar"]) expect(footer).toContain(`href="${href}"`);
  });
});

describe("Landing: FAQ e promessa do personal (R3-9 item 7, R3-18)", () => {
  const landing = ler("app/(site)/page.tsx");

  it("FAQ: apagar tudo DESTE aparelho, e o que foi pelo WhatsApp fica com quem recebeu", () => {
    expect(landing).toContain("apagar tudo deste aparelho quando quiser (o que você já mandou pelo WhatsApp fica com quem recebeu)");
    expect(landing).not.toMatch(/apagar tudo quando quiser/);
  });

  it("o aluno devolve o resultado pelo WhatsApp; o painel mostra os treinos devolvidos e quem está sem notícias", () => {
    expect(landing).toContain("Depois do treino, o aluno devolve o resultado pelo WhatsApp e você vê quem treinou, quanto levantou e quem está sem dar notícias.");
    expect(landing).toContain("Painel com os treinos devolvidos e alerta de quem está sem notícias");
    expect(landing).not.toContain("Painel de aderência com alerta de aluno parado");
  });

  it("'sumiu' não aparece em src/app/(site) nem em src/components/landing", () => {
    for (const f of [...arquivos(join(SRC, "app/(site)")), ...arquivos(join(SRC, "components/landing"))]) expect(readFileSync(f, "utf8"), f).not.toMatch(/\bsumiu\b/i);
  });

  it("teste negativo: a FAQ do personal continua dizendo que o aluno manda o resultado de volta", () => {
    expect(landing).toContain("No fim de cada treino, ele manda o resultado de volta e você registra no seu painel com um toque");
  });
});

describe("rotuloAnual (pricing, R3-9 item 10)", () => {
  it("Pro (R$ 19,90 × 12 = R$ 238,80 contra R$ 149): 'economia de R$ 89,80', nunca '2 meses grátis'", () => {
    expect(rotuloAnual(PLANS.pro)).toBe(`economia de ${brl(89.8)}`);
    expect(rotuloAnual(PLANS.pro)).not.toMatch(/meses grátis/);
  });

  it("Personal (R$ 59,90 × 10 = R$ 599): '2 meses grátis'", () => {
    expect(rotuloAnual(PLANS.coach)).toBe("2 meses grátis");
  });

  it("grátis, sem anual ou sem economia: sem rótulo; 1 mês exato no singular", () => {
    expect(rotuloAnual(PLANS.free)).toBeNull();
    expect(rotuloAnual({ priceMonthly: 10, priceYearly: undefined })).toBeNull();
    expect(rotuloAnual({ priceMonthly: 10, priceYearly: 120 })).toBeNull();
    expect(rotuloAnual({ priceMonthly: 10, priceYearly: 130 })).toBeNull();
    expect(rotuloAnual({ priceMonthly: 10, priceYearly: 110 })).toBe("1 mês grátis");
  });

  it("o seletor não promete '2 meses grátis' para todos os planos", () => {
    expect(ler("components/landing/pricing.tsx")).not.toContain("Anual (2 meses grátis)");
  });
});
