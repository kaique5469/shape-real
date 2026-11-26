import { firstName, fmtDayMonth, type Validity } from "./format";
import { weekStart } from "./progression";

/**
 * Quem precisa de uma mensagem do personal hoje, em /alunos.
 * No modo local o personal só conhece os treinos que o aluno mandou por link: "sem notícias" não quer dizer
 * "sem treinar". O texto "sem treinar" só vale na nuvem, onde o treino chega sozinho.
 */

/** Limite mínimo (e o padrão, sem meta) de dias sem notícias para o aluno entrar no alerta. */
export const DEFAULT_INACTIVE_DAYS = 5;

/** Quantos nomes (e botões "Chamar") o alerta mostra antes de "e mais N". */
export const ALERT_MAX_NAMES = 3;

/**
 * Dias sem notícias a partir dos quais o aluno conta como parado: max(5, arredondar(2 × 7 ÷ meta)).
 * Quem treina 2x por semana pode passar 6 dias sem treinar sem estar sumido; sem meta, 5.
 */
export function inactiveThreshold(daysPerWeek?: number | null): number {
  if (!daysPerWeek || !Number.isFinite(daysPerWeek) || daysPerWeek <= 0) return DEFAULT_INACTIVE_DAYS;
  return Math.max(DEFAULT_INACTIVE_DAYS, Math.round((2 * 7) / daysPerWeek));
}

