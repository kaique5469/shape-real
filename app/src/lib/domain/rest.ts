import type { SetLog } from "./types";

/**
 * Descanso entre séries, em funções puras: a tela de sessão guarda `{ until, total }` no rascunho (sobrevive a recarregar)
 * e pergunta a restPhase em que ponto está a cada tique do relógio. Tempos em milissegundos desde a época (Date.now()).
 */

/** Uma série do treino: o registro (uid) e o índice da série nele. */
export interface SetRef {
  logUid: string;
  index: number;
}

/** Descanso em andamento: termina em `until` (ms); `total` é a duração pedida, em segundos. */
export interface RestTimer {
  until: number;
  total: number;
  /**
   * Série que iniciou este descanso (U1 §3.3): desmarcar ou remover essa série cancela o descanso; um descanso
   * iniciado por outra série continua. Ausente em rascunhos antigos (aí nada cancela o descanso).
   */
  from?: SetRef;
}

/** Até quanto tempo depois do fim o bipe e a vibração ainda fazem sentido (nada de apitar atrasado ao voltar de outro app). */
export const REST_ALERT_WINDOW_MS = 5_000;
/** Descanso vencido há mais que isso é descartado (não reaparece ao reabrir o app). */
export const REST_DISCARD_AFTER_MS = 10 * 60_000;
/** Um descanso que termina mais de 1 h no futuro é dado corrompido (relógio mudou): ignorado. */
const REST_MAX_AHEAD_MS = 60 * 60_000;

export type RestPhase =
  /** Sem descanso (ou dado inválido). */
  | { phase: "none" }
  /** Contando: faltam `leftSec` segundos (arredondado para cima, como a contagem na tela). */
  | { phase: "running"; leftSec: number; total: number }
  /**
   * Acabou há `overSec` segundos (0 no instante do fim; vira o "+0:42" e o "acabou há 40 s").
   * `justEnded`: o fim aconteceu há no máximo REST_ALERT_WINDOW_MS — só aí tocar bipe/vibração (uma vez, controle da tela).
   */
  | { phase: "ended"; overSec: number; justEnded: boolean }
  /** Vencido há mais de 10 min: descartar (limpar do estado e do rascunho). */
  | { phase: "expired" };

/** Em que ponto está o descanso agora. */
export function restPhase(rest: RestTimer | null | undefined, now: number): RestPhase {
  if (!rest || !Number.isFinite(rest.until) || !Number.isFinite(now)) return { phase: "none" };
  const left = rest.until - now;
  if (left > REST_MAX_AHEAD_MS) return { phase: "none" };
  if (left > 0) return { phase: "running", leftSec: Math.ceil(left / 1000), total: rest.total };
  const over = now - rest.until; // (e não -left: no instante do fim daria -0)
  if (over > REST_DISCARD_AFTER_MS) return { phase: "expired" };
  return { phase: "ended", overSec: Math.floor(over / 1000), justEnded: over <= REST_ALERT_WINDOW_MS };
}

/** `from` gravado: uid não vazio e índice inteiro ≥ 0; qualquer outra coisa é descartada. */
function parseSetRef(value: unknown): SetRef | null {
  if (!value || typeof value !== "object") return null;
  const { logUid, index } = value as { logUid?: unknown; index?: unknown };
  if (typeof logUid !== "string" || !logUid || typeof index !== "number" || !Number.isInteger(index) || index < 0) return null;
  return { logUid, index };
}

/**
 * Lê o descanso salvo no rascunho; rascunhos antigos (sem o campo) ou corrompidos dão null. Um `from` inválido é
 * descartado sem perder o descanso (ele só deixa de ser cancelado ao desmarcar).
 */
export function restFromDraft(value: unknown): RestTimer | null {
  if (!value || typeof value !== "object") return null;
  const { until, total, from } = value as { until?: unknown; total?: unknown; from?: unknown };
  if (typeof until !== "number" || !Number.isFinite(until) || typeof total !== "number" || !Number.isFinite(total) || total < 0) return null;
  const ref = parseSetRef(from);
  return ref ? { until, total, from: ref } : { until, total };
}

