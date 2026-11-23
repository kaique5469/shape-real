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
}

/** Dias sem notícias: desde o último treino recebido ou, se nunca chegou nenhum, desde o vínculo. */
export function daysWithoutNews(s: NewsInput, now = new Date()): number {
  return calendarDaysSince(s.lastSessionAt ?? s.linkedAt, now);
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

/**
 * Situação de quem está sem notícias, para o alerta e para a linha do aluno.
 *  - local: "Sem notícias há 9 dias · último treino recebido em 13/11" ou "Nada recebido ainda";
 *  - nuvem: "Sem treinar há 9 dias · último treino em 13/11" ou "Nenhum treino ainda".
 */
export function newsLabel(lastSessionAt: string | null, mode: "local" | "supabase", now = new Date()): string {
  if (!lastSessionAt) return mode === "local" ? "Nada recebido ainda" : "Nenhum treino ainda";
  const n = calendarDaysSince(lastSessionAt, now);
  const days = n === 1 ? "1 dia" : `${n} dias`;
  const date = fmtDayMonth(lastSessionAt);
  return mode === "local" ? `Sem notícias há ${days} · último treino recebido em ${date}` : `Sem treinar há ${days} · último treino em ${date}`;
}

/** Motivo do contato; também vai para a medição (student_contacted.reason). */
export type ContactReason = "sem_noticias" | "ficha_vencendo";

/** Sem notícias vem antes da ficha vencendo; ficha vencida ou sem ficha não entram (o personal monta outra, não manda mensagem). */
export function contactReason(quiet: boolean, validity: Pick<Validity, "state"> | null): ContactReason | null {
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
 * que faltam: nunca peso, medidas ou outro dado de saúde.
 */
export function contactMessage(reason: ContactReason, name: string, daysLeft = 0): string {
  const first = firstName(name);
  if (reason === "ficha_vencendo") return `Oi, ${first}! Sua ficha ${expiresIn(daysLeft)}. Já estou preparando a próxima. Quer mudar alguma coisa?`;
  return `Oi, ${first}! Tudo certo por aí? Faz uns dias que não chega treino seu. Se treinou, me manda pelo app; se travou, me conta que a gente ajusta.`;
}

/**
 * Situação de quem está na fila, ao lado do botão "Chamar": a de "sem notícias" (newsLabel) ou a da ficha
 * vencendo ("Ficha vence em 3 dias").
 */
export function reasonLabel(reason: ContactReason, s: { lastSessionAt: string | null; daysLeft?: number }, mode: "local" | "supabase", now = new Date()): string {
  return reason === "ficha_vencendo" ? expiringLabel(s.daysLeft ?? 0) : newsLabel(s.lastSessionAt, mode, now);
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
