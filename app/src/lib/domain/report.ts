import { weeklyGoal } from "./attention";
import { bestMarkOf, compareMarks, exerciseMarks, markDeltaPct, type Mark } from "./evolution";
import { todayISO } from "./ids";
import { completedSets, e1rmRaw, fmtKg, fmtMark, volumeDaSessao, weekStart } from "./progression";
import { activeMinutes, completude } from "./session-time";
import type { BodyMetric, Profile, Program, Session } from "./types";

/**
 * Relatório de evolução: o que mudou num período (frequência, cargas, medidas),
 * em números que o aluno entende. Puro: a tela e o texto do WhatsApp saem daqui.
 */

export type ReportDays = 30 | 60 | 90;

/**
 * Sobre o que o relatório fala (R3-15): "recebidos" = os treinos que chegaram pelo link (o personal no modo local só
 * tem o que o aluno mandou: treino não enviado não é falta); "registrados" = os treinos do próprio aparelho ou da nuvem.
 */
export type ReportBase = "recebidos" | "registrados";

/** Relatório do personal no modo local fala em treinos recebidos; o do aluno e o da nuvem, em treinos feitos. */
export function reportBase(ctx: { byCoach: boolean; mode: "local" | "supabase" }): ReportBase {
  return ctx.byCoach && ctx.mode === "local" ? "recebidos" : "registrados";
}

/**
 * Meta de treinos por semana do relatório (R3-16): a mesma regra de /alunos, do Hoje e da página do aluno
 * (`weeklyGoal`: a ficha ativa, senão o cadastro). Sem nenhuma das duas, sem meta.
 */
export function reportGoal(programs: readonly Pick<Program, "active" | "daysPerWeek">[], profile: Pick<Profile, "daysPerWeek">): number | undefined {
  return weeklyGoal(programs.find((p) => p.active)?.daysPerWeek, profile.daysPerWeek) ?? undefined;
}

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

/** Linha de "Exercícios que melhoraram": a base contra a melhor marca do período (U6 R-16). */
export interface StrengthRow {
  exerciseId: string;
  name: string;
  /** Base: a última marca válida antes do período; sem ela, a primeira do período. */
  from: Mark;
  /** Melhor: a melhor marca válida do período depois da base (não é a mais recente). */
  to: Mark;
  /** Dias locais AAAA-MM-DD das duas marcas. */
  fromDate: string;
  toDate: string;
  /** Variação da força estimada (1RM de Epley), em %. null quando uma das marcas passa de 12 reps. */
  deltaPct: number | null;
  /** "+2,5 kg" ou "+5 reps" quando o % não diz nada (null ou arredondado para 0); senão null. */
  compact: string | null;
  /** Treinos do período que contam para o exercício. */
  sessions: number;
}

/** Máximo de linhas em "Exercícios que melhoraram"; as que passam disso viram `moreImproved`. */
export const STRENGTH_ROWS = 8;

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
  /** Treinos recebidos (personal no modo local) ou registrados: muda só o texto, nunca a conta. */
  base: ReportBase;
  sessions: number;
  /** Treinos do período abaixo do limiar de "parcial" (R3-4; só os que têm `plannedSets`). */
  partial: number;
  /** Treinos por semana combinados agora (a meta atual vale para o período inteiro); null sem meta. */
  perWeek: number | null;
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
  /** Até 8 linhas (`STRENGTH_ROWS`), da maior variação do 1RM para a menor. */
  strength: StrengthRow[];
  /** Exercícios de força comparáveis que não melhoraram no período (iguais ou piores). */
  steady: number;
  /** Exercícios que melhoraram e ficaram fora das 8 linhas. */
  moreImproved: number;
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

/** Marca de uma linha de força: "55 kg × 10". */
export function markText(row: Pick<StrengthRow, "exerciseId" | "from" | "to">, which: "from" | "to"): string {
  return fmtMark(row[which], row.exerciseId, "reps");
}

/** A diferença de uma linha de força: "+17%" ou, quando o % não diz nada, "+5 reps" / "+2,5 kg". */
export function strengthChange(row: Pick<StrengthRow, "deltaPct" | "compact">): string {
  return row.compact ?? `${signed(row.deltaPct ?? 0, 0)}%`;
}

