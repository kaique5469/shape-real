import { getExercise } from "./exercises";
import type { ExerciseLog, MuscleGroup, Session, SetLog } from "./types";

/** 1RM estimado (Epley), confiável até ~12 repetições. */
export function e1rm(loadKg: number, reps: number): number {
  if (!loadKg || !reps || reps <= 0) return 0;
  if (reps === 1) return loadKg;
  const r = Math.min(reps, 12);
  return Math.round(loadKg * (1 + r / 30) * 10) / 10;
}

export function completedSets(log: ExerciseLog): SetLog[] {
  return log.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
}

export function setVolume(s: SetLog): number {
  return (s.loadKg ?? 0) * (s.reps ?? 0);
}

export function sessionVolume(session: Pick<Session, "exercises">): number {
  let v = 0;
  for (const ex of session.exercises) for (const s of completedSets(ex)) v += setVolume(s);
  return Math.round(v);
}

export function bestSet(log: ExerciseLog): { loadKg: number; reps: number; e1rm: number } | null {
  let best: { loadKg: number; reps: number; e1rm: number } | null = null;
  for (const s of completedSets(log)) {
    const est = e1rm(s.loadKg ?? 0, s.reps ?? 0);
    if (!best || est > best.e1rm || (est === best.e1rm && (s.loadKg ?? 0) > best.loadKg)) {
      best = { loadKg: s.loadKg ?? 0, reps: s.reps ?? 0, e1rm: est };
    }
  }
  return best;
}

/** Sessões mais recentes primeiro. */
function byNewest(a: Session, b: Session) {
  return b.startedAt.localeCompare(a.startedAt);
}

/** Último registro de um exercício antes de uma data (para "Última vez"). */
export function lastPerformance(sessions: Session[], exerciseId: string, before?: string): ExerciseLog | null {
  for (const s of [...sessions].sort(byNewest)) {
    if (before && s.startedAt >= before) continue;
    const log = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (log && completedSets(log).length) return log;
  }
  return null;
}

/** Melhor 1RM estimado histórico de um exercício. */
export function bestE1rm(sessions: Session[], exerciseId: string, before?: string): number {
  let best = 0;
  for (const s of sessions) {
    if (before && s.startedAt >= before) continue;
    for (const log of s.exercises) {
      if (log.exerciseId !== exerciseId) continue;
      const b = bestSet(log);
      if (b && b.e1rm > best) best = b.e1rm;
    }
  }
  return best;
}

/** Exercícios desta sessão que bateram recorde de 1RM estimado. */
export function detectPRs(session: Session, history: Session[]): string[] {
  const prs: string[] = [];
  for (const log of session.exercises) {
    const b = bestSet(log);
    if (!b || b.e1rm <= 0) continue;
    const prev = bestE1rm(
      history.filter((h) => h.id !== session.id),
      log.exerciseId,
      session.startedAt,
    );
    if (prev > 0 && b.e1rm > prev) prs.push(log.exerciseId);
  }
  return prs;
}

/** Incremento típico de carga por implemento (academias brasileiras). */
export function loadIncrement(exerciseId: string): number {
  const ex = getExercise(exerciseId);
  if (!ex) return 2;
  switch (ex.implement) {
    case "barra":
    case "smith":
      return ["quadriceps", "posteriores", "gluteos"].includes(ex.group) ? 5 : 2.5;
    case "halter":
    case "kettlebell":
      return 2;
    case "maquina":
      return 5;
    case "cabo":
      return 2.5;
    default:
      return 0;
  }
}

export type SuggestionKind = "aumentar" | "manter" | "reduzir" | "primeira" | "reps";

export interface LoadSuggestion {
  kind: SuggestionKind;
  loadKg: number | null;
  text: string;
}

/**
 * Progressão dupla: bateu o topo da faixa em todas as séries → aumenta a carga;
 * falhou o mínimo em metade ou mais das séries → reduz ~5%; senão, mantém e busca reps.
 */
