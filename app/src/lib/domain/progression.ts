import { todayISO } from "./ids";
import { getExercise, unitOf } from "./exercises";
import type { ExerciseLog, MuscleGroup, Session, SetLog, Technique, Unit } from "./types";

/**
 * Máquinas em que a carga registrada é ajuda (graviton): mais kg = mais fácil.
 * A progressão e os recordes andam ao contrário e o 1RM estimado não se aplica.
 */
const ASSISTED = new Set(["barra_fixa_assistida"]);

/** 1RM estimado (Epley), confiável até ~10 repetições; acima de 12 a conta para de subir. */
export function e1rm(loadKg: number, reps: number): number {
  if (!loadKg || !reps || reps <= 0) return 0;
  if (reps === 1) return loadKg;
  const r = Math.min(reps, 12);
  return Math.round(loadKg * (1 + r / 30) * 10) / 10;
}

/**
 * Repetições assumidas quando a série é marcada como feita sem digitar.
 * Repete as da última vez, a não ser que a carga tenha subido: aí vale o mínimo da faixa,
 * senão o app registraria o topo da faixa com a carga nova e mandaria subir de novo.
 */
export function assumedReps(current: Pick<SetLog, "loadKg">, previous: Pick<SetLog, "loadKg" | "reps"> | undefined, repsMin: number | undefined): number | null {
  if (!previous?.reps) return repsMin ?? null;
  const heavier = (current.loadKg ?? 0) > (previous.loadKg ?? 0);
  return heavier && repsMin ? Math.min(previous.reps, repsMin) : previous.reps;
}

export function completedSets(log: ExerciseLog): SetLog[] {
  return log.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
}

export function setVolume(s: SetLog): number {
  return (s.loadKg ?? 0) * (s.reps ?? 0);
}

