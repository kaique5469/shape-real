import { z } from "zod";
import { isIsoDate } from "./delivery";
import { dietForLink } from "./diet-plan";
import type { Food } from "./foods";
import { completedSets, volumeDaSessao } from "./progression";
import { completudeLinha, duracaoDoTreino, duracaoTexto } from "./session-time";
import type { BodyMetric, ConsentSource, DietPlan, Exercise, Profile, Program, Session } from "./types";

/**
 * Troca entre o celular do personal e o do aluno sem servidor: tudo viaja dentro de um link.
 *  - "ficha": o personal manda ficha, dieta e o cadastro para o celular do aluno;
 *  - "treinos": o aluno devolve os treinos feitos para o painel do personal.
 * O conteúdo vem de outra pessoa: tudo é validado antes de entrar no aparelho.
 */

export const TRANSFER_VERSION = 1;

/**
 * Link de tipo desconhecido ou de versão mais nova (spec §10.2): pede para atualizar, nunca diz "link cortado". O texto
 * e os tipos são os de questionario-link.ts (`PROBLEMA_TEXTO`, `KINDS_CONHECIDOS`; há teste), copiados para /abrir e o
 * "Colar aqui" não carregarem o esquema do questionário.
 */
export const LINK_VERSAO_NOVA_TEXTO = "Este link é de uma versão mais nova do Shape Real. Atualize a página (puxe para baixo) e abra o link de novo.";
export const KINDS_DO_APP = ["ficha", "treinos", "pedido_anamnese", "anamnese"] as const;
export function ehLinkDeVersaoNova(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const { kind, v } = raw as { kind?: unknown; v?: unknown };
  return (typeof kind === "string" && !(KINDS_DO_APP as readonly string[]).includes(kind)) || (typeof v === "number" && v > TRANSFER_VERSION);
}
export const MAX_SESSIONS_PER_LINK = 20;

const STUDENT_FIELDS = ["name", "sex", "birthYear", "heightCm", "weightKg", "activity", "goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "limitations"] as const;
type StudentFields = Pick<Profile, (typeof STUDENT_FIELDS)[number]>;

export interface FichaPacket {
  v: number;
  kind: "ficha";
  sentAt: string;
  /** `cref` é opcional (links antigos não têm; apps antigos ignoram o campo). */
  coach: { id: string; name: string; phone?: string; cref?: string };
  /** `ref` é o id do aluno no aparelho do personal: os treinos voltam para ele. */
  student: StudentFields & { ref: string };
  program: Program | null;
  diet: DietPlan | null;
  exercises: Exercise[];
  foods: Food[];
}

/**
 * Versão da ficha e da dieta que o aparelho do aluno tem (U2c, eco por conteúdo): os `updatedAt` do personal que
 * vieram no último link da ficha. Volta com os treinos; o personal compara com a versão atual dele.
 */
export interface FichaEcho {
  programAt?: string;
  dietAt?: string;
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
  /** Opcional: links antigos não têm; apps antigos descartam o campo (o esquema ignora chaves desconhecidas). */
  ficha?: FichaEcho;
}

export type Packet = FichaPacket | TreinosPacket;

// ---- validação ----------------------------------------------------------------
const id = z.string().min(1).max(80);
const text = (max: number) => z.string().max(max);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional().nullable();
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
/**
 * Campo novo e acessório (rodada 3): ausente em links antigos; malformado (versão alterada à mão, bug) vira undefined e
 * o link abre do mesmo jeito. Nunca motivo para recusar o pacote.
 */
const extra = <T extends z.ZodTypeAny>(t: T) => t.optional().catch(undefined);

/**
 * Faixa de repetições invertida (Mín 12 / Máx 8, salva assim por um editor antigo): o link troca na hora em vez de
 * recusar (R3-6). A ordem certa não muda nada.
 */
export function faixaEmOrdem<T extends { repsMin: number; repsMax: number }>(p: T): T {
  return p.repsMin > p.repsMax ? { ...p, repsMin: p.repsMax, repsMax: p.repsMin } : p;
}

const planned = z
  .object({
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
  })
  .transform(faixaEmOrdem);

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
        // R3-7: "Senti dor". Só `true` vale; o texto do envio mostra "Dor marcada: …" (nada escondido no link).
        pain: extra(z.boolean()),
      }),
    )
    .max(40),
  note: opt(text(1000)),
  feeling: opt(num(1, 5)),
  volumeKg: num(0, 1_000_000),
  prs: z.array(text(80)).max(40),
  // R3-4: minutos ativos, correção da pessoa e séries planejadas.
  activeMin: extra(num(0, 1440)),
  activeEdited: extra(z.boolean()),
  plannedSets: extra(z.number().int().min(1).max(40 * 30)),
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
  coach: z.object({ id, name: text(120), phone: opt(text(20)), cref: opt(text(30)) }),
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
  // Acessório: um bloco malformado é ignorado (vira undefined) e o link abre do mesmo jeito.
  ficha: z.object({ programAt: text(40).optional(), dietAt: text(40).optional() }).optional().catch(undefined),
});

