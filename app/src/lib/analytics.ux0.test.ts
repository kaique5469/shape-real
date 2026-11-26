import { describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({ default: { capture: () => {}, identify: () => {}, reset: () => {}, register: () => {}, captureException: () => {} } }));

const { cleanProps, DROP_PROPS, EVENT_PROPS, EXTRA_PROPS, track } = await import("./analytics");

/** Nada de nome, contato, carga, texto digitado ou dado de saúde (nem derivado) como nome de propriedade. */
const FORBIDDEN = /nome|name|phone|telefone|email|cref|carga|load|kg|peso|weight|altura|height|texto|text|nota|score|kcal|macro|gordura|medida/i;

describe("medição (UX0)", () => {
  it("diet_analyzed nunca leva a nota da dieta: score é descartado mesmo se uma tela antiga mandar", () => {
    expect(cleanProps("diet_analyzed", { source: "motor", score: 82, where: "self", itens: "1-5" })).toEqual({ source: "motor", where: "self", itens: "1-5" });
    expect(DROP_PROPS.diet_analyzed).toContain("score");
    expect(EXTRA_PROPS.diet_analyzed).toContain("itens");
    expect(EXTRA_PROPS.diet_analyzed as readonly string[]).not.toContain("score");
  });

  it("outros eventos passam intactos", () => {
    const props = { via: "copy", sessions: 2, where: "resumo", resend: false, novos: 2 };
    expect(cleanProps("treinos_link_sent", props)).toEqual(props);
  });

  it("nenhuma propriedade nova tem nome de dado pessoal, carga, texto ou saúde", () => {
    const keys = [...Object.values(EVENT_PROPS), ...Object.values(EXTRA_PROPS)].flat();
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([]);
  });

  it("eventos novos da UX estão na lista de propriedades", () => {
    // A fundação do questionário acrescenta os eventos dela (analytics.anamnese.test.ts); os da UX continuam.
    expect(Object.keys(EVENT_PROPS)).toEqual(expect.arrayContaining(["diet_adjust_started", "evolution_compare_shown", "workout_resumed"]));
    expect(EXTRA_PROPS.treinos_link_sent).toEqual(["where", "resend", "novos"]);
    expect(EXTRA_PROPS.ficha_link_sent.slice(0, 2)).toEqual(["where", "situacao"]);
    expect(EXTRA_PROPS.treinos_link_received).toEqual(["same", "ficha_versao"]);
    expect(EXTRA_PROPS.workout_completed).toEqual(["desmarcadas", "trocas", "grupos_desfeitos"]);
  });

  it("track não quebra fora do navegador", () => {
    expect(() => track("workout_resumed", { origem: "rascunho", mudou_exercicio: false, instalado: true })).not.toThrow();
  });
});

/** Só para o typecheck: os eventos novos têm propriedades fechadas. Nunca roda. */
export function _typecheckStrictEvents() {
  track("diet_adjust_started", { origem: "personal" });
  track("evolution_compare_shown", { kind: "forca", state: "ok", direction: "subiu", chart: true, suspect: false, by_coach: false });
  // @ts-expect-error propriedades obrigatórias
  track("workout_resumed");
  // @ts-expect-error valor fora da categoria
  track("diet_adjust_started", { origem: "nutricionista" });
  // @ts-expect-error chave fora do contrato
  track("workout_resumed", { origem: "conflito", mudou_exercicio: true, instalado: false, nome: "Juliana" });
  // Eventos antigos continuam livres.
  track("section_viewed", { area: "dieta", modo: "leitura", proxima: false, origem: "personal", by_coach: false });
  track("export_downloaded");
}
