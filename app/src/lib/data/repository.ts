import type { Food } from "@/lib/domain/foods";
import type {
  BodyMetric,
  DietPlan,
  Exercise,
  Invite,
  PhotoPose,
  Profile,
  Program,
  ProgressPhoto,
  Session,
  StudentDraft,
  StudentSummary,
} from "@/lib/domain/types";

/**
 * Contrato único de dados. Duas implementações:
 *  - LocalRepository: navegador (localStorage + IndexedDB) — modo local e demonstração;
 *  - SupabaseRepository: Postgres com RLS — contas reais, personal ↔ aluno.
 * As telas só conhecem este contrato.
 */
export interface Repository {
  readonly mode: "local" | "supabase";
  /**
   * O que este armazenamento permite:
   *  - invites: convite por código funciona entre aparelhos (só com contas na nuvem);
   *  - managedStudents: o personal cadastra o aluno direto, sem conta (modo local/teste).
   */
  readonly capabilities: { invites: boolean; managedStudents: boolean };

  getProfile(userId: string): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<Profile>;

  listPrograms(ownerId: string): Promise<Program[]>;
  getProgram(id: string): Promise<Program | null>;
  saveProgram(program: Program): Promise<Program>;
  deleteProgram(id: string): Promise<void>;
  setActiveProgram(ownerId: string, programId: string): Promise<void>;

  listSessions(userId: string, opts?: { limit?: number }): Promise<Session[]>;
  saveSession(session: Session): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  listMetrics(userId: string): Promise<BodyMetric[]>;
  saveMetric(metric: BodyMetric): Promise<BodyMetric>;
  deleteMetric(id: string): Promise<void>;

  listPhotos(userId: string): Promise<ProgressPhoto[]>;
  addPhoto(userId: string, image: Blob, meta: { date: string; pose: PhotoPose }): Promise<ProgressPhoto>;
  deletePhoto(photo: ProgressPhoto): Promise<void>;

  getDiet(ownerId: string): Promise<DietPlan | null>;
  saveDiet(diet: DietPlan): Promise<DietPlan>;

  listStudents(coachId: string): Promise<StudentSummary[]>;
  /** Cadastra um aluno sem conta, já vinculado ao personal (requer capabilities.managedStudents). */
  createStudent(coachId: string, draft: StudentDraft): Promise<Profile>;
  createInvite(coachId: string): Promise<Invite>;
  acceptInvite(code: string, studentId: string): Promise<{ coachName: string }>;
  unlinkStudent(coachId: string, studentId: string): Promise<void>;
  getCoach(studentId: string): Promise<{ id: string; name: string } | null>;

  /** Exercícios e alimentos criados pelo usuário. */
  listCustomExercises(ownerId: string): Promise<Exercise[]>;
  saveCustomExercise(ownerId: string, exercise: Exercise): Promise<Exercise>;
  deleteCustomExercise(ownerId: string, id: string): Promise<void>;
  listCustomFoods(ownerId: string): Promise<Food[]>;
  saveCustomFood(ownerId: string, food: Food): Promise<Food>;
  deleteCustomFood(ownerId: string, id: string): Promise<void>;

  recordUpgradeIntent(userId: string, plan: string): Promise<void>;
  /** LGPD: exclusão definitiva da conta e de todos os dados do usuário. */
  deleteAccount(userId: string): Promise<void>;
}

export class DataError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "forbidden" | "invalid" | "limit" | "network" = "invalid",
  ) {
    super(message);
  }
}

/** Resumo de aluno calculado a partir das sessões — usado pelas duas implementações. */
export function summarizeStudent(
  profile: Profile,
  linkedAt: string,
  sessions: Session[],
  programs: Program[],
  metrics: BodyMetric[],
  now = new Date(),
): StudentSummary {
  const t = now.getTime();
  const day = 86_400_000;
  const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const withWeight = [...metrics].filter((m) => m.weightKg).sort((a, b) => b.date.localeCompare(a.date));
  const latest = withWeight[0]?.weightKg ?? profile.weightKg ?? null;
  const cutoff = new Date(t - 28 * day).toISOString().slice(0, 10);
  const older = withWeight.find((m) => m.date <= cutoff) ?? withWeight[withWeight.length - 1];
  return {
    profile,
    linkedAt,
    lastSessionAt: sorted[0]?.startedAt ?? null,
    sessions7d: sessions.filter((s) => t - new Date(s.startedAt).getTime() <= 7 * day).length,
    sessions28d: sessions.filter((s) => t - new Date(s.startedAt).getTime() <= 28 * day).length,
    activeProgramName: programs.find((p) => p.active)?.name ?? null,
    latestWeightKg: latest,
    weightDelta28d: latest && older?.weightKg && older !== withWeight[0] ? Math.round((latest - older.weightKg) * 10) / 10 : null,
  };
}
