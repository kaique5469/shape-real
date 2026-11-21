import { EXERCISES, getExercise, normalize, unitOf } from "./exercises";
import { EMPHASIS_SLOTS, getSystem, type DayTemplate, type Slot, type TrainingSystem } from "./systems";
import { uid } from "./ids";
import type {
  Equipment,
  Exercise,
  Goal,
  Level,
  MuscleGroup,
  PlannedExercise,
  Program,
  SystemId,
  Technique,
  WorkoutDay,
} from "./types";

export interface GenerateInput {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: Equipment;
  system: SystemId;
  limitations?: string;
  emphasis?: MuscleGroup[];
  seed?: number;
}

export const GOAL_LABEL: Record<Goal, string> = {
  hipertrofia: "Hipertrofia",
  forca: "Força",
  emagrecimento: "Emagrecimento",
  condicionamento: "Condicionamento",
  saude: "Saúde e bem-estar",
};

export const LEVEL_LABEL: Record<Level, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

export const TECHNIQUE_LABEL: Record<Technique, string> = {
  normal: "Normal",
  drop_set: "Drop-set na última série",
  bi_set: "Bi-set com o próximo",
  tri_set: "Tri-set com os próximos",
  super_serie: "Supersérie (antagonista)",
  rest_pause: "Rest-pause",
  piramide: "Pirâmide crescente",
  piramide_dec: "Pirâmide decrescente",
  cluster: "Cluster",
  falha: "Até a falha",
  parciais: "Repetições parciais no fim",
  negativa: "Negativa lenta",
  isometria: "Isometria",
};

/**
 * Ruído determinístico em [0, 1) a partir de um texto (FNV-1a + mistura final).
 * O sorteio de cada encaixe depende só de (seed, dia, encaixe, exercício): a mesma seed dá a mesma
 * escolha mesmo quando o tempo da sessão muda e outros encaixes entram ou saem.
 */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = (h + 0x6d2b79f5) | 0;
  let t = Math.imul(h ^ (h >>> 15), 1 | h);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ───────────────────────── Equipamento e nível ─────────────────────────

/**
 * O exercício pode ser feito com o equipamento do aluno?
 * "home" = halteres, elástico, caneleira e peso do corpo; "peso_corporal" = nada mesmo
 * (sem barra fixa, paralelas ou roda: esses não têm `home`).
 */
export function allowedByEquipment(ex: Exercise, equipment: Equipment): boolean {
  if (equipment === "academia") return true;
  if (equipment === "home") return Boolean(ex.home);
  return ex.implement === "peso_corporal" && Boolean(ex.home);
}

/** Versão de casa (elástico ou sem carga) de algo que a academia faz com máquina, polia ou halter. Abdômen e alongamento não contam. */
export function isGymRegression(ex: Exercise): boolean {
  if (ex.implement === "elastico") return true;
  return ex.implement === "peso_corporal" && Boolean(ex.home) && ex.pattern !== "core" && ex.pattern !== "mobilidade";
}

const RANK: Record<Level, number> = { iniciante: 0, intermediario: 1, avancado: 2 };

/** Regressões: nível máximo em que o motor ainda escolhe o exercício sozinho. */
const MAX_LEVEL: Record<string, Level> = {
  barra_fixa_assistida: "intermediario",
  agachamento_goblet: "intermediario",
  flexao_joelhos: "iniciante",
  flexao_inclinada: "iniciante",
  agachamento_banco: "iniciante",
};

/** O exercício é adequado ao nível? (`minLevel` da biblioteca; regressões saem para quem já passou delas.) */
export function allowedForLevel(ex: Exercise, level: Level): boolean {
  return RANK[ex.minLevel ?? "iniciante"] <= RANK[level] && RANK[MAX_LEVEL[ex.id] ?? "avancado"] >= RANK[level];
}

/** Exercícios de nicho: o personal prescreve, o motor não sorteia (só entram se o encaixe os listar). */
const MANUAL_ONLY = new Set([
  "supino_declinado_barra",
  "supino_declinado_maquina",
  "elevacao_frontal",
  "elevacao_frontal_anilha",
  "remada_alta",
  "remada_alta_cabo",
  "rotacao_externa_cabo",
  "vacuum_abdominal",
  "agachamento_isometrico_parede",
  "suspensao_barra",
  "good_morning",
  "kettlebell_swing",
  "levantamento_terra_sumo",
  "flexao_nordica",
  "remada_trx",
  "burpee",
]);

// ───────────────────────── Limitações ─────────────────────────

interface LimitationRule {
  label: string;
  match: RegExp;
  unless?: RegExp;
  avoid: string[];
  /** Piso de repetições (sem séries pesadas) nos grupos abaixo; sem `groups`, vale para o corpo todo. */
  minReps?: number;
  groups?: MuscleGroup[];
  /** Condição geral (idade, gestação, pressão): pede um programa conservador por inteiro. */
  population?: boolean;
  notes?: Record<string, string>;
}

const LEGS: MuscleGroup[] = ["quadriceps", "posteriores", "gluteos"];
const IMPACT = ["agachamento_salto", "burpee", "pular_corda", "polichinelo", "esteira_corrida", "corrida_rua", "hiit_esteira"];
const KNEE_NOTE = "Amplitude sem dor (até ~90°), descida controlada.";
const BACK_NOTE = "Amplitude sem tirar a lombar do encosto.";
const SHOULDER_AVOID = [
  "desenvolvimento_barra", "desenvolvimento_smith", "desenvolvimento_arnold", "remada_alta", "remada_alta_cabo", "paralelas_peito", "paralelas_triceps",
  "mergulho_banco", "supino_inclinado_barra", "crucifixo_halter", "crucifixo_inclinado_halter", "pullover_halter", "barra_fixa", "barra_fixa_supinada",
  "suspensao_barra", "elevacao_pernas_barra", "abdominal_infra_paralela", "triceps_frances", "triceps_frances_cabo", "elevacao_frontal",
  "elevacao_frontal_anilha", "flexao_pike",
];
const SHOULDER_NOTES = { supino_reto_barra: "Pegada um pouco mais fechada, cotovelos a ~45°, sem dor." };
const TRUNK_FLEXION = [
  "abdominal_supra", "abdominal_infra", "abdominal_polia", "abdominal_maquina", "abdominal_declinado", "abdominal_canivete", "abdominal_remador",
  "abdominal_obliquo", "abdominal_bicicleta", "abdominal_infra_paralela", "abdominal_roda", "elevacao_pernas_barra", "russian_twist", "rotacao_tronco_polia",
];

