import type { Food } from "./foods";
import type { BodyMetric, DietPlan, Exercise, Profile, Program, Session } from "./types";

/**
 * Planilhas (CSV): em export-csv.ts desde a rodada 3 (Fundação). Reexportadas aqui para nenhum importador mudar; a troca
 * dos importadores e o fim desta reexportação são do RM-10 (M-B).
 */
export { programToCsv, programsToCsv, sessionsToCsv } from "./export-csv";

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- cópia de segurança ------------------------------------------------------------
/**
 * Cópia de segurança em um arquivo só (tudo mora no aparelho: trocar de celular sem ela é perder o histórico).
 *  v1 (antigo "shape-real-backup.json"): perfil, fichas, treinos, medidas, dieta e alunos do personal.
 *  v2: + exercícios e alimentos próprios, o personal que manda a ficha por link e os treinos já enviados a ele.
 * Fotos não entram (ficariam grandes demais para um arquivo de compartilhar).
 */
export const BACKUP_FORMAT = "shape-real-copia";
export const BACKUP_VERSION = 2;

export interface BackupBundle {
  profile: Profile;
  programs?: Program[];
  sessions?: Session[];
  metrics?: BodyMetric[];
  diet?: DietPlan | null;
  /** v2: exercícios e alimentos criados por este perfil (as fichas e dietas apontam para eles). */
  customExercises?: Exercise[];
  customFoods?: Food[];
}

export interface Backup extends BackupBundle {
  format?: typeof BACKUP_FORMAT;
  /** Ausente nos arquivos v1. */
  v?: number;
  exportedAt?: string;
  /** Personal: os alunos cadastrados, cada um com fichas, treinos, medidas e dieta. */
  students?: BackupBundle[];
  /** v2, aluno que recebe a ficha por link: o personal guardado no aparelho e os exercícios/alimentos dele. */
  remoteCoach?: BackupBundle;
  /**
   * v2: chaves "sr:sent:*" de cada perfil: treinos já enviados ao personal e quando (lista, `:at`, `:log`) e,
   * no aparelho do personal, o registro de envio da ficha (`:ficha`) e a versão que o aluno disse ter (`:ack`).
   */
  sent?: Record<string, string>;
  /**
   * Rodadas do questionário apagadas ou revogadas neste aparelho (`sr:v1:qapagado:{id}`): id da rodada → data, sem
   * conteúdo. Restauradas antes dos alunos, valem também num aparelho novo (o link antigo do WhatsApp avisa que foram
   * apagadas, e uma cópia mais antiga não traz essas rodadas de volta).
   */
  apagadas?: Record<string, string>;
}

/**
 * Só estas chaves voltam para o aparelho ao restaurar (o arquivo nunca grava outra coisa no navegador).
 * `sr:sent:@desde` (início do registro de envio) não casa de propósito: restaurado num aparelho novo, ele
 * recomeça, e fichas antigas viram "sem informação" em vez de "não enviada" (o app deixa de afirmar).
 */
export const SENT_KEY_RE = /^sr:sent:[\w-]{1,80}(?::at|:log|:ficha|:ack|:decl)?$/;
/**
 * Sufixos das chaves de envio de um perfil (`sr:sent:{id}{sufixo}`), na ordem em que entram na cópia. `:decl` (rodada 3,
 * R3-3): o que a pessoa declarou sobre cada treino ("Já enviei", dispensar o lembrete); nunca é recibo.
 */
export const SENT_SUFFIXES = ["", ":at", ":log", ":ficha", ":ack", ":decl"] as const;
export type SentSuffix = (typeof SENT_SUFFIXES)[number];
/** Chave de envio de um perfil. */
export const sentKeyOf = (profileId: string, suffix: SentSuffix = "") => `sr:sent:${profileId}${suffix}`;
/** Marcador de início do registro de envio neste aparelho (fora da cópia de segurança). */
export const SENT_SINCE_KEY = "sr:sent:@desde";

