import type { Food } from "./foods";
import type { BodyMetric, DietPlan, Exercise, Profile, Program, Session } from "./types";
import { UNIT_LABEL, unitOf } from "./exercises";
import { TECHNIQUE_LABEL } from "./generator";
import { completedSets } from "./progression";

/**
 * CSV no formato do Excel brasileiro: separador ";", decimal com vírgula e BOM UTF-8
 * para os acentos abrirem corretamente.
 */
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false }) : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

const PROGRAM_HEAD = ["Ficha", "Dia", "Ordem", "Exercício", "Séries", "Mín", "Máx", "Unidade", "Carga (kg)", "Descanso (s)", "Técnica", "Observações"];

function programRows(program: Program): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  for (const day of program.days) {
    day.exercises.forEach((e, i) => {
      rows.push([program.name, day.title ? `${day.key} — ${day.title}` : day.key, i + 1, e.name, e.sets, e.repsMin, e.repsMax, UNIT_LABEL[unitOf(e.exerciseId, e.unit)].noun, e.loadKg ?? null, e.restSec, e.technique === "normal" ? "" : TECHNIQUE_LABEL[e.technique], e.notes ?? ""]);
    });
  }
  return rows;
}

export function programToCsv(program: Program): string {
  return toCsv([PROGRAM_HEAD, ...programRows(program)]);
}

/** Várias fichas numa planilha só (a coluna "Ficha" separa uma da outra). */
export function programsToCsv(programs: Program[]): string {
  return toCsv([PROGRAM_HEAD, ...programs.flatMap(programRows)]);
}

export function sessionsToCsv(sessions: Session[]): string {
  const rows: (string | number | null)[][] = [["Data", "Treino", "Exercício", "Série", "Carga (kg)", "Reps", "RPE", "Volume (kg)"]];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const date = new Date(s.startedAt).toLocaleDateString("pt-BR");
    const label = [s.dayKey, s.dayTitle].filter(Boolean).join(" — ") || s.programName || "Treino livre";
    for (const ex of s.exercises) {
      completedSets(ex).forEach((set, i) => {
        rows.push([date, label, ex.name, i + 1, set.loadKg ?? null, set.reps ?? null, set.rpe ?? null, (set.loadKg ?? 0) * (set.reps ?? 0)]);
      });
    }
  }
  return toCsv(rows);
}

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
export const SENT_KEY_RE = /^sr:sent:[\w-]{1,80}(?::at|:log|:ficha|:ack)?$/;
/** Sufixos das chaves de envio de um perfil (`sr:sent:{id}{sufixo}`), na ordem em que entram na cópia. */
export const SENT_SUFFIXES = ["", ":at", ":log", ":ficha", ":ack"] as const;
export type SentSuffix = (typeof SENT_SUFFIXES)[number];
/** Chave de envio de um perfil. */
export const sentKeyOf = (profileId: string, suffix: SentSuffix = "") => `sr:sent:${profileId}${suffix}`;
/** Marcador de início do registro de envio neste aparelho (fora da cópia de segurança). */
export const SENT_SINCE_KEY = "sr:sent:@desde";

// Validação à mão (sem zod): este arquivo entra no pacote de todas as telas, junto com o convite de instalar.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown) => typeof v === "string" && v.length >= 1 && v.length <= 120;
const isText = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;
const CUSTOM_ID = /^custom_[\w-]{1,80}$/;
const none = (v: unknown) => v === undefined || v === null;
const listOf = (v: unknown, ok: (x: unknown) => boolean, max = 100_000) => none(v) || (Array.isArray(v) && v.length <= max && v.every(ok));
const customOk = (x: unknown) => isObj(x) && typeof x.id === "string" && CUSTOM_ID.test(x.id) && isText(x.name);

function bundleOk(x: unknown): boolean {
  if (!isObj(x)) return false;
  const p = x.profile;
  if (!isObj(p) || !isId(p.id) || !isText(p.name) || (p.role !== "coach" && p.role !== "athlete")) return false;
  return (
    listOf(x.programs, (pr) => isObj(pr) && isId(pr.id) && Array.isArray(pr.days) && pr.days.every((d) => isObj(d) && Array.isArray(d.exercises) && d.exercises.every((e) => isObj(e) && typeof e.exerciseId === "string"))) &&
    listOf(x.sessions, (s) => isObj(s) && isId(s.id) && typeof s.startedAt === "string") &&
    listOf(x.metrics, (m) => isObj(m) && isId(m.id) && typeof m.date === "string") &&
    (none(x.diet) || (isObj(x.diet) && isId(x.diet.id))) &&
    listOf(x.customExercises, customOk) &&
    listOf(x.customFoods, customOk)
  );
}