/** Restrições comuns → exercícios evitados pelo motor determinístico (testadas sobre o texto sem acento). */
const LIMITATION_RULES: LimitationRule[] = [
  {
    label: "joelho",
    match: /joelho|menisc|patel|condromalac|\blc[ap]\b|ligamento cruzado|cruzado (anterior|posterior)|gonartrose/,
    avoid: [
      "agachamento_livre", "agachamento_frontal", "agachamento_smith", "hack", "afundo", "afundo_smith", "passada", "recuo_halter", "agachamento_bulgaro",
      "step_up", "agachamento_pistol_assistido", "agachamento_sumo", "leg_press_unilateral", "escada_simulador", ...IMPACT,
    ],
    minReps: 8,
    groups: LEGS,
    notes: { leg_press: KNEE_NOTE, leg_press_horizontal: KNEE_NOTE, agachamento_goblet: KNEE_NOTE, agachamento_livre_corporal: KNEE_NOTE, agachamento_banco: KNEE_NOTE },
  },
  { label: "joelho", match: /patel|condromalac/, avoid: ["cadeira_extensora", "cadeira_extensora_unilateral"] },
  {
    label: "lombar",
    match: /lombar|lombalgia|coluna|hernia|protr?usao|disc(o|al)\b|ciatic|escoliose|espondilo|estenose|bico de papagaio|(dor|doi|doem|doendo|travad\w*)[^.,;]{0,15}costas|costas[^.,;]{0,15}(dor|doi|doem|doendo|travad)/,
    avoid: [
      "levantamento_terra", "levantamento_terra_sumo", "stiff", "stiff_smith", "stiff_unilateral", "terra_romeno_halter", "good_morning", "kettlebell_swing",
      "hiperextensao_lombar", "superman", "remada_curvada_barra", "remada_curvada_supinada", "remada_curvada_halter", "remada_cavalinho", "agachamento_livre",
      "agachamento_frontal", "agachamento_smith", "desenvolvimento_barra", "remo_ergometro", ...TRUNK_FLEXION, ...IMPACT,
    ],
    minReps: 8,
    groups: [...LEGS, "costas"],
    notes: { leg_press: BACK_NOTE, leg_press_horizontal: BACK_NOTE, hack: BACK_NOTE },
  },
  { label: "ombro", match: /ombro|manguito|supra-?espin|subacromial/, avoid: SHOULDER_AVOID, minReps: 8, groups: ["peito", "ombros"], notes: SHOULDER_NOTES },
  { label: "ombro", match: /bursite/, unless: /quadril|trocant|joelho|cotovelo|calcan/, avoid: SHOULDER_AVOID, minReps: 8, groups: ["peito", "ombros"], notes: SHOULDER_NOTES },
  {
    label: "punho",
    match: /punho|\bpulso\b|carpo|quervain/,
    avoid: [
      "flexao", "flexao_diamante", "flexao_joelhos", "flexao_inclinada", "flexao_pike", "prancha_toque_ombro", "mountain_climber", "burpee", "mergulho_banco",
      "rosca_punho", "rosca_punho_inversa", "rosca_punho_halter", "rosca_inversa", "rosca_direta_barra", "remada_alta", "triceps_testa", "agachamento_frontal",
    ],
  },
  {
    label: "cotovelo",
    match: /cotovelo|epicondil|tenista|golfista/,
    avoid: [
      "triceps_testa", "triceps_testa_halter", "triceps_frances", "triceps_frances_cabo", "rosca_scott", "rosca_scott_maquina", "supino_fechado",
      "rosca_direta_barra", "mergulho_banco", "paralelas_peito", "paralelas_triceps", "barra_fixa_supinada", "flexao_diamante",
    ],
  },
  {
    label: "quadril",
    match: /quadril|trocant|femoroacetabular|coxartrose|pubalgia|virilha/,
    avoid: [
      "agachamento_livre", "agachamento_frontal", "agachamento_bulgaro", "afundo", "afundo_smith", "passada", "recuo_halter", "step_up", "hack",
      "agachamento_sumo", "agachamento_pistol_assistido", "levantamento_terra", "levantamento_terra_sumo", "good_morning", "kettlebell_swing",
      "cadeira_abdutora", "abducao_elastico", "abducao_polia", "abducao_caneleira", "passada_lateral_elastico", "cadeira_adutora", "aducao_polia",
      "aducao_caneleira", ...IMPACT,
    ],
    minReps: 8,
    groups: LEGS,
  },
  {
    label: "cervical",
    match: /cervical|pescoco|torcicolo/,
    avoid: ["desenvolvimento_barra", "remada_alta", "remada_alta_cabo", "encolhimento", "encolhimento_barra", "abdominal_supra", "abdominal_declinado", "agachamento_livre", "good_morning"],
  },
  { label: "tornozelo ou pé", match: /tornozelo|calcanh|fascite|aquiles|canelite/, avoid: ["panturrilha_unilateral", "escada_simulador", "passada", ...IMPACT] },
  {
    label: "idade ou artrose",
    match: /\bidos[oa]s?\b|terceira idade|artrose|artrite|osteopo|osteopen|protese/,
    avoid: [
      "agachamento_livre", "agachamento_frontal", "levantamento_terra", "levantamento_terra_sumo", "good_morning", "stiff", "remada_curvada_barra",
      "remada_curvada_supinada", "desenvolvimento_barra", "remada_alta", "barra_fixa", "barra_fixa_supinada", "paralelas_peito", "paralelas_triceps",
      "mergulho_banco", "abdominal_roda", "elevacao_pernas_barra", "kettlebell_swing", "passada", "agachamento_bulgaro", "agachamento_pistol_assistido",
      "flexao_nordica", "hiit_bike", ...IMPACT,
    ],
    minReps: 10,
    population: true,
  },
  {
    label: "pressão ou coração",
    match: /hipertens|pressao alta|cardiac|cardiopat|arritmia|infarto|marca-?passo/,
    avoid: ["supino_declinado_barra", "supino_declinado_maquina", "abdominal_declinado", "hiit_esteira", "hiit_bike", "burpee"],
    minReps: 10,
    population: true,
  },
  {
    label: "gestação",
    match: /gestante|gestacao|gravid|diastase/,
    avoid: [
      "mesa_flexora", "superman", "hiperextensao_lombar", "prancha", "prancha_toque_ombro", "mountain_climber", "supino_declinado_barra",
      "supino_declinado_maquina", "kettlebell_swing", "levantamento_terra", "levantamento_terra_sumo", "good_morning", "flexao_nordica", "hiit_bike",
      ...TRUNK_FLEXION, ...IMPACT,
    ],
    minReps: 10,
    population: true,
  },
];

/** "Sem dor no joelho", "não tenho lesão": a frase negada não aciona regra. */
const NEGATED = /\b(?:sem|nao tenho|nao sinto|nenhum|nenhuma)\s+(?:dor(?:es)?|lesao|lesoes|problemas?|limitac\w*|restric\w*|queixas?|incomodos?)\b[^.,;]*/g;

export interface LimitationPlan {
  /** Ids que o motor (e o saneamento da IA) não usam. */
  avoid: Set<string>;
  /** Regiões/condições reconhecidas no texto, sem repetição. */
  labels: string[];
  /** O aluno informou algo que nenhuma regra reconheceu. */
  unrecognized: boolean;
  /** Condição geral que pede um programa conservador por inteiro. */
  population: boolean;
  /** Piso de repetições para o grupo (0 = sem piso). */
  minRepsFor(group: MuscleGroup): number;
  /** Observação de execução para um exercício mantido na ficha. */
  noteFor(exerciseId: string): string | undefined;
}

/** Lê o texto livre de limitações e devolve o que o motor faz com ele. */
export function analyzeLimitations(text?: string): LimitationPlan {
  const avoid = new Set<string>();
  const labels: string[] = [];
  const notes = new Map<string, string>();
  const floors = new Map<MuscleGroup | "*", number>();
  let population = false;
  const raw = normalize(text ?? "");
  const t = raw.replace(NEGATED, " ");
  const negated = t !== raw;
  for (const rule of LIMITATION_RULES) {
    if (!rule.match.test(t) || (rule.unless && rule.unless.test(t))) continue;
    if (!labels.includes(rule.label)) labels.push(rule.label);
    rule.avoid.forEach((id) => avoid.add(id));
    if (rule.population) population = true;
    if (rule.minReps) for (const g of rule.groups ?? (["*"] as const)) floors.set(g, Math.max(floors.get(g) ?? 0, rule.minReps));
    for (const [id, note] of Object.entries(rule.notes ?? {})) if (!notes.has(id)) notes.set(id, note);
  }
  const declared = t.replace(/\b(?:nao|nada|nenhuma?|sem|tenho|ok)\b/g, "").replace(/[^a-z0-9]/g, "").length > 0;
  return {
    avoid,
    labels,
    // "Sem dor no joelho, liberado pelo fisio": a negação explica o texto; não é uma limitação desconhecida.
    unrecognized: declared && labels.length === 0 && !negated,
    population,
    minRepsFor: (group) => Math.max(floors.get("*") ?? 0, floors.get(group) ?? 0),
    noteFor: (id) => notes.get(id),
  };
}