/**
 * Notas abaixo da tabela "Exercícios que melhoraram" (U6 §3.3 D), na ordem em que aparecem. Sem nenhuma linha: com
 * exercício comparável que não melhorou, "Nenhum exercício com carga melhorou no período."; sem nenhum comparável (só
 * recorde em prancha, supino uma vez só), "Nenhum exercício com carga tem dois registros no período para comparar."
 * (falta de base não é estagnação). "Outros" sem linhas não teria a que se referir.
 */
export function strengthNotes(r: Pick<EvolutionReport, "strength" | "steady" | "moreImproved">): string[] {
  if (!r.strength.length) return [r.steady > 0 ? "Nenhum exercício com carga melhorou no período." : "Nenhum exercício com carga tem dois registros no período para comparar."];
  const out = ["Melhor: a melhor série de cada exercício no período. O % compara a força estimada (1RM); acima de 12 repetições, a diferença aparece em kg ou repetições."];
  if (r.moreImproved > 0) out.push(r.moreImproved === 1 ? "Mais 1 exercício melhorou." : `Mais ${r.moreImproved} exercícios melhoraram.`);
  if (r.steady > 0) out.push(r.steady === 1 ? "Outro exercício não melhorou no período." : `Outros ${r.steady} exercícios não melhoraram no período.`);
  return out;
}

/** "9 h 40 min", "45 min". */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "3 treinos", "3 treinos (2 parciais)", "1 treino (parcial)". */
function treinosTexto(n: number, partial: number, base: ReportBase): string {
  const word = `${n === 1 ? "treino" : "treinos"}${base === "recebidos" ? (n === 1 ? " recebido" : " recebidos") : ""}`;
  const p = partial > 0 ? (n === 1 ? " (parcial)" : ` (${partial} ${partial === 1 ? "parcial" : "parciais"})`) : "";
  return `${n} ${word}${p}`;
}

/** Rótulos do resumo da folha (tela e PDF): "Treinos recebidos" e "Frequência pelos treinos recebidos" no modo local do personal. */
export function reportLabels(r: Pick<EvolutionReport, "base">): { treinos: string; frequencia: string } {
  return r.base === "recebidos" ? { treinos: "Treinos recebidos", frequencia: "Frequência pelos treinos recebidos" } : { treinos: "Treinos feitos", frequencia: "Frequência" };
}

/** Textos do calendário da folha: título, nome da tabela e o estado de cada dia (leitor de tela). */
export interface ReportCalendarLabels {
  titulo: string;
  tabela: string;
  comTreino: string;
  semTreino: string;
}

/**
 * Calendário da folha (correção da revisão, R3-15): no modo local do personal, "Treinos recebidos por dia", "treino
 * recebido" e "nada recebido" no lugar de "Presença" e "sem treino" (o treino que o aluno não mandou não é falta). O
 * relatório do aluno não muda.
 */
export function reportCalendarLabels(r: Pick<EvolutionReport, "base">): ReportCalendarLabels {
  return r.base === "recebidos"
    ? { titulo: "Treinos recebidos por dia", tabela: "Dias com treino recebido no período", comTreino: "treino recebido", semTreino: "nada recebido" }
    : { titulo: "Presença", tabela: "Dias treinados no período", comTreino: "treinou", semTreino: "sem treino" };
}

/** Valor da linha de treinos do resumo: "4 de 13 combinados", "4 (1 parcial) de 13 combinados", "4". */
export function reportSessionsValue(r: Pick<EvolutionReport, "sessions" | "partial" | "planned">): string {
  const p = r.partial > 0 ? ` (${r.partial} ${r.partial === 1 ? "parcial" : "parciais"})` : "";
  return r.planned ? `${r.sessions}${p} de ${r.planned} combinados` : `${r.sessions}${p}`;
}

/**
 * De onde vem o "combinados" (E2-meta-snapshot): a meta é a de hoje e vale para o período inteiro; o relatório não
 * finge que era a mesma nas semanas passadas. null sem meta.
 */