/** Monta o arquivo v2 a partir do que foi lido do aparelho. */
export function buildBackup(input: Omit<Backup, "format" | "v" | "exportedAt">, now = new Date()): Backup {
  const out: Backup = { format: BACKUP_FORMAT, v: BACKUP_VERSION, exportedAt: now.toISOString(), ...input };
  if (!out.students?.length) delete out.students;
  if (!out.remoteCoach) delete out.remoteCoach;
  if (!out.sent || !Object.keys(out.sent).length) delete out.sent;
  if (!out.apagadas || !Object.keys(out.apagadas).length) delete out.apagadas;
  return out;
}

/** "shape-real-copia-2026-11-22.json" (data do aparelho). */
export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `shape-real-copia-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** Contagem que a confirmação de restaurar mostra (o personal soma as fichas e os treinos dos alunos). */
export function backupSummary(b: Backup): { programs: number; sessions: number; students: number } {
  const all = [b, ...(b.students ?? [])];
  return {
    programs: all.reduce((n, x) => n + (x.programs?.length ?? 0), 0),
    sessions: all.reduce((n, x) => n + (x.sessions?.length ?? 0), 0),
    students: b.students?.length ?? 0,
  };
}

// ---- lembretes -------------------------------------------------------------------
const DAY = 86_400_000;

/** Dias inteiros desde `iso` (0 = menos de 24 h). null sem data válida. */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/** "Cópia de segurança: há 12 dias" / "Você ainda não fez nenhuma cópia". */
export function backupStatusText(lastBackupAt: string | null, now = new Date()): string {
  const d = daysSince(lastBackupAt, now);
  if (d === null) return "Você ainda não fez nenhuma cópia";
  return `Cópia de segurança: ${d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`}`;
}

/**
 * Versão curta para o celular (a linha do lembrete cabe em 1 linha a 360 px com o "Fazer agora"):
 * "Última cópia há 12 dias" / "Nenhuma cópia ainda".
 */
export function backupStatusShort(lastBackupAt: string | null, now = new Date()): string {
  const d = daysSince(lastBackupAt, now);
  if (d === null) return "Nenhuma cópia ainda";
  return `Última cópia ${d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`}`;
}

/** Faixa para a medição de uso (nunca a data em si). */
export function backupAgeBucket(lastBackupAt: string | null, now = new Date()): "0-13" | "14-30" | "31+" | "nunca" {
  const d = daysSince(lastBackupAt, now);
  if (d === null) return "nunca";
  return d <= 13 ? "0-13" : d <= 30 ? "14-30" : "31+";
}

export const BACKUP_REMIND_DAYS = 14;

/**
 * Lembrete fora de Conta (Hoje e Alunos): só com dados que doeria perder (5 treinos ou mais, ou 1 aluno real)
 * e 14 dias ou mais sem cópia. Regra só de tempo. Quem nunca fez cópia conta os 14 dias a partir de `since` (o início
 * dos dados: a criação do perfil), não a partir de "nunca": o personal que acabou de cadastrar o 1º aluno não vê o aviso
 * no primeiro dia. Sem `since` (data desconhecida), nunca ter feito cópia já conta como atrasado.
 */
export function backupReminderDue(input: { lastBackupAt: string | null; sessions: number; realStudents: number; since?: string | null; now?: Date }): boolean {
  if (input.sessions < 5 && input.realStudents < 1) return false;
  const d = daysSince(input.lastBackupAt ?? input.since, input.now);
  return d === null || d >= BACKUP_REMIND_DAYS;
}

/**
 * Convite dispensado (instalar o app): some e volta uma única vez, `afterDays` depois da dispensa.
 * `dismissed` null = nunca dispensado.
 */
export function promptShowsAgain(dismissed: { n: number; at: string | null } | null, now = new Date(), afterDays = 14): boolean {
  if (!dismissed || dismissed.n <= 0) return true;
  if (dismissed.n >= 2) return false;
  const d = daysSince(dismissed.at, now);
  return d !== null && d >= afterDays;
}
