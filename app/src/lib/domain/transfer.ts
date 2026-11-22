import { z } from "zod";
import type { Food } from "./foods";
import { completedSets } from "./progression";
import type { BodyMetric, DietPlan, Exercise, Profile, Program, Session } from "./types";

/**
 * Troca entre o celular do personal e o do aluno sem servidor: tudo viaja dentro de um link.
 *  - "ficha": o personal manda ficha, dieta e o cadastro para o celular do aluno;
 *  - "treinos": o aluno devolve os treinos feitos para o painel do personal.
 * O conteúdo vem de outra pessoa: tudo é validado antes de entrar no aparelho.
 */

export const TRANSFER_VERSION = 1;
export const MAX_SESSIONS_PER_LINK = 20;

const STUDENT_FIELDS = ["name", "sex", "birthYear", "heightCm", "weightKg", "activity", "goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "limitations"] as const;
type StudentFields = Pick<Profile, (typeof STUDENT_FIELDS)[number]>;

export interface FichaPacket {
  v: number;
  kind: "ficha";
  sentAt: string;
  coach: { id: string; name: string; phone?: string };
  /** `ref` é o id do aluno no aparelho do personal: os treinos voltam para ele. */
  student: StudentFields & { ref: string };
  program: Program | null;
  diet: DietPlan | null;
  exercises: Exercise[];
  foods: Food[];
}

export interface TreinosPacket {
  v: number;
  kind: "treinos";
  sentAt: string;
  studentRef: string;
  studentName: string;
  coachId: string;
  sessions: Session[];
  metrics: BodyMetric[];
}

export type Packet = FichaPacket | TreinosPacket;

// ---- validação ----------------------------------------------------------------
const id = z.string().min(1).max(80);
const text = (max: number) => z.string().max(max);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional().nullable();
const num = (min: number, max: number) => z.number().finite().min(min).max(max);

const planned = z.object({
  uid: id,
  exerciseId: id,
  name: text(120),
  sets: num(1, 20),
  repsMin: num(0, 999),
  repsMax: num(0, 999),
  restSec: num(0, 3600),
  loadKg: opt(num(0, 1000)),
  technique: text(40),
  notes: opt(text(500)),
  unit: opt(z.enum(["reps", "seg", "min"])),
});

const program = z.object({
  id,
  ownerId: text(80),
  createdBy: text(80),
  name: text(120),
  system: text(40),
  goal: text(40),
  level: text(40),
  daysPerWeek: num(1, 7),
  notes: opt(text(2000)),
  durationWeeks: opt(num(1, 52)),
  days: z
    .array(z.object({ key: text(12), title: text(120), focus: z.array(text(40)).max(20), exercises: z.array(planned).max(40) }))
    .min(1)
    .max(10),
  active: z.boolean(),
  source: text(20),
  createdAt: text(40),
  updatedAt: text(40),
});

const dietItem = z.object({ uid: id, foodId: opt(text(80)), name: text(120), grams: num(0, 5000), kcal: num(0, 20000), proteinG: num(0, 2000), carbsG: num(0, 2000), fatG: num(0, 2000) });
const diet = z.object({
  id,
  ownerId: text(80),
  createdBy: text(80),
  name: text(120),
  targets: z.object({ kcal: num(0, 20000), proteinG: num(0, 2000), carbsG: num(0, 2000), fatG: num(0, 2000) }),
  meals: z.array(z.object({ uid: id, name: text(80), time: opt(text(10)), items: z.array(dietItem).max(60) })).max(15),
  notes: opt(text(2000)),
  updatedAt: text(40),
});

const exercise = z.object({ id: z.string().regex(/^custom_[\w-]{1,60}$/), name: text(120), group: text(40), implement: text(40), pattern: text(40), compound: z.boolean() }).passthrough();
const food = z.object({ id: z.string().regex(/^custom_[\w-]{1,60}$/), name: text(120), aliases: z.array(text(120)).max(20), kcal: num(0, 2000), p: num(0, 200), c: num(0, 200), f: num(0, 200), category: text(20) }).passthrough();

const setLog = z.object({ reps: opt(num(0, 9999)), loadKg: opt(num(0, 1000)), rpe: opt(num(0, 10)), done: z.boolean() });
const session = z.object({
  id,
  userId: text(80),
  programId: opt(text(80)),
  programName: opt(text(120)),
  dayKey: opt(text(12)),
  dayTitle: opt(text(120)),
  startedAt: text(40),
  finishedAt: opt(text(40)),
  exercises: z
    .array(
      z.object({
        uid: id,
        exerciseId: id,
        name: text(120),
        planned: z.any().optional(),
        sets: z.array(setLog).max(30),
        notes: opt(text(500)),
        unit: opt(z.enum(["reps", "seg", "min"])),
      }),
    )
    .max(40),
  note: opt(text(1000)),
  feeling: opt(num(1, 5)),
  volumeKg: num(0, 1_000_000),
  prs: z.array(text(80)).max(40),
});

const metric = z.object({
  id,
  userId: text(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: opt(num(0, 500)),
  bodyFatPct: opt(num(0, 100)),
  waistCm: opt(num(0, 400)),
  hipCm: opt(num(0, 400)),
  chestCm: opt(num(0, 400)),
  armCm: opt(num(0, 200)),
  thighCm: opt(num(0, 200)),
  note: opt(text(500)),
});

const fichaSchema = z.object({
  v: z.literal(TRANSFER_VERSION),
  kind: z.literal("ficha"),
  sentAt: text(40),
  coach: z.object({ id, name: text(120), phone: opt(text(20)) }),
  student: z
    .object({
      ref: id,
      name: z.string().min(1).max(120),
      sex: opt(z.enum(["M", "F"])),
      birthYear: opt(num(1900, 2100)),
      heightCm: opt(num(50, 260)),
      weightKg: opt(num(20, 400)),
      activity: opt(text(20)),
      goal: opt(text(20)),
      level: opt(text(20)),
      daysPerWeek: opt(num(1, 7)),
      sessionMinutes: opt(num(10, 300)),
      equipment: opt(text(20)),
      limitations: opt(text(1000)),
    })
    .passthrough(),
  program: program.nullable(),
  diet: diet.nullable(),
  exercises: z.array(exercise).max(200),
  foods: z.array(food).max(200),
});

const treinosSchema = z.object({
  v: z.literal(TRANSFER_VERSION),
  kind: z.literal("treinos"),
  sentAt: text(40),
  studentRef: id,
  studentName: text(120),
  coachId: text(80),
  sessions: z.array(session).max(60),
  metrics: z.array(metric).max(60),
});

/** Confere o pacote recebido; null quando não é um link do Shape Real (ou veio corrompido). */
export function parsePacket(value: unknown): Packet | null {
  const kind = (value as { kind?: unknown } | null)?.kind;
  const res = kind === "ficha" ? fichaSchema.safeParse(value) : kind === "treinos" ? treinosSchema.safeParse(value) : null;
  if (!res?.success) return null;
  const strip = <T>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (x === null ? undefined : x)));
  return strip(res.data) as unknown as Packet;
}