export function sessionVolume(session: Pick<Session, "exercises">): number {
  let v = 0;
  // Séries por tempo (prancha, cardio) não entram no volume em kg.
  for (const ex of session.exercises) if ((ex.unit ?? "reps") === "reps") for (const s of completedSets(ex)) v += setVolume(s);
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

/**
 * Exercícios desta sessão que bateram recorde. Vale qualquer um destes, sempre contra histórico anterior:
 * 1RM estimado maior; carga maior que todas as anteriores; mais repetições (ou segundos) do que já fez
 * com a carga máxima — ou sem carga, nos exercícios de peso corporal. No graviton, recorde é menos ajuda.
 * Uma carga mais de 2× acima do máximo anterior é tratada como erro de digitação e ignorada.
 */
export function detectPRs(session: Session, history: Session[]): string[] {
  const prs = new Set<string>();
  const before = history.filter((h) => h.id !== session.id && h.startedAt < session.startedAt);
  for (const log of session.exercises) {
    // Aeróbio em minutos não gera recorde (andar mais tempo não é marca de força).
    if (prs.has(log.exerciseId) || unitOf(log.exerciseId, log.unit) === "min") continue;
    const prev = before.flatMap((h) => h.exercises.filter((e) => e.exerciseId === log.exerciseId).flatMap(completedSets));
    if (!prev.length) continue;
    const sets = completedSets(log);
    const load = (s: SetLog) => s.loadKg ?? 0;
    const reps = (s: SetLog) => s.reps ?? 0;

    if (ASSISTED.has(log.exerciseId)) {
      const floor = log.planned?.repsMin ?? 1;
      const prevHelp = prev.filter((s) => load(s) > 0 && reps(s) >= floor).map(load);
      if (prevHelp.length && sets.some((s) => load(s) > 0 && reps(s) >= floor && load(s) < Math.min(...prevHelp))) prs.add(log.exerciseId);
      continue;
    }

    const prevMaxLoad = Math.max(...prev.map(load));
    const prevBest = Math.max(...prev.map((s) => e1rm(load(s), reps(s))));
    const prevRepsAt = (kg: number) => Math.max(0, ...prev.filter((s) => load(s) >= kg).map(reps));
    const record = sets.some((s) => {
      const kg = load(s);
      if (prevMaxLoad >= 20 && kg > prevMaxLoad * 2) return false;
      // Exercício que nunca teve carga registrada só bate recorde por repetições (ou segundos).
      if (prevMaxLoad === 0) return kg === 0 && reps(s) > prevRepsAt(0);
      if (kg <= 0) return false;
      return e1rm(kg, reps(s)) > prevBest || kg > prevMaxLoad || (kg === prevMaxLoad && reps(s) > prevRepsAt(kg));
    });
    if (record) prs.add(log.exerciseId);
  }
  return [...prs];
}

const PLATE_LOADED_MACHINES = new Set(["leg_press", "leg_press_unilateral", "hack", "panturrilha_leg_press"]);

/**
 * Incremento típico de carga por implemento nas academias brasileiras, conforme a carga atual:
 * halteres de 1 em 1 kg até 10 kg e de 2 em 2 depois; polias com placas de 2,5 kg (leves) ou 5 kg;
 * leg press e hack com anilhas; caneleira de 1 em 1 kg. 0 = exercício sem carga (progride por repetições).
 */
export function loadIncrement(exerciseId: string, currentLoadKg = 0): number {
  const ex = getExercise(exerciseId);
  if (!ex) return 2;
  switch (ex.implement) {
    case "barra":
    case "smith":
      return ["quadriceps", "posteriores", "gluteos"].includes(ex.group) && currentLoadKg >= 70 ? 5 : 2.5;
    case "halter":
      return currentLoadKg < 10 ? 1 : 2;
    case "kettlebell":
      return currentLoadKg < 12 ? 2 : 4;
    case "maquina":
      return PLATE_LOADED_MACHINES.has(ex.id) ? 10 : 5;
    case "cabo":
      return currentLoadKg < 30 ? 2.5 : 5;
    case "caneleira":
      return 1;
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

/** O que a ficha pede para o exercício (a tela de sessão passa o PlannedExercise inteiro). */
export interface PlannedTarget {
  sets: number;
  repsMin: number;
  repsMax: number;
  technique?: Technique;
  unit?: Unit;
}

const VARIED_LOAD_TECHNIQUES: Technique[] = ["piramide", "piramide_dec", "drop_set"];

/** Arredonda para baixo até uma carga que existe: múltiplo do incremento; halter acima de 10 kg só em número par. */
function snapDown(kg: number, step: number, implement: string | undefined): number {
  const v = Math.floor(Math.round((kg / step) * 1000) / 1000) * step;
  if (implement === "halter" && v > 10) return Math.floor(v / 2) * 2;
  return Math.round(v * 100) / 100;
}

/**
 * Progressão dupla: fechou o topo da faixa em todas as séries → sobe a carga; caiu muito abaixo do mínimo
 * → reduz um degrau; senão, mantém e busca repetições. Exercícios contados em tempo (prancha, esteira)
 * progridem em segundos/minutos, nunca em carga.
 */
export function suggestNext(last: ExerciseLog | null, planned: PlannedTarget, exerciseId: string): LoadSuggestion {
  const unit = planned.unit ?? last?.unit ?? unitOf(exerciseId);
  if (!last) {
    if (unit === "seg") return { kind: "primeira", loadKg: null, text: "Primeira vez: sustente a posição com boa postura até o tempo pedido." };
    if (unit === "min") return { kind: "primeira", loadKg: null, text: "Primeira vez: mantenha um ritmo em que ainda dá para conversar." };
    return { kind: "primeira", loadKg: null, text: "Primeira vez: escolha uma carga que deixe 2 reps de sobra." };
  }
  const done = completedSets(last);
  const { sets, repsMin, repsMax } = planned;
  const allTop = done.length >= sets && done.slice(0, sets).every((s) => (s.reps ?? 0) >= repsMax);

  if (unit === "seg") {
    return allTop
      ? { kind: "reps", loadKg: null, text: `Fechou ${repsMax} s em todas as séries. Some 5–10 s ou passe para uma variação mais difícil.` }
      : { kind: "manter", loadKg: null, text: `Busque ${repsMax} s em todas as séries.` };
  }
  if (unit === "min") {
    return allTop
      ? { kind: "reps", loadKg: null, text: `Fechou ${repsMax} min. Some 2–5 min ou aumente um pouco o ritmo.` }
      : { kind: "manter", loadKg: null, text: `Busque ${repsMax} min no mesmo ritmo.` };
  }

  const ex = getExercise(exerciseId);
  const loads = done.map((s) => s.loadKg ?? 0);
  const top = Math.max(...loads, 0);

  if (ASSISTED.has(exerciseId)) {
    const helped = loads.filter((kg) => kg > 0);
    if (!helped.length) return { kind: "primeira", loadKg: null, text: "Registre a ajuda usada (kg) para o app sugerir a progressão." };
    const help = Math.min(...helped);
    const work = done.filter((s) => (s.loadKg ?? 0) === help).slice(0, sets);
    if (work.length >= sets && work.every((s) => (s.reps ?? 0) >= repsMax)) {
      const next = Math.max(0, help - 5);
      return { kind: "aumentar", loadKg: next, text: `Reduza a ajuda para ${fmtKg(next)}: você fechou ${repsMax} reps em todas as séries.` };
    }
    if (work.length && work.every((s) => (s.reps ?? 0) < repsMin)) {
      return { kind: "reduzir", loadKg: help + 5, text: `Aumente a ajuda para ${fmtKg(help + 5)} e reconstrua as reps com boa técnica.` };
    }
    return { kind: "manter", loadKg: help, text: `Mantenha ${fmtKg(help)} de ajuda e busque ${repsMax} reps em todas as séries.` };
  }

  const loadable = loadIncrement(exerciseId, top) > 0;
  if (top === 0) {
    // Máquina, barra, polia ou halter sem carga registrada: não há o que progredir ainda.
    // (Caneleira é opcional: sem ela, o exercício progride por repetições.)
    if (loadable && ex?.implement !== "caneleira") return { kind: "primeira", loadKg: null, text: "Registre a carga usada para o app sugerir a progressão." };
    return allTop
      ? { kind: "reps", loadKg: null, text: `Bateu ${repsMax} reps em tudo. Some 1–2 reps ou desacelere a descida.` }
      : { kind: "manter", loadKg: null, text: `Busque ${repsMax} reps em todas as séries.` };
  }
  // Peso corporal com carga extra (colete, anilha na cintura) progride como exercício com carga.
  const step = loadable ? loadIncrement(exerciseId, top) : 2.5;
  const what = loadable ? "" : "o peso extra ";

  // Mudou a faixa de repetições (ficha nova): recomeça de uma carga estimada, em vez de comparar com a faixa antiga.
  const old = last.planned;
  const best = bestSet(last);
  if (old && best && (Math.abs(old.repsMax - repsMax) >= 3 || Math.abs(old.repsMin - repsMin) >= 3)) {
    const start = snapDown((best.e1rm / (1 + repsMax / 30)) * 0.95, step, ex?.implement);
    if (start > 0) return { kind: "primeira", loadKg: start, text: `A faixa de repetições mudou: comece com cerca de ${fmtKg(start)} e ajuste.` };
  }

  const atTop = done.filter((s) => (s.loadKg ?? 0) === top);
  const varied = new Set(loads).size > 1 && atTop.length < sets;
  if ((planned.technique && VARIED_LOAD_TECHNIQUES.includes(planned.technique)) || varied) {
    return { kind: "manter", loadKg: top, text: "Cargas variadas entre as séries: repita o esquema e tente mais 1 rep na série mais pesada." };
  }

  const work = atTop.slice(0, sets);
  if (work.length >= sets && work.every((s) => (s.reps ?? 0) >= repsMax)) {
    // Séries fixas (5×5): progressão linear em passos pequenos, mesmo nos agachamentos pesados.
    const inc = repsMin === repsMax && ex?.pattern === "agachar" ? 2.5 : step;
    let next = Math.round((top + inc) * 100) / 100;
    // Halter acima de 10 kg só existe em número par: 11 → 12, não 13.
    if (ex?.implement === "halter" && next > 10 && next % 2 !== 0) next = next - 1 > top ? next - 1 : next + 1;
    const plate = ex?.implement === "maquina" || ex?.implement === "cabo" ? " (próxima placa)" : "";
    return { kind: "aumentar", loadKg: next, text: `Subir ${what}para ${fmtKg(next)}${plate}: você fechou ${repsMax} reps em todas as séries.` };
  }

  const reps = work.map((s) => s.reps ?? 0);
  const missing = Array.from({ length: sets }, (_, i) => Math.max(0, repsMax - (reps[i] ?? 0))).reduce((a, b) => a + b, 0);
  const keep: LoadSuggestion = { kind: "manter", loadKg: top, text: `Manter ${fmtKg(top)}: faltaram ${missing} reps para fechar ${sets}×${repsMax}.` };
  if (!work.length) return keep;

  // Reduz só quando a carga está claramente acima: faixa → primeira série 2+ reps abaixo do mínimo ou todas abaixo;
  // séries fixas → menos de 80% das repetições pedidas. Fadiga normal nas últimas séries não conta.
  const fixed = repsMin === repsMax;
  const total = reps.reduce((a, b) => a + b, 0);
  const tooHeavy = fixed ? total < 0.8 * work.length * repsMax : reps[0]! < repsMin - 1 || reps.every((r) => r < repsMin);
  if (!tooHeavy) return keep;
  const oneStep = snapDown(top - step, step, ex?.implement);
  const next = fixed ? Math.min(oneStep, snapDown(top * 0.9, step, ex?.implement)) : oneStep;
  if (next <= 0 || next >= top) return keep;
  return { kind: "reduzir", loadKg: next, text: `Reduzir ${what}para ${fmtKg(next)} e reconstruir as reps com boa técnica.` };
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
    if (!log || ASSISTED.has(exerciseId)) continue;
    // Séries de até 12 reps estimam melhor; as mais longas só entram se a sessão não teve outra.
    const precise = { ...log, sets: completedSets(log).filter((x) => (x.reps ?? 0) <= 12) };
    const b = bestSet(precise) ?? bestSet(log);
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
  // Data do calendário local: toISOString() devolveria o dia em UTC, e no Brasil um treino depois das 21h cairia na semana seguinte.
  return todayISO(d);
}

/** Volume semanal (tonelagem) das últimas N semanas, incluindo semanas zeradas. */
export function weeklyVolume(sessions: Session[], weeks = 8, now = new Date()): { week: string; volume: number; sessions: number }[] {
  const out: { week: string; volume: number; sessions: number }[] = [];
  const current = weekStart(now.toISOString());
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current + "T12:00:00");
    d.setDate(d.getDate() - i * 7);
    out.push({ week: todayISO(d), volume: 0, sessions: 0 });
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
  if (!weeks.has(todayISO(d))) d.setDate(d.getDate() - 7);
  while (weeks.has(todayISO(d))) {
    streak++;
    d.setDate(d.getDate() - 7);
  }
  return streak;
}