export function avoidedByLimitations(text?: string): Set<string> {
  return analyzeLimitations(text).avoid;
}

// ───────────────────────── Séries, repetições e descanso ─────────────────────────

interface Scheme {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export interface SchemeOptions {
  /** Dia pesado ou de volume (Upper/Lower e PPL 6x). */
  style?: "forca" | "volume";
}

const sc = (sets: number, repsMin: number, repsMax: number, restSec: number): Scheme => ({ sets, repsMin, repsMax, restSec });

const LIGHT_IMPLEMENTS = ["peso_corporal", "elastico", "caneleira"];
const RACK_IMPLEMENTS = ["barra", "smith", "maquina"];
/** Peso corporal difícil: faixa de repetições de exercício com carga. */
const HARD_BODYWEIGHT = new Set(["barra_fixa", "barra_fixa_supinada", "paralelas_peito", "paralelas_triceps", "flexao_nordica", "agachamento_pistol_assistido", "flexao_pike", "flexao_diamante", "remada_invertida"]);
const HARD_CORE = new Set(["abdominal_roda", "elevacao_pernas_barra", "abdominal_infra_paralela", "abdominal_canivete"]);
const CONTROL_CORE = new Set(["pallof", "rotacao_tronco_polia", "dead_bug", "perdigueiro", "superman", "prancha_toque_ombro"]);

/**
 * Séries × repetições × descanso de um exercício. `isMainSlot` marca o levantamento principal do dia:
 * só ele pode cair na faixa pesada, e só se for um multiarticular com barra, Smith ou máquina.
 */
export function repScheme(goal: Goal, level: Level, ex: Exercise, system: SystemId, isMainSlot: boolean, opts: SchemeOptions = {}): Scheme {
  const beginner = level === "iniciante";
  const advanced = level === "avancado";
  const unit = ex.unit ?? "reps";

  if (unit === "min") {
    if (ex.id.startsWith("hiit_")) return sc(1, 10, 15, 0);
    if (ex.id === "pular_corda") return sc(1, 5, 10, 0);
    return ex.id.includes("caminhada") ? sc(1, 20, 30, 0) : sc(1, 15, 20, 0);
  }
  if (ex.pattern === "mobilidade") return unit === "seg" ? sc(2, 20, 30, 15) : sc(2, 8, 10, 15);
  if (unit === "seg") {
    if (ex.pattern === "cardio" || ex.id === "mountain_climber") return sc(3, 30, 40, 30);
    if (ex.group === "antebraco") return sc(3, 20, 40, 60);
    return beginner ? sc(3, 20, 30, 45) : advanced ? sc(3, 45, 60, 45) : sc(3, 30, 45, 45);
  }
  if (ex.pattern === "core") {
    if (HARD_CORE.has(ex.id)) return sc(3, 8, 12, 60);
    if (CONTROL_CORE.has(ex.id)) return sc(3, 8, 12, 45);
    if (ex.implement !== "peso_corporal") return sc(3, 12, 15, 45);
    return beginner ? sc(3, 10, 15, 45) : sc(3, 15, 20, 45);
  }
  if (ex.pattern === "cardio") return sc(3, 8, 12, 60);

  const light = LIGHT_IMPLEMENTS.includes(ex.implement);
  const heavyApt = ex.compound && RACK_IMPLEMENTS.includes(ex.implement) && !ex.unilateral;
  const main = isMainSlot && ex.compound;

  if (system === "forca_5x5" && main) {
    if (ex.id === "levantamento_terra") return sc(1, 5, 5, 180);
    if (ex.main || ((ex.implement === "barra" || ex.implement === "smith") && !ex.unilateral)) return beginner ? sc(3, 5, 5, 180) : advanced ? sc(5, 3, 5, 180) : sc(5, 5, 5, 180);
    if (light) return sc(3, 8, 15, 90);
    return sc(beginner ? 3 : 4, 6, 10, 120);
  }

  // Sem carga, elástico e caneleira: repetições mais altas e descanso curto, em qualquer objetivo.
  if (light) {
    if (HARD_BODYWEIGHT.has(ex.id)) return sc(advanced ? 4 : 3, opts.style === "volume" ? 8 : 6, 12, 90);
    if (ex.compound && (ex.group === "peito" || ex.group === "triceps" || ex.group === "ombros")) return sc(3, 10, 15, 60);
    return sc(3, 12, 20, ex.compound ? 60 : 45);
  }

  // Iniciante: adaptação com 3 séries, repetições médias e descanso curto (sem faixa pesada).
  if (beginner) {
    if (goal === "forca") return main && heavyApt ? sc(3, 5, 8, 150) : ex.compound ? sc(3, 6, 10, 120) : sc(3, 10, 12, 75);
    const short = goal === "emagrecimento" || goal === "condicionamento";
    if (ex.compound) return sc(3, 10, 12, main && goal === "hipertrofia" ? 90 : short ? 60 : 75);
    return sc(3, 12, 15, short ? 45 : 60);
  }

  const volume = opts.style === "volume";
  switch (goal) {
    case "forca":
      if (main) {
        if (ex.id === "levantamento_terra") return sc(3, 3, 5, 180);
        if (ex.main) return volume ? sc(4, 5, 8, 150) : sc(5, 3, 5, 180);
        return heavyApt ? sc(4, 5, 8, 150) : sc(4, 6, 10, 120);
      }
      if (ex.compound) return heavyApt ? sc(advanced ? 4 : 3, 6, 8, 120) : sc(3, 8, 10, 90);
      return sc(3, 8, 12, 75);
    case "hipertrofia":
      if (main) {
        // O terra fica sempre em 3×6–8 (nada de terra com repetições altas); stiff e afins não entram na faixa 6–8.
        if (ex.id === "levantamento_terra") return sc(3, 6, 8, 150);
        if (volume || !heavyApt || ex.pattern === "quadril") return sc(4, 8, 10, 120);
        return sc(advanced ? 5 : 4, 6, 8, 150);
      }
      if (ex.compound) return volume ? sc(advanced ? 4 : 3, 10, 12, 90) : sc(advanced ? 4 : 3, 8, 12, 120);
      return volume ? sc(3, 12, 15, 60) : sc(3, 10, 15, 75);
    case "emagrecimento":
      if (main) return sc(advanced ? 4 : 3, 8, 12, 90);
      return ex.compound ? sc(3, 10, 12, 75) : sc(3, 12, 15, 60);
    case "condicionamento":
      return ex.compound ? sc(3, 12, 15, 60) : sc(3, 15, 20, 45);
    default:
      return ex.compound ? sc(3, 10, 12, 90) : sc(3, 12, 15, 60);
  }
}

// ───────────────────────── Duração ─────────────────────────

type Timed = Pick<PlannedExercise, "sets" | "repsMin" | "repsMax" | "restSec"> & { exerciseId?: string; unit?: PlannedExercise["unit"] };

/** Duração estimada de um exercício (segundos): execução + descanso + preparação. Unilateral conta os dois lados. */
export function estimateSeconds(p: Timed): number {
  const reps = (p.repsMin + p.repsMax) / 2;
  const unit = unitOf(p.exerciseId ?? "", p.unit);
  const sides = getExercise(p.exerciseId ?? "")?.unilateral ? 2 : 1;
  if (unit === "min") return p.sets * (reps * 60 + p.restSec);
  if (unit === "seg") return p.sets * (reps * sides + p.restSec) + 30;
  return p.sets * (reps * 3 * sides + p.restSec) + 60;
}

/** Aquecimento do dia: 3 min gerais, mais 2 min de séries de aproximação quando o primeiro exercício é pesado. */
function warmupSeconds(list: Timed[]): number {
  const first = list.find((p) => unitOf(p.exerciseId ?? "", p.unit) !== "min");
  if (!first) return 0;
  const heavy = unitOf(first.exerciseId ?? "", first.unit) === "reps" && first.repsMax <= 8;
  return 180 + (heavy ? 120 : 0);
}

function daySeconds(list: Timed[]): number {
  return list.reduce((acc, e) => acc + estimateSeconds(e), 0) + warmupSeconds(list);
}

export function estimateDayMinutes(day: WorkoutDay): number {
  return Math.round(daySeconds(day.exercises) / 60);
}

// ───────────────────────── Escolha do exercício ─────────────────────────

type MainPool = { forca: string[]; hipertrofia: string[]; geral: string[]; iniciante: string[] };

/**
 * Levantamento principal por perfil, em ordem de preferência (o que vem depois é a troca quando o
 * primeiro não pode: lesão, casa). Força: sempre o básico com barra. Iniciante: máquina, Smith e halter.
 */
const MAIN_POOLS: Record<string, MainPool> = {
  "peito:empurrar_h": {
    forca: ["supino_reto_barra", "supino_reto_smith", "supino_maquina", "supino_reto_halter"],
    hipertrofia: ["supino_reto_barra", "supino_reto_smith", "supino_maquina", "supino_reto_halter"],
    geral: ["supino_reto_barra", "supino_maquina", "supino_reto_halter"],
    iniciante: ["supino_maquina", "supino_reto_halter", "supino_reto_barra"],
  },
  "costas:puxar_h": {
    forca: ["remada_curvada_barra", "remada_cavalinho", "remada_maquina", "remada_baixa", "remada_curvada_halter", "remada_unilateral_halter"],
    hipertrofia: ["remada_curvada_barra", "remada_cavalinho", "remada_maquina", "remada_baixa", "remada_curvada_halter", "remada_unilateral_halter"],
    geral: ["remada_baixa", "remada_maquina", "remada_curvada_barra", "remada_curvada_halter", "remada_unilateral_halter"],
    iniciante: ["remada_baixa", "remada_maquina", "remada_sentada_maquina", "remada_curvada_halter", "remada_unilateral_halter"],
  },
  "ombros:empurrar_v": {
    forca: ["desenvolvimento_barra", "desenvolvimento_smith", "desenvolvimento_maquina", "desenvolvimento_halter"],
    hipertrofia: ["desenvolvimento_barra", "desenvolvimento_halter", "desenvolvimento_maquina", "desenvolvimento_smith"],
    geral: ["desenvolvimento_halter", "desenvolvimento_maquina"],
    iniciante: ["desenvolvimento_maquina", "desenvolvimento_halter"],
  },
  "quadriceps:agachar": {
    forca: ["agachamento_livre", "agachamento_smith", "hack", "leg_press", "agachamento_goblet", "agachamento_bulgaro"],
    hipertrofia: ["agachamento_livre", "agachamento_smith", "hack", "leg_press", "agachamento_goblet", "agachamento_bulgaro"],
    geral: ["agachamento_smith", "leg_press", "agachamento_livre", "agachamento_goblet", "agachamento_bulgaro"],
    iniciante: ["leg_press", "agachamento_smith", "leg_press_horizontal", "agachamento_goblet"],
  },
  "posteriores:quadril": {
    forca: ["levantamento_terra", "stiff", "stiff_smith", "terra_romeno_halter"],
    hipertrofia: ["stiff", "levantamento_terra", "stiff_smith", "terra_romeno_halter"],
    geral: ["stiff", "terra_romeno_halter", "stiff_smith"],
    iniciante: ["terra_romeno_halter", "stiff", "stiff_smith"],
  },
};

interface PickCtx {
  equipment: Equipment;
  level: Level;
  goal: Goal;
  system: SystemId;
  avoid: Set<string>;
  usedInDay: Set<string>;
  usedInProgram: Set<string>;
  seed: number;
  /** Identifica o encaixe em sorteio (dia + posição), para o ruído não depender da ordem das chamadas. */
  salt: string;
}

/** Lista de preferidos do encaixe; no principal, depende de nível e objetivo. */
function preferList(slot: Slot, ctx: PickCtx): { ids: string[]; ordered: boolean; strict: boolean } {
  const pool = slot.main ? MAIN_POOLS[`${slot.group}:${slot.pattern}`] : undefined;
  if (!pool) return { ids: slot.prefer ?? [], ordered: false, strict: false };
  if (ctx.system === "forca_5x5" || (ctx.goal === "forca" && ctx.level !== "iniciante")) return { ids: pool.forca, ordered: true, strict: true };
  if (ctx.level === "iniciante") return { ids: pool.iniciante, ordered: true, strict: false };
  return { ids: ctx.goal === "hipertrofia" ? pool.hipertrofia : pool.geral, ordered: true, strict: false };
}

/**
 * Variações do mesmo movimento: duas no mesmo dia são redundância (dois leg press, dois coices de glúteo,
 * corda + pulley com barra). O motor só repete a família se não houver outra opção para o encaixe.
 */
const FAMILIES: string[][] = [
  ["supino_reto_barra", "supino_reto_halter", "supino_reto_smith"],
  ["crucifixo_maquina", "crucifixo_halter", "crucifixo_inclinado_halter"],
  ["crossover", "crossover_polia_baixa"],
  ["remada_curvada_barra", "remada_curvada_supinada", "remada_curvada_halter"],
  ["remada_maquina", "remada_sentada_maquina", "remada_articulada_unilateral"],
  ["crucifixo_inverso", "crucifixo_inverso_maquina", "crucifixo_inverso_cabo"],
  ["rosca_direta_barra", "rosca_direta_barra_w", "rosca_direta_halter", "rosca_cabo"],
  ["rosca_martelo", "rosca_martelo_corda"],
  ["rosca_scott", "rosca_scott_maquina"],
  ["triceps_corda", "triceps_barra_polia", "triceps_inverso"],
  ["triceps_testa", "triceps_testa_halter"],
  ["triceps_frances", "triceps_frances_cabo"],
  ["agachamento_livre", "agachamento_smith", "agachamento_frontal"],
  ["leg_press", "leg_press_horizontal", "leg_press_unilateral"],
  ["cadeira_extensora", "cadeira_extensora_unilateral"],
  ["stiff", "terra_romeno_halter", "stiff_smith", "stiff_unilateral"],
  ["elevacao_pelvica", "elevacao_pelvica_maquina", "elevacao_pelvica_smith", "elevacao_pelvica_halter"],
  ["gluteo_cabo", "gluteo_maquina", "gluteo_4_apoios_caneleira", "gluteo_smith", "extensao_quadril_caneleira"],
  ["cadeira_abdutora", "abducao_polia", "abducao_elastico", "abducao_caneleira", "passada_lateral_elastico"],
  ["abdominal_supra", "abdominal_polia", "abdominal_maquina", "abdominal_declinado"],
];
const FAMILY_OF = new Map<string, number>(FAMILIES.flatMap((ids, i) => ids.map((id): [string, number] => [id, i])));

/**
 * Escolhe o exercício de um encaixe. Filtros fixos: equipamento, lesão, nível, repetição no dia;
 * alongamento e cardio só entram em encaixe próprio; os básicos pesados com barra só no encaixe principal.
 * Depois, do mais específico ao mais geral: preferidos do encaixe → grupo + padrão → grupo.
 * Cada candidato recebe uma nota uma única vez (mesma seed, mesma escolha).
 */
function pickExercise(slot: Slot, ctx: PickCtx): Exercise | undefined {
  const prefer = preferList(slot, ctx);
  // No 5×5 os básicos com barra são o programa: o nível não bloqueia o levantamento principal.
  const fiveByFiveMain = ctx.system === "forca_5x5" && Boolean(slot.main);
  const pool = EXERCISES.filter((e) => {
    if (!allowedByEquipment(e, ctx.equipment) || ctx.avoid.has(e.id) || ctx.usedInDay.has(e.id)) return false;
    if (!(fiveByFiveMain && prefer.ids.includes(e.id)) && !allowedForLevel(e, ctx.level)) return false;
    if (e.pattern === "mobilidade" && slot.pattern !== "mobilidade") return false;
    if ((e.group === "cardio" || e.pattern === "cardio" || e.unit === "min") && slot.group !== "cardio") return false;
    if ((MANUAL_ONLY.has(e.id) || (e.main && !slot.main)) && !prefer.ids.includes(e.id)) return false;
    return true;
  });
  const takenFamilies = new Set<number>();
  for (const id of ctx.usedInDay) {
    const family = FAMILY_OF.get(id);
    if (family !== undefined) takenFamilies.add(family);
  }
  const fresh = (e: Exercise) => {
    const family = FAMILY_OF.get(e.id);
    return family === undefined || !takenFamilies.has(family);
  };

  const beginnerGym = ctx.level === "iniciante" && ctx.equipment === "academia" && !fiveByFiveMain;
  const score = (e: Exercise, preferred: boolean) => {
    let v = hash01(`${ctx.seed}|${ctx.salt}|${e.id}`) * 1.5;
    if (ctx.usedInProgram.has(e.id) && !fiveByFiveMain) v -= 2;
    // Iniciante em academia: barra livre só se não houver máquina, Smith, polia ou halter para o encaixe.
    if (beginnerGym && e.implement === "barra") v -= 3;
    if (preferred && prefer.ordered) {
      // Os três primeiros da lista se alternam; do quarto em diante são trocas (lesão, casa) e só entram se os primeiros faltarem.
      const i = prefer.ids.indexOf(e.id);
      return v - (prefer.strict ? i * 3 : i <= 2 ? i * 0.6 : 1.2 + (i - 2) * 3);
    }
    v += (e.pri ?? 0) * 0.8;
    if (beginnerGym && (e.implement === "maquina" || e.implement === "cabo" || e.implement === "smith")) v += 1;
    return v;
  };

  // Academia: nunca a versão de elástico ou sem carga. Em casa: com carga primeiro, sem carga se faltar.
  const gym = ctx.equipment === "academia";
  const loaded = (e: Exercise) => (gym ? !isGymRegression(e) : ctx.equipment !== "home" || e.implement !== "peso_corporal" || e.pattern === "core");
  const inGroup = pool.filter((e) => e.group === slot.group);
  const kind = (e: Exercise) => slot.compound === undefined || e.compound === slot.compound;
  const tiers = [
    pool.filter((e) => prefer.ids.includes(e.id)),
    inGroup.filter((e) => (!slot.pattern || e.pattern === slot.pattern) && kind(e)),
    inGroup.filter(kind),
    inGroup,
  ];
  const search = (distinctOnly: boolean, lastTier: number): Exercise | undefined => {
    for (let t = 0; t <= lastTier; t++) {
      const tier = distinctOnly ? tiers[t]!.filter(fresh) : tiers[t]!;
      const withLoad = tier.filter(loaded);
      const available = withLoad.length || gym ? withLoad : tier;
      // Fora do core, exercício contado em repetições vem antes de isometria.
      const byReps = slot.pattern === "core" ? available : available.filter((e) => (e.unit ?? "reps") === "reps");
      const candidates = byReps.length ? byReps : available;
      if (!candidates.length) continue;
      return candidates
        .map((e) => ({ e, v: score(e, t === 0) }))
        .sort((a, b) => b.v - a.v || a.e.id.localeCompare(b.e.id))[0]!.e;
    }
    return undefined;
  };
  // Primeiro, um movimento diferente dos que já estão no dia; repetir a família é o último recurso.
  return search(true, 1) ?? search(false, 3);
}

/** Quando o grupo do encaixe não tem exercício possível (sem equipamento, lesão), tenta um grupo vizinho. */
const FALLBACK_COMPOUND: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  posteriores: ["gluteos", "lombar"],
  gluteos: ["posteriores", "quadriceps"],
  quadriceps: ["gluteos"],
  costas: ["lombar"],
  ombros: ["peito", "triceps"],
  peito: ["triceps", "ombros"],
  triceps: ["peito", "ombros"],
};
const FALLBACK_ISOLATED: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  posteriores: ["gluteos"],
  gluteos: ["posteriores"],
  adutores: ["gluteos"],
  biceps: ["costas", "lombar"],
  costas: ["lombar"],
  lombar: ["abdomen"],
};

