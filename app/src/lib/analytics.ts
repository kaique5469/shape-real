"use client";

import type { PostHog } from "posthog-js";

import type { Alimentacao, Atendimento, SecaoId } from "@/lib/domain/anamnese-types";
import type { FichaSendSituation, FichaVersao, PrepVia } from "@/lib/domain/delivery";
import { CODIGO, ehTelaDeRespostas, TIPO } from "@/lib/questionario-base";

/**
 * Eventos de produto e erros (PostHog). O SDK chega depois do primeiro carregamento (src/instrumentation-client.ts e
 * src/lib/posthog-init.ts); até lá as chamadas esperam numa fila curta, na ordem (rodada M, RM-03).
 * Sem NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN nada é enviado: em desenvolvimento os eventos aparecem no console.
 * Regras: nunca envie dados de saúde (peso, medidas, dieta) nem derivados deles (ex.: a nota da dieta), nomes,
 * telefones, cargas ou texto digitado pelo usuário nas propriedades — só contagens, booleanos, opções escolhidas
 * e nomes de recursos. A união abaixo é fechada: evento novo entra aqui, com as propriedades em EVENT_PROPS e na
 * ALLOWED_PROPS de src/lib/analytics-props.ts (rodada 3, R3-19: chave fora dela é descartada antes de sair do aparelho).
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
  | "workout_resumed"
  // Questionário inicial (propriedades fechadas em StrictEventProps; montadas por src/lib/anamnese-events.ts)
  | "work_style_set"
  | "work_style_suggestion"
  | "anamnese_requested"
  | "anamnese_opened"
  | "anamnese_link_opened"
  | "anamnese_part_done"
  | "anamnese_sent"
  | "anamnese_send_confirmed"
  | "anamnese_received"
  | "anamnese_deleted"
  | "summary_viewed"
  | "next_step_clicked";

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

// ---- Questionário inicial (spec da anamnese §12) -------------------------------------------
// Regra: nenhuma propriedade muda por causa de uma resposta de saúde, nem pela presença ou ausência de uma parte ou de
// um passo que só existe com (ou sem) gatilho de saúde. Nada de resposta, nível ou contagem de alertas, liberação,
// termo, "enviado sem saúde", nome, telefone, CREF, id de pedido, link ou público atendido.

/** `reavaliacao` dos eventos: "nao" quando a rodada não é reavaliação (ou na Entrega 1). */
export type ReavaliacaoProp = "nao" | "saude" | "tudo";
/** Faixa do tempo de preenchimento (`anamnese_sent.minutos`). */
export type FaixaMinutos = "<3" | "3-5" | "5-8" | "8-12" | ">12";
/** `anamnese_part_done.parte`: nunca `dorMais` (só existe com dor ou lesão). */
export type ParteEvento = Exclude<SecaoId, "dorMais">;
/** `next_step_clicked.passo`: sem os passos clínicos e sem `dieta`/`nutricionista` (inferência negativa). */
export type PassoEvento = "gerar_ficha" | "enviar_ficha" | "avaliacao" | "checkin" | "reavaliar" | "questionario" | "lembrar";
/** `student_created.modo` (cadastro rápido, formulário completo ou aluno criado em /receber). */
export type StudentCreatedModo = "agora" | "whatsapp" | "depois" | "completo" | "receber";
/** `link_dead_end_shown`, formato fixo (os 4 primeiros motivos já existiam em /abrir e /receber). */
export type DeadEndProps = {
  tela: "abrir" | "receber" | "questionario";
  motivo: "invalido" | "iphone" | "nao_personal" | "sem_alunos" | "versao_nova" | "questionario_personal" | "respostas_no_aluno";
  via_paste: boolean;
};
/** Chaves novas de `program_generated` (`evProgramGeneratedExtra`). `ajustes_n`: 0–7. */
export type ProgramGeneratedExtra = { from_anamnese: boolean; ajustes_n: number };
/** Chaves novas de `ficha_link_sent` (`evFichaLinkExtra`). `aluno_novo`: criado a partir de `QUESTIONARIO_DESDE`. */
export type FichaLinkExtra = { primeira: boolean; horas_desde_cadastro: number | null; questionario: "link" | "junto" | "nenhum"; aluno_novo: boolean };
/** Chave nova de `student_created` (`evStudentCreatedExtra`). */
export type StudentCreatedExtra = { modo: StudentCreatedModo };
/** Faixa de minutos ATIVOS do treino (rodada 3, R3-4; `faixaMinutosAtivos` em domain/session-time.ts). Nunca o bruto. */
export type FaixaMinutosAtivos = "<15" | "15-30" | "30-45" | "45-60" | "60-90" | ">90";
/** Chave nova de `workout_completed` (rodada 3): substitui `minutes` (duração bruta), que o filtro já descarta. */
export type WorkoutCompletedExtra = { minutos_ativos: FaixaMinutosAtivos | null };

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
  /** Beco sem saída de um link (/abrir, /receber, /questionario). */
  link_dead_end_shown: DeadEndProps;
  // Questionário inicial: as telas passam o retorno das funções de src/lib/anamnese-events.ts.
  /** Jeito de trabalhar salvo ou pulado. `publico_n` 0–2; `perguntas_n` 0–3 (sempre 0 na Entrega 1). */
  work_style_set: {
    origem: "onboarding" | "conta" | "cartao";
    pulou: boolean;
    atendimento: Atendimento | "nao_respondeu";
    alimentacao: Alimentacao | "nao_respondeu";
    publico_n: number;
    semanas: 4 | 6 | 8 | 12 | null;
    perguntas_n: number;
  };
  /** [E2] Sugestão do padrão aprendido aceita ou dispensada. */
  work_style_suggestion: { campo: "divisao" | "semanas"; aceitou: boolean };
  /** Uma vez por pedido, no primeiro toque em WhatsApp ou Copiar. `modulos_n` 0–5; `extras_n` 0–3. */
  anamnese_requested: { via: "whatsapp" | "copiar"; reavaliacao: ReavaliacaoProp; modulos_n: number; extras_n: number; de: "cadastro" | "aluno" | "passos" | "lembrete"; reenvio: boolean };
  anamnese_opened: { modo: "link" | "junto" | "previa"; ios_browser: boolean; retomou: boolean; aparelho: "aluno" | "personal_dono" | "outro" };
  /** Abertura do ramo `anamnese` de /receber, antes das guardas. */
  anamnese_link_opened: { tela: "receber"; via_paste: boolean };
  /** `indice`: posição em `secoesDoPedido` (só as partes que o pedido define). */
  anamnese_part_done: { parte: ParteEvento; indice: number; modo: "link" | "junto" };
  /** `modulos_n`: módulos pedidos (não os exibidos); `pulados_n` nunca conta `dorMais`. */
  anamnese_sent: { modo: "link" | "junto"; minutos: FaixaMinutos; modulos_n: number; pulados_n: number; extras_n: number; reenvio: boolean; incompleto: boolean; reavaliacao: ReavaliacaoProp };
  anamnese_send_confirmed: { resposta: "sim" | "tentar" | "copiar" };
  /** `diferencas_n` sem peso e altura. */
  anamnese_received: { achou: "ref" | "nome" | "escolhido" | "novo"; diferencas_n: number; reenvio: boolean; dias_desde_pedido: number | null; reavaliacao: ReavaliacaoProp };
  anamnese_deleted: { com_cadastro: boolean };
  summary_viewed: { tem_questionario: boolean; origem: "aba" | "receber" | "junto" };
  next_step_clicked: { passo: PassoEvento };
}