/**
 * Confere o pacote recebido; null quando não é um link do Shape Real (ou veio corrompido). Nos treinos, o `volumeKg` do
 * remetente (cache, talvez de outra convenção) é recalculado aqui pela convenção única (R3-6 B): o painel nunca guarda
 * o número de outro aparelho como verdade.
 */
export function parsePacket(value: unknown): Packet | null {
  const kind = (value as { kind?: unknown } | null)?.kind;
  const res = kind === "ficha" ? fichaSchema.safeParse(value) : kind === "treinos" ? treinosSchema.safeParse(value) : null;
  if (!res?.success) return null;
  const strip = <T>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (x === null ? undefined : x)));
  const packet = strip(res.data) as unknown as Packet;
  if (packet.kind === "treinos") for (const s of packet.sessions) s.volumeKg = volumeDaSessao(s);
  return packet;
}

// ---- montagem -----------------------------------------------------------------
function pickStudent(p: Partial<Profile>): StudentFields {
  const out: Record<string, unknown> = {};
  for (const k of STUDENT_FIELDS) if (p[k] !== undefined && p[k] !== null && p[k] !== "") out[k] = p[k];
  return out as StudentFields;
}

/**
 * Só os campos de cadastro que o link pode trazer. O esquema aceita campos extras (versões novas do app),
 * mas nada de fora desta lista entra no perfil do aluno: nem consentimento, nem papel, nem vínculo.
 */
export function studentFieldsOf(student: FichaPacket["student"]): StudentFields {
  return pickStudent(student as Partial<Profile>);
}

/**
 * O que vai no link da ficha: a ficha ativa e a dieta salva com itens, orientações ou metas (U3c: uma dieta só com
 * metas e orientações também vai; no aluno, abre em `leitura_metas`). É também o que o registro de envio compara
 * (U2b: as versões gravadas no toque são os `updatedAt` destes dois). Um lugar só, para o link e o registro nunca
 * discordarem sobre o que "a dieta" é.
 */
export function fichaLinkItems(programs: readonly Program[], diet: DietPlan | null): { program: Program | null; diet: DietPlan | null } {
  return { program: programs.find((p) => p.active) ?? null, diet: dietForLink(diet) };
}

/** Pacote que o personal manda ao aluno: ficha ativa, dieta e os exercícios/alimentos próprios usados nelas. */
function semSugerido(p: Program): Program {
  if (!("sugerido" in p)) return p;
  const { sugerido: _sugerido, ...resto } = p;
  return resto;
}

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
    coach: { id: input.coach.id, name: input.coach.name, ...(input.coach.phone ? { phone: input.coach.phone } : {}), ...(input.coach.cref?.trim() ? { cref: input.coach.cref.trim() } : {}) },
    student: { ref: input.student.id, ...pickStudent(input.student) },
    // `sugerido` (o que o gerador pré-preencheu, para o padrão aprendido da Entrega 2) fica no aparelho do personal.
    program: input.program ? semSugerido(input.program) : null,
    diet: input.diet,
    exercises: input.customExercises.filter((e) => usedEx.has(e.id)),
    foods: input.customFoods.filter((f) => usedFood.has(f.id)),
  };
}

