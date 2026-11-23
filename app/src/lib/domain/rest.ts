import type { SetLog } from "./types";

/**
 * Descanso entre séries, em funções puras: a tela de sessão guarda `{ until, total }` no rascunho (sobrevive a recarregar)
 * e pergunta a restPhase em que ponto está a cada tique do relógio. Tempos em milissegundos desde a época (Date.now()).
 */

/** Descanso em andamento: termina em `until` (ms); `total` é a duração pedida, em segundos. */
export interface RestTimer {
  until: number;
  total: number;
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

/** Lê o descanso salvo no rascunho; rascunhos antigos (sem o campo) ou corrompidos dão null. */
export function restFromDraft(value: unknown): RestTimer | null {
  if (!value || typeof value !== "object") return null;
  const { until, total } = value as { until?: unknown; total?: unknown };
  if (typeof until !== "number" || !Number.isFinite(until) || typeof total !== "number" || !Number.isFinite(total) || total < 0) return null;
  return { until, total };
}

/** Novo descanso de `totalSec` segundos a partir de agora; null se não houver descanso (0 s). */
export function startRest(totalSec: number, now: number): RestTimer | null {
  return totalSec > 0 ? { until: now + totalSec * 1000, total: totalSec } : null;
}

/** "−15s" / "+15s": desloca o fim (nunca para antes de agora) e ajusta o total na mesma medida. */
export function shiftRest(rest: RestTimer, deltaSec: number, now: number): RestTimer {
  const until = Math.max(now, rest.until + deltaSec * 1000);
  return { until, total: Math.max(0, rest.total + Math.round((until - rest.until) / 1000)) };
}

type SetsOf = { uid: string; sets: ReadonlyArray<Pick<SetLog, "done">> };

/**
 * Ainda sobra alguma série por fazer no treino? Considera todos os exercícios (bi-set, adicionados na hora, séries
 * marcadas fora de ordem). `marking` é a série que acabou de ser marcada e ainda aparece como não feita no estado
 * (o setState não aplicou). Sem séries pendentes, não se inicia descanso depois da última série.
 */
export function anySetPending(exercises: ReadonlyArray<SetsOf>, marking?: { logUid: string; index: number }): boolean {
  return exercises.some((e) => e.sets.some((s, i) => !s.done && !(marking && e.uid === marking.logUid && i === marking.index)));
}

/** Inicia descanso depois desta série? Só com descanso configurado (> 0 s) e alguma série ainda por fazer. */
export function shouldStartRest(exercises: ReadonlyArray<SetsOf>, marking: { logUid: string; index: number }, restSec: number): boolean {
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