// ---- montagem -----------------------------------------------------------------
function pickStudent(p: Profile): StudentFields {
  const out: Record<string, unknown> = {};
  for (const k of STUDENT_FIELDS) if (p[k] !== undefined && p[k] !== null && p[k] !== "") out[k] = p[k];
  return out as StudentFields;
}

/** Pacote que o personal manda ao aluno: ficha ativa, dieta e os exercícios/alimentos próprios usados nelas. */
export function buildFichaPacket(input: {
  coach: Profile;
  student: Profile;
  program: Program | null;
  diet: DietPlan | null;
  customExercises: Exercise[];
  customFoods: Food[];
  now?: Date;
}): FichaPacket {
  const usedEx = new Set(input.program?.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)) ?? []);
  const usedFood = new Set(input.diet?.meals.flatMap((m) => m.items.map((i) => i.foodId).filter(Boolean)) ?? []);
  return {
    v: TRANSFER_VERSION,
    kind: "ficha",
    sentAt: (input.now ?? new Date()).toISOString(),
    coach: { id: input.coach.id, name: input.coach.name, ...(input.coach.phone ? { phone: input.coach.phone } : {}) },
    student: { ref: input.student.id, ...pickStudent(input.student) },
    program: input.program,
    diet: input.diet,
    exercises: input.customExercises.filter((e) => usedEx.has(e.id)),
    foods: input.customFoods.filter((f) => usedFood.has(f.id)),
  };
}

