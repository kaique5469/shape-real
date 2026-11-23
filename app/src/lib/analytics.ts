"use client";

import posthog from "posthog-js";

import type { FichaSendSituation, FichaVersao, PrepVia } from "@/lib/domain/delivery";

/**
 * Eventos de produto e erros (PostHog, iniciado em src/instrumentation-client.ts).
 * Sem NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN nada é enviado: em desenvolvimento os eventos aparecem no console.
 * Regras: nunca envie dados de saúde (peso, medidas, dieta) nem derivados deles (ex.: a nota da dieta), nomes,
 * telefones, cargas ou texto digitado pelo usuário nas propriedades — só contagens, booleanos, opções escolhidas
 * e nomes de recursos. A união abaixo é fechada: evento novo entra aqui, com as propriedades em EVENT_PROPS.
 */
export type EventName =
  | "landing_cta_clicked"
  | "signup_started"
  | "signup_completed"
  | "demo_started"
  | "onboarding_completed"
  | "program_generated"
  | "program_saved"
  | "workout_started"
  | "workout_completed"
  | "pr_achieved"
  | "metric_logged"
  | "photo_added"
  | "diet_analyzed"
  | "diet_generated"
  | "student_invited"
  | "invite_accepted"
  | "program_assigned"
  | "export_downloaded"
  | "upgrade_clicked"
  | "paywall_viewed"
  | "tester_started"
  | "tester_solo_started"
  | "view_as_student"
  | "student_created"
  | "student_removed"
  | "assessment_logged"
  | "program_shared"
  | "program_copied"
  | "diet_shared"
  | "custom_exercise_created"
  | "custom_food_created"
  | "feedback_sent"
  | "program_edited"
  | "diet_saved"
  | "diet_targets_edited"
  | "session_feature_used"
  | "section_viewed"
  | "student_edited"
  | "student_contacted"
  | "workspace_reset"
  | "error_screen_shown"
  | "report_viewed"
  | "report_shared"
  | "app_install_prompted"
  | "app_installed"
  | "ficha_link_sent"
  | "ficha_link_opened"
  | "treinos_link_sent"
  | "treinos_link_received"
  | "backup_restored"
  | "backup_shared"
  | "link_dead_end_shown"
  | "coach_list_viewed"
  | "coach_cref_set"
  | "student_coach_whatsapp_clicked"
  // UX 23/11 (propriedades fechadas em StrictEventProps)
  | "diet_adjust_started"
  | "evolution_compare_shown"
  | "workout_resumed";

const enabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY);

/** Propriedades de um evento: só contagens, booleanos e categorias. */
export type TrackProps = Record<string, string | number | boolean | null | undefined>;
type Props = TrackProps;

// ---- Contratos de propriedades (UX 23/11) --------------------------------------------------
// Categorias usadas pelas telas. Nenhuma carrega nome, telefone, carga, texto digitado ou dado de saúde.