function pickWithFallback(slot: Slot, ctx: PickCtx): Exercise | undefined {
  const direct = pickExercise(slot, ctx);
  if (direct || slot.optional) return direct;
  const salt = ctx.salt;
  try {
    for (const group of (slot.compound ? FALLBACK_COMPOUND : FALLBACK_ISOLATED)[slot.group] ?? []) {
      ctx.salt = `${salt}>${group}`;
      const ex = pickExercise({ group }, ctx);
      if (ex) return ex;
    }
    return undefined;
  } finally {
    ctx.salt = salt;
  }
}

const SIDE_NOTE = "Repetições por lado.";
const SIDE_NOTE_TIME = "Tempo por lado.";

export function buildPlanned(ex: Exercise, scheme: Scheme, technique: Technique = "normal"): PlannedExercise {
  const side = ex.unilateral ? ((ex.unit ?? "reps") === "seg" ? SIDE_NOTE_TIME : SIDE_NOTE) : undefined;
  return {
    uid: uid(),
    exerciseId: ex.id,
    name: ex.name,
    ...scheme,
    loadKg: null,
    technique,
    ...(side ? { notes: side } : {}),
    ...(ex.unit && ex.unit !== "reps" ? { unit: ex.unit } : {}),
  };
}

/** Com limitação na região, nada de série pesada: sobe as repetições e segura séries e descanso. */
function clampForLimitation(p: PlannedExercise, ex: Exercise, lim: LimitationPlan): void {
  const floor = lim.minRepsFor(ex.group);
  if ((p.unit ?? "reps") === "reps" && ex.pattern !== "core" && ex.pattern !== "cardio" && floor > 0 && p.repsMin < floor) {
    p.repsMin = floor;
    p.repsMax = Math.max(p.repsMax, floor + 2);
    p.sets = Math.min(p.sets, 3);
    p.restSec = Math.min(p.restSec, 90);
  }
  const note = lim.noteFor(ex.id);
  if (note) p.notes = p.notes ? `${p.notes} ${note}` : note;
}

