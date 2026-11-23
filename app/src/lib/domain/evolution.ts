import { getExercise, unitOf } from "./exercises";
import { todayISO } from "./ids";
import { completedSets, e1rm, fmtKg, isAssisted, splitTypos } from "./progression";
import type { ExerciseLog, Implement, Session, SetLog, Unit } from "./types";

/**
 * Evolução de um exercício com números que alguém levantou de verdade (U6 §3.1–3.2). Puro: a aba Cargas, o
 * relatório e os testes saem daqui.
 *  - Marca: a melhor série de um exercício num treino, `{ loadKg, reps }` (em exercício por tempo, reps = segundos).
 *  - Marca válida: a que não é suspeita (R-5: carga acima do dobro da maior válida anterior, com a anterior ≥ 20 kg,
 *    a mesma trava do recorde em `setRecord`).
 *  - Tipo de progresso (`ProgressKind`): diz como comparar e se o 1RM estimado se aplica.
 * "Data" é sempre o dia local AAAA-MM-DD do treino (um treino às 22h no Brasil continua no dia em que foi feito).
 */

export type ProgressKind = "forca" | "reps" | "tempo" | "ajuda" | "duplo";
export type Direction = "subiu" | "igual" | "caiu" | "indefinido";

/** Implementos em que a carga é opcional: com carga em alguma série, carga e reps mudam juntas (`duplo`). */
export const OPTIONAL_LOAD_IMPLEMENTS: readonly Implement[] = ["peso_corporal", "elastico"];

/** Trava de digitação entre treinos: só vale com a maior carga válida anterior a partir daqui (igual a `setRecord`). */
export const SUSPECT_MIN_KG = 20;

/** Acima disso o 1RM de Epley para de subir (teto de `e1rm`): sem % e sem gráfico de força. */
export const E1RM_MAX_REPS = 12;

export interface Mark {
  loadKg: number;
  reps: number;
}

export interface SessionMark {
  sessionId: string;
  startedAt: string;
  /** Dia local AAAA-MM-DD. */
  date: string;
  mark: Mark;
  /** 1RM estimado (com o teto de 12 reps) só no tipo `forca`; null nos outros. */
  e1rm: number | null;
  /** O treino bateu recorde neste exercício (`session.prs`). */
  record: boolean;
  /** Fora da comparação, do gráfico e do relatório (R-5). Continua em "Últimos treinos". */
  suspect: boolean;
}

export interface ExerciseComparison {
  state: "um_registro" | "ok";
  /** Válida mais antiga. */
  first: SessionMark;
  /** Válida mais recente (null em um_registro). */
  last: SessionMark | null;
  /** Melhor marca (R-9), só quando não é first nem last e é melhor que last. */
  best: SessionMark | null;
  direction: Direction | null;
  /** Variação do 1RM estimado em % (R-8): só em força, com as duas marcas até 12 reps. */
  deltaPct: number | null;
  /** A marca mais recente de todas, quando ela é suspeita (só esse caso ganha aviso). */
  suspectLatest: SessionMark | null;
}

export type NoChartReason = "um_registro" | "ajuda" | "duplo" | "reps_altas";

export interface ExerciseChart {
  metric: "e1rm" | "reps" | "seg";
  points: { date: string; value: number }[];
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  unit: Unit;
  kind: ProgressKind;
  /** Do mais antigo ao mais recente, válidas e suspeitas. `marks.length` é o "(N treinos)" do seletor. */
  marks: SessionMark[];
  comparison: ExerciseComparison;
  chart: ExerciseChart | null;
  noChartReason: NoChartReason | null;
}

/** Marcas de um exercício sobre o histórico (R-1 a R-5), sem a comparação. Base de `exerciseProgress` e do relatório. */
export interface ExerciseMarks {
  exerciseId: string;
  name: string;
  unit: Unit;
  kind: ProgressKind;
  marks: SessionMark[];
}

const loadOf = (s: Pick<SetLog, "loadKg">) => s.loadKg ?? 0;
const repsOf = (s: Pick<SetLog, "reps">) => s.reps ?? 0;
const isDone = (s: SetLog) => s.done && repsOf(s) > 0;
const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Diferença de carga sem resto de ponto flutuante (32,5 − 30 = 2,5, não 2,4999…). */
const diffKg = (a: number, b: number) => Math.round((a - b) * 100) / 100;
const markE1rm = (m: Mark) => e1rm(m.loadKg, m.reps);

/**
 * R-2. Tipo de progresso a partir da unidade e das séries feitas (de todos os registros considerados), nesta ordem:
 * minutos → null (aeróbio não entra); graviton → `ajuda`; segundos → `duplo` com carga em alguma série, senão `tempo`;
 * peso do corpo ou elástico → `duplo` com carga, senão `reps`; demais implementos → `forca` com carga, senão `reps`.
 */
