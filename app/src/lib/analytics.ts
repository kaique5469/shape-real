"use client";

import posthog from "posthog-js";

/**
 * Eventos de produto e erros (PostHog, iniciado em src/instrumentation-client.ts).
 * Sem NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN nada é enviado: em desenvolvimento os eventos aparecem no console.
 * Regras: nunca envie dados de saúde (peso, medidas, dieta), nomes, telefones ou texto digitado pelo usuário
 * nas propriedades — só contagens, opções escolhidas e nomes de recursos.
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
  | "coach_list_viewed";

const enabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY);

type Props = Record<string, string | number | boolean | null | undefined>;

/** Analytics nunca quebra nem atrasa o app. */
function safely(fn: () => void) {
  if (typeof window === "undefined" || !enabled) return;
  try {
    fn();
  } catch {
    /* segue o jogo */
  }
}

export function track(event: EventName, props: Props = {}) {
  if (typeof window === "undefined") return;
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
