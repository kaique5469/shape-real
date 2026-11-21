import type { Session } from "@/lib/domain/types";

/**
 * Rascunho do treino em andamento (um por usuário, guardado no aparelho).
 * A tela de treino grava a cada alteração; "Hoje" lê para oferecer a retomada.
 */
export const draftKey = (userId: string) => `sr:draft:${userId}`;

export interface DraftInfo {
  programId: string | null;
  dayKey?: string;
  dayTitle?: string;
  startedAt: string;
  done: number;
  total: number;
  /** Endereço que reabre este treino. */
  href: string;
}

export function draftHref(session: Pick<Session, "programId" | "dayKey">): string {
  return session.programId && session.dayKey ? `/sessao?p=${session.programId}&d=${encodeURIComponent(session.dayKey)}` : "/sessao";
}

/** Resumo do treino em andamento, ou null se não houver nenhum com série feita. */
export function readDraftInfo(userId: string): DraftInfo | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const session = (JSON.parse(raw) as { session?: Session }).session;
    if (!session?.exercises) return null;
    const sets = session.exercises.flatMap((e) => e.sets ?? []);
    const done = sets.filter((s) => s.done).length;
    if (!done) return null;
    return { programId: session.programId ?? null, dayKey: session.dayKey, dayTitle: session.dayTitle, startedAt: session.startedAt, done, total: sets.length, href: draftHref(session) };
  } catch {
    return null;
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* modo privado */
  }
}