/** `treinos_link_sent.where`: de onde o aluno tocou em enviar os treinos. */
export type TreinosLinkWhere = "resumo" | "hoje" | "historico" | "historico_item";
/** `ficha_link_sent.where`: de onde o personal enviou a ficha/dieta (`editor_salvo` = barra depois de salvar). */
export type FichaLinkWhere = "pagina_aluno" | "editor" | "dieta" | "editor_salvo";
export type { FichaSendSituation, FichaVersao, PrepVia };
/** `diet_analyzed.itens`: faixa de itens que o analisador reconheceu (no lugar da nota, que é dado de dieta). */
export type DietItemsBand = "0" | "1-5" | "6+";
/** `section_viewed.modo` com `area: "dieta"`. */
export type DietScreenMode = "leitura" | "leitura_metas" | "edicao" | "vazio";
/** Quem montou o plano de dieta aberto (`diet_adjust_started.origem`, `diet_saved.origem`). */
export type DietOrigin = "personal" | "proprio";
/** `ficha_link_opened.aviso_dieta`: aviso mostrado em /abrir antes de substituir a dieta. */
export type DietReplaceNoticeKind = "ajustes" | "proprio" | "nenhum";
/** `program_edited.kind`. */
export type ProgramEditKind = "modelo" | "aluno" | "propria" | "recebida" | "como_aluno";
/** `program_edited.tela`: "larga" a partir de 1024 px. */
export type EditorWidth = "estreita" | "larga";
/** `program_edited.duracao`: tempo desde que o editor abriu. */
export type EditDuration = "<1min" | "1-3min" | "3-10min" | "10min+";
/** `session_feature_used` com `feature: "serie_desmarcada"`: tempo desde a marcação. */
export type UnmarkBand = "ate_10s" | "10_60s" | "mais_60s";
/** Valores de `session_feature_used.feature` (os de antes e os da U1 §6). */
export type SessionFeature =
  | "adicionar_exercicio"
  | "carga_sugerida_editada"
  | "cronometro_serie"
  | "descanso_atraso"
  | "descanso_mais_15"
  | "descanso_menos_15"
  | "descanso_ok"
  | "descanso_pular"
  | "marcar_preenchidas"
  | "sentimento_salvo"
  | "som"
  | "trocar_exercicio"
  | "serie_desmarcada"
  | "acoes_exercicio"
  | "serie_removida"
  | "exercicio_removido"
  | "remocao_cancelada"
  | "trocar_bloqueado"
  | "proxima_serie_visivel";

/** `diet_analyzed`: sem `score` (a nota é derivada da dieta). Um `score` passado por engano é descartado. */
export interface DietAnalyzedProps {
  source: string;
  where: "coach" | "self";
  itens: DietItemsBand;
}

/** Eventos novos com propriedades fechadas: o typecheck recusa chave ou valor fora do contrato. */
export interface StrictEventProps {
  /** Toque em "Ajustar cardápio" (plano do personal) ou "Editar dieta" (plano próprio). */
  diet_adjust_started: { origem: DietOrigin };
  /** Uma vez por exercício exibido na aba de cargas da Evolução (na entrada e a cada troca). */
  evolution_compare_shown: {
    kind: "forca" | "reps" | "tempo" | "ajuda" | "duplo";
    state: "um_registro" | "ok";
    direction: "subiu" | "igual" | "caiu" | "indefinido" | "nenhuma";
    chart: boolean;
    suspect: boolean;
    by_coach: boolean;
  };
  /** Rascunho de treino reaberto (`begin(d, false)`), inclusive pela tela de conflito. */
  workout_resumed: { origem: "rascunho" | "conflito"; mudou_exercicio: boolean; instalado: boolean };
}

/** Chaves permitidas dos eventos novos (formato da fundação da anamnese; ela acrescenta as dela). */
export const EVENT_PROPS = {
  diet_adjust_started: ["origem"],
  evolution_compare_shown: ["kind", "state", "direction", "chart", "suspect", "by_coach"],
  workout_resumed: ["origem", "mudou_exercicio", "instalado"],
} as const satisfies Partial<Record<EventName, readonly string[]>>;

/**
 * Chaves NOVAS em eventos que já existiam (as antigas continuam). Valores: as categorias acima.
 *  - treinos_link_sent: where (TreinosLinkWhere), resend (algum treino do link já tinha toque), novos (sem toque antes);
 *  - ficha_link_sent: where (FichaLinkWhere), situacao (FichaSendSituation);
 *  - treinos_link_received: same (já estavam iguais), ficha_versao (FichaVersao);
 *  - diet_analyzed: itens (DietItemsBand) — e SAI `score`;
 *  - diet_saved: origem (DietOrigin, só no aparelho do aluno);
 *  - section_viewed (area "dieta"): modo (DietScreenMode), proxima, origem (DietOrigin | "nenhum"), by_coach;
 *  - ficha_link_opened: aviso_dieta (DietReplaceNoticeKind);
 *  - program_edited: kind ganha "recebida"/"como_aluno"; send_ready, tela (EditorWidth), duracao (EditDuration);
 *  - session_feature_used: features novas (SessionFeature) com faixa (UnmarkBand), estado ("pendente" |
 *    "preenchida" | "concluida"), feitas, preenchidas, acao ("serie" | "exercicio"), alvo ("serie" | "exercicio"),
 *    origem ("personal" | "propria" | "livre") e mesma_unidade em trocar_exercicio;
 *  - workout_completed: desmarcadas, trocas, grupos_desfeitos.
 */
