import type { MuscleGroup, Pattern, SystemId } from "./types";

/** Um "encaixe" de exercício dentro de um dia de treino. */
export interface Slot {
  group: MuscleGroup;
  pattern?: Pattern;
  compound?: boolean;
  main?: boolean;
}

export interface DayTemplate {
  key: string;
  title: string;
  focus: MuscleGroup[];
  slots: Slot[];
}

export interface TrainingSystem {
  id: SystemId;
  name: string;
  short: string;
  days: number;
  /** Frequência semanal recomendada (dias) */
  fits: number[];
  description: string;
  bestFor: string;
  week: string[]; // rótulos da semana, ex.: ["A", "B", "C", "–", "A", ...]
  templates: DayTemplate[];
}

const C = (group: MuscleGroup, pattern?: Pattern, main?: boolean): Slot => ({ group, pattern, compound: true, main });
const I = (group: MuscleGroup, pattern?: Pattern): Slot => ({ group, pattern, compound: false });

export const SYSTEMS: TrainingSystem[] = [
  {
    id: "fullbody",
    name: "Full Body",
    short: "Full Body",
    days: 3,
    fits: [2, 3],
    description: "Corpo inteiro em cada treino, três variações alternadas.",
    bestFor: "Iniciantes e quem treina 2–3x por semana.",
    week: ["A", "–", "B", "–", "C", "–", "–"],
    templates: [
      { key: "A", title: "Corpo inteiro — ênfase em agachar e empurrar", focus: ["quadriceps", "peito", "costas"], slots: [C("quadriceps", "agachar", true), C("peito", "empurrar_h"), C("costas", "puxar_v"), C("posteriores", "quadril"), I("ombros"), C("abdomen", "core")] },
      { key: "B", title: "Corpo inteiro — ênfase em quadril e puxar", focus: ["posteriores", "costas", "ombros"], slots: [C("posteriores", "quadril", true), C("costas", "puxar_h"), C("ombros", "empurrar_v"), C("quadriceps", "agachar"), I("biceps"), I("triceps")] },
      { key: "C", title: "Corpo inteiro — ênfase em unilaterais", focus: ["quadriceps", "gluteos", "peito"], slots: [C("quadriceps", "agachar"), C("peito", "empurrar_h"), C("costas", "puxar_v"), C("gluteos", "quadril"), I("panturrilhas"), C("abdomen", "core")] },
    ],
  },
  {
    id: "ab",
    name: "AB (superior / inferior simples)",
    short: "AB",
    days: 2,
    fits: [2, 4],
    description: "Dois treinos que se alternam: A superior, B inferior.",
    bestFor: "Rotina corrida, 2 ou 4 dias por semana.",
    week: ["A", "–", "B", "–", "A", "–", "–"],
    templates: [
      { key: "A", title: "Superiores", focus: ["peito", "costas", "ombros"], slots: [C("peito", "empurrar_h"), C("costas", "puxar_v"), C("ombros", "empurrar_v"), C("costas", "puxar_h"), I("biceps"), I("triceps")] },
      { key: "B", title: "Inferiores e core", focus: ["quadriceps", "posteriores", "gluteos"], slots: [C("quadriceps", "agachar", true), C("posteriores", "quadril"), C("quadriceps", "agachar"), I("posteriores"), I("panturrilhas"), C("abdomen", "core")] },
    ],
  },
  {
    id: "abc",
    name: "ABC",
    short: "ABC",
    days: 3,
    fits: [3, 6],
    description: "Clássico das academias: empurrar, puxar e pernas.",
    bestFor: "Quem treina 3x (ou 6x repetindo) por semana.",
    week: ["A", "B", "C", "–", "A", "B", "C"],
    templates: [
      { key: "A", title: "Peito, ombros e tríceps", focus: ["peito", "ombros", "triceps"], slots: [C("peito", "empurrar_h", true), C("peito", "empurrar_h"), I("peito"), C("ombros", "empurrar_v"), I("ombros"), I("triceps"), I("triceps")] },
      { key: "B", title: "Costas e bíceps", focus: ["costas", "biceps"], slots: [C("costas", "puxar_v"), C("costas", "puxar_h", true), C("costas", "puxar_h"), I("costas"), I("biceps"), I("biceps")] },
      { key: "C", title: "Pernas e abdômen", focus: ["quadriceps", "posteriores", "gluteos"], slots: [C("quadriceps", "agachar", true), C("quadriceps", "agachar"), C("posteriores", "quadril"), I("quadriceps"), I("posteriores"), I("panturrilhas"), C("abdomen", "core")] },
    ],
  },
  {
    id: "abcd",
    name: "ABCD",
    short: "ABCD",
    days: 4,
    fits: [4],
    description: "Quatro divisões: peito, costas, pernas e ombros com braços.",
    bestFor: "Intermediários com 4 dias por semana.",
    week: ["A", "B", "–", "C", "D", "–", "–"],
    templates: [
      { key: "A", title: "Peito e tríceps", focus: ["peito", "triceps"], slots: [C("peito", "empurrar_h", true), C("peito", "empurrar_h"), I("peito"), I("peito"), I("triceps"), I("triceps")] },
      { key: "B", title: "Costas e bíceps", focus: ["costas", "biceps"], slots: [C("costas", "puxar_v"), C("costas", "puxar_h", true), C("costas", "puxar_h"), I("costas"), I("biceps"), I("biceps")] },
      { key: "C", title: "Pernas completas", focus: ["quadriceps", "posteriores", "gluteos"], slots: [C("quadriceps", "agachar", true), C("posteriores", "quadril"), C("quadriceps", "agachar"), I("quadriceps"), I("posteriores"), I("panturrilhas")] },
      { key: "D", title: "Ombros e abdômen", focus: ["ombros", "abdomen"], slots: [C("ombros", "empurrar_v", true), I("ombros"), I("ombros"), C("ombros", "puxar_h"), C("abdomen", "core"), C("abdomen", "core")] },
    ],
  },
  {
    id: "abcde",
    name: "ABCDE",
    short: "ABCDE",
    days: 5,
    fits: [5],
    description: "Um grupo muscular por dia, alto volume por sessão.",
    bestFor: "Avançados que treinam 5x e gostam de treino focado.",
    week: ["A", "B", "C", "D", "E", "–", "–"],
    templates: [
      { key: "A", title: "Peito", focus: ["peito"], slots: [C("peito", "empurrar_h", true), C("peito", "empurrar_h"), C("peito", "empurrar_h"), I("peito"), I("peito")] },
      { key: "B", title: "Costas", focus: ["costas"], slots: [C("costas", "puxar_v"), C("costas", "puxar_h", true), C("costas", "puxar_h"), C("costas", "puxar_v"), I("costas")] },
      { key: "C", title: "Pernas", focus: ["quadriceps", "posteriores", "gluteos"], slots: [C("quadriceps", "agachar", true), C("quadriceps", "agachar"), C("posteriores", "quadril"), I("quadriceps"), I("posteriores"), I("panturrilhas")] },
      { key: "D", title: "Ombros", focus: ["ombros"], slots: [C("ombros", "empurrar_v", true), I("ombros"), I("ombros"), C("ombros", "puxar_h"), I("costas")] },
      { key: "E", title: "Braços e abdômen", focus: ["biceps", "triceps", "abdomen"], slots: [I("biceps"), I("triceps"), I("biceps"), I("triceps"), I("antebraco"), C("abdomen", "core")] },
    ],
  },
  {
    id: "upper_lower",
    name: "Upper / Lower",
    short: "Upper/Lower",
    days: 4,
    fits: [4],
    description: "Superior e inferior, duas vezes por semana com variações.",
    bestFor: "Hipertrofia com frequência 2x por grupo.",
    week: ["U1", "L1", "–", "U2", "L2", "–", "–"],
    templates: [
      { key: "U1", title: "Superior — força", focus: ["peito", "costas", "ombros"], slots: [C("peito", "empurrar_h", true), C("costas", "puxar_h", true), C("ombros", "empurrar_v"), C("costas", "puxar_v"), I("biceps"), I("triceps")] },
      { key: "L1", title: "Inferior — força", focus: ["quadriceps", "posteriores"], slots: [C("quadriceps", "agachar", true), C("posteriores", "quadril"), C("quadriceps", "agachar"), I("posteriores"), I("panturrilhas"), C("abdomen", "core")] },
      { key: "U2", title: "Superior — volume", focus: ["peito", "costas", "ombros"], slots: [C("peito", "empurrar_h"), C("costas", "puxar_v"), I("peito"), C("costas", "puxar_h"), I("ombros"), I("biceps"), I("triceps")] },
      { key: "L2", title: "Inferior — volume", focus: ["gluteos", "quadriceps", "posteriores"], slots: [C("posteriores", "quadril", true), C("quadriceps", "agachar"), C("gluteos", "quadril"), I("quadriceps"), I("posteriores"), I("panturrilhas")] },
    ],
  },
  {
    id: "ppl",
    name: "Push / Pull / Legs",
    short: "PPL",
    days: 3,
    fits: [3],
    description: "Empurrar, puxar e pernas — divisão por padrão de movimento.",
    bestFor: "3 dias com sessões objetivas.",
    week: ["Push", "–", "Pull", "–", "Legs", "–", "–"],
    templates: [
      { key: "Push", title: "Push — peito, ombros e tríceps", focus: ["peito", "ombros", "triceps"], slots: [C("peito", "empurrar_h", true), C("ombros", "empurrar_v"), C("peito", "empurrar_h"), I("ombros"), I("triceps"), I("triceps")] },
      { key: "Pull", title: "Pull — costas e bíceps", focus: ["costas", "biceps"], slots: [C("costas", "puxar_v"), C("costas", "puxar_h", true), C("costas", "puxar_h"), I("ombros"), I("biceps"), I("biceps")] },
      { key: "Legs", title: "Legs — pernas e core", focus: ["quadriceps", "posteriores", "gluteos"], slots: [C("quadriceps", "agachar", true), C("posteriores", "quadril"), C("quadriceps", "agachar"), I("posteriores"), I("panturrilhas"), C("abdomen", "core")] },
    ],
  },
  {
    id: "ppl6",
    name: "Push / Pull / Legs 2x",
    short: "PPL 6x",
    days: 6,
    fits: [6],
    description: "PPL duas vezes por semana, com dias de força e de volume.",
    bestFor: "Avançados com 6 dias disponíveis.",
    week: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B", "–"],
    templates: [
      { key: "Push A", title: "Push A — força", focus: ["peito", "ombros", "triceps"], slots: [C("peito", "empurrar_h", true), C("ombros", "empurrar_v"), C("peito", "empurrar_h"), I("ombros"), I("triceps")] },
      { key: "Pull A", title: "Pull A — força", focus: ["costas", "biceps"], slots: [C("costas", "puxar_h", true), C("costas", "puxar_v"), C("costas", "puxar_h"), I("ombros"), I("biceps")] },
      { key: "Legs A", title: "Legs A — força", focus: ["quadriceps", "posteriores"], slots: [C("quadriceps", "agachar", true), C("posteriores", "quadril"), I("quadriceps"), I("posteriores"), I("panturrilhas")] },
      { key: "Push B", title: "Push B — volume", focus: ["ombros", "peito", "triceps"], slots: [C("ombros", "empurrar_v", true), C("peito", "empurrar_h"), I("peito"), I("ombros"), I("triceps"), I("triceps")] },
      { key: "Pull B", title: "Pull B — volume", focus: ["costas", "biceps"], slots: [C("costas", "puxar_v"), C("costas", "puxar_h"), I("costas"), I("ombros"), I("biceps"), I("biceps")] },
      { key: "Legs B", title: "Legs B — volume", focus: ["gluteos", "posteriores", "quadriceps"], slots: [C("posteriores", "quadril", true), C("quadriceps", "agachar"), C("gluteos", "quadril"), I("quadriceps"), I("panturrilhas"), C("abdomen", "core")] },
    ],
  },
  {
    id: "forca_5x5",
    name: "Força 5×5",
    short: "5×5",
    days: 2,
    fits: [3],
    description: "Treinos A e B alternados com os levantamentos básicos e cargas progressivas.",
    bestFor: "Quem quer ficar forte de verdade no agachamento, supino e terra.",
    week: ["A", "–", "B", "–", "A", "–", "–"],
    templates: [
      { key: "A", title: "A — agachamento, supino, remada", focus: ["quadriceps", "peito", "costas"], slots: [C("quadriceps", "agachar", true), C("peito", "empurrar_h", true), C("costas", "puxar_h", true), C("abdomen", "core")] },
      { key: "B", title: "B — agachamento, desenvolvimento, terra", focus: ["quadriceps", "ombros", "posteriores"], slots: [C("quadriceps", "agachar", true), C("ombros", "empurrar_v", true), C("posteriores", "quadril", true), C("abdomen", "core")] },
    ],
  },
];

