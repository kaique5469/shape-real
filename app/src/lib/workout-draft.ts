import type { ExerciseLog, Session } from "@/lib/domain/types";
import type { LoadSuggestion, SuggestionKind } from "@/lib/domain/progression";
import { restFromDraft, type RestTimer } from "@/lib/domain/rest";
import { setCounts } from "@/lib/domain/session-checks";

/**
 * Rascunho do treino em andamento (um por usuário, guardado no aparelho).
 * A tela de treino grava a cada alteração; "Hoje" lê para oferecer a retomada.
 */
export const draftKey = (userId: string) => `sr:draft:${userId}`;

/**
 * O rascunho como fica gravado em sr:draft:{userId}. Campos novos entram sempre opcionais: um rascunho gravado por uma
 * versão anterior do app continua abrindo.
 */
export interface WorkoutDraft {
  session: Session;
  /** Sugestão de carga por registro (uid). `kind` pode ser "retorno" (volta após pausa); rascunhos antigos nunca têm. */
  suggestions: Record<string, LoadSuggestion>;
  /** Descanso configurado por registro (uid), em segundos. */
  restSec: Record<string, number>;
  /** Descanso em andamento: sobrevive a recarregar a página ou o iOS fechar o app. Ausente em rascunhos antigos. */
  rest?: RestTimer;
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Lê um rascunho gravado. Tolerante a rascunhos antigos (sem `rest`, sem `suggestions`/`restSec`) e a dados
 * corrompidos: devolve null se não houver uma sessão utilizável, e descarta só as partes inválidas.
 */
export function parseDraft(raw: string | null | undefined): WorkoutDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isRecord(data.session)) return null;
  const session = data.session as unknown as Session;
  if (typeof session.startedAt !== "string" || !Array.isArray(session.exercises)) return null;
  if (!session.exercises.every((e) => isRecord(e) && typeof e.uid === "string" && Array.isArray(e.sets))) return null;

  const suggestions: Record<string, LoadSuggestion> = {};
  if (isRecord(data.suggestions))
    for (const [k, v] of Object.entries(data.suggestions)) {
      if (!isRecord(v) || typeof v.text !== "string" || typeof v.kind !== "string") continue;
      const loadKg = typeof v.loadKg === "number" && Number.isFinite(v.loadKg) ? v.loadKg : null;
      suggestions[k] = { kind: v.kind as SuggestionKind, loadKg, text: v.text };
    }
  const restSec: Record<string, number> = {};
  if (isRecord(data.restSec)) for (const [k, v] of Object.entries(data.restSec)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) restSec[k] = v;
  const rest = restFromDraft(data.rest);
  return rest ? { session, suggestions, restSec, rest } : { session, suggestions, restSec };
}

/** Grava o rascunho com o descanso atual (null = sem descanso). Nunca lança (modo privado, cota cheia). */
export function saveDraft(userId: string, draft: WorkoutDraft, rest: RestTimer | null): void {
  try {
    // `rest: undefined` some do JSON: sem descanso, o campo não é gravado.
    localStorage.setItem(draftKey(userId), JSON.stringify({ ...draft, rest: rest ?? undefined }));
  } catch {
    /* sem armazenamento: o treino continua na tela */
  }
}

export interface DraftInfo {
  programId: string | null;
  dayKey?: string;
  dayTitle?: string;
  startedAt: string;
  done: number;
  total: number;
  /** Séries com reps digitadas e ainda sem ✓ (também são trabalho em andamento: nada pode sumir sem aviso). */
  filled: number;
  /** Endereço que reabre este treino. */
  href: string;
}

export function draftHref(session: Pick<Session, "programId" | "dayKey">): string {
  return session.programId && session.dayKey ? `/sessao?p=${session.programId}&d=${encodeURIComponent(session.dayKey)}` : "/sessao";
}

/** O rascunho tem trabalho que não pode ser sobrescrito sem aviso: série feita ou série preenchida sem ✓. */
export function draftHasWork(session: Pick<Session, "exercises">): boolean {
  const c = setCounts({ exercises: session.exercises.map((e) => ({ sets: e.sets ?? [] })) });
  return c.done + c.filledUnmarked > 0;
}

/** "3 de 21 séries feitas", "3 de 21 séries feitas e 1 preenchida sem marcar", "2 séries preenchidas sem marcar". */
export function draftProgressText(c: { done: number; total: number; filled: number }): string {
  const n = c.filled;
  if (!c.done) return n === 1 ? "1 série preenchida sem marcar" : `${n} séries preenchidas sem marcar`;
  const feitas = `${c.done} de ${c.total} séries feitas`;
  return n ? `${feitas} e ${n === 1 ? "1 preenchida" : `${n} preenchidas`} sem marcar` : feitas;
}