export const EXTRA_PROPS = {
  treinos_link_sent: ["where", "resend", "novos"],
  ficha_link_sent: ["where", "situacao"],
  treinos_link_received: ["same", "ficha_versao"],
  diet_analyzed: ["itens"],
  diet_saved: ["origem"],
  section_viewed: ["modo", "proxima", "origem"],
  ficha_link_opened: ["aviso_dieta"],
  program_edited: ["send_ready", "tela", "duracao"],
  session_feature_used: ["faixa", "estado", "feitas", "preenchidas", "acao", "alvo", "origem", "mesma_unidade"],
  workout_completed: ["desmarcadas", "trocas", "grupos_desfeitos"],
} as const satisfies Partial<Record<EventName, readonly string[]>>;

/** Propriedades que nunca saem, mesmo se uma tela antiga ainda as passar (dado de saúde derivado). */
export const DROP_PROPS = {
  diet_analyzed: ["score"],
} as const satisfies Partial<Record<EventName, readonly string[]>>;

/** Tira as propriedades proibidas do evento (DROP_PROPS). Puro, para teste. */
export function cleanProps(event: EventName, props: TrackProps): TrackProps {
  const drop = (DROP_PROPS as Partial<Record<EventName, readonly string[]>>)[event];
  if (!drop) return props;
  const out: TrackProps = { ...props };
  for (const k of drop) delete out[k];
  return out;
}

type TrackArgs<E extends EventName> = E extends keyof StrictEventProps ? [props: StrictEventProps[E]] : [props?: TrackProps];

/** Analytics nunca quebra nem atrasa o app. */
function safely(fn: () => void) {
  if (typeof window === "undefined" || !enabled) return;
  try {
    fn();
  } catch {
    /* segue o jogo */
  }
}

/** Evento de produto. Os eventos de StrictEventProps exigem as propriedades do contrato. */
export function track<E extends EventName>(event: E, ...args: TrackArgs<E>) {
  if (typeof window === "undefined") return;
  const props = cleanProps(event, (args[0] ?? {}) as TrackProps);
  if (!enabled) {
    if (process.env.NODE_ENV !== "production") console.debug("[track]", event, props);
    return;
  }
  safely(() => posthog.capture(event, props));
}

/** Conta real (login): liga os eventos ao id estável do usuário. Sem e-mail nem nome. */
export function identify(userId: string, props: { role?: string } = {}) {
  safely(() => posthog.identify(userId, props));
}

/** Saída de uma conta identificada: os próximos eventos voltam a ser anônimos. */
export function resetIdentity() {
  safely(() => posthog.reset());
}

/** Contexto que acompanha todos os eventos seguintes (modo do app, papel, visão do personal como aluno). */
export function setContext(props: Props) {
  safely(() => posthog.register(props));
}

/**
 * Erro tratado na tela (falha ao salvar, carregar, gerar): vai para o acompanhamento de erros com o local.
 * Erros não tratados já são capturados automaticamente.
 */
export function reportError(error: unknown, where: string, props: Props = {}) {
  if (typeof window === "undefined") return;
  if (!enabled) {
    if (process.env.NODE_ENV !== "production") console.debug("[erro]", where, error);
    return;
  }
  safely(() => posthog.captureException(error instanceof Error ? error : new Error(typeof error === "string" ? error : "Erro desconhecido"), { where, handled: true, ...props }));
}

/** Erro que derrubou uma tela (capturado por um error boundary, que impede a captura automática). */
export function reportCrash(error: unknown, where: string) {
  if (typeof window === "undefined") return;
  if (!enabled) {
    if (process.env.NODE_ENV !== "production") console.debug("[falha]", where, error);
    return;
  }
  safely(() => posthog.captureException(error instanceof Error ? error : new Error(String(error)), { where, handled: false }));
}
