/**
 * Tipos de domínio do Shape Real. Puros (sem React, sem Supabase): o mesmo
 * modelo serve o modo local, o Supabase e as rotas de IA.
 */

export type Role = "athlete" | "coach";
export type Goal = "hipertrofia" | "forca" | "emagrecimento" | "condicionamento" | "saude";
export type Level = "iniciante" | "intermediario" | "avancado";
export type Equipment = "academia" | "home" | "peso_corporal";
export type Sex = "M" | "F";
export type ActivityLevel = "sedentario" | "leve" | "moderado" | "alto" | "atleta";
export type PlanId = "free" | "pro" | "coach";

export type Unit = "reps" | "seg" | "min";

/**
 * Quem registrou a autorização de dados de saúde (LGPD):
 *  - "personal": o personal marcou "O aluno autorizou registrar estes dados de saúde" no cadastro;
 *  - "aluno_link": o aluno tocou em "Salvar no meu celular" ao abrir a ficha enviada pelo personal;
 *  - "aluno": a própria pessoa marcou a autorização (Dieta ou Conta).
 */
export type ConsentSource = "personal" | "aluno_link" | "aluno";

export type SystemId =
  | "livre"
  | "fullbody"
  | "ab"
  | "abc"
  | "abcd"
  | "abcde"
  | "upper_lower"
  | "ppl"
  | "ppl6"
  | "forca_5x5"
  | "abc_inferiores"
  | "abcd_inferiores";

export type MuscleGroup =
  | "peito"
  | "costas"
  | "ombros"
  | "biceps"
  | "triceps"
  | "quadriceps"
  | "posteriores"
  | "gluteos"
  | "panturrilhas"
  | "abdomen"
  | "antebraco"
  | "adutores"
  | "lombar"
  | "cardio";

export type Technique =
  | "normal"
  | "drop_set"
  | "bi_set"
  | "tri_set"
  | "super_serie"
  | "rest_pause"
  | "piramide"
  | "piramide_dec"
  | "cluster"
  | "falha"
  | "parciais"
  | "negativa"
  | "isometria";

export type Implement =
  | "barra"
  | "halter"
  | "maquina"
  | "cabo"
  | "peso_corporal"
  | "kettlebell"
  | "elastico"
  | "smith"
  | "caneleira"
  | "acessorio";

export type Pattern =
  | "empurrar_h"
  | "empurrar_v"
  | "puxar_h"
  | "puxar_v"
  | "agachar"
  | "quadril"
  | "isolado"
  | "core"
  | "cardio"
  | "mobilidade";

export interface Exercise {
  id: string;
  name: string;
  group: MuscleGroup;
  secondary?: MuscleGroup[];
  implement: Implement;
  pattern: Pattern;
  compound: boolean;
  /** Pode ser feito em casa com halteres/elástico/peso corporal. */
  home?: boolean;
  /** Dica de execução curta, exibida na sessão. */
  cue?: string;
  /** Exercício "principal" de força (agachamento, supino, terra, desenvolvimento, remada). */
  main?: boolean;
  /** Como a série é contada: repetições (padrão), segundos (isometria) ou minutos (cardio). */
  unit?: Unit;
  /** Criado pelo usuário (não faz parte da biblioteca padrão). */
  custom?: boolean;
  /** Nível mínimo para o motor escolher este exercício sozinho (o personal pode prescrever sempre). */
  minLevel?: "intermediario" | "avancado";
  /** Prioridade de escolha pelo motor: 2 = básico de quase toda ficha, 1 = muito comum. */
  pri?: 1 | 2;
  /** Executado um lado por vez (as repetições são por lado). */
  unilateral?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  role: Role;
  email?: string;
  sex?: Sex;
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  activity?: ActivityLevel;
  goal?: Goal;
  level?: Level;
  daysPerWeek?: number;
  sessionMinutes?: number;
  equipment?: Equipment;
  preferredSystem?: SystemId;
  limitations?: string;
  /** WhatsApp do aluno (só dígitos, com DDD) — usado pelo personal para enviar ficha e dieta. */
  phone?: string;
  /** Aluno cadastrado pelo próprio personal (sem conta): id do personal responsável. */
  managedBy?: string;
  /** Anotações do personal sobre o aluno (anamnese, rotina, observações). */
  coachNotes?: string;
  /** Perfil de exemplo criado pelo modo teste (pode ser removido pelo personal). */
  sample?: boolean;
  /**
   * Aluno que recebeu a ficha por link, no próprio celular: quem é o personal e qual é o id deste
   * aluno no aparelho dele (os treinos voltam para esse cadastro).
   */
  remoteCoach?: { id: string; name: string; phone?: string; cref?: string; studentRef: string };
  /** CREF do personal, como ele informou (ex.: "012345-G/SP"). Opcional e não conferido pelo app. */
  cref?: string;
  /** Plano que vale agora (inclui o período de teste e o personal pagante). */
  plan: PlanId;
  /** Plano contratado de fato; só existe em contas na nuvem. */
  paidPlan?: PlanId;
  /** Fim do período de teste com tudo liberado (contas na nuvem). */
  trialUntil?: string;
  onboarded: boolean;
  createdAt: string;
  /**
   * LGPD: dados de saúde são sensíveis — consentimento explícito e datado. Só é gravado por uma ação de
   * alguém (checkbox ou o toque em "Salvar no meu celular"), nunca sozinho.
   */
  consentHealthAt?: string;
  /** Quem registrou `consentHealthAt`. Perfis antigos podem ter a data sem a origem. */
  consentSource?: ConsentSource;
}