/** Pacote que o aluno devolve: treinos (os mais recentes primeiro, até o limite) e medidas. */
export function buildTreinosPacket(input: { student: Profile; coachId: string; studentRef: string; sessions: Session[]; metrics?: BodyMetric[]; now?: Date }): TreinosPacket {
  const sessions = [...input.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SESSIONS_PER_LINK);
  return {
    v: TRANSFER_VERSION,
    kind: "treinos",
    sentAt: (input.now ?? new Date()).toISOString(),
    studentRef: input.studentRef,
    studentName: input.student.name,
    coachId: input.coachId,
    sessions,
    metrics: input.metrics ?? [],
  };
}

// ---- texto para o WhatsApp -------------------------------------------------------
const kg = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const br = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const FEELING = ["", "Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];

/** Uma linha por exercício: "Supino reto com barra: 40×10 · 40×10 · 42,5×8". */
export function sessionToText(s: Session): string {
  const minutes = s.finishedAt ? Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000) : null;
  const head = [s.dayKey ? `Treino ${s.dayKey}${s.dayTitle ? ` — ${s.dayTitle}` : ""}` : "Treino livre", br(s.startedAt), minutes && minutes > 0 && minutes <= 300 ? `${minutes} min` : null].filter(Boolean).join(" · ");
  const out = [`*${head}*`];
  for (const e of s.exercises) {
    const sets = completedSets(e);
    if (!sets.length) continue;
    const unit = e.unit === "seg" ? " s" : e.unit === "min" ? " min" : "";
    const parts = sets.map((x) => (x.loadKg ? `${kg(x.loadKg)}×${x.reps}` : `${x.reps}${unit}`));
    out.push(`• ${e.name}: ${parts.join(" · ")}${unit && sets.some((x) => x.loadKg) ? unit : ""}`);
  }
  if (s.prs.length) {
    const names = s.prs.map((id) => s.exercises.find((e) => e.exerciseId === id)?.name ?? id);
    out.push(`Recorde: ${names.join(", ")}`);
  }
  if (s.feeling) out.push(`Como foi: ${FEELING[s.feeling]}`);
  if (s.note?.trim()) out.push(`Anotação: ${s.note.trim()}`);
  return out.join("\n");
}

/** Mensagem com os treinos e o link que leva tudo para o painel do personal. */
export function treinosMessage(sessions: Session[], link: string, coachFirstName?: string): string {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const intro = ordered.length === 1 ? `${coachFirstName ? `${coachFirstName}, ` : ""}treino feito:` : `${coachFirstName ? `${coachFirstName}, ` : ""}${ordered.length} treinos feitos:`;
  // Texto curto para até 3 treinos; acima disso, só o resumo (o detalhe vai pelo link).
  const body = ordered.length <= 3 ? ordered.map(sessionToText).join("\n\n") : ordered.map((s) => `• ${s.dayKey ? `Treino ${s.dayKey}` : "Treino livre"} · ${br(s.startedAt)}`).join("\n");
  return `${intro}\n\n${body}\n\nPara registrar no seu painel do Shape Real, abra: ${link}`;
}
