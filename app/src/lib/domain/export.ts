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

// Validação à mão (sem zod): este arquivo entra no pacote de todas as telas, junto com o convite de instalar.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown) => typeof v === "string" && v.length >= 1 && v.length <= 120;
const isText = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;
const CUSTOM_ID = /^custom_[\w-]{1,80}$/;
const none = (v: unknown) => v === undefined || v === null;
const listOf = (v: unknown, ok: (x: unknown) => boolean, max = 100_000) => none(v) || (Array.isArray(v) && v.length <= max && v.every(ok));
const customOk = (x: unknown) => isObj(x) && typeof x.id === "string" && CUSTOM_ID.test(x.id) && isText(x.name);
/**
 * Treino da cópia (R3-6 A): os exercícios precisam ser uma lista de objetos com `exerciseId` e `sets` em lista (uma
 * cópia com `exercises = "x"` quebraria o histórico depois de gravada). Exercício próprio sem definição na cópia NÃO
 * recusa: dá para apagar um exercício próprio que uma ficha ainda usa, e cópias legítimas têm essa referência.
 */
const sessionOk = (s: unknown) =>
  isObj(s) && isId(s.id) && typeof s.startedAt === "string" && Array.isArray(s.exercises) && s.exercises.every((e) => isObj(e) && typeof e.exerciseId === "string" && Array.isArray(e.sets));

function bundleOk(x: unknown): boolean {
  if (!isObj(x)) return false;
  const p = x.profile;
  if (!isObj(p) || !isId(p.id) || !isText(p.name) || (p.role !== "coach" && p.role !== "athlete")) return false;
  return (
    listOf(x.programs, (pr) => isObj(pr) && isId(pr.id) && Array.isArray(pr.days) && pr.days.every((d) => isObj(d) && Array.isArray(d.exercises) && d.exercises.every((e) => isObj(e) && typeof e.exerciseId === "string"))) &&
    listOf(x.sessions, sessionOk) &&
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
    (none(x.v) || (typeof x.v === "number" && Number.isInteger(x.v) && x.v >= 1)) &&
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

/** Por que a cópia não pode ser restaurada (R3-6 A): não é uma cópia do app, ou é de uma versão mais nova dele. */
export type ProblemaDaCopia = "invalido" | "versao_nova";
export const TEXTO_COPIA_INVALIDA = "Esse arquivo não é uma cópia do Shape Real.";
export const TEXTO_COPIA_VERSAO_NOVA = "Esta cópia é de uma versão mais nova do app. Atualize e tente de novo.";
export const TEXTO_PROBLEMA_DA_COPIA: Record<ProblemaDaCopia, string> = { invalido: TEXTO_COPIA_INVALIDA, versao_nova: TEXTO_COPIA_VERSAO_NOVA };

/**
 * Cópia de uma versão mais nova do app: `v` maior que BACKUP_VERSION, ou `format` presente e diferente do deste app.
 * Conferido antes da estrutura (uma versão nova pode ter outro formato: o texto certo é "atualize", não "não é cópia").
 */
export function copiaDeVersaoNova(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  if (!none(raw.format) && raw.format !== BACKUP_FORMAT) return true;
  return typeof raw.v === "number" && raw.v > BACKUP_VERSION;
}

/** A restauração recusou a cópia antes de qualquer gravação (`restoreBackup` com uma cópia que não passou na leitura). */
export class CopiaRecusada extends Error {
  constructor(public readonly problema: ProblemaDaCopia) {
    super(TEXTO_PROBLEMA_DA_COPIA[problema]);
    this.name = "CopiaRecusada";
  }
}

/**
 * Lê o arquivo da cópia (v1 ou v2) e diz por que não serve, quando não serve. Campos vazios (null) viram ausentes e
 * chaves estranhas em `sent` são descartadas. Toda a validação acontece aqui, antes da primeira gravação.
 */
export function lerCopia(text: string): { copia: Backup } | { problema: ProblemaDaCopia } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problema: "invalido" };
  }
  if (copiaDeVersaoNova(raw)) return { problema: "versao_nova" };
  if (!backupOk(raw)) return { problema: "invalido" };
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
  return { copia: out };
}