function backupOk(x: unknown): x is Obj {
  return (
    bundleOk(x) &&
    isObj(x) &&
    (none(x.exportedAt) || isText(x.exportedAt, 40)) &&
    listOf(x.students, bundleOk, 2000) &&
    (none(x.remoteCoach) || bundleOk(x.remoteCoach)) &&
    (none(x.sent) || (isObj(x.sent) && Object.values(x.sent).every((v) => isText(v, 200_000)))) &&
    (none(x.apagadas) || isObj(x.apagadas))
  );
}

/** Teto das marcas de rodadas apagadas no arquivo (só ids e datas). */
const APAGADAS_MAX = 5000;
/** Só pares id → data legível; o resto é descartado (o arquivo nunca grava outra coisa no navegador). */
function apagadasValidas(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  return Object.fromEntries(
    Object.entries(v)
      .filter(([id, at]) => isId(id) && instante(at) !== null)
      .slice(0, APAGADAS_MAX),
  ) as Record<string, string>;
}

/**
 * Lê o arquivo da cópia (v1 ou v2). null quando não é uma cópia do Shape Real.
 * Campos vazios (null) viram ausentes e chaves estranhas em `sent` são descartadas.
 */
export function parseBackup(text: string): Backup | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!backupOk(raw)) return null;
  const b = raw as unknown as Backup & { students?: BackupBundle[] | null; remoteCoach?: BackupBundle | null; sent?: Record<string, string> | null };
  const sent = Object.fromEntries(Object.entries(b.sent ?? {}).filter(([k]) => SENT_KEY_RE.test(k)));
  const apagadas = apagadasValidas(b.apagadas);
  const out: Backup = {
    ...b,
    students: b.students ?? undefined,
    remoteCoach: b.remoteCoach ?? undefined,
    sent: Object.keys(sent).length ? sent : undefined,
    apagadas: Object.keys(apagadas).length ? apagadas : undefined,
  };
  if (!out.students) delete out.students;
  if (!out.remoteCoach) delete out.remoteCoach;
  if (!out.sent) delete out.sent;
  if (!out.apagadas) delete out.apagadas;
  return out;
}

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

/** Instante de uma data lida de um perfil ou de um arquivo (sem confiar no formato); null quando não dá para ler. */
function instante(v: unknown): number | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** A rodada de `atual` fica? Só com respostas; contra a cópia, quando é mais nova ou igual (o aparelho desempata). */
function ficaAnamneseDoAparelho(atual: Profile, daCopia: Profile): boolean {
  const local = atual.anamnese as unknown;
  if (!isObj(local)) return false;
  const copia = daCopia.anamnese as unknown;
  if (!isObj(copia)) return true;
  const tl = instante(local.answeredAt);
  const tc = instante(copia.answeredAt);
  if (tc === null) return true;
  if (tl === null) return false;
  return tl >= tc;
}

/** Liberações dos dois lados, unidas por `id`; com o mesmo `id`, a registrada por último (empate: a do aparelho). */
function unirLiberacoes(atual: unknown, daCopia: unknown): Profile["liberacoes"] {
  const porId = new Map<string, NonNullable<Profile["liberacoes"]>[number]>();
  const somar = (lista: unknown, aparelho: boolean) => {
    if (!Array.isArray(lista)) return;
    for (const l of lista) {
      if (!isObj(l) || !isId(l.id)) continue;
      const lib = l as unknown as NonNullable<Profile["liberacoes"]>[number];
      const ja = porId.get(lib.id);
      if (!ja) {
        porId.set(lib.id, lib);
        continue;
      }
      const tj = instante(ja.registradoEm) ?? -Infinity;
      const tn = instante(lib.registradoEm) ?? -Infinity;
      if (tn > tj || (tn === tj && aparelho)) porId.set(lib.id, lib);
    }
  };
  somar(daCopia, false);
  somar(atual, true);
  return porId.size ? [...porId.values()] : undefined;
}

/** Marca do aparelho (`saudeRevogadaEm`, `respostasApagadasEm`) mais nova que a da cópia: o instante; senão null. */
function marcaMaisNova(atual: unknown, daCopia: unknown): number | null {
  const ta = instante(atual);
  if (ta === null) return null;
  const tc = instante(daCopia);
  return tc === null || ta > tc ? ta : null;
}

/** A mais nova das duas marcas (ISO), para a próxima restauração continuar sabendo; undefined sem nenhuma. */
function marcaFinal(a: unknown, b: unknown): string | undefined {
  const ta = instante(a);
  const tb = instante(b);
  if (ta === null) return tb === null ? undefined : (b as string);
  return tb !== null && tb > ta ? (b as string) : (a as string);
}

const idDaRodada = (r: unknown): string | null => (isObj(r) && isId(r.id) ? (r.id as string) : null);