/** Divisão montada à mão pelo personal/aluno: quantos dias quiser, sem modelo. Não é gerada pelo motor nem pela IA. */
export const FREE_SYSTEM: TrainingSystem = {
  id: "livre",
  name: "Divisão livre",
  short: "Livre",
  days: 0,
  fits: [],
  description: "Você define os dias e os exercícios do seu jeito.",
  bestFor: "Personais com método próprio.",
  week: [],
  templates: [],
};

const BY_ID = new Map([...SYSTEMS, FREE_SYSTEM].map((s) => [s.id, s]));

/** Letras/chaves padrão para dias de uma divisão livre. */
export const DAY_KEYS = ["A", "B", "C", "D", "E", "F", "G"];

export function getSystem(id: SystemId): TrainingSystem {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Sistema desconhecido: ${id}`);
  return s;
}

/** Sistema sugerido para uma frequência semanal e nível. */
export function suggestSystem(daysPerWeek: number, level: string): SystemId {
  if (daysPerWeek <= 2) return level === "iniciante" ? "fullbody" : "ab";
  if (daysPerWeek === 3) return level === "iniciante" ? "fullbody" : "abc";
  if (daysPerWeek === 4) return level === "avancado" ? "abcd" : "upper_lower";
  if (daysPerWeek === 5) return level === "iniciante" ? "upper_lower" : "abcde";
  return level === "iniciante" ? "abc" : "ppl6";
}
