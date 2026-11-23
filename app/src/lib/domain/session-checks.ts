import type { SetLog } from "./types";

/**
 * Conferências do treino em andamento antes de finalizar. Puras: a tela de sessão passa o rascunho (ou só
 * `{ exercises }`) e decide o diálogo. finish() só salva séries marcadas (✓), então uma série com reps digitadas e sem ✓
 * sumiria sem aviso.
 */

type SetLike = Pick<SetLog, "reps" | "done">;
type SessionLike = { exercises: ReadonlyArray<{ sets: ReadonlyArray<SetLike> }> };

/** Série com repetições (ou segundos/minutos, nos exercícios por tempo) digitadas e ainda sem ✓. A carga pré-preenchida não conta. */
export function isFilledUnmarked(set: SetLike): boolean {
  return !set.done && (set.reps ?? 0) > 0;
}

/** Quantas séries do treino têm reps digitadas e não foram marcadas como feitas (todos os exercícios, inclusive bi-set). */
export function filledUnmarked(session: SessionLike): number {
  let n = 0;
  for (const ex of session.exercises) for (const s of ex.sets) if (isFilledUnmarked(s)) n++;
  return n;
}

/** Contagem das séries do treino: feitas, preenchidas sem ✓ e vazias (nem marcadas nem preenchidas). */
export function setCounts(session: SessionLike): { total: number; done: number; filledUnmarked: number; empty: number } {
  let total = 0;
  let done = 0;
  let filled = 0;
  for (const ex of session.exercises)
    for (const s of ex.sets) {
      total++;
      if (s.done) done++;
      else if (isFilledUnmarked(s)) filled++;
    }
  return { total, done, filledUnmarked: filled, empty: total - done - filled };
}

/**
 * Marca como feitas as séries preenchidas e sem ✓ ("Marcar e finalizar"). Não muda carga, reps nem as séries vazias;
 * devolve o mesmo objeto quando não há nada a marcar.
 */
export function markFilledDone<S extends { exercises: ReadonlyArray<{ sets: ReadonlyArray<SetLike> }> }>(session: S): S {
  if (!filledUnmarked(session)) return session;
  return {
    ...session,
    exercises: session.exercises.map((ex) => (ex.sets.some(isFilledUnmarked) ? { ...ex, sets: ex.sets.map((s) => (isFilledUnmarked(s) ? { ...s, done: true } : s)) } : ex)),
  };
}

/**
 * O que fazer ao tocar "Finalizar", nesta ordem:
 * - "filled": há séries preenchidas sem ✓ (mesmo sem nenhuma marcada) → diálogo "Você preencheu N séries sem marcar";
 * - "nothing": nenhuma marcada e nenhuma preenchida → pedir pelo menos uma série (comportamento atual);
 * - "pending": há séries feitas e outras vazias → diálogo de pendentes, com `count` = só as vazias;
 * - "ok": tudo marcado → finalizar direto.
 */
export type FinishGate = { kind: "filled"; count: number } | { kind: "nothing" } | { kind: "pending"; count: number } | { kind: "ok" };

export function finishGate(session: SessionLike): FinishGate {
  const c = setCounts(session);
  if (c.filledUnmarked > 0) return { kind: "filled", count: c.filledUnmarked };
  if (c.done === 0) return { kind: "nothing" };
  if (c.empty > 0) return { kind: "pending", count: c.empty };
  return { kind: "ok" };
}

/** Título do diálogo: "Você preencheu 3 séries sem marcar" / "Você preencheu 1 série sem marcar". */
export function filledUnmarkedTitle(count: number): string {
  return count === 1 ? "Você preencheu 1 série sem marcar" : `Você preencheu ${count} séries sem marcar`;
}

/**
 * Estado de uma série na tela do treino (U1 §3.1), derivado e nunca gravado:
 * - "pendente": sem ✓ e sem reps (a carga pré-preenchida não conta, mesma regra de `isFilledUnmarked`);
 * - "preenchida": sem ✓ e com reps (ou segundos/minutos) digitadas;
 * - "concluida": com ✓ (mesmo sem reps).
 */
export type SetRowState = "pendente" | "preenchida" | "concluida";

export function setRowState(set: SetLike): SetRowState {
  if (set.done) return "concluida";
  return isFilledUnmarked(set) ? "preenchida" : "pendente";
}

/** Descrição acessível da caixa "Feito": "Preenchida, falta marcar" | "Recorde neste treino" | null (sem descrição). */
export function setRowDescription(state: SetRowState, record: boolean): string | null {
  if (state === "preenchida") return "Preenchida, falta marcar";
  if (state === "concluida" && record) return "Recorde neste treino";
  return null;
}
