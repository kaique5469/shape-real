import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Privacidade from "@/app/(site)/privacidade/page";
import { CopiaFalhou, TEXTO_COPIA_FALHOU } from "@/components/copy-button";
import { reportCalendarLabels } from "@/lib/domain/report";
import { mergeLimitations } from "@/lib/domain/anamnese-ficha";
import { tirarTrechosDoApp } from "@/lib/domain/restauracao";
import { mesclarChaveDeEnvio } from "@/lib/domain/delivery";
import { comContatos, criadoresEContatos, parseContatos } from "@/lib/domain/perfis-de-entrada";

/**
 * Correção da revisão da rodada 3: os achados de tela, privacidade e leitor de tela que não têm teste de domínio próprio.
 * As telas que dependem do navegador são lidas no fonte (como em costura.r3.test.ts); a política e a falha de cópia são
 * renderizadas de verdade. Dados fictícios.
 */

const SRC = path.resolve(__dirname, "..");
const fonte = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("R3-9: a política não diz que a medição de uso fica no aparelho", () => {
  const html = renderToStaticMarkup(createElement(Privacidade));
  const bloco = html.match(/<section[^>]*data-bloco="aparelho"[^>]*>([\s\S]*?)<\/section>/)![1]!;
  const lista = texto(bloco.match(/<ul>([\s\S]*?)<\/ul>/)![1]!);

  it("a lista do que fica no navegador não tem 'Uso do app'; a exceção vem logo depois, apontando o PostHog", () => {
    expect(lista).not.toMatch(/Uso do app|telas e recursos/);
    expect(texto(bloco)).toContain("A medição de uso é a exceção: quais telas e recursos são usados e os erros técnicos que acontecem vão para o PostHog (veja Medição de uso e erros)");
    expect(texto(bloco)).toContain("Esses registros não levam dados de saúde, nomes de alunos, telefones nem o texto que você digita.");
  });

  it("sem cadastro no beta: o perfil fala em 'o que você preencher no seu perfil'", () => {
    expect(texto(bloco)).toContain("No beta não há conta nem cadastro.");
    expect(lista).toContain("o que você preencher no seu perfil");
    expect(lista).not.toMatch(/cadastro/);
  });
});

