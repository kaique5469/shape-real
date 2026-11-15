"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uid } from "@/lib/domain/ids";
import type { BodyMetric, DietPlan, Invite, PhotoPose, Profile, Program, ProgressPhoto, Session } from "@/lib/domain/types";
import { DataError, summarizeStudent, type Repository } from "./repository";

type Row = Record<string, unknown>;

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseKey());
}

function supabaseKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey()!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

function fail(error: { message: string; code?: string } | null, fallback = "Não foi possível salvar. Tente de novo."): never {
  const msg = error?.message ?? "";
  if (/invite_not_found/.test(msg)) throw new DataError("Código não encontrado. Confira com seu personal.", "not_found");
  if (/invite_used/.test(msg)) throw new DataError("Este código já foi usado. Peça um novo ao seu personal.", "invalid");
  if (/invite_expired/.test(msg)) throw new DataError("Código expirado. Peça um novo ao seu personal.", "invalid");
  if (/invite_self/.test(msg)) throw new DataError("Você não pode ser aluno de si mesmo.", "invalid");
  if (/coach_limit_free/.test(msg)) throw new DataError("Seu personal atingiu o limite do plano grátis (3 alunos).", "limit");
  if (/coach_limit/.test(msg)) throw new DataError("Seu personal atingiu o limite de alunos do plano.", "limit");
  if (error?.code === "42501" || /row-level security/.test(msg)) throw new DataError("Você não tem permissão para isso.", "forbidden");
  if (/fetch|network/i.test(msg)) throw new DataError("Sem conexão. Verifique a internet e tente de novo.", "network");
  throw new DataError(fallback);
}

// ---- mapeamento linha ↔ domínio -------------------------------------------
const toProfile = (r: Row, email?: string): Profile => ({
  ...(r.data as Partial<Profile>),
  id: r.id as string,
  name: r.name as string,
  role: r.role as Profile["role"],
  plan: r.plan as Profile["plan"],
  onboarded: r.onboarded as boolean,
  createdAt: r.created_at as string,
  consentHealthAt: (r.consent_health_at as string) ?? undefined,
  email,
});

const fromProfile = (p: Profile): Row => {
  const { id, name, role, onboarded, consentHealthAt, plan: _plan, createdAt: _c, email: _e, ...data } = p;
  return { id, name, role, onboarded, consent_health_at: consentHealthAt ?? null, data };
};

const toProgram = (r: Row): Program => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  createdBy: r.created_by as string,
  name: r.name as string,
  system: r.system as Program["system"],
  goal: r.goal as Program["goal"],
  level: r.level as Program["level"],
  daysPerWeek: r.days_per_week as number,
  notes: (r.notes as string) ?? undefined,
  days: r.days as Program["days"],
  active: r.active as boolean,
  source: r.source as Program["source"],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const fromProgram = (p: Program): Row => ({
  id: p.id,
  owner_id: p.ownerId,
  created_by: p.createdBy,
  name: p.name,
  system: p.system,
  goal: p.goal,
  level: p.level,
  days_per_week: p.daysPerWeek,
  notes: p.notes ?? null,
  days: p.days,
  active: p.active,
  source: p.source,
  updated_at: new Date().toISOString(),
});

const toSession = (r: Row): Session => ({
  id: r.id as string,
  userId: r.user_id as string,
  programId: (r.program_id as string) ?? null,
  programName: (r.program_name as string) ?? undefined,
  dayKey: (r.day_key as string) ?? undefined,
  dayTitle: (r.day_title as string) ?? undefined,
  startedAt: r.started_at as string,
  finishedAt: (r.finished_at as string) ?? null,
  exercises: r.exercises as Session["exercises"],
  note: (r.note as string) ?? undefined,
  feeling: (r.feeling as Session["feeling"]) ?? undefined,
  volumeKg: Number(r.volume_kg ?? 0),
  prs: (r.prs as string[]) ?? [],
});

const fromSession = (s: Session): Row => ({
  id: s.id,
  user_id: s.userId,
  program_id: s.programId ?? null,
  program_name: s.programName ?? null,
  day_key: s.dayKey ?? null,
  day_title: s.dayTitle ?? null,
  started_at: s.startedAt,
  finished_at: s.finishedAt ?? null,
  exercises: s.exercises,
  note: s.note ?? null,
  feeling: s.feeling ?? null,
  volume_kg: s.volumeKg,
  prs: s.prs,
});