/** Dias de calendário, no fuso do aparelho, entre a data e hoje (0 para hoje ou para uma data futura). */
export function calendarDaysSince(iso: string, now = new Date()): number {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // round: um dia com mudança de horário tem 23 ou 25 horas.
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export interface NewsInput {
  /** Último treino recebido (ISO) ou null se nenhum chegou. */
  lastSessionAt: string | null;
  /** Desde quando o aluno está vinculado ao personal (ISO). */
  linkedAt: string;
  /**
   * Criação da ficha ativa (ISO). Para quem nunca mandou treino, a conta começa na data mais recente entre o
   * vínculo e a ficha: uma ficha montada dias depois do cadastro não nasce com alarme. Sem o campo, conta do vínculo.
   */
  programCreatedAt?: string | null;
}

function timeOf(iso: string): number {
  return new Date(iso.length === 10 ? iso + "T12:00:00" : iso).getTime();
}

/**
 * Desde quando conta o "sem notícias": o último treino recebido ou, se nunca chegou nenhum, o mais recente entre
 * o vínculo e a criação da ficha ativa (U4 §3.1). Data da ficha inválida é ignorada.
 */
export function newsSince(s: NewsInput): string {
  if (s.lastSessionAt) return s.lastSessionAt;
  const p = s.programCreatedAt;
  if (p) {
    const tp = timeOf(p);
    if (Number.isFinite(tp) && !(timeOf(s.linkedAt) >= tp)) return p;
  }
  return s.linkedAt;
}

/** Dias sem notícias: desde o último treino recebido ou, se nunca chegou nenhum, desde newsSince (vínculo ou ficha). */
export function daysWithoutNews(s: NewsInput, now = new Date()): number {
  return calendarDaysSince(newsSince(s), now);
}

/** Aluno parado: dias sem notícias ≥ inactiveThreshold(meta). */
export function isQuiet(s: NewsInput, daysPerWeek?: number | null, now = new Date()): boolean {
  return daysWithoutNews(s, now) >= inactiveThreshold(daysPerWeek);
}

/** Meta da semana: a da ficha ativa ou, sem ela, a do perfil; null quando não há meta. */
export function weeklyGoal(programDaysPerWeek?: number | null, profileDaysPerWeek?: number | null): number | null {
  for (const v of [programDaysPerWeek, profileDaysPerWeek]) if (v && Number.isFinite(v) && v > 0) return Math.round(v);
  return null;
}

/** Treinos da semana corrente, de segunda a domingo: a mesma conta que o aluno vê no Hoje. */
export function sessionsThisWeek(startedAts: readonly string[], now = new Date()): number {
  const week = weekStart(now.toISOString());
  return startedAts.filter((t) => weekStart(t) === week).length;
}

const daysText = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

/**
 * Situação de quem está sem notícias, para o alerta e para a linha do aluno.
 *  - local: "Sem notícias há 9 dias · último treino recebido em 13/11" ou "Nada recebido ainda";
 *  - nuvem: "Sem treinar há 9 dias · último treino em 13/11" ou "Nenhum treino ainda".
 * Sem treino recebido e com `opts.daysWithoutNews` (≥ 1), diz o tamanho do silêncio: "Sem notícias há 6 dias ·
 * nada recebido ainda" (nuvem: "Sem treinar há 6 dias · nenhum treino ainda"). Sem `opts`, o texto de sempre.
 */
export function newsLabel(lastSessionAt: string | null, mode: "local" | "supabase", now = new Date(), opts?: { daysWithoutNews?: number }): string {
  if (!lastSessionAt) {
    const n = opts?.daysWithoutNews;
    if (n === undefined || !Number.isInteger(n) || n < 1) return mode === "local" ? "Nada recebido ainda" : "Nenhum treino ainda";
    return mode === "local" ? `Sem notícias há ${daysText(n)} · nada recebido ainda` : `Sem treinar há ${daysText(n)} · nenhum treino ainda`;
  }
  const days = daysText(calendarDaysSince(lastSessionAt, now));
  const date = fmtDayMonth(lastSessionAt);
  return mode === "local" ? `Sem notícias há ${days} · último treino recebido em ${date}` : `Sem treinar há ${days} · último treino em ${date}`;
}

/** Motivo do contato; também vai para a medição (student_contacted.reason). */
export type ContactReason = "sem_noticias" | "ficha_vencendo" | "questionario_pendente";

/** Dias de pedido sem resposta a partir dos quais o questionário entra na fila ("Lembrar"). */
export const QUESTIONARIO_LEMBRAR_DIAS = 2;

/**
 * Motivo para o botão "Chamar". Questionário pedido há `QUESTIONARIO_LEMBRAR_DIAS` dias ou mais sem resposta vem antes
 * de tudo (com ou sem ficha: o próximo passo desse aluno é responder). Depois, sem notícias vem antes da ficha
 * vencendo. Ficha vencida não entra (o personal monta outra, não manda mensagem) e aluno sem ficha nunca entra por
 * esses dois motivos (`hasProgram === false`): o próximo passo dele é a ficha, não "Se treinou, me manda pelo app".
 * Sem `hasProgram`, conta como com ficha; sem `questionarioPendenteDias` (dias do pedido pendente, de
 * `diasDePedidoPendente`), o resultado de antes.
 */
export function contactReason(quiet: boolean, validity: Pick<Validity, "state"> | null, hasProgram = true, questionarioPendenteDias?: number | null): ContactReason | null {
  if (typeof questionarioPendenteDias === "number" && questionarioPendenteDias >= QUESTIONARIO_LEMBRAR_DIAS) return "questionario_pendente";
  if (!hasProgram) return null;
  if (quiet) return "sem_noticias";
  if (validity?.state === "soon") return "ficha_vencendo";
  return null;
}

/** "Ficha vence em 3 dias" / "Ficha vence amanhã" / "Ficha vence hoje", para o alerta. */
export function expiringLabel(daysLeft: number): string {
  return `Ficha ${expiresIn(daysLeft)}`;
}

function expiresIn(daysLeft: number): string {
  if (daysLeft <= 0) return "vence hoje";
  if (daysLeft === 1) return "vence amanhã";
  return `vence em ${daysLeft} dias`;
}

/**
 * Mensagem fixa do botão "Chamar", editável no próprio WhatsApp. Só o primeiro nome e, na ficha, os dias
 * que faltam: nunca peso, medidas ou outro dado de saúde. O lembrete do questionário vai sem link (o link vai pelo
 * "Lembrar" da página do aluno) e não promete que o rascunho continua: o navegador do aluno pode ter apagado.
 */
export function contactMessage(reason: ContactReason, name: string, daysLeft = 0): string {
  const first = firstName(name);
  if (reason === "questionario_pendente") return `Oi, ${first}! Conseguiu ver o questionário? Se parou no meio, é só abrir o link de novo.`;
  if (reason === "ficha_vencendo") return `Oi, ${first}! Sua ficha ${expiresIn(daysLeft)}. Já estou preparando a próxima. Quer mudar alguma coisa?`;
  return `Oi, ${first}! Tudo certo por aí? Faz uns dias que não chega treino seu. Se treinou, me manda pelo app; se travou, me conta que a gente ajusta.`;
}

/**
 * Situação de quem está na fila, ao lado do botão "Chamar": a de "sem notícias" (newsLabel), a da ficha
 * vencendo ("Ficha vence em 3 dias") ou a do questionário ("Questionário pedido há 3 dias", com `pedidoDias`).
 */
export function reasonLabel(
  reason: ContactReason,
  s: { lastSessionAt: string | null; daysLeft?: number; daysWithoutNews?: number; pedidoDias?: number },
  mode: "local" | "supabase",
  now = new Date(),
): string {
  if (reason === "questionario_pendente") {
    // Sem os dias, não inventa um número.
    const n = s.pedidoDias;
    return typeof n === "number" && Number.isFinite(n) && n >= 1 ? `Questionário pedido há ${daysText(Math.trunc(n))}` : "Questionário pedido, ainda sem resposta";
  }
  return reason === "ficha_vencendo" ? expiringLabel(s.daysLeft ?? 0) : newsLabel(s.lastSessionAt, mode, now, { daysWithoutNews: s.daysWithoutNews });
}

// ───────────────────────── Cartão da lista (U4a: só o que tem dado confiável) ─────────────────────────

/**
 * Pendência do cartão de /alunos, na ordem de prioridade (U4 §3.2). "treino_novo" e a fila por motivo entram
 * com a U4b; a prioridade 0 fica reservada aos estados de segurança do questionário.
 */
export type AttentionReason = "sem_ficha" | "sem_noticias" | "ficha_vencida" | "ficha_vencendo";
export const ATTENTION_ORDER: readonly AttentionReason[] = ["sem_ficha", "sem_noticias", "ficha_vencida", "ficha_vencendo"];

/**
 * A pendência mais forte do aluno, ou null. Sem ficha bloqueia todo o resto e nunca vira "sem notícias";
 * `quiet` já deve contar a partir de newsSince (vínculo ou ficha).
 */
export function topReason(i: { hasProgram: boolean; quiet: boolean; validity: Pick<Validity, "state"> | null }): AttentionReason | null {
  if (!i.hasProgram) return "sem_ficha";
  if (i.quiet) return "sem_noticias";
  if (i.validity?.state === "expired") return "ficha_vencida";
  if (i.validity?.state === "soon") return "ficha_vencendo";
  return null;
}

/** "Ficha vence em 2 dias", "Ficha vence hoje", "Ficha vencida ontem", "Ficha vencida há 5 dias" (o rótulo de programValidity). */
export function fichaStateText(validity: Pick<Validity, "label">): string {
  return `Ficha ${validity.label}`;
}

/**
 * Texto da linha de pendência do cartão (o mesmo da fila, sem o nome):
 * "Sem ficha ativa"; "Sem notícias há 12 dias · último treino recebido em 11/11" ou, sem nada recebido,
 * "Sem notícias há 6 dias · nada recebido ainda" (nuvem: "Sem treinar…"); "Ficha vencida há 5 dias"; "Ficha vence em 3 dias".
 */
export function pendingText(
  reason: AttentionReason,
  s: { lastSessionAt: string | null; daysWithoutNews?: number; validity?: Pick<Validity, "label"> | null },
  mode: "local" | "supabase",
  now = new Date(),
): string {
  switch (reason) {
    case "sem_ficha":
      return "Sem ficha ativa";
    case "sem_noticias":
      return newsLabel(s.lastSessionAt, mode, now, { daysWithoutNews: s.daysWithoutNews });
    case "ficha_vencida":
      return s.validity ? fichaStateText(s.validity) : "Ficha vencida";
    case "ficha_vencendo":
      return s.validity ? fichaStateText(s.validity) : "Ficha vencendo";
  }
}

export interface ProgramLineInput {
  /** Nome da ficha ativa; null ou ausente quando o aluno não tem ficha. */
  programName?: string | null;
  /** Objetivo do aluno ("Hipertrofia"), mostrado no lugar da ficha quando não há ficha. */
  goalLabel?: string | null;
  validity: Pick<Validity, "state" | "label"> | null;
  /** Pendência do cartão (topReason). */
  top: AttentionReason | null;
}

/**
 * Linha da ficha no cartão (U4 §3.4, item 4). O estado vem ANTES do nome, para o corte (truncate) cair no nome:
 *  - sem ficha: o objetivo, ou null sem objetivo;
 *  - vencendo ou vencida e a pendência já fala da ficha: só o nome;
 *  - vencendo ou vencida e a pendência é outra: { state: "Ficha vence em 2 dias", name };
 *  - em dia ou sem validade: só o nome.
 */
export function programLine(i: ProgramLineInput): { state: string | null; name: string } | null {
  if (i.programName == null) return i.goalLabel ? { state: null, name: i.goalLabel } : null;
  const v = i.validity;
  const warn = v !== null && (v.state === "soon" || v.state === "expired");
  const pendingIsProgram = i.top === "ficha_vencida" || i.top === "ficha_vencendo";
  return { state: warn && !pendingIsProgram ? fichaStateText(v) : null, name: i.programName };
}

/** A partir de quantas linhas (exemplos incluídos) a busca aparece em /alunos. */
export const LIST_TOOLS_MIN = 7;

/** Sem acento, minúsculas e dividido em palavras (espaço, hífen ou qualquer outro sinal que não seja letra ou dígito). */
function searchWords(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Busca de /alunos: cada palavra digitada precisa ser o INÍCIO de alguma palavra do nome. "ana" acha Ana Souza
 * e Ana Beatriz Souza, mas não Juliana nem Mariana; "joao" acha João; "clara" acha Maria-Clara; vazio acha todos.
 */
export function matchesQuery(name: string, query: string): boolean {
  const wanted = searchWords(query);
  if (!wanted.length) return true;
  const words = searchWords(name);
  return wanted.every((w) => words.some((n) => n.startsWith(w)));
}

/** Anúncio do resultado da busca para leitor de tela: "11 alunos", "1 aluno" ou "Nenhum aluno". */
export function resultsStatus(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "Nenhum aluno";
  return n === 1 ? "1 aluno" : `${Math.floor(n)} alunos`;
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla" ou, com mais gente na fila, "Ana, Bruno, Carla e mais 2". */
export function namesList(names: readonly string[], rest = 0): string {
  if (!names.length) return rest > 0 ? (rest === 1 ? "1 aluno" : `${rest} alunos`) : "";
  if (rest > 0) return `${names.join(", ")} e mais ${rest}`;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Os primeiros `max` da fila (já em ordem de urgência) e quantos sobram para "e mais N". */
export function splitQueue<T>(queue: readonly T[], max = ALERT_MAX_NAMES): { shown: T[]; rest: number } {
  const shown = queue.slice(0, Math.max(0, max));
  return { shown, rest: queue.length - shown.length };
}

/** Nomes para o alerta e os botões: o primeiro nome, ou o nome inteiro quando dois alunos da lista têm o mesmo primeiro nome. */
export function displayNames(names: readonly string[]): string[] {
  const firsts = names.map((n) => firstName(n));
  return names.map((n, i) => (firsts.filter((f) => f.toLocaleLowerCase("pt-BR") === firsts[i]!.toLocaleLowerCase("pt-BR")).length > 1 ? n.trim() : firsts[i]!));
}

/** Faixa de alunos para a medição (coach_list_viewed); null sem alunos reais. */
export function studentBand(count: number): "1-3" | "4-10" | "11+" | null {
  if (count < 1) return null;
  if (count <= 3) return "1-3";
  if (count <= 10) return "4-10";
  return "11+";
}
