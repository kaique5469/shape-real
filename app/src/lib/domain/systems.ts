import type { Equipment, Goal, MuscleGroup, Pattern, SystemId } from "./types";

/** Um "encaixe" de exercício dentro de um dia de treino. */
export interface Slot {
  group: MuscleGroup;
  pattern?: Pattern;
  compound?: boolean;
  main?: boolean;
  /** Encaixe acrescentado pela prioridade do aluno: é o último a ser cortado por tempo. */
  emphasis?: boolean;
  /** Exercícios que um personal usaria neste encaixe (ids). O motor sorteia entre os disponíveis; sem nenhum, cai no grupo/padrão. */
  prefer?: string[];
  /** Só entra quando sobra tempo na sessão. */
  optional?: boolean;
}

export interface DayTemplate {
  key: string;
  title: string;
  focus: MuscleGroup[];
  slots: Slot[];
  /** Dia pesado ou de volume nas divisões que repetem o grupo na semana (muda séries, repetições e descanso). */
  style?: "forca" | "volume";
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
/** Encaixe com lista de preferidos. */
const W = (slot: Slot, prefer: string[]): Slot => ({ ...slot, prefer });
/** Encaixe opcional (entra quando sobra tempo). */
const O = (slot: Slot): Slot => ({ ...slot, optional: true });

// Listas de preferidos: o que se vê nas fichas de academia, do mais comum para o menos comum.
const PRESS = ["supino_reto_halter", "supino_maquina", "supino_reto_barra"];
const INCL = ["supino_inclinado_halter", "supino_inclinado_barra", "supino_inclinado_maquina", "supino_inclinado_smith"];
const PRESS3 = ["supino_maquina", "supino_reto_halter"];
const FLY = ["crucifixo_maquina", "crossover", "crucifixo_halter"];
const FLY2 = ["crossover", "crossover_polia_baixa", "crucifixo_inclinado_halter"];
const PUX = ["puxada_frente", "puxada_triangulo", "barra_fixa", "puxada_supinada"];
const PUX2 = ["puxada_triangulo", "puxada_supinada", "puxada_frente"];
const REM = ["remada_baixa", "remada_unilateral_halter", "remada_maquina", "remada_cavalinho", "remada_sentada_maquina"];
const DESENV = ["desenvolvimento_halter", "desenvolvimento_maquina", "desenvolvimento_smith", "desenvolvimento_arnold"];
const LAT = ["elevacao_lateral", "elevacao_lateral_cabo", "elevacao_lateral_maquina"];
const POST = ["crucifixo_inverso_maquina", "crucifixo_inverso", "face_pull", "crucifixo_inverso_cabo"];
const BI1 = ["rosca_direta_barra", "rosca_alternada", "rosca_scott", "rosca_direta_barra_w", "rosca_direta_halter"];
const BI2 = ["rosca_martelo", "rosca_cabo", "rosca_concentrada", "rosca_inclinada", "rosca_martelo_corda", "rosca_scott_maquina"];
const TRI1 = ["triceps_corda", "triceps_barra_polia"];
const TRI2 = ["triceps_testa", "triceps_frances", "triceps_frances_cabo", "triceps_testa_halter"];
const Q2 = ["leg_press", "hack", "leg_press_horizontal"];
const Q3 = ["agachamento_bulgaro", "afundo", "passada", "agachamento_smith", "afundo_smith", "recuo_halter"];
const HINGE = ["stiff", "terra_romeno_halter", "stiff_smith"];
const HAM = ["mesa_flexora", "cadeira_flexora", "flexora_em_pe"];
const GLU = ["elevacao_pelvica", "elevacao_pelvica_maquina", "elevacao_pelvica_smith"];
const GLU_ISO = ["cadeira_abdutora", "gluteo_cabo", "gluteo_maquina", "abducao_polia", "gluteo_4_apoios_caneleira"];
const PANT = ["panturrilha_em_pe", "panturrilha_sentado", "panturrilha_leg_press", "panturrilha_smith"];
const CORE = ["abdominal_supra", "prancha", "abdominal_infra", "abdominal_polia", "abdominal_maquina", "abdominal_obliquo", "prancha_lateral", "dead_bug"];

/** Encaixes com nome de ficha, para os modelos abaixo lerem como um personal escreve. */
const s = {
  // Principais (o motor escolhe o levantamento conforme nível e objetivo)
  supino: () => C("peito", "empurrar_h", true),
  remadaPrincipal: () => C("costas", "puxar_h", true),
  desenvPrincipal: () => C("ombros", "empurrar_v", true),
  agachamento: () => C("quadriceps", "agachar", true),
  quadrilPrincipal: () => C("posteriores", "quadril", true),
  // Peito
  supinoReto2: () => W(C("peito", "empurrar_h"), PRESS),
  inclinado: () => W(C("peito", "empurrar_h"), INCL),
  supino3: () => W(C("peito", "empurrar_h"), PRESS3),
  crucifixo: () => W(I("peito"), FLY),
  crossover: () => W(I("peito"), FLY2),
  // Costas
  puxada: () => W(C("costas", "puxar_v"), PUX),
  puxada2: () => W(C("costas", "puxar_v"), PUX2),
  remada: () => W(C("costas", "puxar_h"), REM),
  pulldown: () => W(I("costas"), ["pulldown_braco_reto"]),
  trapezio: () => W(I("costas"), ["encolhimento", "encolhimento_barra"]),
  // Ombros
  desenv: () => W(C("ombros", "empurrar_v"), DESENV),
  lateral: () => W(I("ombros"), LAT),
  posteriorOmbro: () => W(I("ombros"), POST),
  // Braços
  biceps1: () => W(I("biceps"), BI1),
  biceps2: () => W(I("biceps"), BI2),
  triceps1: () => W(I("triceps"), TRI1),
  triceps2: () => W(I("triceps"), TRI2),
  // Pernas
  legPress: () => W(C("quadriceps", "agachar"), Q2),
  unilateral: () => W(C("quadriceps", "agachar"), Q3),
  unilateralOuLeg: () => W(C("quadriceps", "agachar"), [...Q3, ...Q2]),
  extensora: () => W(I("quadriceps"), ["cadeira_extensora"]),
  stiff: () => W(C("posteriores", "quadril"), HINGE),
  flexora: () => W(I("posteriores"), HAM),
  elevacaoPelvica: () => W(C("gluteos", "quadril"), GLU),
  gluteoIsolado: () => W(I("gluteos"), GLU_ISO),
  adutora: () => W(I("adutores"), ["cadeira_adutora", "aducao_polia"]),
  panturrilha: () => W(I("panturrilhas"), PANT),
  // Core, lombar e antebraço
  core: () => W(I("abdomen", "core"), CORE),
  lombar: () => W(I("lombar"), ["hiperextensao_lombar", "perdigueiro", "superman"]),
  antebraco: () => W(I("antebraco"), ["rosca_punho", "rosca_inversa"]),
  // Terceiro exercício de braço (só para quem prioriza o grupo)
  biceps3: () => W(I("biceps"), ["rosca_concentrada", "rosca_inclinada", "rosca_scott_maquina", "rosca_martelo_corda", "rosca_cabo"]),
  triceps3: () => W(I("triceps"), ["triceps_maquina", "triceps_inverso", "triceps_coice", "triceps_barra_polia"]),
};

/**
 * Prioridade do aluno: o que o motor acrescenta ao dia para cada grupo — um multiarticular direto
 * (quando o grupo tem), um isolado e, se o dia já tinha os dois, um exercício extra.
 */
export const EMPHASIS_SLOTS: Partial<Record<MuscleGroup, { compound?: () => Slot; isolation: () => Slot; extra: () => Slot }>> = {
  peito: { compound: s.inclinado, isolation: s.crucifixo, extra: s.crossover },
  costas: { compound: s.remada, isolation: s.pulldown, extra: s.puxada2 },
  ombros: { compound: s.desenv, isolation: s.lateral, extra: s.posteriorOmbro },
  biceps: { isolation: s.biceps1, extra: s.biceps3 },
  triceps: { isolation: s.triceps1, extra: s.triceps3 },
  quadriceps: { compound: s.legPress, isolation: s.extensora, extra: s.unilateral },
  posteriores: { compound: s.stiff, isolation: s.flexora, extra: s.flexora },
  gluteos: { compound: s.elevacaoPelvica, isolation: s.gluteoIsolado, extra: s.gluteoIsolado },
  adutores: { isolation: s.adutora, extra: s.adutora },
  panturrilhas: { isolation: s.panturrilha, extra: s.panturrilha },
  abdomen: { isolation: s.core, extra: s.core },
  lombar: { isolation: s.lombar, extra: s.lombar },
  antebraco: { isolation: s.antebraco, extra: s.antebraco },
};

const INFERIORES_A: DayTemplate = {
  key: "A",
  title: "Inferiores — quadríceps e glúteos",
  focus: ["quadriceps", "gluteos"],
  slots: [s.agachamento(), s.elevacaoPelvica(), s.legPress(), s.extensora(), s.gluteoIsolado(), s.adutora(), s.panturrilha()],
};

const INFERIORES_C: DayTemplate = {
  key: "C",
  title: "Inferiores — posteriores e glúteos",
  focus: ["posteriores", "gluteos"],
  slots: [s.quadrilPrincipal(), s.elevacaoPelvica(), s.flexora(), s.unilateral(), s.gluteoIsolado(), s.flexora(), s.panturrilha()],
};

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
      {
        key: "A",
        title: "Corpo inteiro — agachar e empurrar",
        focus: ["quadriceps", "peito", "costas", "gluteos"],
        slots: [s.agachamento(), s.supinoReto2(), s.puxada(), s.flexora(), s.gluteoIsolado(), O(s.lateral()), s.core()],
      },
      {
        key: "B",
        title: "Corpo inteiro — posteriores, glúteos e puxar",
        focus: ["posteriores", "gluteos", "costas", "ombros"],
        slots: [s.quadrilPrincipal(), s.remada(), s.elevacaoPelvica(), s.desenv(), s.extensora(), s.biceps1(), s.triceps1()],
      },
      {
        key: "C",
        title: "Corpo inteiro — empurrar e pernas",
        focus: ["peito", "quadriceps", "costas", "gluteos"],
        slots: [s.supino(), s.legPress(), s.puxada2(), s.stiff(), s.gluteoIsolado(), s.lateral(), s.core()],
      },
    ],
  },
  {
    id: "ab",
    name: "AB (inferiores / superiores)",
    short: "AB",
    days: 2,
    fits: [2, 4],
    description: "Dois treinos que se alternam: A inferiores, B superiores.",
    bestFor: "Rotina corrida, 2 ou 4 dias por semana.",
    week: ["A", "–", "B", "–", "A", "–", "–"],
    templates: [
      {
        key: "A",
        title: "Inferiores e core",
        focus: ["quadriceps", "posteriores", "gluteos"],
        slots: [s.agachamento(), s.legPress(), s.stiff(), s.elevacaoPelvica(), O(s.extensora()), s.flexora(), O(s.gluteoIsolado()), s.panturrilha(), s.core()],
      },
      {
        key: "B",
        title: "Superiores",
        focus: ["peito", "costas", "ombros"],
        slots: [s.supino(), s.puxada(), s.desenv(), s.remada(), O(s.crucifixo()), s.lateral(), s.biceps1(), s.triceps1()],
      },
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
      {
        key: "A",
        title: "Peito, ombros e tríceps",
        focus: ["peito", "ombros", "triceps"],
        slots: [s.supino(), s.inclinado(), O(s.supino3()), s.crucifixo(), s.desenv(), s.lateral(), s.triceps1(), s.triceps2()],
      },
      {
        key: "B",
        title: "Costas, bíceps e abdômen",
        focus: ["costas", "biceps", "abdomen"],
        slots: [s.puxada(), s.remadaPrincipal(), s.remada(), O(s.pulldown()), s.posteriorOmbro(), s.biceps1(), s.biceps2(), s.core()],
      },
      {
        key: "C",
        title: "Pernas e glúteos",
        focus: ["quadriceps", "posteriores", "gluteos"],
        slots: [s.agachamento(), s.legPress(), s.stiff(), s.elevacaoPelvica(), s.extensora(), s.flexora(), O(s.gluteoIsolado()), s.panturrilha(), O(s.core())],
      },
    ],
  },
  {
    id: "abcd",
    name: "ABCD",
    short: "ABCD",
    days: 4,
    fits: [4],
    description: "Quatro divisões: peito, costas, pernas e ombros.",
    bestFor: "Intermediários com 4 dias por semana.",
    week: ["A", "B", "–", "C", "D", "–", "–"],
    templates: [
      {
        key: "A",
        title: "Peito e tríceps",
        focus: ["peito", "triceps"],
        slots: [s.supino(), s.inclinado(), s.supino3(), s.crucifixo(), O(s.crossover()), s.triceps1(), s.triceps2()],
      },
      {
        key: "B",
        title: "Costas e bíceps",
        focus: ["costas", "biceps"],
        slots: [s.puxada(), s.remadaPrincipal(), s.remada(), O(s.pulldown()), s.posteriorOmbro(), s.biceps1(), s.biceps2()],
      },
      {
        key: "C",
        title: "Pernas e glúteos",
        focus: ["quadriceps", "posteriores", "gluteos"],
        slots: [s.agachamento(), s.legPress(), s.stiff(), s.elevacaoPelvica(), s.extensora(), s.flexora(), O(s.gluteoIsolado()), s.panturrilha()],
      },
      {
        key: "D",
        title: "Ombros e abdômen",
        focus: ["ombros", "abdomen"],
        slots: [s.desenvPrincipal(), s.lateral(), s.posteriorOmbro(), s.lateral(), s.trapezio(), s.core(), s.core()],
      },
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
      {
        key: "A",
        title: "Peito",
        focus: ["peito"],
        slots: [s.supino(), s.inclinado(), s.supino3(), W(I("peito"), ["crucifixo_maquina", "crucifixo_halter"]), s.crossover()],
      },
      {
        key: "B",
        title: "Costas",
        focus: ["costas"],
        slots: [s.puxada(), s.remadaPrincipal(), s.remada(), s.puxada2(), s.pulldown(), O(s.posteriorOmbro())],
      },
      {
        key: "C",
        title: "Pernas e glúteos",
        focus: ["quadriceps", "posteriores", "gluteos"],
        slots: [s.agachamento(), s.legPress(), O(s.unilateral()), s.stiff(), s.elevacaoPelvica(), s.extensora(), s.flexora(), s.panturrilha()],
      },
      {
        key: "D",
        title: "Ombros",
        focus: ["ombros"],
        slots: [s.desenvPrincipal(), s.lateral(), s.posteriorOmbro(), s.lateral(), s.trapezio(), O(s.core())],
      },
      {
        key: "E",
        title: "Braços e abdômen",
        focus: ["biceps", "triceps", "abdomen"],
        slots: [
          W(C("triceps", "empurrar_h"), ["supino_fechado"]),
          W(I("biceps"), ["rosca_direta_barra", "rosca_scott", "rosca_direta_barra_w"]),
          s.triceps1(),
          W(I("biceps"), ["rosca_alternada", "rosca_cabo", "rosca_inclinada"]),
          s.triceps2(),
          W(I("biceps"), ["rosca_martelo", "rosca_martelo_corda"]),
          O(s.antebraco()),
          s.core(),
        ],
      },
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
      {
        key: "U1",
        title: "Superiores A",
        style: "forca",
        focus: ["peito", "costas", "ombros"],
        slots: [s.supino(), s.remadaPrincipal(), s.desenv(), s.puxada(), O(s.lateral()), s.biceps1(), s.triceps1()],
      },
      {
        key: "L1",
        title: "Inferiores A — quadríceps",
        style: "forca",
        focus: ["quadriceps", "posteriores", "gluteos"],
        slots: [s.agachamento(), s.stiff(), s.legPress(), s.flexora(), s.gluteoIsolado(), s.panturrilha(), s.core()],
      },
      {
        key: "U2",
        title: "Superiores B",
        style: "volume",
        focus: ["peito", "costas", "ombros"],
        slots: [s.inclinado(), s.puxada(), s.crucifixo(), s.remada(), s.lateral(), O(s.posteriorOmbro()), s.biceps2(), s.triceps2()],
      },
      {
        key: "L2",
        title: "Inferiores B — glúteos e posteriores",
        style: "volume",
        focus: ["gluteos", "posteriores", "quadriceps"],
        slots: [s.elevacaoPelvica(), s.quadrilPrincipal(), s.unilateralOuLeg(), O(s.extensora()), s.flexora(), s.gluteoIsolado(), s.panturrilha()],
      },
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
      {
        key: "Push",
        title: "Push — peito, ombros e tríceps",
        focus: ["peito", "ombros", "triceps"],
        slots: [s.supino(), s.inclinado(), s.desenv(), s.crucifixo(), s.lateral(), s.triceps1(), s.triceps2()],
      },
      {
        key: "Pull",
        title: "Pull — costas, bíceps e abdômen",
        focus: ["costas", "biceps", "abdomen"],
        slots: [s.puxada(), s.remadaPrincipal(), s.remada(), O(s.pulldown()), s.posteriorOmbro(), s.biceps1(), s.biceps2(), s.core()],
      },
      {
        key: "Legs",
        title: "Legs — pernas e glúteos",
        focus: ["quadriceps", "posteriores", "gluteos"],
        slots: [s.agachamento(), s.legPress(), s.stiff(), s.elevacaoPelvica(), s.extensora(), s.flexora(), s.panturrilha(), O(s.core())],
      },
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
      {
        key: "Push A",
        title: "Push A — peito e ombros",
        style: "forca",
        focus: ["peito", "ombros", "triceps"],
        slots: [s.supino(), s.desenv(), s.inclinado(), s.lateral(), s.triceps1(), O(s.triceps2())],
      },
      {
        key: "Pull A",
        title: "Pull A — costas e bíceps",
        style: "forca",
        focus: ["costas", "biceps"],
        slots: [s.remadaPrincipal(), s.puxada(), s.remada(), s.posteriorOmbro(), s.biceps1(), O(s.biceps2())],
      },
      {
        key: "Legs A",
        title: "Legs A — quadríceps",
        style: "forca",
        focus: ["quadriceps", "posteriores"],
        slots: [s.agachamento(), s.legPress(), s.stiff(), s.extensora(), s.flexora(), s.panturrilha(), O(s.core())],
      },
      {
        key: "Push B",
        title: "Push B — ombros e peito",
        style: "volume",
        focus: ["ombros", "peito", "triceps"],
        slots: [s.desenvPrincipal(), W(C("peito", "empurrar_h"), [...INCL, ...PRESS3]), s.crucifixo(), s.lateral(), s.triceps2(), s.triceps1()],
      },
      {
        key: "Pull B",
        title: "Pull B — costas e bíceps",
        style: "volume",
        focus: ["costas", "biceps"],
        slots: [s.puxada(), s.remada(), s.pulldown(), s.posteriorOmbro(), s.biceps1(), s.biceps2()],
      },
      {
        key: "Legs B",
        title: "Legs B — posteriores e glúteos",
        style: "volume",
        focus: ["posteriores", "gluteos", "quadriceps"],
        slots: [s.quadrilPrincipal(), s.elevacaoPelvica(), s.unilateralOuLeg(), s.flexora(), O(s.gluteoIsolado()), s.panturrilha(), s.core()],
      },
    ],
  },
  {
    id: "forca_5x5",
    name: "Força 5×5",
    short: "5×5",
    days: 2,
    fits: [3],
    description: "Treinos A e B alternados com os levantamentos básicos e cargas progressivas.",
    bestFor: "Iniciantes e intermediários que querem ficar fortes no agachamento, supino e terra.",
    week: ["A", "–", "B", "–", "A", "–", "–"],
    templates: [
      {
        key: "A",
        title: "A — agachamento, supino e remada",
        focus: ["quadriceps", "peito", "costas"],
        slots: [s.agachamento(), s.supino(), s.remadaPrincipal(), s.core()],
      },
      {
        key: "B",
        title: "B — agachamento, desenvolvimento e terra",
        focus: ["quadriceps", "ombros", "posteriores"],
        slots: [s.agachamento(), s.desenvPrincipal(), s.quadrilPrincipal(), s.puxada(), s.core()],
      },
    ],
  },
  // Divisões com inferiores 2x por semana (anexadas ao fim: a landing usa SYSTEMS[2]).
  {
    id: "abc_inferiores",
    name: "ABC — glúteos e pernas 2x",
    short: "ABC Glúteos",
    days: 3,
    fits: [3, 6],
    description: "Dois treinos de inferiores por semana, com um de superiores no meio.",
    bestFor: "Prioridade em glúteos e pernas treinando 3x.",
    week: ["A", "–", "B", "–", "C", "–", "–"],
    templates: [
      INFERIORES_A,
      {
        key: "B",
        title: "Superiores e abdômen",
        focus: ["costas", "peito", "ombros", "abdomen"],
        slots: [s.puxada(), s.supinoReto2(), s.remada(), s.desenv(), s.lateral(), s.triceps1(), s.biceps1(), s.core()],
      },
      INFERIORES_C,
    ],
  },
  {
    id: "abcd_inferiores",
    name: "ABCD — inferiores 2x",
    short: "ABCD Glúteos",
    days: 4,
    fits: [4],
    description: "Dois treinos de inferiores e dois de superiores, alternados.",
    bestFor: "Prioridade em glúteos e pernas treinando 4x.",
    week: ["A", "B", "–", "C", "D", "–", "–"],
    templates: [
      INFERIORES_A,
      {
        key: "B",
        title: "Superiores — costas, ombros e bíceps",
        focus: ["costas", "ombros", "biceps"],
        slots: [s.puxada(), s.remada(), s.desenv(), s.lateral(), O(s.posteriorOmbro()), s.biceps1(), s.core()],
      },
      INFERIORES_C,
      {
        key: "D",
        title: "Superiores — peito, ombros e tríceps",
        focus: ["peito", "ombros", "triceps"],
        slots: [s.supinoReto2(), s.inclinado(), O(s.crucifixo()), s.lateral(), s.triceps1(), s.triceps2(), s.core()],
      },
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

const BY_ID = new Map([...SYSTEMS, FREE_SYSTEM].map((sys) => [sys.id, sys]));

/** Letras/chaves padrão para dias de uma divisão livre. */
export const DAY_KEYS = ["A", "B", "C", "D", "E", "F", "G"];

export function getSystem(id: SystemId): TrainingSystem {
  const sys = BY_ID.get(id);
  if (!sys) throw new Error(`Sistema desconhecido: ${id}`);
  return sys;
}

export interface SuggestOptions {
  /** Grupos prioritários (ex.: glúteos pede inferiores 2x por semana). */
  emphasis?: MuscleGroup[];
  equipment?: Equipment;
  goal?: Goal;
}

const LOWER: MuscleGroup[] = ["gluteos", "posteriores", "quadriceps", "adutores", "panturrilhas"];
const UPPER: MuscleGroup[] = ["peito", "costas", "ombros", "biceps", "triceps"];

/** Sistema sugerido para a frequência semanal e o nível; `opts` refina a sugestão. */
export function suggestSystem(daysPerWeek: number, level: string, opts: SuggestOptions = {}): SystemId {
  const beginner = level === "iniciante";
  const emphasis = opts.emphasis ?? [];

  // Sem equipamento não dá para encher um dia só de costas ou só de ombros: divisões de corpo inteiro.
  if (opts.equipment === "peso_corporal") return daysPerWeek <= 3 ? "fullbody" : "upper_lower";

  // Prioridade só em inferiores: pernas e glúteos pelo menos 2x por semana.
  const lowerFocus = emphasis.some((g) => LOWER.includes(g)) && !emphasis.some((g) => UPPER.includes(g));
  if (lowerFocus) {
    if (daysPerWeek <= 2) return "fullbody";
    if (daysPerWeek === 3) return beginner ? "fullbody" : "abc_inferiores";
    if (daysPerWeek === 4) return beginner ? "upper_lower" : "abcd_inferiores";
    if (daysPerWeek === 5) return beginner ? "upper_lower" : "abcd_inferiores";
    return beginner ? "upper_lower" : "abc_inferiores";
  }

  // Força: os básicos com barra várias vezes por semana (o 5×5 precisa de academia).
  if (opts.goal === "forca") {
    const gym = (opts.equipment ?? "academia") === "academia";
    if (daysPerWeek <= 3) return gym ? "forca_5x5" : "fullbody";
    if (daysPerWeek >= 6 && level === "avancado") return "ppl6";
    return "upper_lower";
  }

  if (daysPerWeek <= 2) return beginner ? "fullbody" : "ab";
  if (daysPerWeek === 3) return beginner ? "fullbody" : "abc";
  if (daysPerWeek === 4) return level === "avancado" ? "abcd" : "upper_lower";
  if (daysPerWeek === 5) return beginner ? "upper_lower" : "abcde";
  return beginner ? "abc" : "ppl6";
}