/** Lê o arquivo da cópia (v1 ou v2). null quando não serve (`lerCopia` diz o motivo). */
export function parseBackup(text: string): Backup | null {
  const r = lerCopia(text);
  return "copia" in r ? r.copia : null;
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
 * `atual` null = aluno que não está neste aparelho (novo, ou removido por "Remover aluno"): vem a cópia, com o mesmo corte
 * das rodadas apagadas aqui depois dela (R3-13, `semRodadasApagadas`).
 */
export function mesclarRestauracao(atual: Profile | null, daCopia: Profile, apagadas: ReadonlyMap<string, string> = new Map()): Profile {
  if (!atual) return semRodadasApagadas(daCopia, apagadas);
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

/**
 * R3-13: aluno que não está no aparelho (ex.: "Remover aluno" depois da cópia, que grava `sr:v1:qapagado` das rodadas
 * dele). O mesmo corte do caso com perfil: saem as rodadas (`anamnese`, `anamnesePrev`) com marca de apagado neste
 * aparelho depois da cópia (`apagadas`) ou respondidas antes da marca mais nova, e as liberações registradas antes dela.
 * O resto do aluno (cadastro, fichas, treinos, medidas) volta: restaurar é um ato explícito. Sem marca, a cópia como
 * veio (aparelho limpo: o limite do modo local, explicado na Privacidade).
 */
function semRodadasApagadas(daCopia: Profile, apagadas: ReadonlyMap<string, string>): Profile {
  const ids = new Set<string>();
  let corte = -Infinity;
  for (const r of [daCopia.anamnese, daCopia.anamnesePrev] as unknown[]) {
    const id = idDaRodada(r);
    const t = id ? instante(apagadas.get(id)) : null;
    if (id && t !== null) {
      ids.add(id);
      corte = Math.max(corte, t);
    }
  }
  if (!ids.size) return daCopia;
  const vale = (r: unknown) => isObj(r) && !ids.has(idDaRodada(r) ?? "") && (instante(r.answeredAt) ?? -Infinity) >= corte;
  const out: Profile = { ...daCopia };
  if (out.anamnese !== undefined && !vale(out.anamnese)) delete out.anamnese;
  if (out.anamnesePrev !== undefined && !vale(out.anamnesePrev)) delete out.anamnesePrev;
  if (Array.isArray(out.liberacoes)) {
    const ficam = out.liberacoes.filter((l) => isObj(l) && (instante(l.registradoEm) ?? -Infinity) >= corte);
    if (ficam.length) out.liberacoes = ficam;
    else delete out.liberacoes;
  }
  return out;
}

/** Rodadas da cópia que não voltaram por terem sido apagadas aqui depois dela: a data mais nova; null se todas voltaram. */
export function rodadasQueNaoVoltaram(daCopia: Profile, restaurado: Profile, apagadas: ReadonlyMap<string, string>): string | null {
  const ficaram = new Set([restaurado.anamnese, restaurado.anamnesePrev].map(idDaRodada).filter((x): x is string => x !== null));
  let em: { iso: string; t: number } | null = null;
  for (const r of [daCopia.anamnese, daCopia.anamnesePrev] as unknown[]) {
    const id = idDaRodada(r);
    const iso = id ? apagadas.get(id) : undefined;
    const t = instante(iso);
    if (!id || ficaram.has(id) || t === null || !iso) continue;
    if (!em || t > em.t) em = { iso, t };
  }
  return em?.iso ?? null;
}

/** "22/11" no fuso do aparelho (sem importar format.ts: este arquivo entra em todas as telas, e aquele traz o catálogo). */
function diaMes(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Aviso depois de restaurar (R3-13): uma linha por aluno cujas respostas de saúde não voltaram. */
export function textoRodadasOmitidas(o: { nome: string; em: string }): string {
  return `As respostas de saúde de ${o.nome.trim().split(/\s+/)[0] || o.nome} apagadas neste aparelho em ${diaMes(o.em)} não voltaram com a cópia.`;
}

// ---- plano de restauração (R3-6 A.4) ---------------------------------------------------------------------------------
/**
 * O que o aparelho tem, lido uma vez antes de restaurar: fichas, treinos e medidas por id (de qualquer perfil) e a dieta
 * de cada perfil (uma por dono), e os ids dos perfis que já existem aqui.
 */
export interface AparelhoParaRestaurar {
  fichas: ReadonlyMap<string, Program>;
  dietas: ReadonlyMap<string, DietPlan>;
  treinos: ReadonlyMap<string, Session>;
  medidas: ReadonlyMap<string, BodyMetric>;
  perfis: ReadonlySet<string>;
}

/** O que acontece com um registro da cópia: entra, fica o do aparelho, ou já está igual (nada a gravar). */
export type DecisaoDaCopia = "entra" | "fica" | "igual";

export interface PlanoRestauracao {
  /** Por registro da cópia (`chaveDoRegistro`). Registro sem decisão (exercícios e alimentos próprios) entra. */
  decisoes: ReadonlyMap<string, DecisaoDaCopia>;
  /** Registros deste aparelho mais novos que os da cópia (ficha e dieta pelo `updatedAt`; treino diferente): ficam. */
  mantidos: number;
  /** Registros da cópia com id que já é de outro perfil deste aparelho: ficam com ele (nada muda de dono). */
  deOutroPerfil: number;
  entram: number;
  iguais: number;
  /** Alunos da cópia (do personal) que já estão neste aparelho: o cadastro deles volta ao da cópia. */
  alunosQueJaEstao: number;
  /** O perfil principal da cópia já está neste aparelho (o cadastro dele volta ao da cópia). */
  perfilJaEsta: boolean;
  /** Dono → id da ficha ativa neste aparelho: a escolha da ficha ativa fica a do aparelho. */
  ativas: ReadonlyMap<string, string>;
}

export type TipoDeRegistro = "ficha" | "dieta" | "treino" | "medida";
/** Chave de um registro no plano. A dieta é uma por dono: a chave é o id do dono. */
export const chaveDoRegistro = (tipo: TipoDeRegistro, id: string) => `${tipo}:${id}`;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
/** Forma canônica (chaves em ordem, sem undefined/null em objeto), para comparar conteúdo sem depender da ordem. */
function canonica(v: unknown): Json | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map((x) => canonica(x) ?? null);
  if (typeof v === "object") {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(v as object).sort()) {
      const c = canonica((v as Record<string, unknown>)[k]);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? v : undefined;
}
/** Mesmo conteúdo, ignorando as chaves indicadas (dono, `active`). */
function mesmoConteudo(a: object, b: object, ignorar: readonly string[]): boolean {
  const sem = (o: object) => JSON.stringify(canonica(Object.fromEntries(Object.entries(o).filter(([k]) => !ignorar.includes(k)))));
  return sem(a) === sem(b);
}

/**
 * Qual é mais novo pelo `updatedAt` (data da edição do conteúdo; `keepUpdatedAt`, DECISIONS de 23/11). Data ilegível
 * nunca vence uma legível: a cópia sem data não troca um registro com data. Relógio de um dos aparelhos mexido para trás
 * faz a edição parecer mais velha: não há como saber (limitação registrada).
 */
function maisNovo(aparelho: unknown, copia: unknown): "aparelho" | "copia" | "empate" {
  const ta = instante(aparelho);
  const tc = instante(copia);
  if (ta !== null && tc !== null) return ta > tc ? "aparelho" : ta < tc ? "copia" : "empate";
  if (ta !== null) return "aparelho";
  if (tc !== null) return "copia";
  return "empate";
}

/**
 * Plano de restauração (R3-6 A.4), puro. Para cada registro da cópia:
 *  - ficha e dieta: a do aparelho com `updatedAt` mais novo fica; a da cópia mais nova entra; empate com o mesmo
 *    conteúdo é "igual" (com conteúdo diferente, entra, como antes);
 *  - treino presente nos dois: igual, ou fica o do aparelho (foi mudado aqui depois da cópia);
 *  - medida presente nos dois e diferente: entra (o resto da cópia entra, como antes);
 *  - id que já é de OUTRO perfil deste aparelho (ex.: a cópia de um aluno restaurada no aparelho do personal, cuja
 *    ficha tem o mesmo id da ficha do aluno no painel): fica com o dono daqui;
 *  - o resto entra.
 * O cadastro de quem já está aqui volta ao da cópia (`mesclarRestauracao`). A ficha ativa de cada perfil fica a do
 * aparelho quando ele tem uma (`ativas`). `mesmoTreino`: quem chama passa `sameSession` (delivery.ts, fora deste arquivo
 * para não pesar nas telas); sem ele, compara o conteúdo canônico. Restaurar o mesmo arquivo de novo dá tudo "igual".
 */
export function planoRestauracao(backup: Backup, aparelho: AparelhoParaRestaurar, mesmoTreino: (a: Session, b: Session) => boolean = (a, b) => mesmoConteudo(a, b, ["userId"])): PlanoRestauracao {
  const decisoes = new Map<string, DecisaoDaCopia>();
  let mantidos = 0;
  let deOutroPerfil = 0;
  let entram = 0;
  let iguais = 0;
  const decidir = (chave: string, d: DecisaoDaCopia | "outro") => {
    if (d === "outro") {
      deOutroPerfil += 1;
      decisoes.set(chave, "fica");
      return;
    }
    if (d === "fica") mantidos += 1;
    else if (d === "entra") entram += 1;
    else iguais += 1;
    decisoes.set(chave, d);
  };
  const porData = (dev: { updatedAt?: string }, copia: { updatedAt?: string }, igual: boolean): DecisaoDaCopia => {
    const quem = maisNovo(dev.updatedAt, copia.updatedAt);
    return quem === "aparelho" ? "fica" : quem === "copia" ? "entra" : igual ? "igual" : "entra";
  };

  const ativas = new Map<string, string>();
  for (const f of aparelho.fichas.values()) if (f.active) ativas.set(f.ownerId, f.id);

  const bundles = [backup, ...(backup.students ?? [])];
  for (const b of bundles) {
    const dono = b.profile.id;
    for (const p of b.programs ?? []) {
      const dev = aparelho.fichas.get(p.id);
      const chave = chaveDoRegistro("ficha", p.id);
      if (!dev) decidir(chave, "entra");
      else if (dev.ownerId !== dono) decidir(chave, "outro");
      else decidir(chave, porData(dev, p, mesmoConteudo(dev, { ...p, ownerId: dono }, ["active"])));
    }
    if (b.diet) {
      const dev = aparelho.dietas.get(dono);
      const chave = chaveDoRegistro("dieta", dono);
      if (!dev) decidir(chave, "entra");
      else decidir(chave, porData(dev, b.diet, mesmoConteudo(dev, { ...b.diet, ownerId: dono }, [])));
    }
    for (const s of b.sessions ?? []) {
      const dev = aparelho.treinos.get(s.id);
      const chave = chaveDoRegistro("treino", s.id);
      if (!dev) decidir(chave, "entra");
      else if (dev.userId !== dono) decidir(chave, "outro");
      else decidir(chave, mesmoTreino(dev, { ...s, userId: dono }) ? "igual" : "fica");
    }
    for (const m of b.metrics ?? []) {
      const dev = aparelho.medidas.get(m.id);
      const chave = chaveDoRegistro("medida", m.id);
      if (!dev) decidir(chave, "entra");
      else if (dev.userId !== dono) decidir(chave, "outro");
      else decidir(chave, mesmoConteudo(dev, { ...m, userId: dono }, ["userId"]) ? "igual" : "entra");
    }
  }
  return {
    decisoes,
    mantidos,
    deOutroPerfil,
    entram,
    iguais,
    alunosQueJaEstao: (backup.students ?? []).filter((s) => aparelho.perfis.has(s.profile.id)).length,
    perfilJaEsta: aparelho.perfis.has(backup.profile.id),
    ativas,
  };
}

const registros = (n: number) => (n === 1 ? "1 registro" : `${n} registros`);

/**
 * Texto do diálogo de restaurar, antes de confirmar (substitui "Os mesmos registros que já estiverem neste aparelho são
 * substituídos"): "3 registros deste aparelho são mais novos que a cópia e ficam como estão; 12 entram."
 */
export function textoDoPlano(p: Pick<PlanoRestauracao, "mantidos" | "deOutroPerfil" | "entram" | "iguais" | "alunosQueJaEstao" | "perfilJaEsta">): string[] {
  const linhas: string[] = [];
  const entram = p.entram === 0 ? "nada novo entra" : `${p.entram} ${p.entram === 1 ? "entra" : "entram"}`;
  if (p.mantidos > 0) linhas.push(`${registros(p.mantidos)} deste aparelho ${p.mantidos === 1 ? "é mais novo" : "são mais novos"} que a cópia e ${p.mantidos === 1 ? "fica como está" : "ficam como estão"}; ${entram}.`);
  else if (p.entram > 0) linhas.push(`Nenhum registro deste aparelho é mais novo que a cópia; ${entram}.`);
  else linhas.push("Nada novo para entrar.");
  if (p.iguais > 0) linhas[0] = `${linhas[0]} ${registros(p.iguais)} já ${p.iguais === 1 ? "está igual" : "estão iguais"}.`;
  if (p.deOutroPerfil > 0) linhas.push(`${registros(p.deOutroPerfil)} da cópia já ${p.deOutroPerfil === 1 ? "pertence" : "pertencem"} a outro perfil deste aparelho e ${p.deOutroPerfil === 1 ? "fica" : "ficam"} com ele.`);
  if (p.alunosQueJaEstao > 0) linhas.push("O cadastro dos alunos que já estão aqui volta ao da cópia.");
  else if (p.perfilJaEsta) linhas.push("O seu cadastro volta ao da cópia.");
  return linhas;
}
