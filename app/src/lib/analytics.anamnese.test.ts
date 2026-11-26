import { describe, expect, it, vi } from "vitest";
import type { StrictEventProps } from "./analytics";
import { evAnamneseSent, evFichaLinkExtra, evNextStep, evPartDone, evProgramGeneratedExtra, evStudentCreatedExtra, evWorkStyleSet } from "./anamnese-events";

vi.mock("posthog-js", () => ({ default: { capture: () => {}, identify: () => {}, reset: () => {}, register: () => {}, captureException: () => {} } }));

const { EVENT_PROPS, EXTRA_PROPS, track } = await import("./analytics");

const ANAMNESE_EVENTS = [
  "work_style_set",
  "work_style_suggestion",
  "anamnese_requested",
  "anamnese_opened",
  "anamnese_link_opened",
  "anamnese_part_done",
  "anamnese_sent",
  "anamnese_send_confirmed",
  "anamnese_received",
  "anamnese_deleted",
  "summary_viewed",
  "next_step_clicked",
] as const;

/** Nome de propriedade que sugere resposta, saúde, identidade ou link (spec §11.3). `publico_n` é contagem. */
const FORBIDDEN = /nome|name|phone|telefone|email|cref|peso|weight|altura|height|texto|text|nota|score|idade|sexo|dor|saude|parq|alert|libera|gesta|condic|remed|sintom|lesao|termo|nutri|override|conversei|href|url|link_id|pedido_id|^publico$/i;

describe("medição do questionário (fundação)", () => {
  it("os 12 eventos do questionário e o link_dead_end_shown têm a lista fechada de propriedades da spec §12", () => {
    for (const e of ANAMNESE_EVENTS) expect(EVENT_PROPS[e].length).toBeGreaterThan(0);
    expect(EVENT_PROPS.anamnese_part_done).toEqual(["parte", "indice", "modo"]);
    expect(EVENT_PROPS.next_step_clicked).toEqual(["passo"]);
    expect(EVENT_PROPS.link_dead_end_shown).toEqual(["tela", "motivo", "via_paste"]);
    expect(EXTRA_PROPS.program_generated).toEqual(["from_anamnese", "ajustes_n"]);
    expect(EXTRA_PROPS.ficha_link_sent).toEqual(["where", "situacao", "primeira", "horas_desde_cadastro", "questionario", "aluno_novo"]);
    expect(EXTRA_PROPS.student_created).toEqual(["modo"]);
  });

  it("nenhuma propriedade do questionário tem nome de resposta, saúde, identidade ou link", () => {
    const keys = [...ANAMNESE_EVENTS.flatMap((e) => EVENT_PROPS[e]), ...EXTRA_PROPS.program_generated, ...EXTRA_PROPS.ficha_link_sent, ...EXTRA_PROPS.student_created];
    expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([]);
  });

  it("track dos eventos novos não quebra fora do navegador", () => {
    expect(() => track("next_step_clicked", { passo: "gerar_ficha" })).not.toThrow();
  });
});

// ---- Só typecheck (nunca roda) ---------------------------------------------------------------

type Listed<E extends keyof typeof EVENT_PROPS> = (typeof EVENT_PROPS)[E][number];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Sync = { [E in keyof typeof EVENT_PROPS]: E extends keyof StrictEventProps ? Same<Listed<E>, keyof StrictEventProps[E]> : false };
/** EVENT_PROPS e StrictEventProps têm exatamente as mesmas chaves, evento a evento. */
export const _eventPropsInSync: false extends Sync[keyof Sync] ? never : true = true;
/** Todo evento fechado tem a lista em EVENT_PROPS. */
export const _noStrictWithoutList: [Exclude<keyof StrictEventProps, keyof typeof EVENT_PROPS>] extends [never] ? true : never = true;

/** As funções de src/lib/anamnese-events.ts encaixam direto em `track`. */
export function _typecheckAnamneseEvents() {
  track("work_style_set", evWorkStyleSet(undefined, "onboarding", true));
  track("anamnese_sent", evAnamneseSent({ modo: "link", inicio: "", fim: "", modulosPedidos: [], pulados: [], extras: 0, reenvio: false, incompleto: false }));
  const parte = evPartDone("voce", ["voce"], "link");
  if (parte) track("anamnese_part_done", parte);
  const passo = evNextStep("gerar_ficha");
  if (passo) track("next_step_clicked", passo);
  track("program_generated", { where: "coach", source: "local", ...evProgramGeneratedExtra(true, 0) });
  track("ficha_link_sent", { via: "copy", ...evFichaLinkExtra({ primeira: true, agora: "", questionario: "nenhum" }) });
  track("student_created", { has_phone: true, ...evStudentCreatedExtra("receber") });
  track("link_dead_end_shown", { tela: "questionario", motivo: "versao_nova", via_paste: false });
  // @ts-expect-error dorMais nunca é parte de evento (só existe com dor ou lesão)
  track("anamnese_part_done", { parte: "dorMais", indice: 0, modo: "link" });
  // @ts-expect-error passo clínico não dispara
  track("next_step_clicked", { passo: "liberacao" });
  // @ts-expect-error passo de alimentação não dispara (inferência negativa)
  track("next_step_clicked", { passo: "dieta" });
  // @ts-expect-error chave fora do contrato
  track("anamnese_received", { achou: "ref", diferencas_n: 0, reenvio: false, dias_desde_pedido: null, reavaliacao: "nao", alertas_n: 1 });
  // @ts-expect-error motivo fora do formato fixo
  track("link_dead_end_shown", { tela: "abrir", motivo: "outro", via_paste: false });
}