// ───────────────────────── Ajuste ao tempo ─────────────────────────

interface Entry {
  p: PlannedExercise;
  ex: Exercise;
  /** Levantamento principal do dia: nunca é cortado. */
  main: boolean;
  /** Prioridade do aluno: a última coisa a ser cortada. */
  emphasis: boolean;
}

const isReps = (e: Entry) => (e.p.unit ?? "reps") === "reps";
const isTimed = (e: Entry) => (e.p.unit ?? "reps") === "min";
const total = (list: Entry[]) => daySeconds(list.map((e) => e.p));

/** Custo de tirar um exercício do dia: quanto maior, mais tarde ele sai. */
function removalCost(e: Entry, list: Entry[], focus: MuscleGroup[]): number {
  if (e.main) return Infinity;
  if (isTimed(e)) return 0;
  if (e.emphasis) return 10;
  if (!focus.includes(e.ex.group)) return ({ antebraco: 1, panturrilhas: 2, abdomen: 3 } as Partial<Record<MuscleGroup, number>>)[e.ex.group] ?? 4;
  const sameGroup = list.filter((x) => x.ex.group === e.ex.group).length;
  if (sameGroup >= 2) return e.ex.compound ? 6 : 5;
  return 9; // único exercício de um grupo do foco do dia
}