describe("R3-3: a cópia que falha mostra a mensagem inteira, link incluído", () => {
  const msg = "Oi, Marina! Sua ficha nova está pronta.\n\nAbra no celular: https://app.test/abrir#d=1.ABCDEF";

  it("na falha: a frase manda segurar o texto ABAIXO e o campo só de leitura tem a mensagem inteira, fora da medição", () => {
    const h = renderToStaticMarkup(createElement(CopiaFalhou, { failed: true, text: msg }));
    expect(TEXTO_COPIA_FALHOU).toBe("Não deu para copiar. Use Enviar no WhatsApp ou segure o texto abaixo para copiar.");
    expect(texto(h)).toContain(TEXTO_COPIA_FALHOU);
    const campo = h.match(/<textarea([^>]*)>([\s\S]*?)<\/textarea>/)!;
    expect(campo[1]).toMatch(/readOnly|readonly/);
    expect(campo[1]).toContain('aria-label="Mensagem completa para copiar"');
    expect(campo[1]).toContain("ph-no-capture");
    expect(campo[2]!.replace(/&amp;/g, "&").replace(/&#x27;/g, "'")).toBe(msg);
  });

  it("teste negativo: sem falha, nenhum campo e a região viva vazia (sr-only)", () => {
    const h = renderToStaticMarkup(createElement(CopiaFalhou, { failed: false, text: msg }));
    expect(h).not.toContain("<textarea");
    expect(h).toMatch(/role="status"[^>]*class="[^"]*sr-only/);
    expect(texto(h)).toBe("");
  });

  it("o SendDietPanel usa o CopyButton (sem cópia duplicada) e o CopyButton usa CopiaFalhou", () => {
    const dieta = fonte("components/views/diet-view.tsx");
    const painel = dieta.slice(dieta.indexOf("function SendDietPanel("), dieta.indexOf("function DietBodyForm("));
    expect(painel).toContain('<CopyButton text={estado?.texto ?? ""} disabled={off} onCopied={() => sent("copy")} />');
    expect(painel).not.toMatch(/navigator\.clipboard/);
    expect(fonte("components/copy-button.tsx")).toContain("<CopiaFalhou failed={failed} text={text} />");
  });
});

describe("R3-15: o calendário do relatório do personal no modo local fala em treinos recebidos", () => {
  it("base 'recebidos': sem 'Presença' e sem 'sem treino'; base 'registrados': como antes", () => {
    const rec = reportCalendarLabels({ base: "recebidos" });
    expect(rec).toEqual({ titulo: "Treinos recebidos por dia", tabela: "Dias com treino recebido no período", comTreino: "treino recebido", semTreino: "nada recebido" });
    expect(Object.values(rec).join(" ")).not.toMatch(/Presença|sem treino|treinou/);
    expect(reportCalendarLabels({ base: "registrados" })).toEqual({ titulo: "Presença", tabela: "Dias treinados no período", comTreino: "treinou", semTreino: "sem treino" });
  });

  it("a folha usa os rótulos (nenhum 'Presença' nem 'sem treino' literal)", () => {
    const f = fonte("components/views/report-view.tsx");
    expect(f).toContain("const cal = reportCalendarLabels(r);");
    expect(f).toContain("{cal.titulo}");
    expect(f).toContain("aria-label={cal.tabela}");
    expect(f).not.toMatch(/>Presença<|"sem treino"|"Dias treinados no período"/);
  });
});

describe("R3-1: o texto de autorização das telas de escolha nomeia a ação", () => {
  it("com `tela` (escolha), 'Ao atualizar ou criar o perfil'; nunca 'Ao salvar' ali", () => {
    const f = fonte("app/abrir/page.tsx");
    expect(f).toContain("? `Ao atualizar ou criar o perfil, você autoriza guardar neste celular os dados de treino e saúde deste link, enviados por ${packet.coach.name}.`");
    expect(f).not.toContain("Ao salvar, você autoriza guardar neste celular os dados de treino e saúde deste link");
  });
});

describe("R3-6: o erro de 'Restaurar cópia' em /entrar fica na primeira tela", () => {
  it("em /entrar o Alert vem logo depois do 'Restaurar cópia', antes do texto de apoio, e rola até ele", () => {
    const f = fonte("components/backup-restore.tsx");
    const label = f.indexOf('<span className="font-semibold text-plate-blue-ink underline underline-offset-2">Restaurar cópia</span>');
    const erro = f.indexOf("{erro}", label);
    const apoio = f.indexOf("Salve o arquivo no celular", label);
    expect(label).toBeGreaterThan(0);
    expect(erro).toBeGreaterThan(label);
    expect(erro).toBeLessThan(apoio);
    expect(f).toContain('erroRef.current?.scrollIntoView?.({ block: "nearest" })');
  });
});

describe("R3-7 (privacidade da medição): 'Senti dor' fora da captura automática de cliques", () => {
  it("o botão do treino e o grupo do resumo têm ph-no-capture", () => {
    const f = fonte("app/(painel)/sessao/page.tsx");
    expect(f).toMatch(/className=\{cx\("ph-no-capture -mx-1 flex min-h-11[^"]*"[\s\S]{0,200}\)\}\s*>\s*<span[\s\S]{0,400}Senti dor\s*<\/button>/);
    expect(f).toMatch(/<details className="ph-no-capture group mt-4" open=\{painOpen\}>\s*<summary[^>]*>\s*Senti dor em algum exercício/);
  });

  it("PostHog: web vitals, mapa de calor e clique morto desligados no init", () => {
    const f = fonte("lib/posthog-init.ts");
    expect(f).toContain("capture_performance: false,");
    expect(f).toContain("capture_heatmaps: false,");
    expect(f).toContain("capture_dead_clicks: false,");
  });
});

describe("R3-20: foco e marcos para o leitor de tela", () => {
  const sessao = fonte("app/(painel)/sessao/page.tsx");

  it("'Pular' e 'OK' do descanso levam o foco à próxima série (nunca ao <body>); o fim do descanso foca o 'OK'", () => {
    expect(sessao).toMatch(/setRest\(null\);\s*focarProximaSerie\(\);\s*track\("session_feature_used", \{ feature: "descanso_pular" \}\);/);
    expect(sessao).toMatch(/setRest\(null\);\s*focarProximaSerie\(\);\s*track\("session_feature_used", \{ feature: "descanso_ok" \}\);/);
    expect(sessao).toContain(`document.querySelector<HTMLElement>('main [role="checkbox"][aria-checked="false"][aria-label^="Série"]') ?? finishBtn.current`);
    expect(sessao).toMatch(/if \(!a \|\| a === document\.body \|\| footRef\.current\?\.contains\(a\)\) restOkRef\.current\?\.focus\(\);/);
    expect(sessao).toMatch(/<Button\s+ref=\{restOkRef\}/);
  });

  it("o resumo do treino e o /entrar têm <main>", () => {
    const resumo = sessao.slice(sessao.indexOf("function Summary("));
    expect(resumo).toContain('<main className="mx-auto max-w-xl px-5 pt-6">');
    expect(resumo).toContain("</main>");
    const entrar = fonte("app/entrar/page.tsx");
    expect(entrar).toContain('<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">');
    expect(entrar.match(/<main\b/g)).toHaveLength(1);
  });

  it("'Sua semana' do Hoje: o estado do dia em texto (sr-only), sem aria-label num <span> sem papel", () => {
    const hoje = fonte("app/(painel)/hoje/page.tsx");
    expect(hoje).toContain('<span className="sr-only">{done ? "treinou" : "sem treino"}</span>');
    expect(hoje).not.toMatch(/aria-label=\{done \? `\$\{w\}: treinou`/);
  });
});

describe("R3-4: o resumo diz por que os minutos ficaram menores que o cabeçalho", () => {
  it("finish() calcula a pausa do fim e o Summary mostra textoPausa", () => {
    const f = fonte("app/(painel)/sessao/page.tsx");
    expect(f).toContain("setPausaNoFim(tempo.current ? registrarAtividade(tempo.current, agora.getTime()).pausaMs : 0);");
    expect(f).toContain("pausaMs={pausaNoFim}");
    expect(f).toMatch(/\{textoPausa\(pausaMs\) \? <p className="mt-2 text-sm text-chalk\/80">\{textoPausa\(pausaMs\)\}<\/p> : null\}/);
  });
});

describe("R3-13: tirar das limitações só os trechos do app (a mesma conta de mergeLimitations)", () => {
  const casos: [string, string[]][] = [
    ["joelho esquerdo; osteoporose", ["joelho esquerdo", "osteoporose"]],
    ["evitar agachamento livre; joelho esquerdo; osteoporose", ["joelho esquerdo", "osteoporose"]],
    ["Joelho Esquerdo.; ombro; joelho esquerdo", ["joelho esquerdo"]],
    ["ombro", ["joelho esquerdo"]],
    ["", ["joelho"]],
  ];
  for (const [t, tokens] of casos) {
    it(`"${t}" − ${JSON.stringify(tokens)}`, () => {
      expect(tirarTrechosDoApp(t, tokens)).toBe(mergeLimitations(t, tokens, []).texto);
    });
  }
});

describe("mesclarChaveDeEnvio: casos de borda", () => {
  it("lado ilegível vira o outro; teto da lista antiga em 500", () => {
    expect(mesclarChaveDeEnvio("sr:sent:a:log", "{x", '{"t1":{"via":"copy","at":"2026-11-01T10:00:00.000Z"}}')).toBe('{"t1":{"via":"copy","at":"2026-11-01T10:00:00.000Z"}}');
    expect(mesclarChaveDeEnvio("sr:sent:a:ficha", '{"at":"2026-11-10T10:00:00.000Z","via":"copy","programAt":null,"dietAt":null}', "lixo")).toMatch(/2026-11-10/);
    expect(mesclarChaveDeEnvio("sr:sent:a:at", "2026-11-10T10:00:00.000Z", "2026-11-01T10:00:00.000Z")).toBe("2026-11-10T10:00:00.000Z");
    const muitos = JSON.stringify(Array.from({ length: 400 }, (_, i) => `c${i}`));
    const aqui = JSON.stringify(Array.from({ length: 300 }, (_, i) => `a${i}`));
    const lista = JSON.parse(mesclarChaveDeEnvio("sr:sent:a", aqui, muitos)) as string[];
    expect(lista).toHaveLength(500);
    // Os do aparelho ficam todos (são os mais recentes).
    expect(lista.slice(-300)).toEqual(JSON.parse(aqui));
  });
});

describe("contatos de personal gravados (sr:v1:contatos)", () => {
  it("lista legível, sem repetir, com teto; ilegível = vazia; somada a criadoresDeConteudo", () => {
    expect(parseContatos('["c1","c1",3,"c2"]')).toEqual(["c1", "c2"]);
    expect(parseContatos("{")).toEqual([]);
    expect(parseContatos(null)).toEqual([]);
    expect(comContatos(["c1", "c2"], ["c1"])).toEqual(["c2", "c1"]);
    expect(comContatos(Array.from({ length: 100 }, (_, i) => `x${i}`), ["novo"]).at(-1)).toBe("novo");
    const perfis = [{ id: "a", role: "athlete" as const }];
    expect([...criadoresEContatos(perfis, [{ ownerId: "a", createdBy: "c9" }], '["c1"]')].sort()).toEqual(["c1", "c9"]);
  });
});
