"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uid } from "@/lib/domain/ids";
import type { Food } from "@/lib/domain/foods";
import type { BodyMetric, DietPlan, Exercise, Invite, PhotoPose, PlanId, Profile, Program, ProgressPhoto, Session, StudentDraft } from "@/lib/domain/types";
import { clearDeliveryKeys } from "./local";
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

type DbError = { message: string; code?: string } | null;

/** O pedido não chegou ao servidor (sem sinal, modo avião, DNS). */
const isNetwork = (error: DbError | undefined): boolean => Boolean(error) && /failed to fetch|fetch failed|networkerror|load failed|network request failed|err_internet|typeerror/i.test(error?.message ?? "");

function fail(error: DbError, fallback = "Não foi possível salvar. Tente de novo."): never {
  const msg = error?.message ?? "";
  if (/invite_not_found/.test(msg)) throw new DataError("Código não encontrado. Confira com seu personal.", "not_found");
  if (/invite_used/.test(msg)) throw new DataError("Este código já foi usado. Peça um novo ao seu personal.", "invalid");
  if (/invite_expired/.test(msg)) throw new DataError("Código expirado. Peça um novo ao seu personal.", "invalid");
  if (/invite_self/.test(msg)) throw new DataError("Você não pode ser aluno de si mesmo.", "invalid");
  if (/coach_limit_free/.test(msg)) throw new DataError("Seu personal atingiu o limite do plano grátis (3 alunos).", "limit");
  if (/coach_limit/.test(msg)) throw new DataError("Você atingiu o limite de alunos do seu plano.", "limit");
  if (/not_a_coach/.test(msg)) throw new DataError("Só contas de personal cadastram alunos.", "forbidden");
  if (/invalid_name/.test(msg)) throw new DataError("Informe o nome do aluno.", "invalid");
  if (error?.code === "42501" || /row-level security|permission denied/.test(msg)) throw new DataError("Você não tem permissão para isso.", "forbidden");
  if (isNetwork(error)) throw new DataError("Sem conexão. Verifique a internet e tente de novo.", "network");
  throw new DataError(fallback);
}

// ---- cópia no aparelho: o que foi lido por último continua disponível sem rede ---------------
const CACHE = "sr:cloud:";
const OUTBOX = `${CACHE}outbox`;
const ME = `${CACHE}me`;

function cachePut(key: string, value: unknown) {
  try {
    localStorage.setItem(CACHE + key, JSON.stringify(value));
  } catch {
    /* sem espaço: segue sem cópia */
  }
}
function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Perfil de quem estava logado da última vez: permite abrir o app sem rede. */
export function cachedSelf(): Profile | null {
  try {
    const raw = localStorage.getItem(ME);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}
/** Ao sair da conta, nada dela fica no aparelho. */
export function clearCloudCache() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE)) localStorage.removeItem(key);
  } catch {}
}

function readOutbox(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as Session[];
  } catch {
    return [];
  }
}
function writeOutbox(list: Session[]) {
  try {
    if (list.length) localStorage.setItem(OUTBOX, JSON.stringify(list));
    else localStorage.removeItem(OUTBOX);
  } catch {}
}

// ---- mapeamento linha ↔ domínio -------------------------------------------
/**
 * `data` guarda os campos opcionais do perfil. Plano, "quem cadastrou" e anotações do personal
 * nunca vêm de lá: têm coluna ou tabela própria e regras no banco.
 */
const toProfile = (r: Row, extra: { email?: string; coachNotes?: string | null } = {}): Profile => {
  const { coachNotes: _n, managedBy: _m, plan: _p, trialUntil: _t, paidPlan: _pp, ...data } = (r.data ?? {}) as Partial<Profile>;
  return {
    ...data,
    id: r.id as string,
    name: r.name as string,
    role: r.role as Profile["role"],
    plan: r.plan as Profile["plan"],
    onboarded: r.onboarded as boolean,
    createdAt: r.created_at as string,
    consentHealthAt: (r.consent_health_at as string) ?? undefined,
    managedBy: (r.managed_by as string) ?? undefined,
    trialUntil: (r.trial_until as string) ?? undefined,
    coachNotes: extra.coachNotes ?? undefined,
    email: extra.email,
  };
};

