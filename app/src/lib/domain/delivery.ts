/**
 * Estados de envio com evidência (U2). Puro: sem React e sem localStorage (a leitura e a gravação ficam em
 * src/lib/transfer-client.ts). Regra de redação: o texto descreve o que ESTE aparelho viu (o toque, a cópia,
 * o registro, a versão que voltou com o treino), nunca o que aconteceu do outro lado.
 *
 * Chaves no aparelho (todas apagadas por "Apagar dados deste aparelho"):
 *  - `sr:sent:{alunoId}`        lista antiga de treinos já enviados (compatibilidade; `usePendingWorkouts`);
 *  - `sr:sent:{alunoId}:at`     hora do último toque de envio de treinos;
 *  - `sr:sent:{alunoId}:log`    último toque por treino: `Record<id, PrepEntry>`, no máximo PREP_LOG_MAX;
 *  - `sr:sent:{alunoId}:ficha`  aparelho do personal: o ÚNICO registro de envio da ficha/dieta (FichaSendRecord),
 *                               gravado no toque em "Enviar no WhatsApp" ou "Copiar mensagem";
 *  - `sr:sent:{alunoId}:ack`    aparelho do personal: a versão que o aluno disse ter (FichaAck), vinda com os treinos;
 *  - `sr:sent:@desde`           hora em que o registro de envio começou neste aparelho (fora da cópia de segurança).
 *
 * Fundação (UX0): tipos (inclusive os estados), constantes, validação do que vem do armazenamento,
 * `addPrepEntries` e `nextAck`.
 * U2a (envio do aluno): `sessionDelivery`, `sessionDeliveryText`, `prepStatusText`, `resendNote`, `resendCounts`.
 * Ainda entram aqui: `itemDelivery`/`fichaDelivery`, `fichaDeliveryLines`, `fichaSendSituation` (U2b),
 * `sameSession` (U2d) e `fichaVersao`/eco (U2c).
 */

import { fmtDayMonth, fmtTime } from "./format";

export type PrepVia = "whatsapp" | "copy";
/** Último toque de envio de um treino neste aparelho ("Enviar no WhatsApp" ou "Copiar mensagem"). */
export interface PrepEntry {
  via: PrepVia;
  at: string;
}
/** Máximo de treinos no log de toques (`:log`); ao passar disso, saem os de `at` mais antigo. */
export const PREP_LOG_MAX = 200;
/** A linha curta "Envio iniciado · 23/11" só aparece para toques dos últimos 7 dias. */
export const RECENT_DAYS = 7;

/** Versões (os `updatedAt` de conteúdo) da ficha ativa e da dieta; null quando o item não existe ou não foi. */
export interface VersionPair {
  programAt: string | null;
  dietAt: string | null;
}
/** O registro de envio da ficha: hora e canal do toque e as versões que foram no pacote. Guarda só o último. */
export interface FichaSendRecord extends VersionPair {
  at: string;
  via: PrepVia;
}
/**
 * Eco do aluno: as versões que o aparelho dele tinha quando mandou os treinos. `treinosSentAt` é o `sentAt`
 * do pacote de treinos (relógio do aluno); `registeredAt` é quando o personal registrou (relógio do personal).
 */
export interface FichaAck {
  programAt?: string;
  dietAt?: string;
  treinosSentAt: string;
  registeredAt: string;
}

// ---- Estados (contrato da U2 §4; as funções que os calculam entram com U2a, U2b e U2c) ---------------
/** Estado do envio de um treino no aparelho do aluno (T1–T3 da U2 §3.2). Fase 2 acrescenta `recebido`. */
export type SessionDelivery = { kind: "nao_enviado" } | { kind: "iniciado"; via: PrepVia; at: string } | { kind: "iniciado_antigo" };
/** Ícone de um estado (a tela mapeia para o lucide: CircleDashed, Send, Copy, CheckCheck). */
export type DeliveryIcon = "pendente" | "whatsapp" | "copia" | "confirmado";
/** `short` = null quando a linha fechada não mostra nada (iniciado com mais de RECENT_DAYS, iniciado_antigo). */
export interface DeliveryText {
  short: string | null;
  long: string;
  icon: DeliveryIcon;
  actionLabel: string;
}
/** Situação de um item (ficha ativa ou dieta) no aparelho do personal (I1–I6 da U2 §3.3). */
export type ItemDelivery =
  | { kind: "sem_item" }
  | { kind: "confirmado"; ackAt: string }
  | { kind: "enviado"; at: string; via: PrepVia }
  | { kind: "mudou"; sentAt: string | null; studentVersion: string | null }
  | { kind: "nao_enviado" }
  | { kind: "desconhecido" };
export interface FichaDelivery {
  program: ItemDelivery;
  diet: ItemDelivery;
  /** O treino registrado depois do envio ainda veio com a versão velha (fato, não inferência). */
  staleEcho: { registeredAt: string; version: string } | null;
}