const toMetric = (r: Row): BodyMetric => ({
  id: r.id as string,
  userId: r.user_id as string,
  date: r.date as string,
  weightKg: num(r.weight_kg),
  bodyFatPct: num(r.body_fat_pct),
  waistCm: num(r.waist_cm),
  hipCm: num(r.hip_cm),
  chestCm: num(r.chest_cm),
  armCm: num(r.arm_cm),
  thighCm: num(r.thigh_cm),
  note: (r.note as string) ?? undefined,
});
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const fromMetric = (m: BodyMetric): Row => ({
  id: m.id,
  user_id: m.userId,
  date: m.date,
  weight_kg: m.weightKg ?? null,
  body_fat_pct: m.bodyFatPct ?? null,
  waist_cm: m.waistCm ?? null,
  hip_cm: m.hipCm ?? null,
  chest_cm: m.chestCm ?? null,
  arm_cm: m.armCm ?? null,
  thigh_cm: m.thighCm ?? null,
  note: m.note ?? null,
});

const toDiet = (r: Row): DietPlan => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  createdBy: r.created_by as string,
  name: r.name as string,
  targets: r.targets as DietPlan["targets"],
  meals: r.meals as DietPlan["meals"],
  notes: (r.notes as string) ?? undefined,
  updatedAt: r.updated_at as string,
});