export function progressKind(exerciseId: string, unit: Unit, sets: readonly SetLog[]): ProgressKind | null {
  if (unit === "min") return null;
  if (isAssisted(exerciseId)) return "ajuda";
  const anyLoad = sets.some((s) => isDone(s) && loadOf(s) > 0);
  if (unit === "seg") return anyLoad ? "duplo" : "tempo";
  const implement = getExercise(exerciseId)?.implement;
  if (implement && OPTIONAL_LOAD_IMPLEMENTS.includes(implement)) return anyLoad ? "duplo" : "reps";
  return anyLoad ? "forca" : "reps";
}

/** A série que vence entre as candidatas; `better(a, b)` diz se a vence b. A primeira vence o empate total. */
function pick(sets: readonly SetLog[], better: (a: Mark, b: Mark) => boolean): Mark | null {
  let best: Mark | null = null;
  for (const s of sets) {
    const m = { loadKg: loadOf(s), reps: repsOf(s) };
    if (!best || better(m, best)) best = m;
  }
  return best;
}

/** forca: maior 1RM estimado (com o teto), depois mais reps, depois mais carga. */
function strongerThan(a: Mark, b: Mark): boolean {
  const ea = markE1rm(a);
  const eb = markE1rm(b);
  if (ea !== eb) return ea > eb;
  if (a.reps !== b.reps) return a.reps > b.reps;
  return a.loadKg > b.loadKg;
}

/** ajuda: menos ajuda, depois mais reps. */
function lessHelpThan(a: Mark, b: Mark): boolean {
  if (a.loadKg !== b.loadKg) return a.loadKg < b.loadKg;
  return a.reps > b.reps;
}

/**
 * R-3. Marca do treino (a melhor série do registro), ou null quando o treino não conta:
 *  - forca: séries sem erro de digitação (`splitTypos`) com carga; maior 1RM, depois mais reps, depois mais carga;
 *  - reps e tempo: a série com mais reps (ou segundos);
 *  - ajuda: entre as séries com ajuda e reps ≥ o mínimo da faixa planejada (1 sem ficha), a de menos ajuda; depois mais reps;
 *  - duplo: séries sem erro de digitação; a de mais carga, depois mais reps.
 */
export function sessionMark(log: ExerciseLog, kind: ProgressKind): Mark | null {
  const done = completedSets(log);
  if (!done.length) return null;
  switch (kind) {
    case "forca":
      return pick(
        splitTypos(done).kept.filter((s) => loadOf(s) > 0),
        strongerThan,
      );
    case "reps":
    case "tempo":
      return pick(done, (a, b) => a.reps > b.reps);
    case "ajuda": {
      const floor = log.planned?.repsMin ?? 1;
      return pick(
        done.filter((s) => loadOf(s) > 0 && repsOf(s) >= floor),
        lessHelpThan,
      );
    }
    case "duplo":
      return pick(splitTypos(done).kept, (a, b) => (a.loadKg !== b.loadKg ? a.loadKg > b.loadKg : a.reps > b.reps));
  }
}

/**
 * R-7. Direção de `before` para `after`:
 *  - reps e tempo: o sinal de Δreps (Δsegundos);
 *  - ajuda: menos ajuda sobe, mais ajuda cai; com a mesma ajuda, decide o sinal das reps;
 *  - forca e duplo: carga e reps iguais → igual; as duas ≥ 0 → subiu; as duas ≤ 0 → caiu; sinais opostos: em força
 *    decide o 1RM estimado (empate → igual), em duplo → indefinido.
 */
export function compareMarks(before: Mark, after: Mark, kind: ProgressKind): Direction {
  const dl = sign(diffKg(after.loadKg, before.loadKg));
  const dr = sign(after.reps - before.reps);
  const of = (s: number): Direction => (s > 0 ? "subiu" : s < 0 ? "caiu" : "igual");
  if (kind === "reps" || kind === "tempo") return of(dr);
  if (kind === "ajuda") return dl !== 0 ? of(-dl) : of(dr);
  if (dl === 0 && dr === 0) return "igual";
  if (dl >= 0 && dr >= 0) return "subiu";
  if (dl <= 0 && dr <= 0) return "caiu";
  return kind === "forca" ? of(sign(markE1rm(after) - markE1rm(before))) : "indefinido";
}

/**
 * R-8. Variação do 1RM estimado em %, arredondada (a mesma conta do relatório). null quando uma das marcas passa de
 * 12 reps (o teto do Epley achataria a diferença) ou não tem carga.
 */
