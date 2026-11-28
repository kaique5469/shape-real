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
 *  - `sr:sent:{alunoId}:decl`   aparelho do aluno (rodada 3, R3-3): o que a PESSOA declarou por treino ("Já enviei",
 *                               dispensar o lembrete): `Record<id, DeclaracaoEnvio>`. Declaração, nunca recibo;
 *  - `sr:sent:@desde`           hora em que o registro de envio começou neste aparelho (fora da cópia de segurança).
 *
 * Fundação (UX0): tipos (inclusive os estados), constantes, validação do que vem do armazenamento,
 * `addPrepEntries` e `nextAck`.
 * U2a (envio do aluno): `sessionDelivery`, `sessionDeliveryText`, `prepStatusText`, `resendNote`, `resendCounts`.
 * U2b (envio da ficha, aparelho do personal): `fichaDelivery` (I1, I3–I6), `fichaDeliveryLines`, `fichaSendSituation`.
 * U2d (/receber): `sameSession`, `receivePreview`, `receiveResult`, `seriesText`.
 * U2c (eco da versão): `ack` em `fichaDelivery` (I2, I4 com a versão do aluno, `staleEcho`), `fichaVersao`.
 */

import { fmtDayMonth, fmtTime } from "./format";
import type { Session } from "./types";

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
/**
 * Estado do envio de um treino no aparelho do aluno (T1–T3 da U2 §3.2; rodada 3, R3-3). Os três estados da R3-3:
 *  - "para enviar" = `nao_enviado` (nenhum toque);
 *  - "preparado sem confirmação" = `iniciado` (copiado ou WhatsApp aberto, com canal e hora) ou `iniciado_antigo`
 *    (toque de uma versão anterior, sem canal nem hora);
 *  - "enviado (declarado)" = `declarado`: a pessoa tocou em "Já enviei" (`at`) depois do último toque (`prep`).
 * Nenhum deles diz que a mensagem chegou: o app não vê a conversa. Fase 2 (nuvem) acrescentaria `recebido`.
 */
export type SessionDelivery =
  | { kind: "nao_enviado" }
  | { kind: "iniciado"; via: PrepVia; at: string }
  | { kind: "iniciado_antigo" }
  | { kind: "declarado"; at: string; prep: PrepEntry | null };

/**
 * O que a pessoa declarou sobre um treino (`:decl`): `enviei` = toque em "Já enviei"; `dispensei` = dispensou o lembrete
 * "Você copiou…" do Hoje. Dispensar nunca vira confirmação. Cada um vale para os toques de envio de antes dele: um
 * toque novo (copiar de novo) depois da declaração volta a ser "preparado".
 */
export interface DeclaracaoEnvio {
  enviei?: string;
  dispensei?: string;
}
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
  /**
   * Um treino registrado depois do envio veio com eco, mas sem a versão do item da manchete (o aluno ajustou esse
   * item no celular dele, ou não abriu o link). Só aparece quando vale `true`; com ele, a promessa "A confirmação
   * aparece quando … mandar o próximo treino" sai (já veio um treino, e ele não confirmou).
   */
  headMissingFromEcho?: true;
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

/** Lê as declarações (`:decl`); descarta entradas e datas inválidas (nunca afirma uma declaração ilegível). */
export function parseDeclaracoes(raw: unknown): Record<string, DeclaracaoEnvio> {
  if (!isObj(raw)) return {};
  const out: Record<string, DeclaracaoEnvio> = {};
  for (const [id, e] of Object.entries(raw)) {
    if (id.length === 0 || id.length > 120 || !isObj(e)) continue;
    const d: DeclaracaoEnvio = {};
    if (isIsoDate(e.enviei)) d.enviei = e.enviei;
    if (isIsoDate(e.dispensei)) d.dispensei = e.dispensei;
    if (d.enviei || d.dispensei) out[id] = d;
  }
  return out;
}

const ultimaDeclaracao = (d: DeclaracaoEnvio) => Math.max(d.enviei ? Date.parse(d.enviei) : -Infinity, d.dispensei ? Date.parse(d.dispensei) : -Infinity);

