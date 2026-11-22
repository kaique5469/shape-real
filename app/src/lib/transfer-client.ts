"use client";

import { localRepo } from "@/lib/app-context";
import { uid } from "@/lib/domain/ids";
import type { FichaPacket, TreinosPacket } from "@/lib/domain/transfer";
import type { Profile, Session } from "@/lib/domain/types";

/**
 * Grava no aparelho o que chegou por link. Só existe no modo sem conta: com conta na nuvem,
 * personal e aluno já veem os mesmos dados.
 */

/** O aluno recebe ficha e dieta do personal. Devolve o perfil que deve ficar aberto. */
export async function importFicha(packet: FichaPacket, current: Profile | null): Promise<Profile> {
  const now = new Date().toISOString();
  const { ref, ...fields } = packet.student;
  const remoteCoach = { id: packet.coach.id, name: packet.coach.name, phone: packet.coach.phone, studentRef: ref };

  // Quem já usa o app como aluno neste aparelho continua com o próprio histórico.
  const base: Profile =
    current && current.role === "athlete"
      ? current
      : { id: uid(), name: fields.name, role: "athlete", plan: "free", onboarded: true, createdAt: now };
  const profile: Profile = {
    ...fields,
    ...base,
    // O cadastro feito pelo personal completa o que a pessoa ainda não informou.
    ...Object.fromEntries(Object.entries(fields).filter(([k]) => base[k as keyof Profile] === undefined || base[k as keyof Profile] === "")),
    onboarded: true,
    remoteCoach,
    consentHealthAt: base.consentHealthAt ?? now,
  };
  await localRepo.saveProfile(profile);

  // O personal vira um contato local: "Acompanhado por", ficha "do seu personal" e os exercícios próprios dele.
  const coach = await localRepo.getProfile(packet.coach.id);
  if (!coach || coach.role === "coach") {
    await localRepo.saveProfile({ ...(coach ?? { role: "coach", plan: "coach", onboarded: true, createdAt: now }), id: packet.coach.id, name: packet.coach.name, phone: packet.coach.phone, role: "coach" } as Profile);
  }
  localRepo.linkDirect(packet.coach.id, profile.id, now);
  for (const e of packet.exercises) await localRepo.saveCustomExercise(packet.coach.id, { ...e, custom: true });
  for (const f of packet.foods) await localRepo.saveCustomFood(packet.coach.id, f);

  if (packet.program) {
    // Mesmo id da ficha no aparelho do personal: reenviar atualiza a ficha em vez de duplicar.
    await localRepo.saveProgram({ ...packet.program, ownerId: profile.id, createdBy: packet.coach.id, active: true, updatedAt: now });
    await localRepo.setActiveProgram(profile.id, packet.program.id);
  }
  if (packet.diet) await localRepo.saveDiet({ ...packet.diet, ownerId: profile.id, createdBy: packet.coach.id });
  return profile;
}

/** O personal recebe os treinos do aluno. Devolve quantos eram novos. */
export async function importTreinos(packet: TreinosPacket, studentId: string): Promise<{ added: number; updated: number }> {
  const existing = new Set((await localRepo.listSessions(studentId)).map((s) => s.id));
  let added = 0;
  let updated = 0;
  for (const s of packet.sessions) {
    const session: Session = { ...s, userId: studentId };
    if (existing.has(s.id)) updated += 1;
    else added += 1;
    await localRepo.saveSession(session);
  }
  const metrics = await localRepo.listMetrics(studentId);
  for (const m of packet.metrics) {
    // A mesma data vinda duas vezes substitui a anterior em vez de duplicar.
    const same = metrics.find((x) => x.id === m.id || x.date === m.date);
    await localRepo.saveMetric({ ...m, id: same?.id ?? m.id, userId: studentId });
  }
  return { added, updated };
}

// ---- treinos já enviados ao personal (aparelho do aluno) ----------------------------
const sentKey = (userId: string) => `sr:sent:${userId}`;

export function sentSessionIds(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(sentKey(userId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markSessionsSent(userId: string, ids: string[]) {
  try {
    const all = sentSessionIds(userId);
    for (const id of ids) all.add(id);
    localStorage.setItem(sentKey(userId), JSON.stringify([...all].slice(-500)));
    localStorage.setItem(`${sentKey(userId)}:at`, new Date().toISOString());
  } catch {}
}

export function lastSentAt(userId: string): string | null {
  try {
    return localStorage.getItem(`${sentKey(userId)}:at`);
  } catch {
    return null;
  }
}

// ---- backup ----------------------------------------------------------------------
interface BackupBundle {
  profile: Profile;
  programs?: import("@/lib/domain/types").Program[];
  sessions?: Session[];
  metrics?: import("@/lib/domain/types").BodyMetric[];
  diet?: import("@/lib/domain/types").DietPlan | null;
}
interface Backup extends BackupBundle {
  exportedAt?: string;
  students?: BackupBundle[];
}

/** Lê o arquivo "shape-real-backup.json" exportado em Conta. null se não for um backup do app. */
export function parseBackup(text: string): Backup | null {
  try {
    const b = JSON.parse(text) as Backup;
    const ok = (x: BackupBundle | undefined) => Boolean(x?.profile?.id && x.profile.name !== undefined && (x.profile.role === "coach" || x.profile.role === "athlete"));
    if (!ok(b) || (b.students && !b.students.every(ok))) return null;
    return b;
  } catch {
    return null;
  }
}

async function restoreBundle(b: BackupBundle, ownerOverride?: Partial<Profile>) {
  await localRepo.saveProfile({ ...b.profile, ...ownerOverride });
  for (const p of b.programs ?? []) await localRepo.saveProgram({ ...p, ownerId: b.profile.id });
  if (b.sessions?.length) localRepo.saveSessionsBulk(b.sessions.map((s) => ({ ...s, userId: b.profile.id })));
  if (b.metrics?.length) localRepo.saveMetricsBulk(b.metrics.map((m) => ({ ...m, userId: b.profile.id })));
  if (b.diet) await localRepo.saveDiet({ ...b.diet, ownerId: b.profile.id });
}

/** Restaura o backup neste aparelho (fotos não vão no arquivo). Devolve o perfil a abrir. */
export async function restoreBackup(b: Backup): Promise<{ profile: Profile; students: number }> {
  await restoreBundle(b);
  const now = new Date().toISOString();
  for (const s of b.students ?? []) {
    await restoreBundle(s, { managedBy: b.profile.id });
    localRepo.linkDirect(b.profile.id, s.profile.id, now);
  }
  return { profile: b.profile, students: b.students?.length ?? 0 };
}