const fromProfile = (p: Profile): Row => {
  const { id: _id, name, role, onboarded, consentHealthAt, plan: _plan, paidPlan: _pp, trialUntil: _t, managedBy: _m, coachNotes: _n, createdAt: _c, email: _e, ...data } = p;
  return { name, role, onboarded, consent_health_at: consentHealthAt ?? null, data };
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
  durationWeeks: (r.duration_weeks as number) ?? undefined,
  days: r.days as Program["days"],
  active: r.active as boolean,
  source: r.source as Program["source"],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const fromProgram = (p: Program, opts?: { keepUpdatedAt?: boolean }): Row => ({
  id: p.id,
  owner_id: p.ownerId,
  created_by: p.createdBy,
  name: p.name,
  system: p.system,
  goal: p.goal,
  level: p.level,
  days_per_week: p.daysPerWeek,
  notes: p.notes ?? null,
  duration_weeks: p.durationWeeks ?? null,
  days: p.days,
  active: p.active,
  source: p.source,
  updated_at: opts?.keepUpdatedAt && p.updatedAt ? p.updatedAt : new Date().toISOString(),
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
  readonly capabilities = { invites: true, managedStudents: true };
  private get db() {
    return getSupabase();
  }

  /** Quem está logado. Sem rede e com a sessão vencida, vale quem estava logado da última vez. */
  private async me(): Promise<{ id: string; email?: string } | null> {
    const { data } = await this.db.auth.getSession().catch(() => ({ data: { session: null } }));
    if (data.session) return { id: data.session.user.id, email: data.session.user.email };
    const last = cachedSelf();
    return last ? { id: last.id, email: last.email } : null;
  }

  /** Leitura com rede; sem rede, devolve a última cópia guardada no aparelho. */
  private async read<T>(key: string, load: () => PromiseLike<{ data: unknown; error: DbError }>, map: (data: unknown) => T, message?: string): Promise<T> {
    let res: { data: unknown; error: DbError };
    try {
      res = await load();
    } catch (e) {
      res = { data: null, error: { message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) } };
    }
    if (!res.error) {
      const value = map(res.data);
      cachePut(key, value);
      return value;
    }
    if (isNetwork(res.error)) {
      const hit = cacheGet<T>(key);
      if (hit !== null) return hit;
    }
    fail(res.error, message);
  }

  async getProfile(userId: string) {
    const me = await this.me();
    const self = me?.id === userId;
    const profile = await this.read<Profile | null>(
      `profile:${userId}`,
      () => this.db.from("profiles").select("*").eq("id", userId).maybeSingle(),
      (row) => (row ? toProfile(row as Row, { email: self ? me?.email : undefined }) : null),
      "Não foi possível carregar o perfil.",
    );
    if (!profile) return null;
    if (self) {
      // Plano efetivo (teste de 60 dias, personal pagante) é calculado no banco.
      const plan = await this.read<{ plan: PlanId; paid_plan: PlanId; trial_until: string | null } | null>(
        `plan:${userId}`,
        () => this.db.rpc("my_plan"),
        (d) => (d as { plan: PlanId; paid_plan: PlanId; trial_until: string | null } | null) ?? null,
      ).catch(() => null);
      const full: Profile = plan ? { ...profile, plan: plan.plan, paidPlan: plan.paid_plan, trialUntil: plan.trial_until ?? undefined } : profile;
      try {
        localStorage.setItem(ME, JSON.stringify(full));
      } catch {}
      return full;
    }
    // Aluno visto pelo personal: as anotações vêm do vínculo.
    if (me) {
      const notes = await this.read<string | null>(
        `notes:${me.id}:${userId}`,
        () => this.db.from("coach_links").select("notes").eq("coach_id", me.id).eq("student_id", userId).maybeSingle(),
        (d) => ((d as { notes?: string | null } | null)?.notes ?? null),
      ).catch(() => null);
      return { ...profile, coachNotes: notes ?? undefined };
    }
    return profile;
  }

  async saveProfile(profile: Profile) {
    const me = await this.me();
    if (me && profile.id !== me.id) {
      // Personal editando um aluno: anotações ficam no vínculo; o cadastro só muda se o aluno ainda não tem conta.
      const notes = profile.coachNotes?.trim() || null;
      const link = await this.db.from("coach_links").update({ notes }).eq("coach_id", me.id).eq("student_id", profile.id);
      if (link.error) fail(link.error);
      if (profile.managedBy !== me.id) return profile;
      const { data, error } = await this.db.from("profiles").update(fromProfile(profile)).eq("id", profile.id).select("*").single();
      if (error) fail(error);
      return toProfile(data, { coachNotes: notes });
    }
    const { data, error } = await this.db.from("profiles").update(fromProfile(profile)).eq("id", profile.id).select("*").single();
    if (error) fail(error);
    const saved: Profile = { ...toProfile(data, { email: profile.email }), plan: profile.plan, paidPlan: profile.paidPlan, trialUntil: profile.trialUntil };
    try {
      localStorage.setItem(ME, JSON.stringify(saved));
    } catch {}
    return saved;
  }

  listPrograms(ownerId: string) {
    return this.read(
      `programs:${ownerId}`,
      () => this.db.from("programs").select("*").eq("owner_id", ownerId).order("active", { ascending: false }).order("updated_at", { ascending: false }),
      (rows) => ((rows as Row[]) ?? []).map(toProgram),
      "Não foi possível carregar as fichas.",
    );
  }
  getProgram(id: string) {
    return this.read(
      `program:${id}`,
      () => this.db.from("programs").select("*").eq("id", id).maybeSingle(),
      (row) => (row ? toProgram(row as Row) : null),
    );
  }
  /** `keepUpdatedAt`: mantém o `updated_at` (só edição de conteúdo muda a data), como no modo local. */
  async saveProgram(program: Program, opts?: { keepUpdatedAt?: boolean }) {
    const { data, error } = await this.db.from("programs").upsert(fromProgram(program, opts)).select("*").single();
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
    const remote = await this.read(
      `sessions:${userId}`,
      () => this.db.from("sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(opts?.limit ?? 500),
      // A cópia sem rede guarda os 80 treinos mais recentes: bastam para "última vez" e sugestão de carga.
      (rows) => ((rows as Row[]) ?? []).slice(0, 80).map(toSession),
      "Não foi possível carregar o histórico.",
    );
    // Treinos finalizados sem rede aparecem na hora e sobem quando a conexão voltar.
    const pending = readOutbox().filter((s) => s.userId === userId && !remote.some((r) => r.id === s.id));
    return pending.length ? [...pending, ...remote].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : remote;
  }
  async saveSession(session: Session) {
    let res: { data: unknown; error: DbError };
    try {
      res = await this.db.from("sessions").upsert(fromSession(session)).select("*").single();
    } catch (e) {
      res = { data: null, error: { message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) } };
    }
    if (!res.error) return toSession(res.data as Row);
    if (isNetwork(res.error)) {
      // Sem sinal na academia: o treino fica guardado no aparelho e é enviado depois.
      writeOutbox([...readOutbox().filter((s) => s.id !== session.id), session]);
      return session;
    }
    fail(res.error, "Não foi possível salvar o treino. Seus dados continuam nesta tela.");
  }
  /** Envia os treinos guardados sem rede. Devolve quantos ainda faltam. */
  async flushPending(): Promise<number> {
    let left = readOutbox();
    for (const session of [...left]) {
      const { error } = await this.db.from("sessions").upsert(fromSession(session));
      if (error && isNetwork(error)) break;
      // Erro que não é de rede (ex.: vínculo desfeito): não adianta insistir, o treino sai da fila.
      left = left.filter((s) => s.id !== session.id);
      writeOutbox(left);
    }
    return left.length;
  }
  pendingCount(): number {
    return readOutbox().length;
  }
  async deleteSession(id: string) {
    const queued = readOutbox();
    if (queued.some((s) => s.id === id)) {
      writeOutbox(queued.filter((s) => s.id !== id));
      return;
    }
    const { error } = await this.db.from("sessions").delete().eq("id", id);
    if (error) fail(error);
  }

  listMetrics(userId: string) {
    return this.read(
      `metrics:${userId}`,
      () => this.db.from("body_metrics").select("*").eq("user_id", userId).order("date"),
      (rows) => ((rows as Row[]) ?? []).map(toMetric),
    );
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
    if (error) {
      await this.db.storage.from("progress-photos").remove([path]);
      fail(error);
    }
    const { data: s } = await this.db.storage.from("progress-photos").createSignedUrl(path, 3600);
    return { id, userId, path, url: s?.signedUrl ?? "", ...meta } satisfies ProgressPhoto;
  }
  async deletePhoto(photo: ProgressPhoto) {
    // Primeiro o arquivo (a regra de acesso dele depende do registro), depois o registro.
    if (photo.path) await this.db.storage.from("progress-photos").remove([photo.path]);
    const { error } = await this.db.from("progress_photos").delete().eq("id", photo.id);
    if (error) fail(error);
  }

  getDiet(ownerId: string) {
    return this.read(
      `diet:${ownerId}`,
      () => this.db.from("diet_plans").select("*").eq("owner_id", ownerId).maybeSingle(),
      (row) => (row ? toDiet(row as Row) : null),
    );
  }
  async saveDiet(diet: DietPlan, opts?: { keepUpdatedAt?: boolean }) {
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
          updated_at: opts?.keepUpdatedAt && diet.updatedAt ? diet.updatedAt : new Date().toISOString(),
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
    if (profiles.error) fail(profiles.error, "Não foi possível carregar os alunos.");
    return (profiles.data ?? []).map((p) => {
      const id = p.id as string;
      const link = links!.find((l) => l.student_id === id)!;
      return summarizeStudent(
        toProfile(p, { coachNotes: link.notes as string | null }),
        link.created_at as string,
        (sessions.data ?? []).filter((s) => s.user_id === id).map(toSession),
        (programs.data ?? []).filter((x) => x.owner_id === id).map(toProgram),
        (metrics.data ?? []).filter((m) => m.user_id === id).map(toMetric),
      );
    });
  }
  /** Cadastro direto pelo personal: o aluno existe no app antes de ter conta e pode assumi-lo depois por convite. */
  async createStudent(_coachId: string, draft: StudentDraft): Promise<Profile> {
    const { name, ...rest } = draft;
    const { data, error } = await this.db.rpc("create_managed_student", { student_name: name, student_data: rest });
    if (error) fail(error, "Não foi possível cadastrar o aluno. Tente de novo.");
    return toProfile(data as Row, { coachNotes: draft.coachNotes });
  }
  /** Com `studentId`, o convite entrega àquela pessoa o cadastro que o personal já fez (fichas, treinos, medidas). */
  async createInvite(coachId: string, studentId?: string) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
    const { data, error } = await this.db.from("invites").insert({ code, coach_id: coachId, student_id: studentId ?? null }).select("*").single();
    if (error) fail(error, "Não foi possível gerar o convite.");
    return { code: data.code, coachId: data.coach_id, createdAt: data.created_at, expiresAt: data.expires_at, studentId: data.student_id ?? undefined } satisfies Invite;
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
    return this.read<{ id: string; name: string } | null>(
      `coach:${studentId}`,
      async () => {
        const link = await this.db.from("coach_links").select("coach_id").eq("student_id", studentId).maybeSingle();
        if (link.error || !link.data) return { data: null, error: link.error };
        return this.db.from("profiles").select("id,name").eq("id", link.data.coach_id).maybeSingle();
      },
      (row) => (row ? { id: (row as Row).id as string, name: (row as Row).name as string } : null),
    ).catch(() => null);
  }

  private listCustom<T>(table: "custom_exercises" | "custom_foods", ownerId: string): Promise<T[]> {
    return this.read(
      `${table}:${ownerId}`,
      () => this.db.from(table).select("data").eq("owner_id", ownerId),
      (rows) => ((rows as { data: T }[]) ?? []).map((r) => r.data),
      "Não foi possível carregar seus itens personalizados.",
    );
  }
  private async saveCustom<T extends { id: string }>(table: "custom_exercises" | "custom_foods", ownerId: string, item: T): Promise<T> {
    // Quem cria é sempre quem está logado: o personal vendo como aluno cria no próprio cadastro (o aluno enxerga).
    const owner = (await this.me())?.id ?? ownerId;
    const { error } = await this.db.from(table).upsert({ id: item.id, owner_id: owner, data: item }, { onConflict: "owner_id,id" });
    if (error) fail(error);
    return item;
  }
  private async deleteCustom(table: "custom_exercises" | "custom_foods", ownerId: string, id: string) {
    const { error } = await this.db.from(table).delete().eq("owner_id", ownerId).eq("id", id);
    if (error) fail(error);
  }
  listCustomExercises(ownerId: string) {
    return this.listCustom<Exercise>("custom_exercises", ownerId);
  }
  saveCustomExercise(ownerId: string, exercise: Exercise) {
    return this.saveCustom("custom_exercises", ownerId, { ...exercise, custom: true });
  }
  deleteCustomExercise(ownerId: string, id: string) {
    return this.deleteCustom("custom_exercises", ownerId, id);
  }
  listCustomFoods(ownerId: string) {
    return this.listCustom<Food>("custom_foods", ownerId);
  }
  saveCustomFood(ownerId: string, food: Food) {
    return this.saveCustom("custom_foods", ownerId, food);
  }
  deleteCustomFood(ownerId: string, id: string) {
    return this.deleteCustom("custom_foods", ownerId, id);
  }

  async recordUpgradeIntent(userId: string, plan: string) {
    await this.db.from("upgrade_intents").insert({ user_id: userId, plan });
  }

  private async removePhotoFiles(userId: string) {
    const { data: rows } = await this.db.from("progress_photos").select("path").eq("user_id", userId);
    const paths = (rows ?? []).map((r) => r.path as string).filter(Boolean);
    if (paths.length) await this.db.storage.from("progress-photos").remove(paths);
  }

  /** A própria conta (LGPD) ou, para o personal, o cadastro de um aluno que ainda não tem conta. */
  async deleteAccount(userId: string) {
    const me = await this.me();
    if (me && userId !== me.id) {
      await this.removePhotoFiles(userId);
      const { error } = await this.db.rpc("delete_managed_student", { student: userId });
      if (error) fail(error, "Não foi possível remover o aluno. Tente de novo.");
      clearDeliveryKeys(userId);
      return;
    }
    const { data: students } = await this.db.from("profiles").select("id").eq("managed_by", userId);
    for (const s of students ?? []) await this.removePhotoFiles(s.id as string);
    await this.removePhotoFiles(userId);
    const { error } = await this.db.rpc("delete_my_account");
    if (error) fail(error, "Não foi possível excluir a conta. Tente de novo.");
    for (const s of students ?? []) clearDeliveryKeys(s.id as string);
    clearDeliveryKeys(userId);
    clearCloudCache();
    await this.db.auth.signOut();
  }
}