export function reportGoalNote(r: Pick<EvolutionReport, "perWeek" | "planned">): string | null {
  if (!r.perWeek || !r.planned) return null;
  return `Combinados pela frequência atual: ${r.perWeek} ${r.perWeek === 1 ? "treino" : "treinos"} por semana.`;
}

export function buildReport(input: { profile: Pick<Profile, "name" | "daysPerWeek">; sessions: Session[]; metrics: BodyMetric[]; days: ReportDays; daysPerWeek?: number; base?: ReportBase; now?: Date }): EvolutionReport {
  const { profile } = input;
  const base: ReportBase = input.base ?? "registrados";
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
  const perWeek = Math.min(7, Math.max(0, Math.round(input.daysPerWeek ?? profile.daysPerWeek ?? 0) || 0));
  const planned = perWeek ? Math.max(1, Math.round((perWeek * days) / 7)) : null;
  const adherencePct = planned ? Math.round((inPeriod.length / planned) * 100) : null;
  const partial = inPeriod.filter((s) => completude(s).parcial).length;
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

  // Tempo, volume e séries. Minutos pela regra única (R3-4: ativos; sessão antiga, a duração registrada até 180 min;
  // acima, sem minutos, mas o treino conta). Volume pela convenção única (R3-6 B), nunca pelo `volumeKg` gravado.
  let minutes = 0;
  let sets = 0;
  let volumeKg = 0;
  for (const s of inPeriod) {
    minutes += activeMinutes(s) ?? 0;
    volumeKg += volumeDaSessao(s);
    for (const e of s.exercises) sets += completedSets(e).length;
  }

  // Recordes
  const prMap = new Map<string, string>();
  for (const s of inPeriod) for (const id of s.prs) prMap.set(id, s.exercises.find((e) => e.exerciseId === id)?.name ?? id);

  // Exercícios que melhoraram (U6 R-16): só força, com as marcas e a trava de digitação da Evolução, sobre todo o
  // histórico até o fim do período. Base = última marca válida antes do período (sem ela, a primeira do período);
  // Melhor = a melhor marca válida do período depois da base. Melhorou ⇔ compareMarks(base, melhor) = "subiu".
  const history = all.filter((s) => dayOf(s.startedAt) <= to);
  const ids = new Set<string>();
  for (const s of inPeriod) for (const e of s.exercises) ids.add(e.exerciseId);
  const improved: { row: StrengthRow; gain: number }[] = [];
  let steady = 0;
  for (const id of ids) {
    const h = exerciseMarks(history, id);
    if (!h || h.kind !== "forca") continue;
    const inside = h.marks.filter((m) => m.date >= from && m.date <= to);
    const valid = inside.filter((m) => !m.suspect);
    const prior = h.marks.filter((m) => m.date < from && !m.suspect);
    const base = prior[prior.length - 1] ?? valid[0];
    const later = prior.length ? valid : valid.slice(1);
    const best = bestMarkOf(later, "forca");
    if (!base || !best) continue;
    if (compareMarks(base.mark, best.mark, "forca") !== "subiu") {
      steady += 1;
      continue;
    }
    const deltaPct = markDeltaPct(base.mark, best.mark);
    const dl = Math.round((best.mark.loadKg - base.mark.loadKg) * 100) / 100;
    const dr = best.mark.reps - base.mark.reps;
    const compact = deltaPct ? null : dl > 0 ? `+${fmtKg(dl)}` : `+${dr} ${dr === 1 ? "rep" : "reps"}`;
    const e0 = e1rmRaw(base.mark.loadKg, base.mark.reps);
    improved.push({
      row: { exerciseId: id, name: h.name, from: base.mark, to: best.mark, fromDate: base.date, toDate: best.date, deltaPct, compact, sessions: inside.length },
      // Ordem: variação do 1RM com o teto (sem arredondar; resíduo de ponto flutuante cortado), depois número de treinos.
      gain: e0 ? Math.round(((e1rmRaw(best.mark.loadKg, best.mark.reps) - e0) / e0) * 1e6) / 1e6 : 0,
    });
  }
  improved.sort((a, b) => b.gain - a.gain || b.row.sessions - a.row.sessions);
  const strength = improved.slice(0, STRENGTH_ROWS).map((x) => x.row);
  const moreImproved = Math.max(0, improved.length - STRENGTH_ROWS);

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
    const count = treinosTexto(inPeriod.length, partial, base);
    highlights.push(planned ? `${count} em ${days} dias, de ${planned} ${planned === 1 ? "combinado" : "combinados"} (${Math.min(adherencePct!, 999)}% de frequência).` : `${count} em ${days} dias.`);
  }
  if (strength[0]) {
    const s = strength[0];
    highlights.push(`Maior evolução: ${s.name}, de ${markText(s, "from")} para ${markText(s, "to")} (${strengthChange(s)}).`);
  }
  if (prMap.size) highlights.push(`${prMap.size} ${prMap.size === 1 ? "recorde pessoal" : "recordes pessoais"} no período.`);
  const weight = body.find((b) => b.key === "weightKg");
  if (weight && weight.delta !== 0) highlights.push(`Peso: de ${num(weight.from)} para ${num(weight.to)} kg (${signed(weight.delta)} kg).`);
  const waist = body.find((b) => b.key === "waistCm");
  if (waist && waist.delta !== 0) highlights.push(`Cintura: ${signed(waist.delta)} cm.`);
  if (inPeriod.length && previousSessions && inPeriod.length !== previousSessions) {
    const diff = inPeriod.length - previousSessions;
    const word = Math.abs(diff) === 1 ? (base === "recebidos" ? "treino recebido" : "treino") : base === "recebidos" ? "treinos recebidos" : "treinos";
    highlights.push(`${Math.abs(diff)} ${word} a ${diff > 0 ? "mais" : "menos"} que nos ${days} dias anteriores.`);
  }

  return {
    name: profile.name,
    from,
    to,
    days,
    base,
    sessions: inPeriod.length,
    partial,
    perWeek: perWeek || null,
    planned,
    adherencePct,
    weeks,
    calendar,
    minutes,
    volumeKg: Math.round(volumeKg),
    sets,
    previousSessions,
    prs: [...prMap].map(([exerciseId, name]) => ({ exerciseId, name })),
    strength,
    steady,
    moreImproved,
    body,
    highlights,
    hasData: inPeriod.length > 0 || body.length > 0,
  };
}