export function markDeltaPct(before: Mark, after: Mark): number | null {
  if (before.reps > E1RM_MAX_REPS || after.reps > E1RM_MAX_REPS) return null;
  const a = markE1rm(before);
  const b = markE1rm(after);
  if (!a || !b) return null;
  return Math.round(((b - a) / a) * 100) || 0;
}

/**
 * R-9. Melhor marca entre as candidatas (passe só as válidas): força = maior 1RM, depois mais reps, depois mais carga;
 * reps e tempo = mais reps; ajuda = menos ajuda, depois mais reps; empate total = a mais antiga; duplo = nenhuma.
 */
export function bestMarkOf(marks: readonly SessionMark[], kind: ProgressKind): SessionMark | null {
  if (kind === "duplo") return null;
  const better = kind === "forca" ? strongerThan : kind === "ajuda" ? lessHelpThan : (a: Mark, b: Mark) => a.reps > b.reps;
  let best: SessionMark | null = null;
  for (const m of marks) if (!best || better(m.mark, best.mark)) best = m;
  return best;
}

interface Considered {
  session: Session;
  log: ExerciseLog;
  date: string;
}

/**
 * R-1 a R-5. Por treino (do mais antigo ao mais recente), o 1º registro do exercício com séries feitas; a unidade de
 * referência e o nome são os do registro mais recente, e registros em outra unidade ficam de fora. null para aeróbio
 * em minutos ou quando nenhum treino conta.
 */
export function exerciseMarks(sessions: readonly Session[], exerciseId: string): ExerciseMarks | null {
  const records: Considered[] = [];
  for (const session of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const log = session.exercises.find((e) => e.exerciseId === exerciseId && completedSets(e).length);
    if (log) records.push({ session, log, date: todayISO(started) });
  }
  const latest = records[records.length - 1];
  if (!latest) return null;
  const unit = unitOf(exerciseId, latest.log.unit);
  const same = records.filter((r) => unitOf(exerciseId, r.log.unit) === unit);
  const kind = progressKind(
    exerciseId,
    unit,
    same.flatMap((r) => completedSets(r.log)),
  );
  if (!kind) return null;

  const guarded = kind === "forca" || kind === "duplo";
  const marks: SessionMark[] = [];
  let maxValid = 0;
  for (const r of same) {
    const mark = sessionMark(r.log, kind);
    if (!mark) continue;
    // R-5: a maior carga entre as marcas anteriores não suspeitas; a suspeita não atualiza esse máximo.
    const suspect = guarded && maxValid >= SUSPECT_MIN_KG && mark.loadKg > 2 * maxValid;
    if (!suspect) maxValid = Math.max(maxValid, mark.loadKg);
    marks.push({
      sessionId: r.session.id,
      startedAt: r.session.startedAt,
      date: r.date,
      mark,
      e1rm: kind === "forca" ? markE1rm(mark) : null,
      record: r.session.prs.includes(exerciseId),
      suspect,
    });
  }
  if (!marks.length) return null;
  return { exerciseId, name: latest.log.name, unit, kind, marks };
}

/** R-5, R-6, R-7, R-8 e R-9 sobre as marcas (do mais antigo ao mais recente). */
function compare(marks: readonly SessionMark[], kind: ProgressKind): ExerciseComparison {
  const valid = marks.filter((m) => !m.suspect);
  const latest = marks[marks.length - 1]!;
  const suspectLatest = latest.suspect ? latest : null;
  // A primeira marca nunca é suspeita (não há anterior), então sempre há uma válida.
  const first = valid[0]!;
  const last = valid[valid.length - 1]!;
  // As datas acompanham a ordem dos treinos: duas datas distintas ⇔ a primeira e a última diferem.
  if (first.date === last.date) return { state: "um_registro", first, last: null, best: null, direction: null, deltaPct: null, suspectLatest };
  const best = bestMarkOf(valid, kind);
  return {
    state: "ok",
    first,
    last,
    best: best && best !== first && best !== last && compareMarks(last.mark, best.mark, kind) === "subiu" ? best : null,
    direction: compareMarks(first.mark, last.mark, kind),
    deltaPct: kind === "forca" ? markDeltaPct(first.mark, last.mark) : null,
    suspectLatest,
  };
}

/**
 * R-10. Gráfico: nenhum com um registro só, na ajuda ou no duplo (nessa ordem de motivo). Em força, nenhum quando menos
 * da metade das marcas válidas tem até 12 reps (`reps_altas`); senão, o 1RM estimado das válidas. reps → reps; tempo →
 * segundos. As suspeitas nunca entram.
 */