/** Novo descanso de `totalSec` segundos a partir de agora, iniciado pela série `from`; null se não houver descanso (0 s). */
export function startRest(totalSec: number, now: number, from?: SetRef): RestTimer | null {
  if (!(totalSec > 0)) return null;
  const rest: RestTimer = { until: now + totalSec * 1000, total: totalSec };
  if (from) rest.from = { logUid: from.logUid, index: from.index };
  return rest;
}

/** "−15s" / "+15s": desloca o fim (nunca para antes de agora) e ajusta o total na mesma medida. A série de origem continua. */
export function shiftRest(rest: RestTimer, deltaSec: number, now: number): RestTimer {
  const until = Math.max(now, rest.until + deltaSec * 1000);
  const out: RestTimer = { until, total: Math.max(0, rest.total + Math.round((until - rest.until) / 1000)) };
  if (rest.from) out.from = rest.from;
  return out;
}

/**
 * Desmarcar a série `mark`: o descanso (contando ou na barra de fim) que ela iniciou é cancelado (null); um descanso
 * iniciado por outra série, ou sem série de origem (rascunho antigo), continua igual.
 */
export function restAfterUnmark(rest: RestTimer | null, mark: SetRef): RestTimer | null {
  if (!rest?.from) return rest;
  return rest.from.logUid === mark.logUid && rest.from.index === mark.index ? null : rest;
}

/**
 * Remoção de séries do registro `logUid`, que fica com `newLength` séries (0 = o exercício saiu do treino): o descanso
 * iniciado por uma série que saiu é cancelado; os demais continuam.
 */
export function restAfterRemove(rest: RestTimer | null, logUid: string, newLength: number): RestTimer | null {
  if (!rest?.from) return rest;
  return rest.from.logUid === logUid && rest.from.index >= newLength ? null : rest;
}

type SetsOf = { uid: string; sets: ReadonlyArray<Pick<SetLog, "done">> };

/**
 * Ainda sobra alguma série por fazer no treino? Considera todos os exercícios (bi-set, adicionados na hora, séries
 * marcadas fora de ordem). `marking` é a série que acabou de ser marcada e ainda aparece como não feita no estado
 * (o setState não aplicou). Sem séries pendentes, não se inicia descanso depois da última série.
 */
export function anySetPending(exercises: ReadonlyArray<SetsOf>, marking?: SetRef): boolean {
  return exercises.some((e) => e.sets.some((s, i) => !s.done && !(marking && e.uid === marking.logUid && i === marking.index)));
}

/** Inicia descanso depois desta série? Só com descanso configurado (> 0 s) e alguma série ainda por fazer. */
export function shouldStartRest(exercises: ReadonlyArray<SetsOf>, marking: SetRef, restSec: number): boolean {
  return restSec > 0 && anySetPending(exercises, marking);
}

/** "1:05" (contagem regressiva). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "+0:42" (tempo extra depois do fim, contando para cima). */
export function fmtOvertime(overSec: number): string {
  return `+${fmtClock(overSec)}`;
}

/** Ao reabrir o app com o descanso vencido: "Descanso acabou há 40 s" / "Descanso acabou há 3 min". */
export function restEndedAgoText(overSec: number): string {
  const s = Math.max(0, Math.floor(overSec));
  if (s < 1) return "Descanso acabou";
  return s < 60 ? `Descanso acabou há ${s} s` : `Descanso acabou há ${Math.floor(s / 60)} min`;
}

/** Próxima série por fazer de um exercício ("Série 3 de 4"), ou null se todas estiverem feitas. */
export function nextSetOf(log: { name: string; sets: ReadonlyArray<Pick<SetLog, "done">> }): { number: number; of: number; name: string } | null {
  const i = log.sets.findIndex((s) => !s.done);
  return i < 0 ? null : { number: i + 1, of: log.sets.length, name: log.name };
}

/** Texto da barra no fim: "Descanso acabou · Série 3 de 4 · Supino" (só "Descanso acabou" sem próxima série). */
export function restEndedText(next: { number: number; of: number; name: string } | null): string {
  return next ? `Descanso acabou · Série ${next.number} de ${next.of} · ${next.name}` : "Descanso acabou";
}