export interface PlannedExercise {
  uid: string;
  exerciseId: string;
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  loadKg?: number | null;
  technique: Technique;
  notes?: string;
  /** Unidade da série (padrão: a do exercício, ou "reps"). */
  unit?: Unit;
}

export interface WorkoutDay {
  key: string;
  title: string;
  focus: MuscleGroup[];
  exercises: PlannedExercise[];
}

export type ProgramSource = "ia" | "manual" | "modelo" | "personal";

export interface Program {
  id: string;
  ownerId: string;
  createdBy: string;
  name: string;
  system: SystemId;
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  notes?: string;
  /** Validade planejada da ficha, em semanas (o personal é avisado quando vence). */
  durationWeeks?: number;
  days: WorkoutDay[];
  active: boolean;
  source: ProgramSource;
  createdAt: string;
  updatedAt: string;
}

export interface SetLog {
  reps: number | null;
  loadKg: number | null;
  rpe?: number | null;
  done: boolean;
}

export interface ExerciseLog {
  uid: string;
  exerciseId: string;
  name: string;
  /** Cópia do que a ficha pedia quando o treino começou (inclui técnica e observação do personal). */
  planned?: { sets: number; repsMin: number; repsMax: number; loadKg?: number | null; restSec?: number; technique?: Technique; notes?: string };
  sets: SetLog[];
  notes?: string;
  unit?: Unit;
}

export interface Session {
  id: string;
  userId: string;
  programId?: string | null;
  programName?: string;
  dayKey?: string;
  dayTitle?: string;
  startedAt: string;
  finishedAt?: string | null;
  exercises: ExerciseLog[];
  note?: string;
  feeling?: 1 | 2 | 3 | 4 | 5;
  volumeKg: number;
  /** exerciseIds com recorde nesta sessão */
  prs: string[];
}

export interface BodyMetric {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  note?: string;
}

export type PhotoPose = "frente" | "lado" | "costas";

export interface ProgressPhoto {
  id: string;
  userId: string;
  date: string;
  pose: PhotoPose;
  /** URL exibível (data URL no modo local, URL assinada no Supabase) */
  url: string;
  path?: string;
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DietItem {
  uid: string;
  foodId?: string;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Meal {
  uid: string;
  name: string;
  time?: string;
  items: DietItem[];
}

export interface DietPlan {
  id: string;
  ownerId: string;
  createdBy: string;
  name: string;
  targets: MacroTargets;
  meals: Meal[];
  notes?: string;
  updatedAt: string;
}

/** Dados que o personal informa ao cadastrar um aluno sem conta. */
export type StudentDraft = Pick<Profile, "name"> &
  Partial<Pick<Profile, "phone" | "sex" | "birthYear" | "heightCm" | "weightKg" | "activity" | "goal" | "level" | "daysPerWeek" | "sessionMinutes" | "equipment" | "preferredSystem" | "limitations" | "coachNotes" | "consentHealthAt" | "consentSource">>;

export interface Invite {
  code: string;
  coachId: string;
  createdAt: string;
  expiresAt: string;
  usedBy?: string | null;
  /** Convite de um cadastro específico: quem aceita assume aquele aluno. */
  studentId?: string;
}

export interface StudentSummary {
  profile: Profile;
  linkedAt: string;
  lastSessionAt: string | null;
  sessions7d: number;
  sessions28d: number;
  activeProgramName: string | null;
  /** Ficha ativa do aluno (para avisar validade e abrir direto). */
  activeProgram: { id: string; name: string; createdAt: string; updatedAt: string; durationWeeks?: number; days: number } | null;
  latestWeightKg: number | null;
  weightDelta28d: number | null;
  /** Treinos na semana corrente (segunda a domingo): o "N de M na semana" de /alunos, igual ao Hoje do aluno. */
  sessionsWeek: number;
  /** Meta de treinos por semana (dias da ficha ativa, senão os do cadastro); null sem meta. */
  weeklyGoal: number | null;
}
