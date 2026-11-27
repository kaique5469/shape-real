import type { EventName, TrackProps } from "@/lib/analytics";

/**
 * Rodada 3 (R3-19): o que cada evento pode levar, conferido em tempo de execução. Defesa em profundidade: nenhuma
 * chamada atual vaza (inventário de todas as chamadas a track() pelo verificador de tipos, 27/11), mas eventos fora de
 * StrictEventProps aceitam qualquer TrackProps no tipo.
 *
 * PESO: este arquivo só é importado por posthog-init.ts, que chega depois do primeiro carregamento (rodada M, RM-03).
 * As listas não entram em nenhuma rota no load. NÃO importe este arquivo em analytics.ts nem em código de tela: a
 * fila de analytics.ts aplica o filtro que posthog-init.ts entrega junto com o SDK (`anexarPosthog`), antes de
 * qualquer evento sair do aparelho. Em desenvolvimento sem token, analytics.ts pede este arquivo só para avisar.
 *
 * Evento novo exige lista (o `satisfies` recusa evento sem entrada). Chave nova: acrescente aqui e confira as regras
 * de analytics.ts (nunca saúde nem derivado, dor incluída; nome; telefone; carga; texto digitado). Os eventos com
 * propriedades fechadas têm exatamente as chaves de EVENT_PROPS (teste em analytics.allowlist.test.ts).
 */
export const ALLOWED_PROPS = {
  landing_cta_clicked: ["plan", "porta", "system", "where", "yearly"],
  signup_started: ["role"],
  signup_completed: ["mode", "role"],
  demo_started: ["role"],
  onboarding_completed: ["geracao", "goal", "passos", "role", "system", "whatsapp"],
  program_generated: ["ajustes_n", "from_anamnese", "source", "system", "where"],
  program_saved: ["source"],
  workout_started: ["day", "program"],
  // `minutos_ativos`: faixa de minutos ATIVOS (FaixaMinutosAtivos, R3-4), no lugar de `minutes` (duração bruta), que saiu.
  workout_completed: ["compare_lines", "completed_all", "desmarcadas", "exercises", "from_program", "grupos_desfeitos", "linked_exercises", "minutos_ativos", "prs", "sets", "timed_exercises", "trocas"],
  pr_achieved: ["count", "live"],
  metric_logged: ["fields"],
  photo_added: ["pose"],
  diet_analyzed: ["itens", "source", "where"],
  diet_generated: ["source", "where"],
  student_invited: ["count"],
  invite_accepted: ["where"],
  program_assigned: ["source"],
  export_downloaded: ["files", "kind"],
  upgrade_clicked: ["from", "plan"],
  paywall_viewed: ["where"],
  tester_started: [],
  tester_solo_started: [],
  view_as_student: [],
  student_created: ["consent", "has_phone", "modo"],
  student_removed: ["count", "managed", "sample"],
  assessment_logged: ["fields"],
  program_shared: ["direct", "via"],
  program_copied: ["to"],
  diet_shared: ["direct", "via"],
  custom_exercise_created: ["group", "unit"],
  custom_food_created: [],
  feedback_sent: ["length", "topic"],
  program_edited: ["custom", "days", "duracao", "exercises", "has_validity", "kind", "send_ready", "system", "tela", "timed", "with_notes", "with_technique"],
  diet_saved: ["custom_items", "has_notes", "items", "meals", "origem", "where"],
  diet_targets_edited: ["had_computed", "via", "where"],
  session_feature_used: ["acao", "alvo", "count", "editada", "escolha", "estado", "faixa", "feature", "feitas", "mesma_unidade", "on", "origem", "preenchidas", "tipo"],
  section_viewed: ["area", "by_coach", "modo", "origem", "proxima", "tab"],
  student_edited: ["consent", "has_phone"],
  student_contacted: ["reason", "where"],
  workspace_reset: [],
  error_screen_shown: ["where"],
  report_viewed: ["by_coach"],
  report_shared: ["by_coach", "days", "has_message", "via", "with_photos"],
  app_install_prompted: ["acao", "gatilho", "plataforma", "where"],
  app_installed: ["plataforma"],
  ficha_link_sent: ["aluno_novo", "direct", "has_diet", "has_program", "horas_desde_cadastro", "primeira", "questionario", "situacao", "via", "where"],
  ficha_link_opened: ["aviso_dieta", "had_profile", "has_diet", "has_program", "ios_browser", "via_paste"],
  treinos_link_sent: ["novos", "resend", "sessions", "via", "where"],
  treinos_link_received: ["added", "ficha_versao", "ios_browser", "matched", "mirrored", "same", "sessions", "via_paste"],
  backup_restored: ["origem", "role", "students", "v"],
  backup_shared: ["alunos", "dias_desde_ultima", "onde", "via"],
  coach_list_viewed: ["faixa_alunos"],
  coach_cref_set: ["filled", "first", "valid"],
  student_coach_whatsapp_clicked: ["has_cref", "where"],
  // Propriedades fechadas (StrictEventProps): as mesmas chaves de EVENT_PROPS.
  link_dead_end_shown: ["tela", "motivo", "via_paste"],
  diet_adjust_started: ["origem"],
  evolution_compare_shown: ["kind", "state", "direction", "chart", "suspect", "by_coach"],
  workout_resumed: ["origem", "mudou_exercicio", "instalado"],
  work_style_set: ["origem", "pulou", "atendimento", "alimentacao", "publico_n", "semanas", "perguntas_n"],
  work_style_suggestion: ["campo", "aceitou"],
  anamnese_requested: ["via", "reavaliacao", "modulos_n", "extras_n", "de", "reenvio"],
  anamnese_opened: ["modo", "ios_browser", "retomou", "aparelho"],
  anamnese_link_opened: ["tela", "via_paste"],
  anamnese_part_done: ["parte", "indice", "modo"],
  anamnese_sent: ["modo", "minutos", "modulos_n", "pulados_n", "extras_n", "reenvio", "incompleto", "reavaliacao"],
  anamnese_send_confirmed: ["resposta"],
  anamnese_received: ["achou", "diferencas_n", "reenvio", "dias_desde_pedido", "reavaliacao"],
  anamnese_deleted: ["com_cadastro"],
  summary_viewed: ["tem_questionario", "origem"],
  next_step_clicked: ["passo"],
} as const satisfies Record<EventName, readonly string[]>;

/** Texto acima disto não sai (categoria nunca é tão longa; texto longo seria digitado ou montado com dado). */
export const MAX_TEXTO_PROP = 64;

/**
 * Só as chaves da lista do evento, com valor número, booleano, null ou texto de até MAX_TEXTO_PROP caracteres. O resto
 * é descartado; em desenvolvimento, um aviso com o evento e o NOME da chave, nunca o valor. Puro (fora o aviso).
 */
export function filtrarProps(event: EventName, props: TrackProps): TrackProps {
  const lista: readonly string[] = (ALLOWED_PROPS as Record<string, readonly string[]>)[event] ?? [];
  const out: TrackProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    const valorOk = v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= MAX_TEXTO_PROP);
    if (valorOk && lista.includes(k)) out[k] = v;
    else if (process.env.NODE_ENV !== "production") console.warn(`[track] ${event}: propriedade "${k}" descartada (${lista.includes(k) ? "valor fora do formato" : "fora da lista"})`);
  }
  return out;
}
