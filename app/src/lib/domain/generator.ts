import { EXERCISES, getExercise, normalize } from "./exercises";
import { getSystem, type Slot } from "./systems";
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
  bi_set: "Bi-set",
  rest_pause: "Rest-pause",
  piramide: "Pirâmide",
  isometria: "Isometria",
};

/** PRNG determinístico (mulberry32) para variações reproduzíveis. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allowedByEquipment(ex: Exercise, equipment: Equipment): boolean {
  if (equipment === "academia") return true;
  if (equipment === "home") return Boolean(ex.home);
  return ex.implement === "peso_corporal";
}

/** Restrições comuns → exercícios evitados pelo motor determinístico. */
const LIMITATION_RULES: { keys: string[]; avoid: string[] }[] = [
  {
    keys: ["joelho", "menisco", "patela", "lca"],
    avoid: ["agachamento_livre", "agachamento_frontal", "afundo", "passada", "agachamento_bulgaro", "hack", "agachamento_smith"],
  },
  {
    keys: ["ombro", "manguito", "bursite"],
    avoid: ["desenvolvimento_barra", "remada_alta", "paralelas_peito", "mergulho_banco", "supino_declinado_barra", "triceps_testa"],
  },
  {
    keys: ["lombar", "coluna", "hernia", "protusao", "costas doi"],
    avoid: ["levantamento_terra", "remada_curvada_barra", "good_morning", "stiff", "agachamento_livre", "agachamento_frontal", "remada_cavalinho"],
  },
  { keys: ["punho", "pulso", "tunel do carpo"], avoid: ["flexao", "flexao_diamante", "rosca_punho", "agachamento_frontal"] },
  { keys: ["cotovelo", "epicondilite", "tendinite"], avoid: ["triceps_testa", "triceps_frances", "rosca_scott", "supino_fechado"] },
];

export function avoidedByLimitations(text?: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const t = normalize(text);
  for (const rule of LIMITATION_RULES) {
    if (rule.keys.some((k) => t.includes(k))) rule.avoid.forEach((id) => out.add(id));
  }
  return out;
}