export function suggestNext(
  last: ExerciseLog | null,
  planned: { sets: number; repsMin: number; repsMax: number },
  exerciseId: string,
): LoadSuggestion {
  if (!last) {
    return { kind: "primeira", loadKg: null, text: "Primeira vez: escolha uma carga que deixe 2 reps de sobra." };
  }
  const done = completedSets(last);
  const top = Math.max(...done.map((s) => s.loadKg ?? 0), 0);
  const inc = loadIncrement(exerciseId);
  const workSets = done.filter((s) => (s.loadKg ?? 0) === top);

  if (inc === 0 || top === 0) {
    const allTop = done.length >= planned.sets && done.every((s) => (s.reps ?? 0) >= planned.repsMax);
    return allTop
      ? { kind: "reps", loadKg: null, text: `Bateu ${planned.repsMax} reps em tudo. Some 1–2 reps ou desacelere a descida.` }
      : { kind: "manter", loadKg: null, text: `Busque ${planned.repsMax} reps em todas as séries.` };
  }

  const hitTop = workSets.length >= planned.sets && workSets.every((s) => (s.reps ?? 0) >= planned.repsMax);
  if (hitTop) {
    const next = roundTo(top + inc, inc >= 2.5 ? 0.5 : 1);
    return { kind: "aumentar", loadKg: next, text: `Subir para ${fmtKg(next)}: você fechou ${planned.repsMax} reps em todas as séries.` };
  }
  const misses = workSets.filter((s) => (s.reps ?? 0) < planned.repsMin).length;
  if (workSets.length && misses / workSets.length >= 0.5) {
    const next = roundTo(top * 0.95, inc >= 2.5 ? 2.5 : 1);
    return { kind: "reduzir", loadKg: next, text: `Reduzir para ${fmtKg(next)} e reconstruir as reps com boa técnica.` };
  }
  return { kind: "manter", loadKg: top, text: `Manter ${fmtKg(top)} e buscar ${planned.repsMax} reps em todas as séries.` };
}

function roundTo(v: number, step: number) {
  return Math.round(v / step) * step;
}

export function fmtKg(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

/** Série histórica de 1RM estimado por sessão (para gráfico). */
export function e1rmSeries(sessions: Session[], exerciseId: string): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const log = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (!log) continue;
    const b = bestSet(log);
    if (b && b.e1rm > 0) out.push({ date: s.startedAt.slice(0, 10), value: b.e1rm });
  }
  return out;
}

/** Exercícios registrados, ordenados pela frequência (os mais treinados primeiro). */
export function trackedExercises(sessions: Session[]): { exerciseId: string; name: string; count: number }[] {
  const map = new Map<string, { exerciseId: string; name: string; count: number }>();
  for (const s of sessions)
    for (const l of s.exercises) {
      if (!completedSets(l).some((x) => (x.loadKg ?? 0) > 0)) continue;
      const cur = map.get(l.exerciseId) ?? { exerciseId: l.exerciseId, name: l.name, count: 0 };
      cur.count++;
      map.set(l.exerciseId, cur);
    }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Início da semana (segunda-feira) em ISO yyyy-mm-dd. */
export function weekStart(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Volume semanal (tonelagem) das últimas N semanas, incluindo semanas zeradas. */
export function weeklyVolume(sessions: Session[], weeks = 8, now = new Date()): { week: string; volume: number; sessions: number }[] {
  const out: { week: string; volume: number; sessions: number }[] = [];
  const current = weekStart(now.toISOString());
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current + "T12:00:00");
    d.setDate(d.getDate() - i * 7);
    out.push({ week: d.toISOString().slice(0, 10), volume: 0, sessions: 0 });
  }
  const idx = new Map(out.map((w, i) => [w.week, i]));
  for (const s of sessions) {
    const i = idx.get(weekStart(s.startedAt));
    if (i === undefined) continue;
    out[i]!.volume += s.volumeKg || sessionVolume(s);
    out[i]!.sessions += 1;
  }
  return out;
}

/** Séries válidas por grupo muscular nos últimos 7 dias (principal = 1, secundário = 0,5). */
export function setsPerGroup(sessions: Session[], now = new Date()): Partial<Record<MuscleGroup, number>> {
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const s of sessions) {
    if (new Date(s.startedAt) < since) continue;
    for (const l of s.exercises) {
      const ex = getExercise(l.exerciseId);
      if (!ex) continue;
      const n = completedSets(l).length;
      out[ex.group] = (out[ex.group] ?? 0) + n;
      for (const g of ex.secondary ?? []) out[g] = (out[g] ?? 0) + n * 0.5;
    }
  }
  return out;
}

/** Dias consecutivos-de-semana com treino (sequência de semanas com ≥1 treino). */
export function weekStreak(sessions: Session[], now = new Date()): number {
  const weeks = new Set(sessions.map((s) => weekStart(s.startedAt)));
  let streak = 0;
  const d = new Date(weekStart(now.toISOString()) + "T12:00:00");
  // A semana atual conta se já houver treino; se ainda não houver, não quebra a sequência.
  if (!weeks.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 7);
  while (weeks.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 7);
  }
  return streak;
}