/**
 * Grava a declaração (`campo`) de cada treino com a hora `at` e mantém no máximo `max` treinos, tirando os de declaração
 * mais antiga. Os ids recém-declarados nunca saem. Declarar "Já enviei" não apaga um "dispensei" anterior (e vice-versa).
 */
export function addDeclaracoes(decl: Readonly<Record<string, DeclaracaoEnvio>>, ids: readonly string[], campo: keyof DeclaracaoEnvio, at: string, max = PREP_LOG_MAX): Record<string, DeclaracaoEnvio> {
  const next: Record<string, DeclaracaoEnvio> = { ...decl };
  const fresh = new Set(ids);
  for (const id of fresh) next[id] = { ...next[id], [campo]: at };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const removable = keys.filter((k) => !fresh.has(k)).sort((a, b) => ultimaDeclaracao(next[a]!) - ultimaDeclaracao(next[b]!));
  for (const k of removable.slice(0, keys.length - Math.max(max, fresh.size))) delete next[k];
  return next;
}

/** A declaração vale para o toque? Sem toque com hora, vale; com toque, só se a declaração for igual ou mais nova. */
function declaracaoVale(quando: string | undefined, prep: PrepEntry | undefined): boolean {
  if (!quando) return false;
  if (!prep) return true;
  const a = Date.parse(quando);
  const b = Date.parse(prep.at);
  return !Number.isFinite(b) || a >= b;
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

// ---- restauração das chaves de envio (rodada 3, correção da revisão) ---------------------------------------
/** Teto da lista antiga `sr:sent:{id}` (o mesmo de `markSessionsSent`). */
export const SENT_LIST_MAX = 500;
const SUFIXO_RE = /:(at|log|ficha|ack|decl)$/;
const lerJson = (s: string | null): unknown => {
  if (s === null) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
};
const quando = (iso: string | undefined) => (iso && isIsoDate(iso) ? Date.parse(iso) : -Infinity);
/** Mantém as `max` entradas de data mais nova (o mesmo corte de `addPrepEntries` e `addDeclaracoes`). */
function cortar<T>(rec: Record<string, T>, data: (v: T) => number, max: number): Record<string, T> {
  const ids = Object.keys(rec);
  if (ids.length <= max) return rec;
  const ficam = new Set(ids.sort((a, b) => data(rec[b]!) - data(rec[a]!)).slice(0, max));
  return Object.fromEntries(Object.entries(rec).filter(([id]) => ficam.has(id)));
}

/**
 * Valor a gravar numa chave de envio (`sr:sent:{id}{sufixo}`) ao restaurar uma cópia: junta o que o aparelho tem
 * (`atual`) com o que veio no arquivo (`daCopia`), sem nunca desfazer um registro mais novo do aparelho (restaurar uma
 * cópia antiga no mesmo aparelho não pode voltar o treino a "para enviar" nem a ficha a "mudou depois do envio"):
 *  - lista antiga: a união dos ids (teto SENT_LIST_MAX, saem os mais antigos da cópia);
 *  - `:at`: a hora mais nova;
 *  - `:log`: por treino, o toque mais novo; `:decl`: por treino e por campo, a data mais nova (teto PREP_LOG_MAX);
 *  - `:ficha`: o registro de envio com `at` mais novo; `:ack`: `nextAck` (o eco nunca volta atrás).
 * Sem valor no aparelho, o da cópia como veio (aparelho limpo: como antes). Lado ilegível = o outro lado.
 */
export function mesclarChaveDeEnvio(chave: string, atual: string | null, daCopia: string): string {
  if (atual === null || atual === daCopia) return daCopia;
  const a = lerJson(atual);
  const c = lerJson(daCopia);
  switch (SUFIXO_RE.exec(chave)?.[1]) {
    case "at":
      return quando(daCopia) > quando(atual) ? daCopia : atual;
    case "log": {
      const out = parsePrepLog(a);
      for (const [id, e] of Object.entries(parsePrepLog(c))) if (!hasOwn(out, id) || Date.parse(e.at) > Date.parse(out[id]!.at)) out[id] = e;
      return JSON.stringify(cortar(out, (e) => Date.parse(e.at), PREP_LOG_MAX));
    }
    case "decl": {
      const out = parseDeclaracoes(a);
      for (const [id, d] of Object.entries(parseDeclaracoes(c))) {
        const ja: DeclaracaoEnvio = { ...out[id] };
        for (const campo of ["enviei", "dispensei"] as const) if (d[campo] && quando(d[campo]) > quando(ja[campo])) ja[campo] = d[campo];
        out[id] = ja;
      }
      return JSON.stringify(cortar(out, ultimaDeclaracao, PREP_LOG_MAX));
    }
    case "ficha": {
      const ra = parseFichaSendRecord(a);
      const rc = parseFichaSendRecord(c);
      if (!ra) return daCopia;
      return rc && Date.parse(rc.at) > Date.parse(ra.at) ? daCopia : atual;
    }
    case "ack": {
      const ka = parseFichaAck(a);
      const kc = parseFichaAck(c);
      if (!ka) return daCopia;
      return kc && nextAck(ka, kc) === kc ? daCopia : atual;
    }
    default: {
      const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
      const la = lista(a);
      const lc = lista(c);
      if (!la) return daCopia;
      if (!lc) return atual;
      return JSON.stringify([...new Set([...lc, ...la])].slice(-SENT_LIST_MAX));
    }
  }
}

// ---- U2a: estado do envio de cada treino (aparelho do aluno) ------------------------------------------
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const DAY_MS = 86_400_000;

/**
 * Estado do envio de um treino neste aparelho, nesta ordem (U2 §3.2):
 *  T1. toque no log (`:log`) → `iniciado` com canal e hora;
 *  T2. só na lista antiga (toque de uma versão anterior, sem hora nem canal) → `iniciado_antigo`;
 *  T3. nenhum dos dois → `nao_enviado`.
 * "Pendentes" (faixa forte do Hoje, botão do cabeçalho do Histórico) = `nao_enviado` (T4). R3-3: o treino copiado
 * não some, passa à linha discreta do Hoje ("Você copiou…", `lembreteDeCopia`) até "Já enviei" (`declarado`) ou dispensar
 * (`DeclaracaoEnvio`); o Histórico mostra o estado de cada um. Quem chama só pergunta com `user.remoteCoach` no modo
 * local (T5).
 */
export function sessionDelivery(input: { id: string; legacySent: ReadonlySet<string>; log: Readonly<Record<string, PrepEntry>>; decl?: Readonly<Record<string, DeclaracaoEnvio>> }): SessionDelivery {
  const e = hasOwn(input.log, input.id) ? input.log[input.id] : undefined;
  const d = input.decl && hasOwn(input.decl, input.id) ? input.decl[input.id] : undefined;
  // R3-3: "Já enviei" depois do último toque (ou sem toque) → declarado. Um toque mais novo volta a "preparado".
  if (d?.enviei && declaracaoVale(d.enviei, e)) return { kind: "declarado", at: d.enviei, prep: e ? { via: e.via, at: e.at } : null };
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
  if (d.kind === "declarado") {
    // Declaração da pessoa, rotulada assim: nunca "recebido" nem "enviado para".
    const day = fmtDayMonth(d.at);
    return {
      short: isRecent(d.at, now) ? `Você marcou: já enviei · ${day}` : null,
      long: `Você marcou este treino como enviado em ${day} às ${fmtTime(d.at)}. O app não vê a conversa: se ${coachFirst} não recebeu, envie de novo.`,
      icon: "whatsapp",
      actionLabel: resend,
    };
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
  if (d.kind === "declarado") return d.prep ?? "antigo";
  return d.kind === "iniciado_antigo" ? "antigo" : null;
}

// ---- R3-3: pendência honesta no aparelho do aluno ---------------------------------------------------------------------
/** O treino ainda está "para enviar" (nenhum toque nem declaração): o banner forte do Hoje e o botão do Histórico. */
export const paraEnviar = (d: SessionDelivery) => d.kind === "nao_enviado";

/**
 * Lembrete discreto do Hoje: só treinos COPIADOS, sem "Já enviei" e sem dispensa depois do toque. "Envio iniciado"
 * (WhatsApp aberto) não cobra no Hoje (o Histórico mostra o estado). null quando não há o que lembrar.
 */
export function lembreteDeCopia(preparados: readonly { id: string; via: PrepVia | "share"; at: string }[], decl: Readonly<Record<string, DeclaracaoEnvio>> = {}): { ids: string[]; texto: string } | null {
  const ids = preparados
    .filter((p) => p.via === "copy")
    .filter((p) => {
      const d = hasOwn(decl, p.id) ? decl[p.id] : undefined;
      return !declaracaoVale(d?.enviei, { via: "copy", at: p.at }) && !declaracaoVale(d?.dispensei, { via: "copy", at: p.at });
    })
    .map((p) => p.id);
  if (!ids.length) return null;
  return { ids, texto: `Você copiou ${ids.length === 1 ? "1 treino" : `${ids.length} treinos`}. Já colou na conversa?` };
}

/**
 * As duas listas da pendência no aparelho do aluno (R3-3), sobre o que foi lido do aparelho:
 *  - `toSend`: "para enviar" (nenhum toque nem declaração);
 *  - `prepared`: "preparado sem confirmação" com canal e hora, sem o lembrete dispensado depois do toque.
 * Declarado ("Já enviei") e toque antigo (sem canal nem hora) não entram em nenhuma das duas.
 */
export function pendenciaDeEnvio<S extends { id: string }>(
  sessions: readonly S[],
  input: { legacySent: ReadonlySet<string>; log: Readonly<Record<string, PrepEntry>>; decl: Readonly<Record<string, DeclaracaoEnvio>> },
): { toSend: S[]; prepared: { session: S; via: PrepVia; at: string }[] } {
  const toSend: S[] = [];
  const prepared: { session: S; via: PrepVia; at: string }[] = [];
  for (const s of sessions) {
    const d = sessionDelivery({ id: s.id, ...input });
    if (d.kind === "nao_enviado") toSend.push(s);
    else if (d.kind === "iniciado" && !dispensado(s.id, input.log, input.decl)) prepared.push({ session: s, via: d.via, at: d.at });
  }
  return { toSend, prepared };
}

/** Dispensado depois do último toque: o lembrete do Hoje some (o estado do treino continua "preparado"). */
export function dispensado(id: string, log: Readonly<Record<string, PrepEntry>>, decl: Readonly<Record<string, DeclaracaoEnvio>>): boolean {
  const d = hasOwn(decl, id) ? decl[id] : undefined;
  return declaracaoVale(d?.dispensei, hasOwn(log, id) ? log[id] : undefined);
}

/**
 * Rótulo do botão de envio de treinos. Acima do limite por link: "Enviar 20 de 23 treinos" (coerente com o "faltam 3"
 * do diálogo); os que não cabem continuam "para enviar".
 */
export function rotuloDoEnvio(total: number, max: number, coachFirst: string): string {
  if (total > max) return `Enviar ${max} de ${total} treinos`;
  return total === 1 ? `Enviar treino para ${coachFirst}` : `Enviar ${total} treinos para ${coachFirst}`;
}

/** Linha do diálogo quando nem todos cabem num link: "20 de 23 neste envio; faltam 3." null quando cabem todos. */
export function textoDoLote(total: number, max: number): string | null {
  if (total <= max) return null;
  const faltam = total - max;
  return `${max} de ${total} neste envio; ${faltam === 1 ? "falta 1" : `faltam ${faltam}`}.`;
}

/** `markSessionsPrepared` não conseguiu gravar o toque: o status do diálogo diz isso (nunca "copiada às …"). */
export const TEXTO_REGISTRO_FALHOU = "Não deu para registrar neste aparelho; o treino continua como para enviar.";

/** Medição de `treinos_link_sent`: `resend` = algum treino do link já tinha toque; `novos` = quantos não tinham. */
export function resendCounts(states: readonly SessionDelivery[]): { resend: boolean; novos: number } {
  const novos = states.filter((d) => d.kind === "nao_enviado").length;
  return { resend: novos < states.length, novos };
}

// ---- U2b: envio da ficha e da dieta (aparelho do personal) ------------------------------------------
/** `a ≥ b` entre duas datas; data ilegível nunca vale como prova. */
function notBefore(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x >= y;
}

/**
 * Situação de um item (ficha ativa ou dieta que vai no link; `current` = o `updatedAt` dele ou null), nesta ordem
 * (U2 §3.3):
 *  I1. sem item → `sem_item`;
 *  I2. o último treino recebido trouxe esta versão (`acked`, eco do aluno) → `confirmado` (quando foi registrado);
 *  I3. o último envio levou esta versão → `enviado` (hora e canal do toque);
 *  I4. o último envio ou o eco têm outra versão → `mudou` (data do envio; versão que o aluno disse ter);
 *  I5. o registro começou antes desta versão (`current ≥ marcador`) e nenhum envio a levou → `nao_enviado` (fato);
 *  I6. senão → `desconhecido`: o conteúdo é anterior ao registro, sem prova de nada (nenhuma frase).
 * Toda comparação de versão é igualdade de textos do relógio do personal (o eco devolve o `updatedAt` dele).
 */
function itemDelivery(current: string | null, sent: string | null, acked: string | null, record: FichaSendRecord | null, ack: FichaAck | null, trackingSince: string | null): ItemDelivery {
  if (current === null) return { kind: "sem_item" };
  if (ack && acked !== null && acked === current) return { kind: "confirmado", ackAt: ack.registeredAt };
  const wasSent = record !== null && sent !== null;
  if (wasSent && sent === current) return { kind: "enviado", at: record.at, via: record.via };
  if (wasSent || acked !== null) return { kind: "mudou", sentAt: wasSent ? record.at : null, studentVersion: acked };
  if (trackingSince !== null && notBefore(current, trackingSince)) return { kind: "nao_enviado" };
  return { kind: "desconhecido" };
}

/** `a > b` entre duas datas; data ilegível nunca vale como prova. */
function after(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x > y;
}

/**
 * Situação do envio da ficha e da dieta de um aluno (U2 §3.3). `current` = versões do que iria no link agora;
 * `record` = o registro único `sr:sent:{aluno}:ficha` (o último toque); `ack` = o eco `sr:sent:{aluno}:ack` (a versão
 * que veio com o último treino; opcional: sem eco, nada é confirmado); `trackingSince` = `sr:sent:@desde`.
 * Reenviar o mesmo conteúdo continua `enviado` (a versão é o conteúdo, não a hora do pacote).
 * `staleEcho` (eco antigo, fato e não inferência): o item da manchete (a ficha; sem ficha, a dieta) está `enviado`,
 * e um treino registrado DEPOIS do envio (`ack.registeredAt > record.at`, os dois no relógio do personal) ainda veio
 * com outra versão dele.
 */
export function fichaDelivery(input: { current: VersionPair; record: FichaSendRecord | null; ack?: FichaAck | null; trackingSince: string | null }): FichaDelivery {
  const { current, record, trackingSince } = input;
  const ack = input.ack ?? null;
  const program = itemDelivery(current.programAt, record?.programAt ?? null, ack?.programAt ?? null, record, ack, trackingSince);
  const diet = itemDelivery(current.dietAt, record?.dietAt ?? null, ack?.dietAt ?? null, record, ack, trackingSince);
  const head = program.kind === "sem_item" ? { item: diet, current: current.dietAt, acked: ack?.dietAt } : { item: program, current: current.programAt, acked: ack?.programAt };
  const staleEcho =
    head.item.kind === "enviado" && ack && record && head.acked && head.acked !== head.current && after(ack.registeredAt, record.at) ? { registeredAt: ack.registeredAt, version: head.acked } : null;
  const headMissingFromEcho = head.item.kind === "enviado" && ack !== null && record !== null && !head.acked && after(ack.registeredAt, record.at);
  return { program, diet, staleEcho, ...(headMissingFromEcho ? { headMissingFromEcho: true as const } : {}) };
}

/** Linhas de estado do envio da ficha (U2 §3.3). `pageIcon` vale para a linha `page`. */
export interface FichaDeliveryLines {
  /** Uma linha, para a página do aluno (sob o botão de envio); null = nada a afirmar. */
  page: string | null;
  pageIcon: DeliveryIcon | null;
  /** Diálogo e painéis de envio: manchete (M) e detalhe (D), no máximo duas linhas, nesta ordem. */
  dialog: string[];
  /** Ícone da primeira linha de `dialog` (as demais vão sem ícone). */
  dialogIcon: DeliveryIcon | null;
}

/**
 * Textos do envio da ficha (S = primeiro nome do aluno; dd/mm e HH:MM no fuso do aparelho). A manchete (M) vem
 * da ficha; sem ficha, da dieta ("a dieta" no lugar de "a ficha"). O detalhe (D) é o primeiro que valer:
 *  1. a dieta mudou (e a ficha não); 2. a dieta atual ainda não foi; 3. eco antigo (U2c); 4. envio sem confirmação.
 * (A U2 punha o eco antigo e "a confirmação aparece…" antes da dieta; aqui o que pede ação vem antes.)
 * A página mostra uma linha só: M quando há algo a fazer com a ficha (mudou, não foi) ou nada a fazer com a dieta;
 * quando a ficha está em dia e a dieta não, o detalhe da dieta (senão a página diria "em dia" com a dieta pendente).
 * A linha da página é sempre uma das linhas do diálogo.
 * Nunca afirma o outro lado: nada de "enviada para", "aberto no WhatsApp", "chegou", "Nenhum envio".
 */
export function fichaDeliveryLines(d: FichaDelivery, studentFirst: string): FichaDeliveryLines {
  const s = studentFirst;
  const dietHead = d.program.kind === "sem_item";
  const head = dietHead ? d.diet : d.program;
  const noun = dietHead ? "dieta" : "ficha";

  let m: { text: string; icon: DeliveryIcon } | null = null;
  switch (head.kind) {
    case "confirmado": {
      const both = !dietHead && d.diet.kind === "confirmado";
      m = { text: `${s} está com ${both ? "a ficha e a dieta atuais" : `a ${noun} atual`}. Confirmado pelo treino recebido em ${fmtDayMonth(head.ackAt)}.`, icon: "confirmado" };
      break;
    }
    case "enviado": {
      const when = `${fmtDayMonth(head.at)} às ${fmtTime(head.at)}`;
      m = head.via === "copy" ? { text: `Mensagem com a ${noun} atual copiada em ${when}.`, icon: "copia" } : { text: `Envio da ${noun} atual iniciado em ${when}.`, icon: "whatsapp" };
      break;
    }
    case "mudou": {
      const both = !dietHead && d.diet.kind === "mudou";
      const text = head.sentAt
        ? both
          ? `A ficha e a dieta mudaram depois do último envio (${fmtDayMonth(head.sentAt)}).`
          : `A ${noun} mudou depois do último envio (${fmtDayMonth(head.sentAt)}).`
        : head.studentVersion
          ? `${s} está com a versão de ${fmtDayMonth(head.studentVersion)}. A ${noun} mudou depois disso.`
          : `A ${noun} mudou depois do último envio.`;
      m = { text, icon: "pendente" };
      break;
    }
    case "nao_enviado":
      m = { text: `A versão atual da ${noun} ainda não foi para o app de ${s}.`, icon: "pendente" };
      break;
    default:
      m = null; // sem_item, desconhecido: nada a afirmar
  }

  // Detalhe da dieta quando a manchete é da ficha (com a manchete da dieta, repetiria a mesma coisa).
  const dietDetail = dietHead
    ? null
    : d.diet.kind === "mudou" && d.program.kind !== "mudou"
      ? "A dieta mudou depois do último envio."
      : d.diet.kind === "nao_enviado"
        ? `A dieta atual ainda não foi para o app de ${s}.`
        : null;
  const staleText = d.staleEcho ? `O treino recebido em ${fmtDayMonth(d.staleEcho.registeredAt)} ainda veio com a versão de ${fmtDayMonth(d.staleEcho.version)}.` : null;
  const detail = dietDetail ?? staleText ?? (head.kind === "enviado" && !d.headMissingFromEcho ? `A confirmação aparece quando ${s} mandar o próximo treino.` : null);

  const headUpToDate = head.kind === "enviado" || head.kind === "confirmado";
  const page = m && !(headUpToDate && dietDetail) ? m : dietDetail ? { text: dietDetail, icon: "pendente" as const } : null;
  const dialog = [m?.text, detail].filter((t): t is string => Boolean(t));
  return { page: page?.text ?? null, pageIcon: page?.icon ?? null, dialog, dialogIcon: m?.icon ?? (dialog.length ? "pendente" : null) };
}

/**
 * Categoria do envio para a medição (`ficha_link_sent.situacao`), calculada com a situação de ANTES do toque:
 * `repetido` = tudo o que vai já tinha ido (ou voltou confirmado); `mudou` = algo mudou ou entrou depois do último
 * envio; `nunca` = nada do que vai tinha ido; `sem_info` = conteúdo anterior ao registro (ou nada a enviar).
 */
export function fichaSendSituation(d: FichaDelivery): FichaSendSituation {
  const kinds = [d.program.kind, d.diet.kind].filter((k) => k !== "sem_item");
  if (!kinds.length) return "sem_info";
  if (kinds.includes("mudou")) return "mudou";
  if (kinds.every((k) => k === "enviado" || k === "confirmado")) return "repetido";
  if (kinds.includes("desconhecido")) return "sem_info";
  return kinds.every((k) => k === "nao_enviado") ? "nunca" : "mudou";
}

// ---- U2c: versão que voltou com os treinos (medição) ------------------------------------------------
/**
 * Versão que o aluno disse ter, comparada com a atual, para a medição (`treinos_link_received.ficha_versao`).
 * `echo` = o bloco `ficha` do pacote de treinos, só quando vale como eco (mesmo personal e mesmo aluno), senão
 * undefined. `atual` = toda versão ecoada é igual à atual; `anterior` = alguma difere; `sem_info` = sem eco.
 */
export function fichaVersao(echo: { programAt?: string; dietAt?: string } | undefined, current: VersionPair): FichaVersao {
  if (!echo) return "sem_info";
  const pairs: [string, string | null][] = [];
  if (echo.programAt !== undefined) pairs.push([echo.programAt, current.programAt]);
  if (echo.dietAt !== undefined) pairs.push([echo.dietAt, current.dietAt]);
  if (!pairs.length) return "sem_info";
  return pairs.every(([e, c]) => e === c) ? "atual" : "anterior";
}

/**
 * O bloco `ficha` de um pacote de treinos só vale como eco quando veio do aparelho de um aluno DESTE personal:
 * mesmo personal (`coachId`) e o mesmo aluno do painel (`studentRef`, o id para onde a ficha foi). Escolher outro
 * aluno à mão em /receber não grava eco nenhum. Versões e `sentAt` ilegíveis ficam de fora. null = sem eco.
 */
export function fichaEchoOf(packet: { ficha?: { programAt?: string; dietAt?: string }; coachId: string; studentRef: string; sentAt: string }, studentId: string, coachId: string | undefined): { programAt?: string; dietAt?: string } | null {
  const f = packet.ficha;
  if (!f || !coachId || packet.coachId !== coachId || packet.studentRef !== studentId || !isIsoDate(packet.sentAt)) return null;
  const out: { programAt?: string; dietAt?: string } = {};
  if (isIsoDate(f.programAt)) out.programAt = f.programAt;
  if (isIsoDate(f.dietAt)) out.dietAt = f.dietAt;
  return out.programAt || out.dietAt ? out : null;
}

// ---- U2d: /receber sem "atualizado" falso (aparelho do personal) ---------------------------------------
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Forma canônica: chaves em ordem, sem `undefined`/`null` em objeto (o link já tira os nulos), arrays na ordem. */
function canonical(v: unknown): Json | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map((x) => canonical(x) ?? null);
  if (typeof v === "object") {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(v as object).sort()) {
      const c = canonical((v as Record<string, unknown>)[k]);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  return undefined;
}

/**
 * O treino que chegou é igual ao que já está no painel? Independe da ordem das chaves e ignora `userId` (no painel o
 * treino é gravado com o id do aluno do personal), `volumeKg` (só cache, recalculado na chegada pelo link pela
 * convenção única; rodada 3, R3-6 B) e campos `undefined`/`null`. Ordem das séries e dos exercícios conta. Qualquer
 * outra diferença (anotação, carga, repetição) → false.
 */
export function sameSession(a: Session, b: Session): boolean {
  const strip = (s: Session) => canonical({ ...s, userId: undefined, volumeKg: undefined });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** "1 série" / "3 séries". */
export function seriesText(n: number): string {
  return `${n} ${n === 1 ? "série" : "séries"}`;
}

/** "a", "a e b", "a, b e c". */
function joinPt(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/**
 * Título de /receber antes de registrar (S = primeiro nome do aluno no painel). `present` = quantos treinos do link
 * já estão no painel (pelo id); null = ainda não se sabe (aluno não escolhido): só a contagem.
 *  - nenhum no painel: "2 treinos para registrar";
 *  - alguns: "1 treino novo para registrar" + "1 já está no painel de S.";
 *  - todos: "Estes treinos já estão no painel de S" ("Este treino já está…" com um) e o botão "Registrar de novo".
 */
export function receivePreview(total: number, present: number | null, studentFirst: string): { title: string; line: string | null; allPresent: boolean } {
  const count = (n: number) => (n === 1 ? "1 treino" : `${n} treinos`);
  if (present === null || present <= 0 || total <= 0) return { title: `${count(total)} para registrar`, line: null, allPresent: false };
  if (present >= total) return { title: total === 1 ? `Este treino já está no painel de ${studentFirst}` : `Estes treinos já estão no painel de ${studentFirst}`, line: null, allPresent: true };
  const novos = total - present;
  return {
    title: `${novos === 1 ? "1 treino novo" : `${novos} treinos novos`} para registrar`,
    line: `${present} ${present === 1 ? "já está" : "já estão"} no painel de ${studentFirst}.`,
    allPresent: false,
  };
}

/**
 * Textos de /receber depois de registrar (`importTreinos`: `updated` só conta o que mudou; `same`, o que já estava
 * igual). Título no singular ou no plural pelo número de treinos do link; corpo só com as partes diferentes de zero
 * ("1 treino novo, 1 atualizado e 1 que já estava no painel"); nada novo nem mudado → "Nada novo: …".
 * Nunca "0 treinos novos" e nunca "atualizado" para o que não mudou.
 */
export function receiveResult(r: { added: number; updated: number; same: number }, studentFirst: string): { title: string; body: string } {
  const total = r.added + r.updated + r.same;
  const title = total === 1 ? `Treino de ${studentFirst} registrado.` : `Treinos de ${studentFirst} registrados.`;
  const tail = `Frequência, cargas e o relatório de evolução já contam com ${total === 1 ? "ele" : "eles"}.`;
  if (!r.added && !r.updated) {
    const lead = total === 1 ? "Nada novo: este treino já estava no painel." : "Nada novo: estes treinos já estavam no painel.";
    return { title, body: `${lead} ${tail}` };
  }
  const parts = [
    r.added ? (r.added === 1 ? "1 treino novo" : `${r.added} treinos novos`) : null,
    r.updated ? (r.updated === 1 ? "1 atualizado" : `${r.updated} atualizados`) : null,
    r.same ? (r.same === 1 ? "1 que já estava no painel" : `${r.same} que já estavam no painel`) : null,
  ].filter((p): p is string => p !== null);
  return { title, body: `${joinPt(parts)}. ${tail}` };
}