interface Scheme {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export function repScheme(goal: Goal, level: Level, ex: Exercise, system: SystemId, isMainSlot: boolean): Scheme {
  if (ex.pattern === "core") {
    const timed = ex.id.startsWith("prancha");
    return { sets: 3, repsMin: timed ? 30 : 12, repsMax: timed ? 45 : 20, restSec: 45 };
  }
  if (system === "forca_5x5" && isMainSlot) {
    return { sets: level === "iniciante" ? 3 : 5, repsMin: 5, repsMax: 5, restSec: 180 };
  }
  const main = isMainSlot && ex.compound;
  let s: Scheme;
  switch (goal) {
    case "forca":
      s = main ? { sets: 5, repsMin: 3, repsMax: 5, restSec: 180 } : ex.compound ? { sets: 4, repsMin: 5, repsMax: 8, restSec: 150 } : { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 };
      break;
    case "hipertrofia":
      s = main ? { sets: 4, repsMin: 6, repsMax: 8, restSec: 150 } : ex.compound ? { sets: 3, repsMin: 8, repsMax: 12, restSec: 120 } : { sets: 3, repsMin: 10, repsMax: 15, restSec: 75 };
      break;
    case "emagrecimento":
      s = main ? { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 } : ex.compound ? { sets: 3, repsMin: 10, repsMax: 12, restSec: 75 } : { sets: 3, repsMin: 12, repsMax: 15, restSec: 60 };
      break;
    case "condicionamento":
      s = ex.compound ? { sets: 3, repsMin: 12, repsMax: 15, restSec: 60 } : { sets: 3, repsMin: 15, repsMax: 20, restSec: 45 };
      break;
    default:
      s = ex.compound ? { sets: 3, repsMin: 10, repsMax: 12, restSec: 90 } : { sets: 2, repsMin: 12, repsMax: 15, restSec: 60 };
  }
  if (level === "iniciante") s.sets = Math.max(2, s.sets - 1);
  if (level === "avancado" && ex.compound) s.sets = Math.min(5, s.sets + 1);
  return s;
}

/** Duração estimada de um exercício (segundos): execução + descanso + preparação. */
export function estimateSeconds(p: Pick<PlannedExercise, "sets" | "repsMin" | "repsMax" | "restSec">): number {
  const reps = (p.repsMin + p.repsMax) / 2;
  return p.sets * (reps * 3 + p.restSec) + 60;
}

export function estimateDayMinutes(day: WorkoutDay): number {
  return Math.round(day.exercises.reduce((acc, e) => acc + estimateSeconds(e), 0) / 60);
}

function pickExercise(
  slot: Slot,
  ctx: { equipment: Equipment; avoid: Set<string>; usedInDay: Set<string>; usedInProgram: Set<string>; rand: () => number },
): Exercise | undefined {
  const base = EXERCISES.filter(
    (e) => e.group === slot.group && allowedByEquipment(e, ctx.equipment) && !ctx.avoid.has(e.id) && !ctx.usedInDay.has(e.id),
  );
  const tiers: Exercise[][] = [
    base.filter((e) => (!slot.pattern || e.pattern === slot.pattern) && (slot.compound === undefined || e.compound === slot.compound)),
    base.filter((e) => slot.compound === undefined || e.compound === slot.compound),
    base,
  ];
  for (const tier of tiers) {
    if (!tier.length) continue;
    const score = (e: Exercise) =>
      (slot.main && e.main ? 4 : 0) + (ctx.usedInProgram.has(e.id) ? -2 : 0) + (e.implement === "barra" && slot.main ? 1 : 0) + ctx.rand() * 1.5;
    return [...tier].sort((a, b) => score(b) - score(a))[0];
  }
  return undefined;
}

export function buildPlanned(ex: Exercise, scheme: Scheme, technique: Technique = "normal"): PlannedExercise {
  return { uid: uid(), exerciseId: ex.id, name: ex.name, ...scheme, loadKg: null, technique };
}

/** Motor determinístico: gera uma ficha completa sem IA (também é o fallback da IA). */
export function generateProgram(input: GenerateInput, owner: { ownerId: string; createdBy: string }): Program {
  const system = getSystem(input.system);
  const rand = rng(input.seed ?? 1);
  const avoid = avoidedByLimitations(input.limitations);
  const usedInProgram = new Set<string>();
  const minutes = Math.max(25, input.sessionMinutes || 60);

  const days: WorkoutDay[] = system.templates.map((tpl) => {
    const usedInDay = new Set<string>();
    const slots = [...tpl.slots];
    for (const g of input.emphasis ?? []) {
      if (tpl.focus.includes(g)) slots.push({ group: g, compound: false });
    }
    const exercises: PlannedExercise[] = [];
    slots.forEach((slot, i) => {
      const ex = pickExercise(slot, { equipment: input.equipment, avoid, usedInDay, usedInProgram, rand });
      if (!ex) return;
      usedInDay.add(ex.id);
      usedInProgram.add(ex.id);
      const isMain = Boolean(slot.main) || (i === 0 && ex.compound);
      exercises.push(buildPlanned(ex, repScheme(input.goal, input.level, ex, input.system, isMain)));
    });

    // Ajuste ao tempo disponível: remove do fim, preservando ao menos 3 exercícios.
    const day: WorkoutDay = { key: tpl.key, title: tpl.title, focus: tpl.focus, exercises };
    while (day.exercises.length > 3 && estimateDayMinutes(day) > minutes) {
      day.exercises.pop();
    }
    // Avançado em hipertrofia: drop-set no último isolado.
    if (input.level === "avancado" && input.goal === "hipertrofia") {
      const last = [...day.exercises].reverse().find((p) => !getExercise(p.exerciseId)?.compound);
      if (last) last.technique = "drop_set";
    }
    return day;
  });

  const now = new Date().toISOString();
  return {
    id: uid(),
    ownerId: owner.ownerId,
    createdBy: owner.createdBy,
    name: `${system.short} · ${GOAL_LABEL[input.goal]}`,
    system: input.system,
    goal: input.goal,
    level: input.level,
    daysPerWeek: input.daysPerWeek,
    notes:
      "Carga inicial: escolha um peso em que você termine cada série com 2 repetições de sobra. Quando bater o topo da faixa em todas as séries, o app sugere aumentar.",
    days,
    active: true,
    source: "modelo",
    createdAt: now,
    updatedAt: now,
  };
}