export class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;
  private get db() {
    return getSupabase();
  }

  async getProfile(userId: string) {
    const { data, error } = await this.db.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) fail(error, "Não foi possível carregar o perfil.");
    if (!data) return null;
    const { data: auth } = await this.db.auth.getUser();
    return toProfile(data, auth.user?.id === userId ? auth.user.email : undefined);
  }
  async saveProfile(profile: Profile) {
    const { data, error } = await this.db.from("profiles").update(fromProfile(profile)).eq("id", profile.id).select("*").single();
    if (error) fail(error);
    return toProfile(data, profile.email);
  }

  async listPrograms(ownerId: string) {
    const { data, error } = await this.db
      .from("programs")
      .select("*")
      .eq("owner_id", ownerId)
      .order("active", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) fail(error, "Não foi possível carregar as fichas.");
    return (data ?? []).map(toProgram);
  }
  async getProgram(id: string) {
    const { data, error } = await this.db.from("programs").select("*").eq("id", id).maybeSingle();
    if (error) fail(error);
    return data ? toProgram(data) : null;
  }
  async saveProgram(program: Program) {
    const { data, error } = await this.db.from("programs").upsert(fromProgram(program)).select("*").single();
    if (error) fail(error);
    if (program.active) await this.setActiveProgram(program.ownerId, program.id);
    return toProgram(data);
  }
  async deleteProgram(id: string) {
    const { error } = await this.db.from("programs").delete().eq("id", id);
    if (error) fail(error);
  }
  async setActiveProgram(ownerId: string, programId: string) {
    const off = await this.db.from("programs").update({ active: false }).eq("owner_id", ownerId).neq("id", programId);
    if (off.error) fail(off.error);
    const on = await this.db.from("programs").update({ active: true }).eq("id", programId);
    if (on.error) fail(on.error);
  }

  async listSessions(userId: string, opts?: { limit?: number }) {
    let q = this.db.from("sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false });
    q = q.limit(opts?.limit ?? 500);
    const { data, error } = await q;
    if (error) fail(error, "Não foi possível carregar o histórico.");
    return (data ?? []).map(toSession);
  }
  async saveSession(session: Session) {
    const { data, error } = await this.db.from("sessions").upsert(fromSession(session)).select("*").single();
    if (error) fail(error, "Não foi possível salvar o treino. Seus dados continuam nesta tela.");
    return toSession(data);
  }
  async deleteSession(id: string) {
    const { error } = await this.db.from("sessions").delete().eq("id", id);
    if (error) fail(error);
  }

  async listMetrics(userId: string) {
    const { data, error } = await this.db.from("body_metrics").select("*").eq("user_id", userId).order("date");
    if (error) fail(error);
    return (data ?? []).map(toMetric);
  }
  async saveMetric(metric: BodyMetric) {
    const { data, error } = await this.db.from("body_metrics").upsert(fromMetric(metric)).select("*").single();
    if (error) fail(error);
    return toMetric(data);
  }
  async deleteMetric(id: string) {
    const { error } = await this.db.from("body_metrics").delete().eq("id", id);
    if (error) fail(error);
  }

  async listPhotos(userId: string) {
    const { data, error } = await this.db.from("progress_photos").select("*").eq("user_id", userId).order("date");
    if (error) fail(error);
    const rows = data ?? [];
    if (!rows.length) return [];
    const { data: signed } = await this.db.storage.from("progress-photos").createSignedUrls(
      rows.map((r) => r.path as string),
      60 * 60,
    );
    return rows.map((r, i) => ({
      id: r.id as string,
      userId: r.user_id as string,
      date: r.date as string,
      pose: r.pose as PhotoPose,
      path: r.path as string,
      url: signed?.[i]?.signedUrl ?? "",
    }));
  }
  async addPhoto(userId: string, image: Blob, meta: { date: string; pose: PhotoPose }) {
    const id = uid();
    const path = `${userId}/${id}.jpg`;
    const up = await this.db.storage.from("progress-photos").upload(path, image, { contentType: "image/jpeg", upsert: false });
    if (up.error) fail(up.error, "Falha ao enviar a foto.");
    const { error } = await this.db.from("progress_photos").insert({ id, user_id: userId, date: meta.date, pose: meta.pose, path });
    if (error) fail(error);
    const { data: s } = await this.db.storage.from("progress-photos").createSignedUrl(path, 3600);
    return { id, userId, path, url: s?.signedUrl ?? "", ...meta } satisfies ProgressPhoto;
  }
  async deletePhoto(photo: ProgressPhoto) {
    if (photo.path) await this.db.storage.from("progress-photos").remove([photo.path]);
    const { error } = await this.db.from("progress_photos").delete().eq("id", photo.id);
    if (error) fail(error);
  }

  async getDiet(ownerId: string) {
    const { data, error } = await this.db.from("diet_plans").select("*").eq("owner_id", ownerId).maybeSingle();
    if (error) fail(error);
    return data ? toDiet(data) : null;
  }
  async saveDiet(diet: DietPlan) {
    const { data, error } = await this.db
      .from("diet_plans")
      .upsert(
        {
          id: diet.id,
          owner_id: diet.ownerId,
          created_by: diet.createdBy,
          name: diet.name,
          targets: diet.targets,
          meals: diet.meals,
          notes: diet.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      )
      .select("*")
      .single();
    if (error) fail(error);
    return toDiet(data);
  }

  async listStudents(coachId: string) {
    const { data: links, error } = await this.db.from("coach_links").select("*").eq("coach_id", coachId);
    if (error) fail(error, "Não foi possível carregar os alunos.");
    const ids = (links ?? []).map((l) => l.student_id as string);
    if (!ids.length) return [];
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const [profiles, sessions, programs, metrics] = await Promise.all([
      this.db.from("profiles").select("*").in("id", ids),
      this.db.from("sessions").select("id,user_id,started_at,volume_kg,exercises,prs").in("user_id", ids).gte("started_at", since),
      this.db.from("programs").select("*").in("owner_id", ids).eq("active", true),
      this.db.from("body_metrics").select("*").in("user_id", ids).order("date"),
    ]);
    return (profiles.data ?? []).map((p) => {
      const id = p.id as string;
      const link = links!.find((l) => l.student_id === id)!;
      return summarizeStudent(
        toProfile(p),
        link.created_at as string,
        (sessions.data ?? []).filter((s) => s.user_id === id).map(toSession),
        (programs.data ?? []).filter((x) => x.owner_id === id).map(toProgram),
        (metrics.data ?? []).filter((m) => m.user_id === id).map(toMetric),
      );
    });
  }
  async createInvite(coachId: string) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
    const { data, error } = await this.db.from("invites").insert({ code, coach_id: coachId }).select("*").single();
    if (error) fail(error, "Não foi possível gerar o convite.");
    return { code: data.code, coachId: data.coach_id, createdAt: data.created_at, expiresAt: data.expires_at } satisfies Invite;
  }
  async acceptInvite(code: string) {
    const { data, error } = await this.db.rpc("accept_invite", { invite_code: code });
    if (error) fail(error);
    return { coachName: (data as { coach_name: string }).coach_name };
  }
  async unlinkStudent(coachId: string, studentId: string) {
    const { error } = await this.db.from("coach_links").delete().eq("coach_id", coachId).eq("student_id", studentId);
    if (error) fail(error);
  }
  async getCoach(studentId: string) {
    const { data } = await this.db.from("coach_links").select("coach_id").eq("student_id", studentId).maybeSingle();
    if (!data) return null;
    const { data: coach } = await this.db.from("profiles").select("id,name").eq("id", data.coach_id).maybeSingle();
    return coach ? { id: coach.id as string, name: coach.name as string } : null;
  }

  async recordUpgradeIntent(userId: string, plan: string) {
    await this.db.from("upgrade_intents").insert({ user_id: userId, plan });
  }

  async deleteAccount(userId: string) {
    const { data: files } = await this.db.storage.from("progress-photos").list(userId, { limit: 1000 });
    if (files?.length) await this.db.storage.from("progress-photos").remove(files.map((f) => `${userId}/${f.name}`));
    const { error } = await this.db.rpc("delete_my_account");
    if (error) fail(error, "Não foi possível excluir a conta. Tente de novo.");
    await this.db.auth.signOut();
  }
}
