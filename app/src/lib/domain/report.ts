import { unitOf } from "./exercises";
import { todayISO } from "./ids";
import { bestSet, completedSets, sessionVolume, weekStart } from "./progression";
import type { BodyMetric, Profile, Session } from "./types";

/**
 * Relatório de evolução: o que mudou num período (frequência, cargas, medidas),
 * em números que o aluno entende. Puro: a tela e o texto do WhatsApp saem daqui.
 */

export type ReportDays = 30 | 60 | 90;

type BodyKey = "weightKg" | "bodyFatPct" | "waistCm" | "hipCm" | "chestCm" | "armCm" | "thighCm";

const BODY: { key: BodyKey; label: string; unit: string }[] = [
  { key: "weightKg", label: "Peso", unit: "kg" },
  { key: "bodyFatPct", label: "Gordura corporal", unit: "%" },
  { key: "waistCm", label: "Cintura", unit: "cm" },
  { key: "hipCm", label: "Quadril", unit: "cm" },
  { key: "chestCm", label: "Peito", unit: "cm" },
  { key: "armCm", label: "Braço", unit: "cm" },
  { key: "thighCm", label: "Coxa", unit: "cm" },
];

export interface StrengthRow {
  exerciseId: string;
  name: string;
  from: { loadKg: number; reps: number };
  to: { loadKg: number; reps: number };
  /** Variação da força estimada (1RM de Epley), em %. */
  deltaPct: number;
  sessions: number;
}

export interface BodyRow {
  key: BodyKey;
  label: string;
  unit: string;
  from: number;
  to: number;
  delta: number;
  fromDate: string;
  toDate: string;
}

export interface EvolutionReport {
  name: string;
  /** Datas locais yyyy-mm-dd, inclusive. */
  from: string;
  to: string;
  days: number;
  sessions: number;
  /** Treinos esperados no período pela frequência combinada; null sem frequência definida. */
  planned: number | null;
  adherencePct: number | null;
  weeks: { week: string; sessions: number }[];
  /** Cartão de presença: semanas de segunda a domingo cobrindo o período. */
  calendar: { week: string; days: { date: string; state: "treinou" | "livre" | "fora" }[] }[];
  minutes: number;
  volumeKg: number;
  sets: number;
  previousSessions: number;
  prs: { exerciseId: string; name: string }[];
  strength: StrengthRow[];
  /** Exercícios com carga comparável que não subiram no período. */
  steady: number;
  body: BodyRow[];
  highlights: string[];
  hasData: boolean;
}

const dayOf = (iso: string) => todayISO(new Date(iso));

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return todayISO(d);
}

const num = (v: number, digits = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), digits)}`;
const br = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Lista curta de nomes: os primeiros e "e mais N" (um mês bom rende dezenas de recordes). */
export function nameList(names: string[], max = 5): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} e mais ${names.length - max}`;
}