function chartOf(marks: readonly SessionMark[], kind: ProgressKind, state: ExerciseComparison["state"]): { chart: ExerciseChart | null; noChartReason: NoChartReason | null } {
  if (state === "um_registro") return { chart: null, noChartReason: "um_registro" };
  if (kind === "ajuda" || kind === "duplo") return { chart: null, noChartReason: kind };
  const valid = marks.filter((m) => !m.suspect);
  if (kind === "forca") {
    const precise = valid.filter((m) => m.mark.reps <= E1RM_MAX_REPS).length;
    if (precise * 2 < valid.length) return { chart: null, noChartReason: "reps_altas" };
    return { chart: { metric: "e1rm", points: valid.map((m) => ({ date: m.date, value: m.e1rm ?? markE1rm(m.mark) })) }, noChartReason: null };
  }
  return { chart: { metric: kind === "tempo" ? "seg" : "reps", points: valid.map((m) => ({ date: m.date, value: m.mark.reps })) }, noChartReason: null };
}

/** Tudo o que a aba Cargas mostra de um exercício, ou null (aeróbio em minutos, ou nenhum treino que conte). */
export function exerciseProgress(sessions: readonly Session[], exerciseId: string): ExerciseProgress | null {
  const h = exerciseMarks(sessions, exerciseId);
  if (!h) return null;
  const comparison = compare(h.marks, h.kind);
  return { ...h, comparison, ...chartOf(h.marks, h.kind, comparison.state) };
}

const MINUS = "−";
const signed = (v: number, text: string) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${text}`;
const repsText = (n: number) => `${n} ${n === 1 ? "rep" : "reps"}`;

/**
 * R-11. A diferença entre duas marcas em palavras (com "−" U+2212 e kg no formato pt-BR):
 * "+15 kg e +1 rep", "+2,5 kg com as mesmas reps", "+4 reps com a mesma carga", "+4 kg no mesmo tempo",
 * "+3 reps na melhor série", "+15 s na melhor série", "5 kg a menos de ajuda", "10 kg a mais de ajuda e +2 reps".
 */
export function deltaLine(kind: ProgressKind, before: Mark, after: Mark, unit: Unit): string {
  const dl = diffKg(after.loadKg, before.loadKg);
  const dr = after.reps - before.reps;
  const reps = signed(dr, repsText(Math.abs(dr)));
  const secs = signed(dr, `${Math.abs(dr)} s`);
  switch (kind) {
    case "reps":
      return dr === 0 ? "Mesmas reps na melhor série" : `${reps} na melhor série`;
    case "tempo":
      return dr === 0 ? "Mesmo tempo na melhor série" : `${secs} na melhor série`;
    case "ajuda": {
      if (dl === 0) return dr === 0 ? "Mesma ajuda e mesmas reps" : `${reps} com a mesma ajuda`;
      const help = dl < 0 ? `${fmtKg(-dl)} a menos de ajuda` : `${fmtKg(dl)} a mais de ajuda`;
      return dr === 0 ? help : `${help} e ${reps}`;
    }
    case "forca":
    case "duplo": {
      const seg = unit === "seg";
      const other = seg ? secs : reps;
      if (dl === 0 && dr === 0) return seg ? "Mesma carga e mesmo tempo" : "Mesma carga e mesmas reps";
      if (dl === 0) return `${other} com a mesma carga`;
      const kg = signed(dl, fmtKg(Math.abs(dl)));
      if (dr === 0) return `${kg} ${seg ? "no mesmo tempo" : "com as mesmas reps"}`;
      return `${kg} e ${other}`;
    }
  }
}

/** R-12. "Força estimada (1RM): +20%" / "…: −5%" / "…: menos de 1% de diferença". null sem `deltaPct`. */
export function strengthIndicator(c: Pick<ExerciseComparison, "deltaPct">): string | null {
  if (c.deltaPct === null) return null;
  if (c.deltaPct === 0) return "Força estimada (1RM): menos de 1% de diferença";
  return `Força estimada (1RM): ${signed(c.deltaPct, `${Math.abs(c.deltaPct)}%`)}`;
}

/**
 * R-13. Datas da comparação em "dd/mm"; se as duas forem de anos diferentes, as duas viram "dd/mm/aa".
 * Recebe dias locais AAAA-MM-DD (`SessionMark.date`, `StrengthRow.fromDate`).
 */
export function comparisonDates(first: string, last: string | null = null): { first: string; last: string | null } {
  const withYear = last !== null && first.slice(0, 4) !== last.slice(0, 4);
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}${withYear ? `/${d.slice(2, 4)}` : ""}`;
  return { first: fmt(first), last: last === null ? null : fmt(last) };
}