function cheapest(list: Entry[], focus: MuscleGroup[], maxCost: number): Entry | undefined {
  let best: { e: Entry; cost: number; group: number; index: number } | undefined;
  list.forEach((e, index) => {
    const cost = removalCost(e, list, focus);
    if (cost > maxCost) return;
    const group = list.filter((x) => x.ex.group === e.ex.group).length;
    if (!best || cost < best.cost || (cost === best.cost && (group > best.group || (group === best.group && index > best.index)))) best = { e, cost, group, index };
  });
  return best?.e;
}

/**
 * Faz o dia caber no tempo, do corte menos doloroso ao mais doloroso, parando assim que couber:
 * descanso dos acessórios → séries acima de 3 → exercícios redundantes ou fora do foco →
 * 2 séries nos acessórios → descanso e séries do principal → o que sobrar, até 3 exercícios.
 * Nunca sai o principal; a prioridade do aluno e o último exercício de um grupo do foco saem por último.
 */
function fitToTime(entries: Entry[], focus: MuscleGroup[], minutes: number): Entry[] {
  const limit = minutes * 60;
  let list = [...entries];
  const over = () => total(list) > limit;
  const fromEnd = () => [...list].reverse();
  if (!over()) return list;

  // Cardio primeiro: encurta até 10 min.
  for (const e of list.filter(isTimed)) {
    while (over() && e.p.repsMax > 10) {
      e.p.repsMax = Math.max(10, e.p.repsMax - 5);
      e.p.repsMin = Math.min(e.p.repsMin, e.p.repsMax);
    }
  }
  if (!over()) return list;

  for (const e of list) if (!e.main && !isTimed(e)) e.p.restSec = Math.min(e.p.restSec, e.ex.compound ? 90 : 60);

  const trimSets = (pick: (e: Entry) => boolean, floor: number) => {
    let changed = true;
    while (over() && changed) {
      changed = false;
      for (const e of fromEnd()) {
        if (!over()) break;
        if (pick(e) && e.p.sets > floor) {
          e.p.sets -= 1;
          changed = true;
        }
      }
    }
  };
  // Principais perdem séries todos juntos (um 5×5 não vira 5×5 + 4×5).
  const mains = () => list.filter((e) => e.main);
  const trimMains = (pick: (e: Entry) => boolean, floor: number) => {
    while (over() && mains().some((e) => pick(e) && e.p.sets > floor)) for (const e of mains()) if (pick(e) && e.p.sets > floor) e.p.sets -= 1;
  };
  trimSets((e) => !e.main && !e.ex.compound && !isTimed(e), 3);
  trimSets((e) => !e.main && e.ex.compound, 3);
  // Séries fixas (5×5) são o programa: só encolhem no fim, depois do descanso.
  trimMains((e) => e.p.repsMin < e.p.repsMax, 4);

  const minKeep = Math.min(4, list.length);
  while (over() && list.length > minKeep) {
    const victim = cheapest(list, focus, 6);
    if (!victim) break;
    list = list.filter((e) => e !== victim);
  }

  trimSets((e) => !e.main && !e.emphasis && !isTimed(e), 2);

  while (over() && mains().some((e) => e.p.restSec > 120)) for (const e of mains()) e.p.restSec = Math.max(120, e.p.restSec - 30);
  trimMains(() => true, 3);

  while (over() && list.length > 3) {
    const victim = cheapest(list, focus, 10);
    if (!victim) break;
    list = list.filter((e) => e !== victim);
  }

  // Sessões muito curtas: o que ainda dá para apertar sem tirar o principal.
  trimSets((e) => !e.main && !isTimed(e), 2);
  for (const e of list) if (over() && !e.main && !isTimed(e)) e.p.restSec = Math.min(e.p.restSec, 45);
  while (over() && list.length > 2) {
    const victim = cheapest(list, focus, 10);
    if (!victim) break;
    list = list.filter((e) => e !== victim);
  }
  return list;
}

/**
 * Ajusta um dia já montado (pela IA, por exemplo) ao tempo da sessão, com as mesmas prioridades do motor.
 * O primeiro multiarticular do dia é tratado como principal; `emphasis` protege os grupos prioritários.
 */
export function fitDayToTime(day: WorkoutDay, minutes: number, emphasis: MuscleGroup[] = []): WorkoutDay {
  let mainTaken = false;
  const entries: Entry[] = [];
  for (const p of day.exercises) {
    const ex = getExercise(p.exerciseId);
    if (!ex) continue;
    const main = !mainTaken && ex.compound && (p.unit ?? ex.unit ?? "reps") === "reps";
    if (main) mainTaken = true;
    entries.push({ p: { ...p }, ex, main, emphasis: emphasis.includes(ex.group) });
  }
  if (entries.length !== day.exercises.length) return day;
  return { ...day, exercises: fitToTime(entries, day.focus, minutes).map((e) => e.p) };
}

// ───────────────────────── Montagem do dia ─────────────────────────

const CARDIO_GOALS: Goal[] = ["emagrecimento", "condicionamento", "saude"];

/** Aeróbio de fechamento por perfil (ids contados em minutos), do mais indicado ao menos. */
function cardioPool(ctx: PickCtx): string[] {
  if (ctx.equipment !== "academia") return ctx.goal === "condicionamento" ? ["corrida_rua", "pular_corda", "caminhada_rua"] : ["caminhada_rua"];
  if (ctx.goal === "condicionamento") return ["hiit_esteira", "hiit_bike", "esteira_corrida", "remo_ergometro", "bicicleta_ergometrica", "eliptico", "esteira_caminhada_inclinada"];
  if (ctx.goal === "saude") return ["esteira_caminhada", "bicicleta_ergometrica", "eliptico"];
  return ["esteira_caminhada_inclinada", "bicicleta_ergometrica", "eliptico", "escada_simulador", "esteira_caminhada"];
}

function pickCardio(ctx: PickCtx): Exercise | undefined {
  const ok = (e: Exercise | undefined): e is Exercise =>
    Boolean(e) && e!.unit === "min" && allowedByEquipment(e!, ctx.equipment) && !ctx.avoid.has(e!.id) && allowedForLevel(e!, ctx.level);
  const pool = cardioPool(ctx).map(getExercise).filter(ok);
  const candidates = pool.length ? pool : EXERCISES.filter((e) => ok(e) && e.group === "cardio" && !(ctx.equipment === "academia" && isGymRegression(e)));
  // Os três primeiros da lista se alternam entre os dias; os demais só entram como troca.
  return candidates
    .slice(0, 3)
    .map((e) => ({ e, v: hash01(`${ctx.seed}|${ctx.salt}|cardio|${e.id}`) + (ctx.usedInProgram.has(e.id) ? -0.5 : 0) }))
    .sort((a, b) => b.v - a.v || a.e.id.localeCompare(b.e.id))[0]?.e;
}

/** Dias em que a prioridade do aluno se aplica quando nenhum dia do sistema treina o grupo. */
const RELATED_FOCUS: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  gluteos: LEGS,
  posteriores: LEGS,
  quadriceps: LEGS,
  adutores: LEGS,
  panturrilhas: LEGS,
  biceps: ["costas"],
  triceps: ["peito", "ombros"],
  antebraco: ["biceps", "costas"],
  lombar: ["costas", "posteriores"],
  abdomen: ["abdomen"],
};

