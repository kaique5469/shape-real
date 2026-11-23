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

/** Um registro do exercício com a data do treino em que foi feito. */
export interface DatedPerformance {
  log: ExerciseLog;
  /** `startedAt` do treino (ISO). */
  startedAt: string;
}

/**
 * Registros de um exercício com séries feitas, do treino mais recente para o mais antigo, cada um com a data do treino.
 * `limit` corta a lista; `before` (ISO) ignora treinos a partir dessa data.
 */
export function recentPerformances(sessions: Session[], exerciseId: string, limit = Infinity, before?: string): DatedPerformance[] {
  const out: DatedPerformance[] = [];
  for (const s of [...sessions].sort(byNewest)) {
    if (out.length >= limit) break;
    if (before && s.startedAt >= before) continue;
    const log = s.exercises.find((e) => e.exerciseId === exerciseId && completedSets(e).length);
    if (log) out.push({ log, startedAt: s.startedAt });
  }
  return out;
}

/** Último registro de um exercício antes de uma data, com a data do treino (para o retorno após pausa). */
export function lastPerformanceWithDate(sessions: Session[], exerciseId: string, before?: string): DatedPerformance | null {
  return recentPerformances(sessions, exerciseId, 1, before)[0] ?? null;
}

/** Último registro de um exercício antes de uma data (para "Última vez"). */
export function lastPerformance(sessions: Session[], exerciseId: string, before?: string): ExerciseLog | null {
  return lastPerformanceWithDate(sessions, exerciseId, before)?.log ?? null;
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

const loadOf = (s: Pick<SetLog, "loadKg">) => s.loadKg ?? 0;
const repsOf = (s: Pick<SetLog, "reps">) => s.reps ?? 0;
const isCompleted = (s: SetLog) => s.done && repsOf(s) > 0;

/** Séries feitas do exercício nos treinos anteriores a `session`: o histórico contra o qual se mede recorde. */
export function priorSets(history: Session[], exerciseId: string, session: Pick<Session, "id" | "startedAt">): SetLog[] {
  return history
    .filter((h) => h.id !== session.id && h.startedAt < session.startedAt)
    .flatMap((h) => h.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(completedSets));
}

/** O que identifica o exercício para medir recorde (um ExerciseLog serve). */
export type RecordTarget = Pick<ExerciseLog, "exerciseId" | "unit" | "planned">;

/**
 * Esta série é recorde? Predicado único, usado ao vivo (ao marcar o ✓) e no fim (detectPRs), para os dois nunca discordarem.
 * `set` é tratada como feita (precisa de reps > 0). Compara com o histórico (`prior`, de priorSets) mais as séries já feitas
 * nesta sessão (`earlier`, só as concluídas contam). Vale qualquer um destes: 1RM estimado maior; carga maior que todas as
 * anteriores; mais repetições (ou segundos) do que já fez com a carga máxima — ou sem carga, nos exercícios de peso corporal.
 * No graviton, recorde é menos ajuda. Sem histórico não há recorde; aeróbio em minutos nunca é recorde.
 * A trava de 2× (carga mais de 2× acima do máximo anterior = erro de digitação) vale só contra o histórico.
 */
export function setRecord(set: SetLog, target: RecordTarget, prior: SetLog[], earlier: SetLog[] = []): boolean {
  // Aeróbio em minutos não gera recorde (andar mais tempo não é marca de força).
  if (unitOf(target.exerciseId, target.unit) === "min") return false;
  const hist = prior.filter(isCompleted);
  const kg = loadOf(set);
  const reps = repsOf(set);
  if (!hist.length || reps <= 0) return false;
  const before = earlier.filter(isCompleted);

  if (ASSISTED.has(target.exerciseId)) {
    const floor = target.planned?.repsMin ?? 1;
    const counts = (s: SetLog) => loadOf(s) > 0 && repsOf(s) >= floor;
    const histHelp = hist.filter(counts).map(loadOf);
    if (!histHelp.length || !counts(set)) return false;
    return kg < Math.min(...histHelp, ...before.filter(counts).map(loadOf));
  }

  const histMax = Math.max(...hist.map(loadOf));
  const typo = (s: SetLog) => histMax >= 20 && loadOf(s) > histMax * 2;
  if (typo(set)) return false;
  // Exercício que nunca teve carga registrada só bate recorde por repetições (ou segundos), sem carga.
  if (histMax === 0) return kg === 0 && reps > Math.max(0, ...[...hist, ...before.filter((s) => loadOf(s) === 0)].map(repsOf));
  if (kg <= 0) return false;
  const pool = [...hist, ...before.filter((s) => !typo(s))];
  const maxLoad = Math.max(...pool.map(loadOf));
  const best = Math.max(...pool.map((s) => e1rm(loadOf(s), repsOf(s))));
  return e1rm(kg, reps) > best || kg > maxLoad || (kg === maxLoad && reps > Math.max(0, ...pool.filter((s) => loadOf(s) >= kg).map(repsOf)));
}

/**
 * Recorde série a série num registro da sessão: a série k é recorde se bate o histórico e as séries feitas antes dela
 * (na ordem das séries) neste registro. Séries não feitas ficam false. Estado derivado: desmarcar ou corrigir reps desfaz.
 * Cada série marcada como recorde supera todas as anteriores, então a última `true` é a melhor marca do dia.
 */
export function recordFlags(log: ExerciseLog, prior: SetLog[]): boolean[] {
  const done: SetLog[] = [];
  return log.sets.map((s) => {
    if (!isCompleted(s)) return false;
    const record = setRecord(s, log, prior, done);
    done.push(s);
    return record;
  });
}

/** Índice da 1ª série recorde do registro nesta sessão (o ✓ vermelho com troféu), ou -1. */
export function firstRecordSet(log: ExerciseLog, history: Session[], session: Pick<Session, "id" | "startedAt">): number {
  return recordFlags(log, priorSets(history, log.exerciseId, session)).indexOf(true);
}

/**
 * A série que bateu a marca do exercício nesta sessão, para o resumo e para "Recordes recentes": a última série recorde
 * (a melhor do dia). null se o exercício não bateu recorde contra `history`.
 */
export function recordSetOf(session: Pick<Session, "id" | "startedAt" | "exercises">, history: Session[], exerciseId: string): { log: ExerciseLog; set: SetLog } | null {
  const prior = priorSets(history, exerciseId, session);
  let found: { log: ExerciseLog; set: SetLog } | null = null;
  for (const log of session.exercises) {
    if (log.exerciseId !== exerciseId) continue;
    const flags = recordFlags(log, prior);
    for (let i = 0; i < flags.length; i++) if (flags[i]) found = { log, set: log.sets[i]! };
  }
  return found;
}

/**
 * Uma série como aparece em recordes: "42,5 kg × 8", "15 reps", "60 s", "10 kg · 60 s", "30 kg de ajuda × 8".
 * Peso corporal sem carga nunca vira "0 kg × 15".
 */
export function fmtMark(set: Pick<SetLog, "loadKg" | "reps">, exerciseId: string, unit?: Unit): string {
  const u = unitOf(exerciseId, unit);
  const kg = loadOf(set);
  const reps = repsOf(set);
  if (u === "min") return `${reps} min`;
  if (u === "seg") return kg > 0 ? `${fmtKg(kg)} · ${reps} s` : `${reps} s`;
  if (kg > 0) return ASSISTED.has(exerciseId) ? `${fmtKg(kg)} de ajuda × ${reps}` : `${fmtKg(kg)} × ${reps}`;
  return `${reps} ${reps === 1 ? "rep" : "reps"}`;
}

/**
 * Exercícios desta sessão que bateram recorde (ids, sem repetição). Usa setRecord série a série, a mesma regra do ✓ ao vivo:
 * o exercício entra se alguma série for recorde contra o histórico anterior.
 */
export function detectPRs(session: Session, history: Session[]): string[] {
  const prs = new Set<string>();
  for (const log of session.exercises) {
    if (prs.has(log.exerciseId)) continue;
    if (recordFlags(log, priorSets(history, log.exerciseId, session)).some(Boolean)) prs.add(log.exerciseId);
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

/** "retorno" = voltando depois de uma pausa (rascunhos antigos nunca têm esse valor; todos continuam válidos). */
export type SuggestionKind = "aumentar" | "manter" | "reduzir" | "primeira" | "reps" | "retorno";

export interface LoadSuggestion {
  kind: SuggestionKind;
  loadKg: number | null;
  text: string;
}

/** Dias sem fazer o exercício a partir dos quais a sugestão vira retorno (≈90% da última carga). */
export const RETURN_AFTER_DAYS = 14;

/** Contexto opcional de suggestNext; suggestFromHistory monta tudo a partir do histórico. */
export interface SuggestContext {
  /** Data (ISO) do treino em que `last` foi feito. Sem ela não há regra de retorno após pausa. */
  lastAt?: string;
  /** Registros do mesmo exercício nos treinos anteriores a `last`, do mais recente ao mais antigo (só os 3 primeiros contam). */
  earlier?: ExerciseLog[];
  /** "Agora" (padrão: new Date()). */
  now?: Date;
}

function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/**
 * Guarda de digitação dentro do registro: com 3 séries ou mais, separa as séries cuja carga passa de 1,5× a mediana
 * de TODAS as séries do registro, desde que sejam minoria (14/140/14 → 140 sai; pirâmide 50/55/60 fica inteira).
 * Medir cada série contra a mediana das outras falhava com uma série mais leve: em 4/40/40 (ou aquecimento 15/50/50),
 * a mediana das outras duas de cada série de 40 é 22, e as séries reais é que eram descartadas. Uma série baixa nunca
 * é tratada como erro aqui (aquecimento é normal). Se metade ou mais pareceria erro, nada é ignorado.
 */
function splitTypos(sets: SetLog[]): { kept: SetLog[]; ignored: SetLog[] } {
  if (sets.length < 3) return { kept: sets, ignored: [] };
  const m = median(sets.map(loadOf));
  if (m <= 0) return { kept: sets, ignored: [] };
  const typo = (s: SetLog) => loadOf(s) > 1.5 * m;
  const ignored = sets.filter(typo);
  if (!ignored.length || ignored.length * 2 >= sets.length) return { kept: sets, ignored: [] };
  return { kept: sets.filter((s) => !typo(s)), ignored };
}

/** Maior carga confiável de um registro (sem as séries que parecem digitadas errado). */
function trustedTop(log: ExerciseLog): number {
  return Math.max(0, ...splitTypos(completedSets(log)).kept.map(loadOf));
}

/** Dias de calendário (no fuso do aparelho) entre a data ISO e `to`. NaN se a data for inválida. */
function daysSince(fromISO: string, to: Date): number {
  const from = new Date(fromISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return NaN;
  return Math.round((new Date(todayISO(to) + "T12:00:00").getTime() - new Date(todayISO(from) + "T12:00:00").getTime()) / 86_400_000);
}

const fmtNumber = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

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
 * Sugestão de carga (número e texto saem juntos daqui). Precedência, de cima para baixo:
 * 1. mudança de faixa de repetições (ficha nova) → recomeça de uma carga estimada (do treino anterior, se o último for
 *    suspeito pela trava de 2×);
 * 2. retorno após pausa (último registro há RETURN_AFTER_DAYS dias ou mais, precisa de `context.lastAt`) → ~90% da carga;
 * 3. guarda de digitação → com 2× acima da melhor carga dos 3 treinos anteriores (`context.earlier`), mantém a carga
 *    anterior e pede para conferir; série (minoria) 1,5× acima da mediana do mesmo registro é ignorada;
 * 4. progressão dupla: fechou o topo da faixa em todas as séries → sobe; caiu muito abaixo do mínimo → reduz um degrau
 *    (com salto grande de equipamento, só se a 1ª série ficar 3+ reps abaixo do mínimo); senão mantém e busca reps.
 * Exercícios contados em tempo (prancha, esteira) progridem em segundos/minutos, nunca em carga.
 */
export function suggestNext(last: ExerciseLog | null, planned: PlannedTarget, exerciseId: string, context: SuggestContext = {}): LoadSuggestion {
  const unit = planned.unit ?? last?.unit ?? unitOf(exerciseId);
  if (!last) {
    if (unit === "seg") return { kind: "primeira", loadKg: null, text: "Primeira vez: sustente a posição com boa postura até o tempo pedido." };
    if (unit === "min") return { kind: "primeira", loadKg: null, text: "Primeira vez: mantenha um ritmo em que ainda dá para conversar." };
    return { kind: "primeira", loadKg: null, text: "Primeira vez: escolha uma carga que deixe 2 reps de sobra." };
  }
  const all = completedSets(last);
  const { sets, repsMin, repsMax } = planned;
  const topAll = (xs: SetLog[]) => xs.length >= sets && xs.slice(0, sets).every((s) => (s.reps ?? 0) >= repsMax);

  if (unit === "seg") {
    return topAll(all)
      ? { kind: "reps", loadKg: null, text: `Fechou ${repsMax} s em todas as séries. Some 5–10 s ou passe para uma variação mais difícil.` }
      : { kind: "manter", loadKg: null, text: `Busque ${repsMax} s em todas as séries.` };
  }
  if (unit === "min") {
    return topAll(all)
      ? { kind: "reps", loadKg: null, text: `Fechou ${repsMax} min. Some 2–5 min ou aumente um pouco o ritmo.` }
      : { kind: "manter", loadKg: null, text: `Busque ${repsMax} min no mesmo ritmo.` };
  }

  const ex = getExercise(exerciseId);
  const away = context.lastAt ? daysSince(context.lastAt, context.now ?? new Date()) : NaN;
  const returning = away >= RETURN_AFTER_DAYS;
  // Curto para caber em 2 linhas a 360 px mesmo com "120 dias" e "67,5 kg de peso extra".
  const back = (what: string) => `Faz ${away} dias sem este exercício: volte ${what} e reencontre o ritmo.`;

  if (ASSISTED.has(exerciseId)) {
    const helped = all.map(loadOf).filter((kg) => kg > 0);
    if (!helped.length) return { kind: "primeira", loadKg: null, text: "Registre a ajuda usada (kg) para o app sugerir a progressão." };
    const help = Math.min(...helped);
    // Graviton ao contrário: voltar de pausa é pôr mais ajuda.
    if (returning) return { kind: "retorno", loadKg: help + 5, text: back(`com ${fmtKg(help + 5)} de ajuda`) };
    const work = all.filter((s) => (s.loadKg ?? 0) === help).slice(0, sets);
    if (work.length >= sets && work.every((s) => (s.reps ?? 0) >= repsMax)) {
      const next = Math.max(0, help - 5);
      return { kind: "aumentar", loadKg: next, text: `Reduza a ajuda para ${fmtKg(next)}: você fechou ${repsMax} reps em todas as séries.` };
    }
    if (work.length && work.every((s) => (s.reps ?? 0) < repsMin)) {
      return { kind: "reduzir", loadKg: help + 5, text: `Aumente a ajuda para ${fmtKg(help + 5)} e reconstrua as reps com boa técnica.` };
    }
    return { kind: "manter", loadKg: help, text: `Mantenha ${fmtKg(help)} de ajuda e busque ${repsMax} reps em todas as séries.` };
  }

  // Guarda de digitação: série muito acima das outras do mesmo registro não entra no cálculo.
  const { kept: done, ignored } = splitTypos(all);
  const loads = done.map(loadOf);
  const top = Math.max(...loads, 0);

  const loadable = loadIncrement(exerciseId, top) > 0;
  if (top === 0) {
    // Máquina, barra, polia ou halter sem carga registrada: não há o que progredir ainda.
    // (Caneleira é opcional: sem ela, o exercício progride por repetições.)
    if (loadable && ex?.implement !== "caneleira") return { kind: "primeira", loadKg: null, text: "Registre a carga usada para o app sugerir a progressão." };
    if (returning) return { kind: "retorno", loadKg: null, text: back("sem forçar") };
    return topAll(done)
      ? { kind: "reps", loadKg: null, text: `Bateu ${repsMax} reps em tudo. Some 1–2 reps ou desacelere a descida.` }
      : { kind: "manter", loadKg: null, text: `Busque ${repsMax} reps em todas as séries.` };
  }
  // Peso corporal com carga extra (colete, anilha na cintura) progride como exercício com carga.
  const stepAt = (kg: number) => (loadable ? loadIncrement(exerciseId, kg) : 2.5);
  const step = stepAt(top);
  const what = loadable ? "" : "o peso extra ";

  // Carga dos treinos anteriores (só os 3 mais recentes): base da trava de 2× contra erro de digitação.
  const recent = (context.earlier ?? []).slice(0, 3).filter((l) => trustedTop(l) > 0);
  const prior = recent.map(trustedTop);
  const priorBest = Math.max(0, ...prior);
  const suspicious = priorBest > 0 && top > 2 * priorBest;
  const previous = prior[0] ?? priorBest;

  // 1) Mudou a faixa de repetições (ficha nova): recomeça de uma carga estimada, em vez de comparar com a faixa antiga.
  // Com o último registro suspeito (2× acima dos anteriores), a estimativa parte do treino anterior, nunca do número errado.
  const old = last.planned;
  const base = suspicious && recent[0] ? recent[0] : last;
  const best = bestSet({ ...base, sets: base === last ? done : splitTypos(completedSets(base)).kept });
  if (old && best && (Math.abs(old.repsMax - repsMax) >= 3 || Math.abs(old.repsMin - repsMin) >= 3)) {
    const estimate = (best.e1rm / (1 + repsMax / 30)) * 0.95;
    const start = snapDown(estimate, stepAt(estimate), ex?.implement);
    if (start > 0) return { kind: "primeira", loadKg: start, text: `A faixa de repetições mudou: comece com cerca de ${fmtKg(start)} e ajuste.` };
  }

  // 2) Retorno após pausa: ~90% da carga, arredondado para baixo até uma carga que existe. Nunca a partir de um número suspeito.
  if (returning) {
    const from = suspicious ? previous : top;
    const snapped = snapDown(from * 0.9, stepAt(from * 0.9), ex?.implement);
    const next = snapped > 0 ? snapped : from;
    return { kind: "retorno", loadKg: next, text: back(`com ${fmtKg(next)}${loadable ? "" : " de peso extra"}`) };
  }

  // 3) Guarda de digitação.
  if (suspicious) return { kind: "manter", loadKg: previous, text: `Última vez: ${fmtKg(top)}? Confira se foi isso mesmo.` };
  if (ignored.length) {
    const typed = fmtKg(Math.max(...ignored.map(loadOf)));
    const text = ignored.length === 1 ? `Uma série parecia digitada errada (${typed}) e foi ignorada.` : `${ignored.length} séries pareciam digitadas erradas (${typed}) e foram ignoradas.`;
    return { kind: "manter", loadKg: top, text };
  }

  // 4) Progressão dupla.
  const atTop = done.filter((s) => (s.loadKg ?? 0) === top);
  const varied = new Set(loads).size > 1 && atTop.length < sets;
  if ((planned.technique && VARIED_LOAD_TECHNIQUES.includes(planned.technique)) || varied) {
    return { kind: "manter", loadKg: top, text: "Cargas variadas: repita o esquema e tente mais 1 rep na série mais pesada." };
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
  const short = missing === 1 ? "faltou 1 rep" : `faltaram ${missing} reps`;
  // Séries puladas não viram "reps que faltaram" (2 de 4 séries feitas não é "faltaram 18 reps").
  const partial = work.length > 0 && work.length < sets;
  const keep: LoadSuggestion = {
    kind: "manter",
    loadKg: top,
    text: partial ? `Manter ${fmtKg(top)}: da última vez saíram ${work.length} de ${sets} séries.` : `Manter ${fmtKg(top)}: ${short} para fechar ${sets}×${repsMax}.`,
  };
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
  // Salto grande sem gangorra: quando o degrau passa de 10% da carga (halter 14 → 16 kg), ficar abaixo do mínimo nas
  // primeiras vezes é normal. Fora dos exercícios principais e das séries fixas (5×5), só reduz com a 1ª série 3+ reps abaixo.
  if (!fixed && !ex?.main && top - next > 0.1 * top && reps[0]! > repsMin - 3) {
    return {
      kind: "manter",
      loadKg: top,
      // Texto encurtado em relação ao da spec para caber em 2 linhas a 360 px (ver DECISIONS.md, 2026-11-22).
      text: `Salto grande (${fmtNumber(next)} → ${fmtKg(top)}): abaixo de ${repsMin} reps no início é normal. Mantenha ${fmtKg(top)}.`,
    };
  }
  return { kind: "reduzir", loadKg: next, text: `Reduzir ${what}para ${fmtKg(next)} e reconstruir as reps com boa técnica.` };
}

/**
 * O que a tela de treino deve chamar: sugestão a partir do histórico, com o último registro do exercício (e a data dele,
 * para o retorno após pausa) e os 3 anteriores (para a trava de 2×).
 */
export function suggestFromHistory(sessions: Session[], planned: PlannedTarget, exerciseId: string, now: Date = new Date()): LoadSuggestion {
  const [last, ...earlier] = recentPerformances(sessions, exerciseId, 4);
  return suggestNext(last?.log ?? null, planned, exerciseId, { lastAt: last?.startedAt, earlier: earlier.map((e) => e.log), now });
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

/** É o 1º treino da semana (segunda a domingo)? Para mostrar "Semana N seguida" só uma vez por semana. */
export function firstOfWeek(session: Pick<Session, "id" | "startedAt">, history: Pick<Session, "id" | "startedAt">[]): boolean {
  const week = weekStart(session.startedAt);
  return !history.some((h) => h.id !== session.id && h.startedAt < session.startedAt && weekStart(h.startedAt) === week);
}

/** Resultado de compareWithLastSameDay: o bloco "Desde o último Treino B" do fim de treino. */
export interface SameDayComparison {
  /**
   * "first": 1ª vez com esta ficha neste dia (mostrar `firstText`); "compare": houve um treino anterior igual (o bloco
   * só aparece se houver `lines`); "none": treino livre ou sem dia da ficha (nada a mostrar).
   */
  variant: "first" | "compare" | "none";
  /** "Treino B" (null no treino livre). */
  dayLabel: string | null;
  /** Até 3 linhas do que melhorou, em pt-BR. Vazio = o bloco não aparece (nunca "você piorou"). */
  lines: string[];
  /** "Primeiro Treino B registrado. Na próxima, a gente compara." (só em "first"). */
  firstText?: string;
}

/** Soma das melhores k séries de cada lado (k = o menor número de séries): ganho de reps com a mesma carga. */
function repsGain(before: SetLog[], now: SetLog[]): number {
  const k = Math.min(before.length, now.length);
  const sum = (xs: SetLog[]) =>
    xs
      .map(repsOf)
      .sort((a, b) => b - a)
      .slice(0, k)
      .reduce((a, b) => a + b, 0);
  return sum(now) - sum(before);
}

const plural = (n: number) => `${n} ${n === 1 ? "rep" : "reps"}`;

/** O que melhorou num exercício em relação a um registro anterior (rank 0 = carga, 1 = reps/tempo), ou null. */
function improvement(now: ExerciseLog, prev: ExerciseLog): { line: string; rank: number } | null {
  const id = now.exerciseId;
  const unit = unitOf(id, now.unit);
  // Aeróbio em minutos não entra (mais tempo andando não é marca), como nos recordes.
  if (unit === "min") return null;
  const name = now.name;
  const maxReps = (xs: SetLog[]) => Math.max(0, ...xs.map(repsOf));

  if (ASSISTED.has(id)) {
    // Graviton: menos ajuda é melhor. Vale a série com o mínimo de reps da faixa, como no recorde.
    const floor = now.planned?.repsMin ?? 1;
    const counts = (s: SetLog) => loadOf(s) > 0 && repsOf(s) >= floor;
    const a = completedSets(prev).filter(counts);
    const b = completedSets(now).filter(counts);
    if (!a.length || !b.length) return null;
    const ha = Math.min(...a.map(loadOf));
    const hb = Math.min(...b.map(loadOf));
    if (hb < ha) return { line: `${name}: ${fmtNumber(ha)} → ${fmtKg(hb)} de ajuda`, rank: 0 };
    const gain = hb === ha ? repsGain(a.filter((s) => loadOf(s) === ha), b.filter((s) => loadOf(s) === hb)) : 0;
    return gain > 0 ? { line: `${name}: +${plural(gain)} com ${fmtKg(hb)} de ajuda`, rank: 1 } : null;
  }

  const a = splitTypos(completedSets(prev)).kept;
  const b = splitTypos(completedSets(now)).kept;
  if (!a.length || !b.length) return null;

  if (unit === "seg") {
    const sa = maxReps(a);
    const sb = maxReps(b);
    return sb > sa ? { line: `${name}: ${sa} → ${sb} s`, rank: 1 } : null;
  }

  const ta = Math.max(0, ...a.map(loadOf));
  const tb = Math.max(0, ...b.map(loadOf));
  if (ta === 0 && tb === 0) {
    // Peso corporal: mais repetições na melhor série.
    const ra = maxReps(a);
    const rb = maxReps(b);
    return rb > ra ? { line: `${name}: ${ra} → ${plural(rb)}`, rank: 1 } : null;
  }
  if (ta === 0) {
    // Passou a usar peso extra num exercício de carga opcional (peso corporal, elástico, caneleira).
    const impl = getExercise(id)?.implement;
    const optional = impl === "peso_corporal" || impl === "elastico" || impl === "caneleira";
    return optional ? { line: `${name}: +${fmtKg(tb)} extra`, rank: 0 } : null;
  }
  // Mesma trava de digitação dos recordes: mais de 2× a carga anterior não é comemorado.
  if (ta >= 20 && tb > ta * 2) return null;
  if (tb > ta) return { line: `${name}: ${fmtNumber(ta)} → ${fmtKg(tb)}`, rank: 0 };
  if (tb < ta) return null;
  const gain = repsGain(a.filter((s) => loadOf(s) === ta), b.filter((s) => loadOf(s) === tb));
  return gain > 0 ? { line: `${name}: +${plural(gain)} com ${fmtKg(tb)}`, rank: 1 } : null;
}

/**
 * "Desde o último Treino B": compara esta sessão com o último treino da mesma ficha e do mesmo dia (programId + dayKey).
 * Exercício que não estava naquele treino (o dia mudou, exercício trocado) é comparado com o último registro dele em
 * qualquer treino. Linhas só do que melhorou — carga primeiro, depois reps/tempo, na ordem do treino —, no máximo `max`:
 * "Agachamento livre: 60 → 62,5 kg", "Supino reto com barra: +1 rep com 40 kg", "Prancha: 45 → 60 s",
 * "Barra fixa: 8 → 10 reps", "Barra fixa assistida (graviton/gravitron): 30 → 25 kg de ajuda".
 * Usa o nome do exercício como foi registrado; a tela pode truncar.
 */
export function compareWithLastSameDay(session: Session, history: Session[], max = 3): SameDayComparison {
  if (!session.programId || !session.dayKey) return { variant: "none", dayLabel: null, lines: [] };
  const dayLabel = `Treino ${session.dayKey}`;
  const earlier = history.filter((h) => h.id !== session.id && h.startedAt < session.startedAt).sort(byNewest);
  const sameDay = earlier.find((h) => h.programId === session.programId && h.dayKey === session.dayKey && h.exercises.some((e) => completedSets(e).length));
  if (!sameDay) return { variant: "first", dayLabel, lines: [], firstText: `Primeiro ${dayLabel} registrado. Na próxima, a gente compara.` };

  const seen = new Set<string>();
  const found: { line: string; rank: number; order: number }[] = [];
  session.exercises.forEach((log, order) => {
    if (seen.has(log.exerciseId) || !completedSets(log).length) return;
    seen.add(log.exerciseId);
    const prev = sameDay.exercises.find((e) => e.exerciseId === log.exerciseId && completedSets(e).length) ?? lastPerformance(earlier, log.exerciseId);
    const imp = prev ? improvement(log, prev) : null;
    if (imp) found.push({ ...imp, order });
  });
  found.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return { variant: "compare", dayLabel, lines: found.slice(0, Math.max(0, max)).map((f) => f.line) };
}