/** Só as versões informadas; null quando nenhuma veio (o campo não vai no link). */
function cleanEcho(e: FichaEcho | null | undefined): FichaEcho | null {
  if (!e) return null;
  const out: FichaEcho = {};
  if (typeof e.programAt === "string" && e.programAt) out.programAt = e.programAt;
  if (typeof e.dietAt === "string" && e.dietAt) out.dietAt = e.dietAt;
  return out.programAt || out.dietAt ? out : null;
}

/**
 * Eco que este aparelho manda com os treinos (U2c): só o que continua igual ao que chegou do personal. A ficha entra
 * quando a ativa é dele (`createdBy`) e não foi ajustada aqui (`adjustedAt`, U5a); a dieta, nas mesmas condições
 * (U3b). O eco prova a versão recebida, não o conteúdo em uso: sem este filtro, o personal leria "está com a ficha
 * atual" enquanto o celular do aluno diz "ajustado por você". O que fica de fora não confirma nada lá.
 */
export function echoFor(
  recebido: FichaEcho | null | undefined,
  coachId: string,
  activeProgram: Pick<Program, "createdBy" | "adjustedAt"> | null | undefined,
  diet: Pick<DietPlan, "createdBy" | "adjustedAt"> | null | undefined,
): FichaEcho | null {
  const unchanged = (item: { createdBy: string; adjustedAt?: string } | null | undefined) => Boolean(item && item.createdBy === coachId && !item.adjustedAt);
  return cleanEcho({
    ...(recebido?.programAt && unchanged(activeProgram) ? { programAt: recebido.programAt } : {}),
    ...(recebido?.dietAt && unchanged(diet) ? { dietAt: recebido.dietAt } : {}),
  });
}

/**
 * Pacote que o aluno devolve: treinos (os mais recentes primeiro, até o limite) e medidas. `ficha` (U2c) = a versão
 * da ficha e da dieta que este aparelho recebeu (`remoteCoach.recebido`); só entra no pacote quando informada.
 */
export function buildTreinosPacket(input: { student: Profile; coachId: string; studentRef: string; sessions: Session[]; metrics?: BodyMetric[]; ficha?: FichaEcho | null; now?: Date }): TreinosPacket {
  const sessions = [...input.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SESSIONS_PER_LINK);
  const ficha = cleanEcho(input.ficha);
  return {
    v: TRANSFER_VERSION,
    kind: "treinos",
    sentAt: (input.now ?? new Date()).toISOString(),
    studentRef: input.studentRef,
    studentName: input.student.name,
    coachId: input.coachId,
    sessions,
    metrics: input.metrics ?? [],
    ...(ficha ? { ficha } : {}),
  };
}

/**
 * Versão da ficha e da dieta que este aparelho passa a ter (U2c), lida do PACOTE (o `updatedAt` do personal), antes
 * de a ficha ser gravada aqui com o horário local. Item que não veio no link mantém a versão anterior quando o
 * personal é o mesmo (a ficha ou a dieta de antes continua no aparelho); outro personal recomeça do zero.
 * Data ilegível não vira versão. null = nenhuma versão conhecida.
 */
export function receivedVersions(packet: Pick<FichaPacket, "coach" | "program" | "diet">, previous: Profile["remoteCoach"] | undefined): FichaEcho | null {
  const prev = previous?.id === packet.coach.id ? previous.recebido : undefined;
  const pick = (item: { updatedAt: string } | null, old: string | undefined) => (item ? (isIsoDate(item.updatedAt) ? item.updatedAt : undefined) : old);
  const programAt = pick(packet.program, prev?.programAt);
  const dietAt = pick(packet.diet, prev?.dietAt);
  if (!programAt && !dietAt) return null;
  return { ...(programAt ? { programAt } : {}), ...(dietAt ? { dietAt } : {}) };
}

// ---- recebimento: carga atual e medidas ------------------------------------------
/** Carga de cada exercício num treino: a maior entre as séries feitas (mesma regra do fim do treino em /sessao). */
export function topLoads(session: Session): Map<string, number> {
  const top = new Map<string, number>();
  for (const e of session.exercises) {
    const sets = completedSets(e);
    if (!sets.length) continue;
    top.set(e.exerciseId, Math.max(top.get(e.exerciseId) ?? 0, ...sets.map((x) => x.loadKg ?? 0)));
  }
  return top;
}