function emphasisDays(system: TrainingSystem, group: MuscleGroup): Set<string> {
  const direct = system.templates.filter((t) => t.focus.includes(group) || t.slots.some((s) => s.group === group));
  const related = RELATED_FOCUS[group] ?? [];
  const legDays = system.templates.filter((t) => t.focus.some((g) => related.includes(g)));
  // Glúteos, posteriores e quadríceps priorizados entram em todo dia de pernas, não só no dia que já os treina.
  if (LEGS.includes(group)) return new Set([...direct, ...legDays].map((t) => t.key));
  return new Set((direct.length ? direct : legDays).map((t) => t.key));
}

/**
 * Prioridade do aluno num dia: o que já existe do grupo fica protegido (e deixa de ser opcional),
 * o multiarticular direto sobe para o 2º lugar, e entra um isolado — ou um exercício extra, se o dia já tinha os dois.
 */
function emphasize(slots: Slot[], group: MuscleGroup): Slot[] {
  const spec = EMPHASIS_SLOTS[group];
  if (!spec) return slots;
  const out = slots.map((s) => (s.group === group ? { ...s, optional: false, emphasis: true } : s));
  let added = false;

  if (spec.compound) {
    const at = out.findIndex((s) => s.group === group && s.compound);
    if (at === -1) {
      out.splice(Math.min(1, out.length), 0, { ...spec.compound(), emphasis: true });
      added = true;
    } else if (at > 1) {
      out.splice(1, 0, ...out.splice(at, 1));
    }
  }

  const lastOfGroup = () => out.reduce((last, s, i) => (s.group === group ? i : last), -1);
  if (!out.some((s) => s.group === group && s.compound === false)) {
    // Primeiro entre os isolados do dia (depois do multiarticular do próprio grupo).
    const firstIso = out.findIndex((s, i) => s.compound === false && i > lastOfGroup());
    out.splice(firstIso === -1 ? out.length : firstIso, 0, { ...spec.isolation(), emphasis: true });
    added = true;
  }
  if (!added) out.splice(lastOfGroup() + 1, 0, { ...spec.extra(), emphasis: true });
  return out;
}

interface DayCtx extends PickCtx {
  input: GenerateInput;
  lim: LimitationPlan;
  minutes: number;
  /** Mesmo treino 2x por semana (ABC 6x): sem séries extras. */
  highFrequency: boolean;
  /** Programa trocado por um mais seguro por causa de limitação: nada de séries abaixo de 6 repetições. */
  conservative: boolean;
  emphasisByDay: Map<MuscleGroup, Set<string>>;
}

function buildDay(tpl: DayTemplate, ctx: DayCtx): WorkoutDay {
  const { input, lim } = ctx;
  const emphasis = [...ctx.emphasisByDay].filter(([, days]) => days.has(tpl.key)).map(([g]) => g);
  let slots = tpl.slots.map((s) => ({ ...s }));
  for (const g of emphasis) slots = emphasize(slots, g);
  // Força: o levantamento principal abre o dia.
  if (input.goal === "forca") slots = [...slots.filter((s) => s.main), ...slots.filter((s) => !s.main)];

  ctx.usedInDay = new Set<string>();
  const styled = input.level !== "iniciante" && (input.goal === "hipertrofia" || input.goal === "forca") ? tpl.style : undefined;

  const make = (slot: Slot, ex: Exercise): Entry => {
    ctx.usedInDay.add(ex.id);
    ctx.usedInProgram.add(ex.id);
    const scheme = repScheme(input.goal, input.level, ex, ctx.system, Boolean(slot.main), { style: styled });
    const mainLift = Boolean(slot.main) && ex.compound;
    if (ctx.highFrequency) scheme.sets = Math.min(scheme.sets, mainLift ? 4 : 3);
    if (ctx.conservative && (ex.unit ?? "reps") === "reps" && ex.pattern !== "core" && scheme.repsMin < 6) {
      scheme.repsMin = 6;
      scheme.repsMax = Math.max(scheme.repsMax, 8);
      scheme.sets = Math.min(scheme.sets, 4);
      scheme.restSec = Math.min(scheme.restSec, 150);
    }
    // Sessões de até 60 min: acessórios com 60–90 s de descanso, iguais em todos os dias da ficha.
    if (ctx.minutes <= 60 && !mainLift && (ex.unit ?? "reps") === "reps") scheme.restSec = Math.min(scheme.restSec, ex.compound ? 90 : 60);
    const p = buildPlanned(ex, scheme);
    clampForLimitation(p, ex, lim);
    return { p, ex, main: mainLift, emphasis: Boolean(slot.emphasis) || emphasis.includes(ex.group) };
  };

  // 1. Encaixes fixos, na ordem do modelo (os opcionais ficam guardando lugar).
  const placed: (Entry | undefined)[] = slots.map((slot, i) => {
    if (slot.optional) return undefined;
    ctx.salt = `${tpl.key}:${i}`;
    const ex = pickWithFallback(slot, ctx);
    return ex ? make(slot, ex) : undefined;
  });
  const active = () => placed.filter((e): e is Entry => Boolean(e));

  // 2. Mínimo de 4 exercícios (sem equipamento ou com várias lesões os encaixes do modelo podem faltar).
  const extras: Entry[] = [];
  const add = (group: MuscleGroup, keep = false) => {
    ctx.salt = `${tpl.key}:extra:${group}:${extras.length}`;
    const ex = pickExercise({ group }, ctx);
    if (ex) extras.push(make({ group, emphasis: keep }, ex));
  };
  // Sem equipamento não há puxada: todo dia leva ao menos um exercício de lombar, que o corte por tempo preserva.
  const hasBack = active().some((e) => e.ex.group === "lombar" || e.ex.group === "costas");
  if (input.equipment === "peso_corporal") {
    if (hasBack) active().find((e) => e.ex.group === "lombar" || e.ex.group === "costas")!.emphasis = true;
    else add("lombar", true);
  }
  const fillers: MuscleGroup[] = ["abdomen", "gluteos", "lombar", "quadriceps", "abdomen", "peito", "panturrilhas"];
  for (const g of fillers) {
    if (active().length + extras.length >= Math.min(4, slots.filter((s) => !s.optional).length)) break;
    add(g);
  }
  // Extras entram antes do core/panturrilha final, para o abdômen continuar fechando o dia.
  const tail = (e: Entry) => e.ex.group === "abdomen" || e.ex.group === "panturrilhas";
  // Encaixe multiarticular que só achou um isolado (lesão): o isolado vai para junto dos outros isolados.
  const swapped = (e: Entry, i: number) => Boolean(slots[i]?.compound) && !e.ex.compound;
  const kept = placed.map((e, i) => (e && !swapped(e, i) ? e : undefined)).filter((e): e is Entry => Boolean(e));
  const moved = placed.map((e, i) => (e && swapped(e, i) ? e : undefined)).filter((e): e is Entry => Boolean(e));
  const firstIso = kept.findIndex((e) => !e.ex.compound);
  const base = moved.length ? (firstIso === -1 ? [...kept, ...moved] : [...kept.slice(0, firstIso), ...moved, ...kept.slice(firstIso)]) : kept;
  const cut = base.length - [...base].reverse().findIndex((e) => !tail(e));
  let list = cut > base.length ? [...extras, ...base] : [...base.slice(0, cut), ...extras, ...base.slice(cut)];

  // 3. Tempo: corta se passou; se sobrou, aeróbio (emagrecimento, condicionamento, saúde), opcionais e séries extras.
  const limit = ctx.minutes * 60;
  if (total(list) > limit) {
    list = fitToTime(list, tpl.focus, ctx.minutes);
  } else {
    let cardio: Entry | undefined;
    const spare = limit - total(list);
    if (CARDIO_GOALS.includes(input.goal) && spare >= 600) {
      ctx.salt = tpl.key;
      const ex = pickCardio(ctx);
      if (ex) {
        const cap = ex.id.startsWith("hiit_") ? 15 : ex.id === "pular_corda" ? 10 : 20;
        const m = Math.min(cap, Math.floor(spare / 300) * 5);
        ctx.usedInProgram.add(ex.id);
        cardio = { p: buildPlanned(ex, sc(1, m, m, 0)), ex, main: false, emphasis: false };
      }
    }
    const withCardio = () => (cardio ? [...list, cardio] : list);

    // Opcionais do modelo, na posição em que o personal os escreveria.
    slots.forEach((slot, i) => {
      // Iniciante: no máximo 7 exercícios de força por dia.
      if (!slot.optional || (input.level === "iniciante" && list.length >= 7)) return;
      ctx.salt = `${tpl.key}:${i}`;
      const ex = pickExercise(slot, ctx);
      if (!ex) return;
      const wasUsed = ctx.usedInProgram.has(ex.id);
      const entry = make(slot, ex);
      const before = placed.slice(0, i).filter((e): e is Entry => Boolean(e) && list.includes(e!));
      const at = before.length ? list.indexOf(before[before.length - 1]!) + 1 : 0;
      const next = [...list.slice(0, at), entry, ...list.slice(at)];
      if (total(cardio ? [...next, cardio] : next) <= limit) {
        list = next;
        placed[i] = entry;
      } else {
        ctx.usedInDay.delete(ex.id);
        if (!wasUsed) ctx.usedInProgram.delete(ex.id);
      }
    });

    // Séries extras (até 4) só em sessões acima de 60 min, para intermediário e avançado fora da força.
    // Entram em bloco, para a ficha não ficar com séries desencontradas: isolados dos grupos do foco,
    // depois os demais isolados e, por fim, os multiarticulares. Para no primeiro bloco que não couber.
    if (ctx.minutes > 60 && input.level !== "iniciante" && input.goal !== "forca" && !ctx.highFrequency) {
      const isolated = (e: Entry) => !e.ex.compound && e.ex.pattern !== "core";
      const blocks = [
        list.filter((e) => isolated(e) && tpl.focus.includes(e.ex.group)),
        list.filter((e) => isolated(e) && !tpl.focus.includes(e.ex.group)),
        list.filter((e) => e.ex.compound && !e.main),
      ];
      for (const block of blocks) {
        const able = block.filter((e) => isReps(e) && e.p.sets < 4 && lim.minRepsFor(e.ex.group) === 0);
        for (const e of able) e.p.sets += 1;
        if (total(withCardio()) <= limit) continue;
        for (const e of able) e.p.sets -= 1;
        break;
      }
    }
    list = withCardio();
  }

  // 4. Avançado em hipertrofia: drop-set no último isolado com carga (de preferência de um grupo do foco).
  if (input.level === "avancado" && input.goal === "hipertrofia") {
    const loadable = (e: Entry) => !e.ex.compound && e.ex.pattern === "isolado" && isReps(e) && ["maquina", "cabo", "halter"].includes(e.ex.implement) && e.ex.group !== "antebraco";
    const candidates = [...list].reverse().filter(loadable);
    const target = candidates.find((e) => tpl.focus.includes(e.ex.group)) ?? candidates[0];
    if (target) target.p.technique = "drop_set";
  }

  // Em hipertrofia o título avisa qual é o dia pesado e qual é o de volume.
  const title = styled && input.goal === "hipertrofia" ? `${tpl.title} (${styled === "forca" ? "força" : "volume"})` : tpl.title;
  return { key: tpl.key, title, focus: tpl.focus, exercises: list.map((e) => e.p) };
}