/** "9 h 40 min", "45 min". */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function buildReport(input: { profile: Pick<Profile, "name" | "daysPerWeek">; sessions: Session[]; metrics: BodyMetric[]; days: ReportDays; daysPerWeek?: number; now?: Date }): EvolutionReport {
  const { profile } = input;
  const to = todayISO(input.now ?? new Date());
  const all = [...input.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  // Quem começou há menos tempo que o período pedido é avaliado desde o primeiro treino:
  // semanas anteriores não contam como falta.
  const requestedFrom = shiftDays(to, -(input.days - 1));
  const firstEver = all[0] ? dayOf(all[0].startedAt) : null;
  const from = firstEver && firstEver > requestedFrom && firstEver <= to ? firstEver : requestedFrom;
  const days = Math.round((Date.parse(to + "T12:00:00") - Date.parse(from + "T12:00:00")) / 86_400_000) + 1;
  const prevFrom = shiftDays(from, -days);

  const inPeriod = all.filter((s) => {
    const d = dayOf(s.startedAt);
    return d >= from && d <= to;
  });
  const before = all.filter((s) => dayOf(s.startedAt) < from);
  const previousSessions = before.filter((s) => dayOf(s.startedAt) >= prevFrom).length;

  // Frequência
  const perWeek = Math.min(7, Math.max(0, input.daysPerWeek ?? profile.daysPerWeek ?? 0));
  const planned = perWeek ? Math.max(1, Math.round((perWeek * days) / 7)) : null;
  const adherencePct = planned ? Math.round((inPeriod.length / planned) * 100) : null;
  const weeks: { week: string; sessions: number }[] = [];
  for (let w = weekStart(from); w <= to; w = shiftDays(w, 7)) weeks.push({ week: w, sessions: 0 });
  for (const s of inPeriod) {
    const w = weeks.find((x) => x.week === weekStart(s.startedAt));
    if (w) w.sessions += 1;
  }

  const trained = new Set(inPeriod.map((s) => dayOf(s.startedAt)));
  const calendar = weeks.map((w) => ({
    week: w.week,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = shiftDays(w.week, i);
      const state: "treinou" | "livre" | "fora" = date < from || date > to ? "fora" : trained.has(date) ? "treinou" : "livre";
      return { date, state };
    }),
  }));

  // Tempo, volume e séries
  let minutes = 0;
  let sets = 0;
  let volumeKg = 0;
  for (const s of inPeriod) {
    if (s.finishedAt) {
      const m = (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60000;
      if (m > 0 && m <= 240) minutes += Math.round(m);
    }
    volumeKg += s.volumeKg || sessionVolume(s);
    for (const e of s.exercises) sets += completedSets(e).length;
  }

  // Recordes
  const prMap = new Map<string, string>();
  for (const s of inPeriod) for (const id of s.prs) prMap.set(id, s.exercises.find((e) => e.exerciseId === id)?.name ?? id);

  // Cargas: melhor série do período contra o ponto de partida
  // (último treino antes do período, ou o primeiro do período para quem começou agora).
  const ids = new Set<string>();
  for (const s of inPeriod) for (const e of s.exercises) if (unitOf(e.exerciseId, e.unit) === "reps") ids.add(e.exerciseId);
  const strength: StrengthRow[] = [];
  let steady = 0;
  for (const id of ids) {
    const logs = inPeriod.map((s) => s.exercises.find((e) => e.exerciseId === id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
    const marks = logs.map((l) => bestSet(l)).filter((b): b is NonNullable<typeof b> => Boolean(b && b.loadKg > 0));
    if (!marks.length) continue;
    const prior = [...before]
      .reverse()
      .map((s) => s.exercises.find((e) => e.exerciseId === id))
      .map((l) => (l ? bestSet(l) : null))
      .find((b) => b && b.loadKg > 0);
    const base = prior ?? marks[0]!;
    const later = prior ? marks : marks.slice(1);
    if (!later.length) continue;
    const best = later.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const deltaPct = base.e1rm ? Math.round(((best.e1rm - base.e1rm) / base.e1rm) * 100) : 0;
    if (deltaPct >= 1) strength.push({ exerciseId: id, name: logs[0]!.name, from: { loadKg: base.loadKg, reps: base.reps }, to: { loadKg: best.loadKg, reps: best.reps }, deltaPct, sessions: logs.length });
    else steady += 1;
  }
  strength.sort((a, b) => b.deltaPct - a.deltaPct || b.sessions - a.sessions);

  // Medidas: último registro até o início do período (até 60 dias antes) contra o último do período
  const metrics = [...input.metrics].sort((a, b) => a.date.localeCompare(b.date));
  const body: BodyRow[] = [];
  for (const b of BODY) {
    const withValue = metrics.filter((m) => typeof m[b.key] === "number" && (m[b.key] as number) > 0);
    const end = [...withValue].reverse().find((m) => m.date >= from && m.date <= to);
    if (!end) continue;
    const start = [...withValue].reverse().find((m) => m.date <= from && m.date >= shiftDays(from, -60) && m.date < end.date) ?? withValue.find((m) => m.date >= from && m.date < end.date);
    if (!start) continue;
    const a = start[b.key] as number;
    const z = end[b.key] as number;
    body.push({ key: b.key, label: b.label, unit: b.unit, from: a, to: z, delta: Math.round((z - a) * 10) / 10, fromDate: start.date, toDate: end.date });
  }

  // Frases prontas, do mais concreto para o mais geral
  const highlights: string[] = [];
  if (inPeriod.length) {
    highlights.push(
      planned
        ? `${inPeriod.length} ${inPeriod.length === 1 ? "treino" : "treinos"} em ${days} dias, de ${planned} ${planned === 1 ? "combinado" : "combinados"} (${Math.min(adherencePct!, 999)}% de frequência).`
        : `${inPeriod.length} ${inPeriod.length === 1 ? "treino" : "treinos"} em ${days} dias.`,
    );
  }
  if (strength[0]) {
    const s = strength[0];
    highlights.push(`Maior evolução: ${s.name}, de ${num(s.from.loadKg, 2)} kg × ${s.from.reps} para ${num(s.to.loadKg, 2)} kg × ${s.to.reps} (${signed(s.deltaPct, 0)}%).`);
  }
  if (prMap.size) highlights.push(`${prMap.size} ${prMap.size === 1 ? "recorde pessoal" : "recordes pessoais"} no período.`);
  const weight = body.find((b) => b.key === "weightKg");
  if (weight && weight.delta !== 0) highlights.push(`Peso: de ${num(weight.from)} para ${num(weight.to)} kg (${signed(weight.delta)} kg).`);
  const waist = body.find((b) => b.key === "waistCm");
  if (waist && waist.delta !== 0) highlights.push(`Cintura: ${signed(waist.delta)} cm.`);
  if (inPeriod.length && previousSessions && inPeriod.length !== previousSessions) {
    const diff = inPeriod.length - previousSessions;
    highlights.push(`${Math.abs(diff)} ${Math.abs(diff) === 1 ? "treino" : "treinos"} a ${diff > 0 ? "mais" : "menos"} que nos ${days} dias anteriores.`);
  }

  return {
    name: profile.name,
    from,
    to,
    days,
    sessions: inPeriod.length,
    planned,
    adherencePct,
    weeks,
    calendar,
    minutes,
    volumeKg: Math.round(volumeKg),
    sets,
    previousSessions,
    prs: [...prMap].map(([exerciseId, name]) => ({ exerciseId, name })),
    strength: strength.slice(0, 8),
    steady,
    body,
    highlights,
    hasData: inPeriod.length > 0 || body.length > 0,
  };
}

/** Relatório em texto simples para o WhatsApp (*negrito* com asteriscos, sem emoji). */
export function reportToText(r: EvolutionReport, opts: { coachName?: string; message?: string; self?: boolean } = {}): string {
  const out: string[] = [`*${opts.self ? "Meu resumo de treino" : `Relatório de evolução — ${r.name.trim()}`}*`, `${br(r.from)} a ${br(r.to)}/${r.to.slice(0, 4)} (${r.days} dias)`];

  out.push("", "*Frequência*");
  if (r.sessions) {
    out.push(r.planned ? `${r.sessions} de ${r.planned} treinos combinados (${r.adherencePct}%)` : `${r.sessions} ${r.sessions === 1 ? "treino" : "treinos"}`);
    if (r.weeks.length > 1) out.push(`Semana a semana: ${r.weeks.map((w) => w.sessions).join(" · ")}`);
    if (r.minutes) out.push(`Tempo treinado: ${fmtDuration(r.minutes)}`);
  } else out.push("Nenhum treino registrado no período.");

  if (r.strength.length) {
    out.push("", "*Cargas que subiram*");
    for (const s of r.strength) out.push(`• ${s.name}: ${num(s.from.loadKg, 2)} kg × ${s.from.reps} → ${num(s.to.loadKg, 2)} kg × ${s.to.reps} (${signed(s.deltaPct, 0)}%)`);
  }
  if (r.prs.length) out.push("", `*${r.prs.length} ${r.prs.length === 1 ? "recorde pessoal" : "recordes pessoais"}:* ${nameList(r.prs.map((p) => p.name))}`);

  if (r.body.length) {
    out.push("", "*Medidas*");
    for (const b of r.body) out.push(`• ${b.label}: ${num(b.from)} → ${num(b.to)} ${b.unit} (${b.delta === 0 ? "sem mudança" : `${signed(b.delta)} ${b.unit}`})`);
  }

  const message = opts.message?.trim();
  if (message) out.push("", message);
  if (opts.coachName) out.push("", `— ${opts.coachName}`);
  return out.join("\n");
}