/**
 * A ficha passa a mostrar a carga atual de cada exercício, como acontece no celular de quem treinou.
 * Só contam treinos desta ficha começados depois da última alteração dela (`updatedAt`): uma redução que o
 * personal fez depois do treino não é desfeita. Treinos em ordem: vale o mais recente, como no aparelho do aluno.
 * Devolve null quando nada muda. Não mexe em `updatedAt` (copiar a carga não é uma edição da ficha).
 */
export function mirrorLoads(program: Program, sessions: Session[]): Program | null {
  const since = Date.parse(program.updatedAt);
  if (!Number.isFinite(since)) return null;
  const relevant = sessions.filter((s) => s.programId === program.id && Date.parse(s.startedAt) > since).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  if (!relevant.length) return null;
  const load = new Map<string, number>();
  for (const s of relevant) for (const [id, kg] of topLoads(s)) if (kg > 0) load.set(id, kg);
  let changed = false;
  const days = program.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((p) => {
      const kg = load.get(p.exerciseId);
      if (!kg || kg === p.loadKg) return p;
      changed = true;
      return { ...p, loadKg: kg };
    }),
  }));
  return changed ? { ...program, days } : null;
}

const METRIC_FIELDS = ["weightKg", "bodyFatPct", "waistCm", "hipCm", "chestCm", "armCm", "thighCm", "note"] as const;
const filled = (v: unknown) => v !== undefined && v !== null && v !== "";

/**
 * Medida que chega do aluno numa data em que o personal já tem registro.
 *  - registro do personal (outro id): nada do personal é apagado nem trocado; o aluno só preenche campos vazios;
 *  - o mesmo registro do aluno chegando de novo (mesmo id): os valores novos do aluno valem, mas um campo
 *    que não veio nunca apaga o que já estava.
 * Mantém id e dono do registro existente.
 */
export function mergeMetric(existing: BodyMetric | null | undefined, incoming: BodyMetric): BodyMetric {
  if (!existing) return incoming;
  const sameRecord = existing.id === incoming.id;
  const out: BodyMetric = { ...existing };
  const target = out as unknown as Record<string, unknown>;
  const from = incoming as unknown as Record<string, unknown>;
  for (const k of METRIC_FIELDS) {
    if (!filled(from[k])) continue;
    if (sameRecord || !filled(target[k])) target[k] = from[k];
  }
  return out;
}

// ---- autorização de dados de saúde (LGPD) ----------------------------------------
type ConsentFields = Pick<Profile, "consentHealthAt" | "consentSource">;

/**
 * Limitação, peso, altura ou respostas de saúde do questionário (as que não foram omitidas): dados de saúde que só
 * são guardados com a autorização registrada.
 */
export function hasHealthData(p: Partial<Pick<Profile, "limitations" | "weightKg" | "heightCm" | "anamnese">>): boolean {
  return (
    Boolean(p.limitations?.trim()) ||
    (typeof p.weightKg === "number" && p.weightKg > 0) ||
    (typeof p.heightCm === "number" && p.heightCm > 0) ||
    Boolean(p.anamnese && !p.anamnese.healthOmitted)
  );
}

type ConsentOwner = Partial<ConsentFields & Pick<Profile, "managedBy" | "remoteCoach">>;

/**
 * A autorização de dados de saúde vale? Versões anteriores carimbavam `consentHealthAt` sozinhas em todo aluno
 * cadastrado pelo personal (managedBy) e em toda ficha recebida por link (remoteCoach), sem ninguém marcar nada.
 * Nesses perfis, a data sem origem (`consentSource`) não conta: o personal ou o aluno confirma de novo. No perfil próprio
 * (solo ou aluno da nuvem), a data sem origem continua valendo: ela só era gravada pelo checkbox do onboarding ou de Conta.
 */
export function consentConfirmed(p: ConsentOwner | null | undefined): boolean {
  if (!p?.consentHealthAt) return false;
  if (p.consentSource) return true;
  return !p.managedBy && !p.remoteCoach;
}

/**
 * O que o checkbox de autorização grava. Marcado: mantém a autorização que já valia (data e origem originais)
 * ou registra uma nova, com a data de agora e quem marcou. Desmarcado: retira a autorização.
 */