/** Categoria do envio da ficha para a medição (`ficha_link_sent.situacao`; calculada por `fichaSendSituation`, U2b). */
export type FichaSendSituation = "nunca" | "repetido" | "mudou" | "sem_info";
/** Versão que o aluno disse ter, comparada com a atual (`treinos_link_received.ficha_versao`; `fichaVersao`, U2c). */
export type FichaVersao = "atual" | "anterior" | "sem_info";

const VIAS: readonly PrepVia[] = ["whatsapp", "copy"];
const MAX_ISO = 40;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Data ISO 8601 (como `toISOString()` grava). O parser do navegador aceita "versão 2" como data: aqui não. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
/** Texto curto que é uma data ISO válida (o armazenamento pode ter vindo de uma cópia de segurança). */
export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_ISO && ISO_RE.test(v) && Number.isFinite(Date.parse(v));
}
const isVia = (v: unknown): v is PrepVia => typeof v === "string" && (VIAS as readonly string[]).includes(v);
const versionOrNull = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : isIsoDate(v) ? v : undefined);

/** Lê o log de toques; descarta entradas inválidas (nunca afirma um envio que não se consegue ler). */
export function parsePrepLog(raw: unknown): Record<string, PrepEntry> {
  if (!isObj(raw)) return {};
  const out: Record<string, PrepEntry> = {};
  for (const [id, e] of Object.entries(raw)) {
    if (id.length === 0 || id.length > 120 || !isObj(e) || !isVia(e.via) || !isIsoDate(e.at)) continue;
    out[id] = { via: e.via, at: e.at };
  }
  return out;
}

/**
 * Acrescenta (ou atualiza) o toque de cada treino e mantém no máximo `max` entradas, tirando as de `at`
 * mais antigo. Os ids recém-tocados nunca saem.
 */
export function addPrepEntries(log: Readonly<Record<string, PrepEntry>>, ids: readonly string[], entry: PrepEntry, max = PREP_LOG_MAX): Record<string, PrepEntry> {
  const next: Record<string, PrepEntry> = { ...log };
  const fresh = new Set(ids);
  for (const id of fresh) next[id] = { via: entry.via, at: entry.at };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const removable = keys.filter((k) => !fresh.has(k)).sort((a, b) => Date.parse(next[a]!.at) - Date.parse(next[b]!.at));
  for (const k of removable.slice(0, keys.length - Math.max(max, fresh.size))) delete next[k];
  return next;
}

/** Lê o registro de envio da ficha; null se faltar ou estiver malformado. */
export function parseFichaSendRecord(raw: unknown): FichaSendRecord | null {
  if (!isObj(raw) || !isIsoDate(raw.at) || !isVia(raw.via)) return null;
  const programAt = versionOrNull(raw.programAt);
  const dietAt = versionOrNull(raw.dietAt);
  if (programAt === undefined || dietAt === undefined) return null;
  return { at: raw.at, via: raw.via, programAt, dietAt };
}

/** Lê o eco do aluno; null se faltar ou estiver malformado. Versões inválidas viram ausentes. */
export function parseFichaAck(raw: unknown): FichaAck | null {
  if (!isObj(raw) || !isIsoDate(raw.treinosSentAt) || !isIsoDate(raw.registeredAt)) return null;
  const out: FichaAck = { treinosSentAt: raw.treinosSentAt, registeredAt: raw.registeredAt };
  if (isIsoDate(raw.programAt)) out.programAt = raw.programAt;
  if (isIsoDate(raw.dietAt)) out.dietAt = raw.dietAt;
  return out;
}

/**
 * O eco novo só substitui o anterior quando o pacote de treinos é mais novo (`treinosSentAt`, os dois no
 * relógio do aluno). Reabrir um link antigo nunca faz a versão "voltar atrás". Data inválida não vence.
 */
export function nextAck(prev: FichaAck | null, incoming: FichaAck): FichaAck {
  if (!prev) return incoming;
  const a = Date.parse(prev.treinosSentAt);
  const b = Date.parse(incoming.treinosSentAt);
  if (!Number.isFinite(b)) return prev;
  if (!Number.isFinite(a)) return incoming;
  return b > a ? incoming : prev;
}

// ---- U2a: estado do envio de cada treino (aparelho do aluno) ------------------------------------------
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const DAY_MS = 86_400_000;

/**
 * Estado do envio de um treino neste aparelho, nesta ordem (U2 §3.2):
 *  T1. toque no log (`:log`) → `iniciado` com canal e hora;
 *  T2. só na lista antiga (toque de uma versão anterior, sem hora nem canal) → `iniciado_antigo`;
 *  T3. nenhum dos dois → `nao_enviado`.
 * "Pendentes" (faixa do Hoje, botão do cabeçalho do Histórico) = `nao_enviado` (T4). Quem chama só pergunta com
 * `user.remoteCoach` no modo local (T5).
 */