/**
 * Restauração de um aluno que já existe no aparelho (spec §9.2, D-32). Hoje a restauração gravava o perfil como veio:
 * uma cópia antiga apagaria respostas e liberações mais novas (e a trava de "pediu para não treinar"). Agora:
 *  - fica a `anamnese` com `answeredAt` mais novo (empate: a do aparelho), com a `anamnesePrev` e os
 *    `limitacoesDoQuestionario` dela. As limitações (`limitations`) acompanham os tokens: são o texto que eles indexam,
 *    e a ficha seguinte precisa considerar as dores da rodada que ficou;
 *  - se a rodada que fica é a do aparelho, tem saúde e a cópia não tem autorização, a autorização do aparelho fica
 *    (respostas de saúde nunca sem a autorização registrada);
 *  - `liberacoes` unidas por `id`;
 *  - revogação e "Apagar respostas" feitos neste aparelho depois da cópia (marcas `saudeRevogadaEm` e
 *    `respostasApagadasEm` mais novas que as da cópia, ou `apagadas`: ids das rodadas da cópia com `sr:v1:qapagado`
 *    gravado aqui depois dela) não são desfeitos: da cópia não voltam as rodadas nem as liberações de antes do ato; o
 *    peso, a altura e as limitações ficam como estão no aparelho; com a revogação, a autorização também;
 *  - o resto, como hoje: vale o que veio na cópia.
 * A anamnese que fica não é confiada aqui: quem lê usa `readAnamnese` (versão mais nova ou dado danificado viram trava).
 * `atual` null = aluno novo neste aparelho: devolve a cópia.
 */
export function mesclarRestauracao(atual: Profile | null, daCopia: Profile, apagadas: ReadonlyMap<string, string> = new Map()): Profile {
  if (!atual) return daCopia;
  const revogada = marcaMaisNova(atual.saudeRevogadaEm, daCopia.saudeRevogadaEm);
  let apagada = marcaMaisNova(atual.respostasApagadasEm, daCopia.respostasApagadasEm);
  const idsApagados = new Set<string>();
  for (const r of [daCopia.anamnese, daCopia.anamnesePrev] as unknown[]) {
    const id = idDaRodada(r);
    const t = id ? instante(apagadas.get(id)) : null;
    if (id && t !== null) {
      idsApagados.add(id);
      apagada = Math.max(apagada ?? t, t);
    }
  }
  const corte = Math.max(revogada ?? -Infinity, apagada ?? -Infinity);
  const temCorte = corte > -Infinity;
  /** Da cópia, só o que é de depois do ato (data ilegível conta como de antes). */
  const depoisDoCorte = (iso: unknown) => {
    const t = instante(iso);
    return t !== null && t >= corte;
  };
  const rodadaVale = (r: unknown) => !temCorte || (isObj(r) && !idsApagados.has(idDaRodada(r) ?? "") && depoisDoCorte(r.answeredAt));

  const copia: Profile = { ...daCopia };
  if (temCorte) {
    if (copia.anamnese !== undefined && !rodadaVale(copia.anamnese)) delete copia.anamnese;
    if (copia.anamnesePrev !== undefined && !rodadaVale(copia.anamnesePrev)) delete copia.anamnesePrev;
    if (Array.isArray(copia.liberacoes)) copia.liberacoes = copia.liberacoes.filter((l) => isObj(l) && depoisDoCorte(l.registradoEm));
  }

  const out: Profile = { ...copia };
  if (ficaAnamneseDoAparelho(atual, copia)) {
    out.anamnese = atual.anamnese;
    out.anamnesePrev = atual.anamnesePrev;
    out.limitacoesDoQuestionario = atual.limitacoesDoQuestionario;
    out.limitations = atual.limitations;
    const comSaude = isObj(atual.anamnese) && !(atual.anamnese as { healthOmitted?: unknown }).healthOmitted;
    if (comSaude && atual.consentHealthAt && !copia.consentHealthAt) {
      out.consentHealthAt = atual.consentHealthAt;
      out.consentSource = atual.consentSource;
    }
  }
  if (temCorte) {
    out.weightKg = atual.weightKg;
    out.heightCm = atual.heightCm;
    out.limitations = atual.limitations;
    out.limitacoesDoQuestionario = atual.limitacoesDoQuestionario;
  }
  if (revogada !== null) {
    out.consentHealthAt = atual.consentHealthAt;
    out.consentSource = atual.consentSource;
  }
  out.saudeRevogadaEm = marcaFinal(atual.saudeRevogadaEm, daCopia.saudeRevogadaEm);
  out.respostasApagadasEm = marcaFinal(atual.respostasApagadasEm, daCopia.respostasApagadasEm);
  out.liberacoes = unirLiberacoes(atual.liberacoes, copia.liberacoes);
  for (const k of ["anamnese", "anamnesePrev", "limitacoesDoQuestionario", "limitations", "liberacoes", "consentHealthAt", "consentSource", "weightKg", "heightCm", "saudeRevogadaEm", "respostasApagadasEm"] as const) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}