export function consentFromCheckbox(prev: ConsentOwner | null | undefined, checked: boolean, source: ConsentSource, now: string): ConsentFields {
  if (!checked) return { consentHealthAt: undefined, consentSource: undefined };
  if (prev?.consentHealthAt && consentConfirmed(prev)) return { consentHealthAt: prev.consentHealthAt, consentSource: prev.consentSource };
  return { consentHealthAt: now, consentSource: source };
}

/** Propriedade "consent" dos eventos de cadastro de aluno: só a situação, nunca o dado de saúde. */
export function consentMetric(draft: Partial<Pick<Profile, "limitations" | "weightKg" | "heightCm">>, consented: boolean): "sim" | "nao" | "sem_dados_saude" {
  if (consented) return "sim";
  return hasHealthData(draft) ? "nao" : "sem_dados_saude";
}

// ---- texto para o WhatsApp -------------------------------------------------------
const kg = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const br = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const FEELING = ["", "Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];

/** O "1 de 24 séries (parcial)" mora em session-time.ts (a tela importa de lá, sem o zod deste arquivo). */
export { completudeLinha };

/**
 * Uma linha por exercício: "Supino reto com barra: 40×10 · 40×10 · 42,5×8". No título, os minutos pela regra única
 * (`duracaoDoTreino`: ativos, ajustados ou a duração registrada até 180 min) e o "{feitas} de {planejadas} séries".
 */
export function sessionToText(s: Session): string {
  const head = [s.dayKey ? `Treino ${s.dayKey}${s.dayTitle ? ` — ${s.dayTitle}` : ""}` : "Treino livre", br(s.startedAt), duracaoTexto(duracaoDoTreino(s)), completudeLinha(s)].filter(Boolean).join(" · ");
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
/**
 * Mensagem do envio da ficha e da dieta por link (spec da anamnese §8.6): o link leva o conteúdo; o texto da ficha não
 * vai na mensagem. `coachSignature` = assinatura única do personal ("Nome · CREF …"); vazia vira "seu personal".
 */
export function fichaLinkMessage(i: { studentFirstName: string; coachSignature?: string; hasProgram: boolean; hasDiet: boolean; link: string }): string {
  const what = i.hasProgram && i.hasDiet ? "sua ficha e sua dieta" : i.hasProgram ? "sua ficha" : "sua dieta";
  const verbo = i.hasProgram && i.hasDiet ? "estão" : "está";
  const para = i.hasProgram ? "treinar, registrar as cargas e me mandar cada treino" : "guardar e consultar quando quiser";
  return `Oi, ${i.studentFirstName}! ${what[0]!.toUpperCase()}${what.slice(1)} ${verbo} no Shape Real. Abra este link no seu celular para ${para} (não precisa cadastro):\n${i.link}\n\n— ${i.coachSignature?.trim() || "seu personal"}`;
}

/**
 * "Dor marcada: Supino reto com barra (20/11)", uma linha por exercício com "Senti dor", na ordem dos treinos (R3-7).
 * A dor só vai no pacote porque a mensagem visível diz isto: nada escondido no link.
 */
export function painLines(sessions: readonly Session[]): string[] {
  const out: string[] = [];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) for (const e of s.exercises) if (e.pain === true) out.push(`Dor marcada: ${e.name} (${br(s.startedAt)})`);
  return out;
}

export function treinosMessage(sessions: Session[], link: string, coachFirstName?: string): string {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const intro = ordered.length === 1 ? `${coachFirstName ? `${coachFirstName}, ` : ""}treino feito:` : `${coachFirstName ? `${coachFirstName}, ` : ""}${ordered.length} treinos feitos:`;
  // Texto curto para até 3 treinos; acima disso, só o resumo (o detalhe vai pelo link).
  const body = ordered.length <= 3 ? ordered.map(sessionToText).join("\n\n") : ordered.map((s) => `• ${s.dayKey ? `Treino ${s.dayKey}` : "Treino livre"} · ${br(s.startedAt)}`).join("\n");
  // A dor aparece nos dois formatos (também no resumo de mais de 3 treinos).
  const pain = painLines(ordered);
  return `${intro}\n\n${body}${pain.length ? `\n\n${pain.join("\n")}` : ""}\n\nPara registrar no seu painel do Shape Real, abra: ${link}`;
}