/** Resumo do treino em andamento, ou null se não houver nenhum com série feita ou preenchida. */
export function readDraftInfo(userId: string): DraftInfo | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const session = (JSON.parse(raw) as { session?: Session }).session;
    if (!session?.exercises) return null;
    const c = setCounts({ exercises: session.exercises.map((e) => ({ sets: e.sets ?? [] })) });
    if (!c.done && !c.filledUnmarked) return null;
    return {
      programId: session.programId ?? null,
      dayKey: session.dayKey,
      dayTitle: session.dayTitle,
      startedAt: session.startedAt,
      done: c.done,
      total: c.total,
      filled: c.filledUnmarked,
      href: draftHref(session),
    };
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

// ───────────────────────── Apoio da tela de treino (funções puras) ─────────────────────────

/** Faixa do atraso entre o fim do descanso e a próxima série (evento descanso_atraso; nunca o valor exato). */
export type RestDelayBand = "0-15s" | "15-60s" | "60s+";

export function restDelayBand(overSec: number): RestDelayBand {
  const s = Number.isFinite(overSec) ? Math.max(0, overSec) : 0;
  return s < 15 ? "0-15s" : s < 60 ? "15-60s" : "60s+";
}

/** Tipos de sugestão medidos no evento carga_sugerida_editada. */
export type SuggestionTipo = "aumentar" | "manter" | "reduzir" | "retorno";
const TIPOS: ReadonlySet<string> = new Set<SuggestionTipo>(["aumentar", "manter", "reduzir", "retorno"]);

/**
 * A carga pré-preenchida pela sugestão foi mudada nas séries feitas? Só para sugestões com carga (aumentar, manter,
 * reduzir, retorno) e exercícios com série feita; senão null. Nada de valores de carga sai daqui, só o tipo e o sim/não.
 */
export function suggestionEdit(log: Pick<ExerciseLog, "sets">, suggestion: Pick<LoadSuggestion, "kind" | "loadKg"> | undefined): { tipo: SuggestionTipo; editada: boolean } | null {
  if (!suggestion || suggestion.loadKg === null || !TIPOS.has(suggestion.kind)) return null;
  const done = log.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
  if (!done.length) return null;
  return { tipo: suggestion.kind as SuggestionTipo, editada: done.some((s) => (s.loadKg ?? null) !== suggestion.loadKg) };
}

/** "62,5" → 62.5 (número escrito em pt-BR). NaN se não for número. */
export function parsePtNumber(text: string): number {
  return /^\d+(,\d+)?$/.test(text) ? Number(text.replace(",", ".")) : Number.NaN;
}

/** Casas decimais de um número escrito em pt-BR ("62,5" → 1). */
export function decimalsOf(text: string): number {
  const i = text.indexOf(",");
  return i < 0 ? 0 : text.length - i - 1;
}

/** Uma linha de "Desde o último Treino B" separada para a tela (nome truncável, detalhe sempre inteiro). */
export interface CompareLineParts {
  /** "Agachamento" (vazio se a linha não tiver "Nome: "). */
  name: string;
  /** "60 → 62,5 kg", "+1 rep com 40 kg". */
  detail: string;
  /** Quando o detalhe é "A → B": o número novo anima a partir do anterior. */
  arrow?: { head: string; fromText: string; from: number; toText: string; to: number; tail: string };
}

export function splitCompareLine(line: string): CompareLineParts {
  const cut = line.lastIndexOf(": ");
  const name = cut < 0 ? "" : line.slice(0, cut);
  const detail = cut < 0 ? line : line.slice(cut + 2);
  const m = /^(\D*?)(\d+(?:,\d+)?) → (\d+(?:,\d+)?)(.*)$/.exec(detail);
  if (!m) return { name, detail };
  const [, head = "", fromText = "", toText = "", tail = ""] = m;
  const from = parsePtNumber(fromText);
  const to = parsePtNumber(toText);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { name, detail };
  return { name, detail, arrow: { head, fromText, from, toText, to, tail } };
}

/** Saída suave (easeOutCubic) para os números que animam do valor anterior ao novo; t entre 0 e 1. */
export function tween(from: number, to: number, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return from + (to - from) * (1 - (1 - p) ** 3);
}