/** Relatório em texto simples para o WhatsApp (*negrito* com asteriscos, sem emoji). */
export function reportToText(r: EvolutionReport, opts: { coachName?: string; message?: string; self?: boolean } = {}): string {
  const out: string[] = [`*${opts.self ? "Meu resumo de treino" : `Relatório de evolução — ${r.name.trim()}`}*`, `${br(r.from)} a ${br(r.to)}/${r.to.slice(0, 4)} (${r.days} dias)`];

  const recebidos = r.base === "recebidos";
  out.push("", `*${reportLabels(r).frequencia}*`);
  if (r.sessions) {
    const parciais = r.partial > 0 ? ` · ${r.partial} ${r.partial === 1 ? "parcial" : "parciais"}` : "";
    if (r.planned) out.push(recebidos ? `${r.sessions} de ${r.planned} treinos combinados recebidos (${r.adherencePct}%)${parciais}` : `${r.sessions} de ${r.planned} treinos combinados (${r.adherencePct}%)${parciais}`);
    else out.push(`${treinosTexto(r.sessions, 0, r.base)}${parciais}`);
    const nota = reportGoalNote(r);
    if (nota) out.push(nota);
    if (r.weeks.length > 1) out.push(`Semana a semana: ${r.weeks.map((w) => w.sessions).join(" · ")}`);
    if (r.minutes) out.push(`Tempo treinado: ${fmtDuration(r.minutes)}`);
  } else out.push(recebidos ? "Nenhum treino recebido no período." : "Nenhum treino registrado no período.");

  if (r.strength.length) {
    out.push("", "*Exercícios que melhoraram*");
    for (const s of r.strength) out.push(`• ${s.name}: ${markText(s, "from")} → ${markText(s, "to")} (${strengthChange(s)})`);
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
