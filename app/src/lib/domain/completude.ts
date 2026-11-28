import { completedSets, weekStart } from "./progression";
import type { Session } from "./types";

/**
 * Rodada 3 (R3-4 item 2): completude do treino ("1 de 24 séries", "parcial"). Separado de session-time.ts (o relógio do
 * treino) na integração da rodada 3 para não levar o relógio a toda rota: repository.ts (`summarizeStudent`) entra no
 * grafo do app-context, e só precisa de `parciaisNaSemana`. session-time.ts reexporta tudo daqui (nenhum importador
 * muda).
 */

/**
 * Séries feitas e planejadas. `planejadas` só existe com `plannedSets` gravado no fim do treino (rodada 3); sem ele,
 * null e nunca "parcial" (não derivar de `sets.length` da sessão salva: os exercícios sem série feita já saíram).
 */
export function sessionCompleteness(s: Pick<Session, "exercises" | "plannedSets">): { feitas: number; planejadas: number | null } {
  let feitas = 0;
  for (const ex of s.exercises) feitas += completedSets(ex).length;
  const p = s.plannedSets;
  return { feitas, planejadas: typeof p === "number" && Number.isInteger(p) && p > 0 ? p : null };
}

/**
 * Limiar do rótulo "parcial" (DECISIONS, rodada 3): menos de metade das séries planejadas. O "{feitas} de {planejadas}"
 * aparece sempre que for menor; só o rótulo espera o limiar (23 de 24 não é "parcial").
 */
export const LIMIAR_PARCIAL = 0.5;

export interface Completude {
  feitas: number;
  planejadas: number | null;
  /** "1 de 24 séries" quando feitas < planejadas; null sem `plannedSets` ou com o treino inteiro. */
  texto: string | null;
  /** Abaixo de LIMIAR_PARCIAL das planejadas. Sempre false sem `plannedSets`. */
  parcial: boolean;
}

export function completude(s: Pick<Session, "exercises" | "plannedSets">): Completude {
  const { feitas, planejadas } = sessionCompleteness(s);
  if (planejadas === null || feitas >= planejadas) return { feitas, planejadas, texto: null, parcial: false };
  return { feitas, planejadas, texto: `${feitas} de ${planejadas} ${planejadas === 1 ? "série" : "séries"}`, parcial: feitas < planejadas * LIMIAR_PARCIAL };
}

/**
 * O "1 de 24 séries" da tela, com "(parcial)" abaixo do limiar; null com o treino inteiro ou sem `plannedSets`.
 * O mesmo texto no link de treinos (transfer.ts), no Histórico e na página do aluno.
 */
export function completudeLinha(s: Pick<Session, "exercises" | "plannedSets">): string | null {
  const c = completude(s);
  return c.texto ? `${c.texto}${c.parcial ? " (parcial)" : ""}` : null;
}

/**
 * Treinos parciais (abaixo de LIMIAR_PARCIAL das planejadas, só com `plannedSets`) da semana corrente, de segunda a
 * domingo no fuso do aparelho: a mesma semana do "N de M na semana" (`sessionsThisWeek`). O "· 1 parcial" de "Sua
 * semana" no Hoje e da linha do aluno em /alunos (R3-4 item 2). Sessão antiga, sem `plannedSets`, nunca conta.
 */
export function parciaisNaSemana(sessions: readonly Pick<Session, "startedAt" | "exercises" | "plannedSets">[], now = new Date()): number {
  const semana = weekStart(now.toISOString());
  let n = 0;
  for (const s of sessions) if (Number.isFinite(Date.parse(s.startedAt)) && weekStart(s.startedAt) === semana && completude(s).parcial) n++;
  return n;
}

/** "1 parcial", "2 parciais"; null com 0 (nada aparece). */
export function textoParciais(n: number): string | null {
  if (!Number.isInteger(n) || n <= 0) return null;
  return n === 1 ? "1 parcial" : `${n} parciais`;
}