// ───────────────────────── Ficha ─────────────────────────

const FIVE_BASICS = ["agachamento_livre", "supino_reto_barra", "remada_curvada_barra", "desenvolvimento_barra", "levantamento_terra"];

const NOTE_WARMUP = "Aquecimento: 5 min leves e, no primeiro exercício do dia, 2 séries de aproximação (cerca de 50% e 75% da carga) antes das séries válidas.";
const NOTE_LOAD = "Carga inicial: escolha um peso que deixe 2 repetições de sobra em cada série. Quando fechar o topo da faixa em todas as séries, o app sugere aumentar.";
const NOTE_BODYWEIGHT = "Aquecimento: 5 min de mobilidade e polichinelos leves. Quando fechar o topo da faixa em todas as séries, desacelere a descida ou passe para uma variação mais difícil.";
const NOTE_5X5 =
  "Comece leve (cerca de metade do que você faria em 5 repetições) e faça 2–3 séries de aquecimento subindo a carga antes das séries válidas. Fechou todas as séries com 5 repetições: suba 2,5 kg no agachamento, supino, desenvolvimento e remada e 5 kg no terra. Falhou: repita a carga; após duas falhas seguidas, volte 10%.";

/** O 5×5 depende dos básicos com barra: sem academia ou com limitação que os tira, vira um Full Body. */
function resolveSystem(input: GenerateInput, lim: LimitationPlan): { system: TrainingSystem; note?: string; conservative: boolean } {
  if (input.system !== "forca_5x5") return { system: getSystem(input.system), conservative: false };
  if (input.equipment !== "academia") return { system: getSystem("fullbody"), note: "O 5×5 precisa de barra e anilhas; montei um Full Body equivalente.", conservative: false };
  if (lim.population || FIVE_BASICS.some((id) => lim.avoid.has(id))) {
    return { system: getSystem("fullbody"), note: "O 5×5 depende dos básicos pesados com barra; com as limitações informadas, montei um Full Body mais seguro.", conservative: true };
  }
  return { system: getSystem("forca_5x5"), conservative: false };
}

/** Motor determinístico: gera uma ficha completa sem IA (também é o fallback da IA). Mesma seed, mesma ficha. */
export function generateProgram(input: GenerateInput, owner: { ownerId: string; createdBy: string }): Program {
  const lim = analyzeLimitations(input.limitations);
  const { system, note, conservative } = resolveSystem(input, lim);
  const emphasisByDay = new Map<MuscleGroup, Set<string>>();
  for (const g of input.emphasis ?? []) if (g !== "cardio" && !emphasisByDay.has(g)) emphasisByDay.set(g, emphasisDays(system, g));

  const ctx: DayCtx = {
    input,
    lim,
    equipment: input.equipment,
    level: input.level,
    goal: input.goal,
    system: system.id,
    avoid: lim.avoid,
    usedInDay: new Set<string>(),
    usedInProgram: new Set<string>(),
    seed: input.seed ?? 1,
    salt: "",
    conservative,
    minutes: Math.max(25, input.sessionMinutes || 60),
    highFrequency: system.days > 0 && system.id !== "forca_5x5" && input.daysPerWeek >= 2 * system.days,
    emphasisByDay,
  };
  const days = system.templates.map((tpl) => buildDay(tpl, ctx));

  const notes = [
    note,
    system.id === "forca_5x5" ? NOTE_5X5 : input.equipment === "peso_corporal" ? NOTE_BODYWEIGHT : `${NOTE_WARMUP} ${NOTE_LOAD}`,
    lim.labels.length ? `Limitações consideradas: ${lim.labels.join(", ")}. Os exercícios de maior risco para a região ficaram de fora; revise antes de aplicar.` : undefined,
    lim.unrecognized ? `Atenção: não reconheci a limitação informada (“${(input.limitations ?? "").trim().slice(0, 80)}”). Revise os exercícios antes de aplicar.` : undefined,
  ].filter(Boolean);

  const now = new Date().toISOString();
  return {
    id: uid(),
    ownerId: owner.ownerId,
    createdBy: owner.createdBy,
    name: `${system.short} · ${GOAL_LABEL[input.goal]}`,
    system: system.id,
    goal: input.goal,
    level: input.level,
    daysPerWeek: input.daysPerWeek,
    notes: notes.join(" "),
    days,
    active: true,
    source: "modelo",
    createdAt: now,
    updatedAt: now,
  };
}