export function sessionDelivery(input: { id: string; legacySent: ReadonlySet<string>; log: Readonly<Record<string, PrepEntry>> }): SessionDelivery {
  const e = hasOwn(input.log, input.id) ? input.log[input.id] : undefined;
  if (e) return { kind: "iniciado", via: e.via, at: e.at };
  if (input.legacySent.has(input.id)) return { kind: "iniciado_antigo" };
  return { kind: "nao_enviado" };
}

/** O toque foi nos últimos RECENT_DAYS (hora no futuro, por relógio mexido, conta como recente). */
function isRecent(at: string, now: Date): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && now.getTime() - t <= RECENT_DAYS * DAY_MS;
}

/**
 * Textos do estado de um treino (U2 §3.2; C = primeiro nome do personal; dd/mm e HH:MM no fuso do aparelho).
 * `short` é a linha da linha fechada do Histórico: sempre em `nao_enviado`; em `iniciado`, só nos últimos 7 dias;
 * nunca em `iniciado_antigo`. `long` e `actionLabel` valem sempre (linha aberta).
 * Nunca afirma o que aconteceu do outro lado: nada de "enviado para", "aberto", "chegou", "recebido", "conferido".
 */
export function sessionDeliveryText(d: SessionDelivery, coachFirst: string, now: Date = new Date()): DeliveryText {
  const resend = `Enviar de novo para ${coachFirst}`;
  if (d.kind === "nao_enviado") {
    // A tabela da U2 dizia "ainda não foi enviado para C": casa com a guarda /enviado para/ do próprio aceite.
    return { short: "Ainda não enviado", long: `Você ainda não enviou este treino para ${coachFirst}.`, icon: "pendente", actionLabel: `Enviar para ${coachFirst}` };
  }
  if (d.kind === "iniciado_antigo") {
    return { short: null, long: `O envio deste treino já foi iniciado neste celular. Se ${coachFirst} não recebeu, envie de novo.`, icon: "whatsapp", actionLabel: resend };
  }
  const day = fmtDayMonth(d.at);
  const time = fmtTime(d.at);
  const recent = isRecent(d.at, now);
  if (d.via === "copy") {
    return {
      short: recent ? `Mensagem copiada · ${day}` : null,
      long: `Mensagem copiada em ${day} às ${time}. Se você não colou na conversa com ${coachFirst}, envie de novo.`,
      icon: "copia",
      actionLabel: resend,
    };
  }
  return {
    short: recent ? `Envio iniciado · ${day}` : null,
    long: `Você tocou em Enviar no WhatsApp em ${day} às ${time}. O app não vê se a mensagem saiu: se não saiu, envie de novo.`,
    icon: "whatsapp",
    actionLabel: resend,
  };
}

/**
 * Texto do `role="status"` logo depois do toque (U2 §3.5 aluno-1 e personal-2). `otherFirst` = primeiro nome de
 * quem vai receber (o personal, no aparelho do aluno; o aluno, no aparelho do personal).
 */
export function prepStatusText(via: PrepVia, at: string, otherFirst: string, side: "aluno" | "personal"): string {
  const time = fmtTime(at);
  if (via === "copy") return `Mensagem copiada às ${time}. Cole na conversa com ${otherFirst}.`;
  return side === "aluno" ? `Envio iniciado às ${time}. Se a mensagem não saiu no WhatsApp, envie de novo.` : `Envio iniciado às ${time}. Confira na conversa com ${otherFirst} se a mensagem saiu.`;
}

/**
 * Nota do diálogo de envio de treinos, no lugar do antigo "Último envio: …". Vale o toque mais recente entre os
 * treinos mostrados; "antigo" = treino só na lista antiga (sem hora). null quando nenhum teve toque.
 * "Não duplica" é fato: o personal grava cada treino pelo id (upsert).
 */
export function resendNote(entries: readonly (PrepEntry | "antigo")[], coachFirst: string): string | null {
  let latest: PrepEntry | null = null;
  for (const e of entries) {
    if (e === "antigo" || !Number.isFinite(Date.parse(e.at))) continue;
    if (!latest || Date.parse(e.at) > Date.parse(latest.at)) latest = e;
  }
  const tail = `Enviar de novo não duplica nada no app de ${coachFirst}.`;
  if (latest) return `Envio já iniciado em ${fmtDayMonth(latest.at)} às ${fmtTime(latest.at)}. ${tail}`;
  if (entries.includes("antigo")) return `O envio já foi iniciado antes. ${tail}`;
  return null;
}

/** O que a nota de reenvio considera de cada estado: o toque com hora, "antigo" ou nada. */
export function resendEntry(d: SessionDelivery): PrepEntry | "antigo" | null {
  if (d.kind === "iniciado") return { via: d.via, at: d.at };
  return d.kind === "iniciado_antigo" ? "antigo" : null;
}

/** Medição de `treinos_link_sent`: `resend` = algum treino do link já tinha toque; `novos` = quantos não tinham. */
export function resendCounts(states: readonly SessionDelivery[]): { resend: boolean; novos: number } {
  const novos = states.filter((d) => d.kind === "nao_enviado").length;
  return { resend: novos < states.length, novos };
}
