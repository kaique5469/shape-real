import type { Exercise, MuscleGroup } from "./types";

/**
 * Biblioteca de exercícios com os nomes usados nas academias brasileiras.
 * IDs são estáveis: o histórico de cargas e a IA dependem deles.
 */
export const EXERCISES: Exercise[] = [
  // Peito
  { id: "supino_reto_barra", name: "Supino reto com barra", group: "peito", secondary: ["triceps", "ombros"], implement: "barra", pattern: "empurrar_h", compound: true, main: true, cue: "Escápulas presas no banco, barra desce até o meio do peito." },
  { id: "supino_reto_halter", name: "Supino reto com halteres", group: "peito", secondary: ["triceps", "ombros"], implement: "halter", pattern: "empurrar_h", compound: true, home: true, cue: "Cotovelos a ~45° do tronco, desça até alongar o peitoral." },
  { id: "supino_inclinado_barra", name: "Supino inclinado com barra", group: "peito", secondary: ["ombros", "triceps"], implement: "barra", pattern: "empurrar_h", compound: true, cue: "Banco a 30°, barra toca a parte alta do peito." },
  { id: "supino_inclinado_halter", name: "Supino inclinado com halteres", group: "peito", secondary: ["ombros", "triceps"], implement: "halter", pattern: "empurrar_h", compound: true, home: true },
  { id: "supino_declinado_barra", name: "Supino declinado com barra", group: "peito", secondary: ["triceps"], implement: "barra", pattern: "empurrar_h", compound: true },
  { id: "supino_maquina", name: "Supino na máquina", group: "peito", secondary: ["triceps"], implement: "maquina", pattern: "empurrar_h", compound: true },
  { id: "crucifixo_halter", name: "Crucifixo com halteres", group: "peito", implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Cotovelos levemente flexionados e fixos durante todo o arco." },
  { id: "crucifixo_maquina", name: "Crucifixo na máquina (peck deck)", group: "peito", implement: "maquina", pattern: "isolado", compound: false },
  { id: "crossover", name: "Crossover na polia", group: "peito", implement: "cabo", pattern: "isolado", compound: false },
  { id: "flexao", name: "Flexão de braço", group: "peito", secondary: ["triceps", "ombros", "abdomen"], implement: "peso_corporal", pattern: "empurrar_h", compound: true, home: true, cue: "Corpo em prancha, peito desce até quase tocar o chão." },
  { id: "paralelas_peito", name: "Paralelas (foco peito)", group: "peito", secondary: ["triceps"], implement: "peso_corporal", pattern: "empurrar_v", compound: true },

  // Costas
  { id: "puxada_frente", name: "Puxada frontal na polia", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_v", compound: true, cue: "Puxe com os cotovelos em direção ao quadril, peito aberto." },
  { id: "puxada_triangulo", name: "Puxada com triângulo", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_v", compound: true },
  { id: "barra_fixa", name: "Barra fixa", group: "costas", secondary: ["biceps"], implement: "peso_corporal", pattern: "puxar_v", compound: true, cue: "Saia do ponto morto, queixo passa a barra sem balanço." },
  { id: "barra_fixa_assistida", name: "Barra fixa assistida (gravitron)", group: "costas", secondary: ["biceps"], implement: "maquina", pattern: "puxar_v", compound: true },
  { id: "remada_curvada_barra", name: "Remada curvada com barra", group: "costas", secondary: ["biceps", "posteriores"], implement: "barra", pattern: "puxar_h", compound: true, main: true, cue: "Tronco a ~45°, lombar neutra, barra vai ao umbigo." },
  { id: "remada_unilateral_halter", name: "Remada unilateral com halter (serrote)", group: "costas", secondary: ["biceps"], implement: "halter", pattern: "puxar_h", compound: true, home: true },
  { id: "remada_baixa", name: "Remada baixa sentada", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_h", compound: true },
  { id: "remada_cavalinho", name: "Remada cavalinho (T-bar)", group: "costas", secondary: ["biceps"], implement: "barra", pattern: "puxar_h", compound: true },
  { id: "remada_maquina", name: "Remada na máquina articulada", group: "costas", secondary: ["biceps"], implement: "maquina", pattern: "puxar_h", compound: true },
  { id: "pulldown_braco_reto", name: "Pulldown com braço estendido", group: "costas", implement: "cabo", pattern: "isolado", compound: false },
  { id: "remada_elastico", name: "Remada com elástico", group: "costas", secondary: ["biceps"], implement: "elastico", pattern: "puxar_h", compound: true, home: true },
  { id: "levantamento_terra", name: "Levantamento terra", group: "posteriores", secondary: ["costas", "gluteos", "quadriceps"], implement: "barra", pattern: "quadril", compound: true, main: true, cue: "Barra colada na canela, empurre o chão e trave o quadril no topo." },

  // Ombros
  { id: "desenvolvimento_barra", name: "Desenvolvimento militar com barra", group: "ombros", secondary: ["triceps"], implement: "barra", pattern: "empurrar_v", compound: true, main: true, cue: "Glúteos e abdômen contraídos, barra sobe em linha reta." },
  { id: "desenvolvimento_halter", name: "Desenvolvimento com halteres", group: "ombros", secondary: ["triceps"], implement: "halter", pattern: "empurrar_v", compound: true, home: true },
  { id: "desenvolvimento_maquina", name: "Desenvolvimento na máquina", group: "ombros", secondary: ["triceps"], implement: "maquina", pattern: "empurrar_v", compound: true },
  { id: "elevacao_lateral", name: "Elevação lateral com halteres", group: "ombros", implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Suba até a linha do ombro, cotovelo guia o movimento." },
  { id: "elevacao_lateral_cabo", name: "Elevação lateral na polia", group: "ombros", implement: "cabo", pattern: "isolado", compound: false },
  { id: "elevacao_frontal", name: "Elevação frontal", group: "ombros", implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "crucifixo_inverso", name: "Crucifixo inverso", group: "ombros", secondary: ["costas"], implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "face_pull", name: "Face pull", group: "ombros", secondary: ["costas"], implement: "cabo", pattern: "puxar_h", compound: false },
  { id: "remada_alta", name: "Remada alta", group: "ombros", implement: "barra", pattern: "puxar_v", compound: true },
  { id: "encolhimento", name: "Encolhimento com halteres", group: "costas", implement: "halter", pattern: "isolado", compound: false, home: true },

  // Bíceps
  { id: "rosca_direta_barra", name: "Rosca direta com barra", group: "biceps", implement: "barra", pattern: "isolado", compound: false, cue: "Cotovelos colados ao tronco, sem balanço." },
  { id: "rosca_alternada", name: "Rosca alternada com halteres", group: "biceps", implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "rosca_martelo", name: "Rosca martelo", group: "biceps", secondary: ["antebraco"], implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "rosca_scott", name: "Rosca Scott", group: "biceps", implement: "barra", pattern: "isolado", compound: false },
  { id: "rosca_cabo", name: "Rosca na polia baixa", group: "biceps", implement: "cabo", pattern: "isolado", compound: false },
  { id: "rosca_concentrada", name: "Rosca concentrada", group: "biceps", implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "rosca_elastico", name: "Rosca com elástico", group: "biceps", implement: "elastico", pattern: "isolado", compound: false, home: true },

  // Tríceps
  { id: "triceps_corda", name: "Tríceps na polia com corda", group: "triceps", implement: "cabo", pattern: "isolado", compound: false, cue: "Abra a corda no final e trave os cotovelos ao lado do corpo." },
  { id: "triceps_barra_polia", name: "Tríceps pulley com barra", group: "triceps", implement: "cabo", pattern: "isolado", compound: false },
  { id: "triceps_testa", name: "Tríceps testa", group: "triceps", implement: "barra", pattern: "isolado", compound: false },
  { id: "triceps_frances", name: "Tríceps francês com halter", group: "triceps", implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "mergulho_banco", name: "Mergulho no banco", group: "triceps", secondary: ["peito"], implement: "peso_corporal", pattern: "empurrar_v", compound: true, home: true },
  { id: "supino_fechado", name: "Supino fechado", group: "triceps", secondary: ["peito"], implement: "barra", pattern: "empurrar_h", compound: true },
  { id: "flexao_diamante", name: "Flexão diamante", group: "triceps", secondary: ["peito"], implement: "peso_corporal", pattern: "empurrar_h", compound: true, home: true },
  { id: "triceps_coice", name: "Tríceps coice com halter", group: "triceps", implement: "halter", pattern: "isolado", compound: false, home: true },

  // Quadríceps
  { id: "agachamento_livre", name: "Agachamento livre", group: "quadriceps", secondary: ["gluteos", "posteriores"], implement: "barra", pattern: "agachar", compound: true, main: true, cue: "Pés na largura dos ombros, joelhos acompanham a ponta dos pés." },
  { id: "agachamento_smith", name: "Agachamento no Smith", group: "quadriceps", secondary: ["gluteos"], implement: "smith", pattern: "agachar", compound: true },
  { id: "agachamento_frontal", name: "Agachamento frontal", group: "quadriceps", secondary: ["gluteos", "abdomen"], implement: "barra", pattern: "agachar", compound: true },
  { id: "agachamento_goblet", name: "Agachamento goblet", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true },
  { id: "agachamento_bulgaro", name: "Agachamento búlgaro", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, cue: "Pé de trás apoiado no banco, tronco levemente inclinado." },
  { id: "agachamento_livre_corporal", name: "Agachamento com peso corporal", group: "quadriceps", secondary: ["gluteos"], implement: "peso_corporal", pattern: "agachar", compound: true, home: true },
  { id: "leg_press", name: "Leg press 45°", group: "quadriceps", secondary: ["gluteos"], implement: "maquina", pattern: "agachar", compound: true, cue: "Não descole a lombar do encosto na descida." },
  { id: "hack", name: "Agachamento hack", group: "quadriceps", secondary: ["gluteos"], implement: "maquina", pattern: "agachar", compound: true },
  { id: "cadeira_extensora", name: "Cadeira extensora", group: "quadriceps", implement: "maquina", pattern: "isolado", compound: false },
  { id: "afundo", name: "Afundo com halteres", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true },
  { id: "passada", name: "Passada (avanço caminhando)", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true },

  // Posteriores e glúteos
  { id: "stiff", name: "Stiff com barra", group: "posteriores", secondary: ["gluteos"], implement: "barra", pattern: "quadril", compound: true, cue: "Quadril vai para trás, barra desliza rente às coxas." },
  { id: "terra_romeno_halter", name: "Terra romeno com halteres", group: "posteriores", secondary: ["gluteos"], implement: "halter", pattern: "quadril", compound: true, home: true },
  { id: "mesa_flexora", name: "Mesa flexora", group: "posteriores", implement: "maquina", pattern: "isolado", compound: false },
  { id: "cadeira_flexora", name: "Cadeira flexora", group: "posteriores", implement: "maquina", pattern: "isolado", compound: false },
  { id: "flexora_em_pe", name: "Flexora em pé unilateral", group: "posteriores", implement: "maquina", pattern: "isolado", compound: false },
  { id: "elevacao_pelvica", name: "Elevação pélvica com barra", group: "gluteos", secondary: ["posteriores"], implement: "barra", pattern: "quadril", compound: true, cue: "Queixo no peito, trave o glúteo 1 s no topo." },
  { id: "ponte_gluteo", name: "Ponte de glúteo", group: "gluteos", secondary: ["posteriores"], implement: "peso_corporal", pattern: "quadril", compound: true, home: true },
  { id: "cadeira_abdutora", name: "Cadeira abdutora", group: "gluteos", implement: "maquina", pattern: "isolado", compound: false },
  { id: "gluteo_cabo", name: "Glúteo na polia (coice)", group: "gluteos", implement: "cabo", pattern: "isolado", compound: false },
  { id: "abducao_elastico", name: "Abdução com elástico", group: "gluteos", implement: "elastico", pattern: "isolado", compound: false, home: true },
  { id: "good_morning", name: "Bom dia (good morning)", group: "posteriores", secondary: ["gluteos"], implement: "barra", pattern: "quadril", compound: true },
  { id: "kettlebell_swing", name: "Kettlebell swing", group: "gluteos", secondary: ["posteriores"], implement: "kettlebell", pattern: "quadril", compound: true, home: true },

  // Panturrilhas
  { id: "panturrilha_em_pe", name: "Panturrilha em pé", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false, cue: "Amplitude total: alongue embaixo, segure 1 s no topo." },
  { id: "panturrilha_sentado", name: "Panturrilha sentado", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false },
  { id: "panturrilha_leg_press", name: "Panturrilha no leg press", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false },
  { id: "panturrilha_unilateral", name: "Panturrilha unilateral no degrau", group: "panturrilhas", implement: "peso_corporal", pattern: "isolado", compound: false, home: true },

  // Abdômen e core
  { id: "prancha", name: "Prancha", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Contraia glúteo e abdômen; reps = segundos." },
  { id: "abdominal_supra", name: "Abdominal supra", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true },
  { id: "abdominal_infra", name: "Abdominal infra (elevação de pernas)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true },
  { id: "abdominal_polia", name: "Abdominal na polia (crunch)", group: "abdomen", implement: "cabo", pattern: "core", compound: false },
  { id: "elevacao_pernas_barra", name: "Elevação de pernas na barra", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false },
  { id: "abdominal_roda", name: "Abdominal com roda", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true },
  { id: "pallof", name: "Pallof press", group: "abdomen", implement: "cabo", pattern: "core", compound: false },
  { id: "prancha_lateral", name: "Prancha lateral", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true },

  // Antebraço
  { id: "rosca_punho", name: "Rosca de punho", group: "antebraco", implement: "barra", pattern: "isolado", compound: false },
  { id: "farmer_walk", name: "Caminhada do fazendeiro", group: "antebraco", secondary: ["abdomen", "costas"], implement: "halter", pattern: "core", compound: true, home: true },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  quadriceps: "Quadríceps",
  posteriores: "Posteriores",
  gluteos: "Glúteos",
  panturrilhas: "Panturrilhas",
  abdomen: "Abdômen",
  antebraco: "Antebraço",
};

/** Busca tolerante a acentos e caixa. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function searchExercises(query: string, group?: MuscleGroup | null): Exercise[] {
  const q = normalize(query);
  return EXERCISES.filter((e) => (!group || e.group === group) && (!q || normalize(e.name).includes(q)));
}