/** Chaves permitidas dos eventos com propriedades fechadas (as mesmas de StrictEventProps; teste em analytics.anamnese.test.ts). */
export const EVENT_PROPS = {
  diet_adjust_started: ["origem"],
  evolution_compare_shown: ["kind", "state", "direction", "chart", "suspect", "by_coach"],
  workout_resumed: ["origem", "mudou_exercicio", "instalado"],
  link_dead_end_shown: ["tela", "motivo", "via_paste"],
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
 *  - workout_completed: desmarcadas, trocas, grupos_desfeitos;
 *  - questionário inicial: program_generated (ProgramGeneratedExtra), ficha_link_sent (FichaLinkExtra),
 *    student_created (StudentCreatedExtra); student_contacted.reason ganha o valor "questionario_pendente".
 */
export const EXTRA_PROPS = {
  treinos_link_sent: ["where", "resend", "novos"],
  ficha_link_sent: ["where", "situacao", "primeira", "horas_desde_cadastro", "questionario", "aluno_novo"],
  program_generated: ["from_anamnese", "ajustes_n"],
  student_created: ["modo"],
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

/**
 * Filtro por evento em tempo de execução (rodada 3, R3-19): só as chaves de ALLOWED_PROPS (src/lib/analytics-props.ts)
 * e texto de até 64 caracteres. As listas chegam com o SDK (posthog-init.ts → `anexarPosthog`) e não pesam no primeiro
 * carregamento; até lá nada sai do aparelho (a fila fica em memória), e cada chamada da fila passa pelo filtro na hora de
 * ir para o SDK, assim como as chamadas diretas depois do init.
 */
export type FiltroDeProps = (event: EventName, props: TrackProps) => TrackProps;
let filtrar: FiltroDeProps | null = null;

// ---- SDK depois do primeiro carregamento (rodada M, RM-03) ---------------------------------------------------------
// O posthog-js (~120 KB gzip) é baixado 3 s depois do `load`, quando o navegador fica ocioso. Até lá cada chamada
// espera numa fila, com o horário e a página da ação, e é aplicada na ordem quando o SDK iniciar. A fila só guarda o
// que a chamada já mandaria: as propriedades são as mesmas, e o horário e a página vão nos campos do próprio SDK
// (`timestamp` do capture, `$current_url` e `$pathname`), que de outro modo seriam os da hora do envio.

/** Abertura da página, lida em instrumentation-client.ts antes de a página mexer na barra (limpar o `#d=`, redirecionar). */
export interface InicioDaPagina {
  /** URL da abertura, já sem `?k=` e sem `#`. */
  url: string;
  pathname: string;
  /** `document.referrer`, já sem `?k=` e sem `#` ("" quando não há). */
  referrer: string;
  em: Date;
}

/** Erro não tratado antes de o SDK chegar (window error e unhandledrejection, até 20, em instrumentation-client.ts). */
export interface ErroCedo {
  erro: unknown;
  em: Date;
  /** Página do erro, já sem `?k=` e sem `#`. */
  url: string;
  pathname: string;
}

/** Uma chamada feita antes do SDK: o que fazer e o horário e a página em que aconteceu. */
interface Chamada {
  em: Date;
  url: string;
  pathname: string;
  fazer: (p: PostHog, c?: Chamada) => void;
}

/**
 * - `evento`: capture e captureException (o volume da fila);
 * - `estado`: identify, reset e register. Perder um deles muda todos os eventos seguintes (contexto velho, eventos
 *   ligados à conta anterior), então não disputam o teto com os eventos.
 */
type TipoDeChamada = "evento" | "estado";

/** Teto de eventos na fila: passou disso, o evento se perde (a medição nunca segura memória do app). */
export const MAX_FILA = 200;
/** Teto à parte para identify, reset e register. No uso normal são poucos (login, saída, mudança de contexto). */
export const MAX_FILA_ESTADO = 50;

let posthog: PostHog | null = null;
const fila: Chamada[] = [];
const naFila: Record<TipoDeChamada, number> = { evento: 0, estado: 0 };
const TETO: Record<TipoDeChamada, number> = { evento: MAX_FILA, estado: MAX_FILA_ESTADO };

/** Tira da URL a chave do link de teste (`?k=`) e tudo depois do "#" (onde viajam ficha, dieta e respostas). */
export function semChaveNemFragmento(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.delete("k");
    url.hash = "";
    return url.toString();
  } catch {
    return href.replace(/#.*$/, "").replace(/([?&])k=[^&#]*/g, "$1");
  }
}

/** Página da ação nos campos do SDK (só para o que esperou na fila; depois do init o SDK lê a página atual). */
function naPagina(c: Chamada | undefined) {
  return c ? { $current_url: c.url, $pathname: c.pathname } : {};
}

// As regras são as de limparEventoPosthog (questionario-base.ts): telas que abrem respostas, código nosso e tipo do erro.
/**
 * Erro de /questionario ou /receber que esperou na fila e sai depois de a pessoa deixar a tela: o before_send olha a
 * página ATUAL e não limparia. Sai como sairia lá: o tipo, a mensagem só se for um código nosso, e sem a pilha (o texto
 * dela repete a mensagem).
 */
function comoNaTelaDoErro(erro: Error, pathname: string): Error {
  if (!ehTelaDeRespostas(pathname) || ehTelaDeRespostas(window.location.pathname)) return erro;
  const limpo = new Error(CODIGO.test(erro.message) ? erro.message : "");
  limpo.name = TIPO.test(erro.name) ? erro.name : "Error";
  limpo.stack = limpo.message ? `${limpo.name}: ${limpo.message}` : limpo.name;
  return limpo;
}

function aplicar(fn: () => void) {
  try {
    fn();
  } catch {
    /* segue o jogo */
  }
}

/**
 * Exceção que esperou na fila sai com o horário da ação. O `captureException` não aceita horário, mas chama o `capture`
 * da própria instância, na mesma hora (posthog-js: `sendExceptionEvent` → `this._instance.capture("$exception", …)`):
 * só durante a chamada, o `capture` acrescenta `timestamp` ao `$exception`, e volta a ser o de antes.
 */
function comHorario(p: PostHog, em: Date, enviar: () => void) {
  const antes = p.capture;
  p.capture = function (this: PostHog, ...args: Parameters<PostHog["capture"]>) {
    const [evento, props, opcoes] = args;
    return antes.call(this, evento, props, evento === "$exception" ? { ...opcoes, timestamp: em } : opcoes);
  } as PostHog["capture"];
  try {
    enviar();
  } finally {
    p.capture = antes;
  }
}

/** Analytics nunca quebra nem atrasa o app. */
function safely(fn: (p: PostHog, c?: Chamada) => void, tipo: TipoDeChamada = "evento") {
  if (typeof window === "undefined" || !enabled) return;
  if (posthog) return aplicar(() => fn(posthog!));
  if (naFila[tipo] >= TETO[tipo]) return;
  aplicar(() => {
    fila.push({ em: new Date(), url: semChaveNemFragmento(window.location.href), pathname: window.location.pathname, fazer: fn });
    naFila[tipo]++;
  });
}

/**
 * O SDK iniciou (posthog-init.ts). Manda a $pageview da abertura com a URL e o horário capturados no módulo; depois os
 * erros de antes do SDK e a fila, na ordem dos horários, cada um com o horário e a página da ação (e uma $pageview
 * quando a página muda, como o SDK faria na navegação); por fim a página atual, se for outra. Daí em diante as chamadas
 * vão direto para o SDK. `filtro` (R3-19, `filtrarProps` de analytics-props.ts): vale para os eventos da fila e os
 * seguintes; posthog-init.ts sempre passa (teste em analytics.allowlist.test.ts).
 */
export function anexarPosthog(p: PostHog, inicio: InicioDaPagina, cedo: readonly ErroCedo[], filtro?: FiltroDeProps) {
  if (filtro) filtrar = filtro;
  const erros: Chamada[] = cedo.map((e) => ({
    em: e.em,
    url: e.url,
    pathname: e.pathname,
    fazer: (q, c) => comHorario(q, e.em, () => q.captureException(comoNaTelaDoErro(e.erro instanceof Error ? e.erro : new Error(String(e.erro)), e.pathname), { handled: false, ...naPagina(c) })),
  }));
  const chamadas = [...fila.splice(0), ...erros].sort((a, b) => a.em.getTime() - b.em.getTime());
  naFila.evento = naFila.estado = 0;
  let pagina: string | null = null;
  const vista = (v: { url: string; pathname: string; em?: Date }, extra: Record<string, string> = {}) => {
    if (v.pathname === pagina) return;
    pagina = v.pathname;
    aplicar(() => p.capture("$pageview", { $current_url: v.url, $pathname: v.pathname, ...extra }, v.em ? { timestamp: v.em } : undefined));
  };
  vista(inicio, inicio.referrer ? { $referrer: inicio.referrer } : {});
  for (const c of chamadas) {
    vista(c);
    aplicar(() => c.fazer(p, c));
  }
  vista({ url: semChaveNemFragmento(window.location.href), pathname: window.location.pathname });
  posthog = p;
}

/** Evento de produto. Os eventos de StrictEventProps exigem as propriedades do contrato. */
export function track<E extends EventName>(event: E, ...args: TrackArgs<E>) {
  if (typeof window === "undefined") return;
  const props = cleanProps(event, (args[0] ?? {}) as TrackProps);
  if (!enabled) {
    if (process.env.NODE_ENV !== "production") console.debug("[track]", event, props);
    // Em desenvolvimento sem token, o aviso de chave fora da lista (R3-19) sem esperar o SDK. Fora do build de produção.
    if (process.env.NODE_ENV === "development") void import("./analytics-props").then((m) => m.filtrarProps(event, props), () => undefined);
    return;
  }
  safely((p, c) => {
    const ok = filtrar ? filtrar(event, props) : props;
    if (c) p.capture(event, { ...ok, ...naPagina(c) }, { timestamp: c.em });
    else p.capture(event, ok);
  });
}

/** Conta real (login): liga os eventos ao id estável do usuário. Sem e-mail nem nome. */
export function identify(userId: string, props: { role?: string } = {}) {
  safely((p) => p.identify(userId, props), "estado");
}

/** Saída de uma conta identificada: os próximos eventos voltam a ser anônimos. */
export function resetIdentity() {
  safely((p) => p.reset(), "estado");
}

/** Contexto que acompanha todos os eventos seguintes (modo do app, papel, visão do personal como aluno). */
export function setContext(props: Props) {
  safely((p) => p.register(props), "estado");
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
  const erro = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Erro desconhecido");
  safely((p, c) => {
    if (!c) return void p.captureException(erro, { where, handled: true, ...props });
    comHorario(p, c.em, () => p.captureException(comoNaTelaDoErro(erro, c.pathname), { where, handled: true, ...props, ...naPagina(c) }));
  });
}

/** Erro que derrubou uma tela (capturado por um error boundary, que impede a captura automática). */
export function reportCrash(error: unknown, where: string) {
  if (typeof window === "undefined") return;
  if (!enabled) {
    if (process.env.NODE_ENV !== "production") console.debug("[falha]", where, error);
    return;
  }
  const erro = error instanceof Error ? error : new Error(String(error));
  safely((p, c) => {
    if (!c) return void p.captureException(erro, { where, handled: false });
    comHorario(p, c.em, () => p.captureException(comoNaTelaDoErro(erro, c.pathname), { where, handled: false, ...naPagina(c) }));
  });
}
