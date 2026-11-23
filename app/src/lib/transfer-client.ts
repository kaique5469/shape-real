"use client";

import { localRepo } from "@/lib/app-context";
import { track } from "@/lib/analytics";
import { lastBackupAt, markBackupDone } from "@/lib/data/local";
import type { Repository } from "@/lib/data/repository";
import { uid } from "@/lib/domain/ids";
import { backupAgeBucket, backupFileName, buildBackup, downloadText, parseBackup as parseBackupFile, SENT_KEY_RE, type Backup, type BackupBundle } from "@/lib/domain/export";
import { mergeMetric, mirrorLoads, studentFieldsOf, type FichaPacket, type TreinosPacket } from "@/lib/domain/transfer";
import type { Profile, Session } from "@/lib/domain/types";

/**
 * Grava no aparelho o que chegou por link. Só existe no modo sem conta: com conta na nuvem,
 * personal e aluno já veem os mesmos dados.
 */

/**
 * O aluno recebe ficha e dieta do personal. Devolve o perfil que deve ficar aberto.
 * `consent`: a pessoa tocou em "Salvar no meu celular" com o texto de autorização logo acima do botão; só então
 * a autorização de dados de saúde é gravada (origem "aluno_link"). Sem isso, nada é carimbado sozinho.
 */
export async function importFicha(packet: FichaPacket, current: Profile | null, opts: { consent?: boolean } = {}): Promise<Profile> {
  const now = new Date().toISOString();
  const ref = packet.student.ref;
  // Só os campos de cadastro: o que mais vier no link (versões novas, link adulterado) não entra no perfil.
  const fields = studentFieldsOf(packet.student);
  const remoteCoach = { id: packet.coach.id, name: packet.coach.name, phone: packet.coach.phone, cref: packet.coach.cref, studentRef: ref };

  // Quem já usa o app como aluno neste aparelho continua com o próprio histórico.
  const keepsHistory = Boolean(current && current.role === "athlete");
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
    ...(opts.consent ? { consentHealthAt: now, consentSource: "aluno_link" as const } : {}),
  };
  await localRepo.saveProfile(profile);

  // O personal vira um contato local: "Acompanhado por", ficha "do seu personal" e os exercícios próprios dele.
  const coach = await localRepo.getProfile(packet.coach.id);
  if (!coach || coach.role === "coach") {
    await localRepo.saveProfile({ ...(coach ?? { role: "coach", plan: "coach", onboarded: true, createdAt: now }), id: packet.coach.id, name: packet.coach.name, phone: packet.coach.phone, cref: packet.coach.cref, role: "coach" } as Profile);
  }
  localRepo.linkDirect(packet.coach.id, profile.id, now);
  for (const e of packet.exercises) await localRepo.saveCustomExercise(packet.coach.id, { ...e, custom: true });
  for (const f of packet.foods) await localRepo.saveCustomFood(packet.coach.id, f);

  if (packet.program) {
    let program = { ...packet.program, ownerId: profile.id, createdBy: packet.coach.id, active: true };
    // Reenvio: treinos feitos aqui depois da última alteração do personal (e ainda não devolvidos)
    // continuam valendo na ficha nova; a carga não volta para trás. Uma redução feita pelo personal
    // depois do treino é mantida.
    if (keepsHistory) program = mirrorLoads(program, await localRepo.listSessions(profile.id)) ?? program;
    // Mesmo id da ficha no aparelho do personal: reenviar atualiza a ficha em vez de duplicar.
    await localRepo.saveProgram({ ...program, updatedAt: now });
    await localRepo.setActiveProgram(profile.id, packet.program.id);
  }
  if (packet.diet) await localRepo.saveDiet({ ...packet.diet, ownerId: profile.id, createdBy: packet.coach.id });
  return profile;
}

/**
 * O personal recebe os treinos do aluno. Devolve quantos eram novos, quantos já existiam e quantos
 * exercícios da ficha passaram a mostrar a carga que o aluno fez.
 */
export async function importTreinos(packet: TreinosPacket, studentId: string): Promise<{ added: number; updated: number; mirrored: number }> {
  const existing = new Set((await localRepo.listSessions(studentId)).map((s) => s.id));
  let added = 0;
  let updated = 0;
  const incoming: Session[] = [];
  for (const s of packet.sessions) {
    const session: Session = { ...s, userId: studentId };
    if (existing.has(s.id)) updated += 1;
    else added += 1;
    incoming.push(session);
    await localRepo.saveSession(session);
  }

  // A ficha ativa do aluno passa a mostrar a carga atual: o próximo reenvio não faz a carga regredir.
  let mirrored = 0;
  const active = (await localRepo.listPrograms(studentId)).find((p) => p.active);
  if (active) {
    const next = mirrorLoads(active, incoming);
    if (next) {
      mirrored = next.days.reduce((n, d, i) => n + d.exercises.filter((e, j) => e.loadKg !== active.days[i]?.exercises[j]?.loadKg).length, 0);
      await localRepo.saveProgram(next, { keepUpdatedAt: true });
    }
  }

  const metrics = await localRepo.listMetrics(studentId);
  for (const m of packet.metrics) {
    // Mesmo registro chegando de novo: atualiza. Mesma data de uma avaliação do personal: o aluno só completa.
    const same = metrics.find((x) => x.id === m.id) ?? metrics.find((x) => x.date === m.date);
    const merged = { ...mergeMetric(same, { ...m, userId: studentId }), userId: studentId };
    await localRepo.saveMetric(merged);
    if (same) metrics[metrics.indexOf(same)] = merged;
    else metrics.push(merged);
  }
  return { added, updated, mirrored };
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

/** Chaves "sr:sent:*" destes perfis, para a cópia de segurança. */
function readSentKeys(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const id of ids) {
      for (const k of [sentKey(id), `${sentKey(id)}:at`]) {
        const v = localStorage.getItem(k);
        if (v !== null && SENT_KEY_RE.test(k)) out[k] = v;
      }
    }
  } catch {}
  return out;
}

// ---- cópia de segurança ------------------------------------------------------------
/** Lê do armazenamento tudo o que entra na cópia deste perfil (fotos ficam de fora). */
export async function collectBackup(repo: Repository, user: Profile, now = new Date()): Promise<Backup> {
  const bundle = async (p: Profile): Promise<BackupBundle> => {
    const [programs, sessions, metrics, diet, customExercises, customFoods] = await Promise.all([
      repo.listPrograms(p.id),
      repo.listSessions(p.id),
      repo.listMetrics(p.id),
      repo.getDiet(p.id),
      repo.listCustomExercises(p.id).catch(() => []),
      repo.listCustomFoods(p.id).catch(() => []),
    ]);
    return { profile: p, programs, sessions, metrics, diet, customExercises, customFoods };
  };
  const main = await bundle(user);
  // Personal: os alunos vão junto, cada um com fichas, treinos, medidas, dieta e o que for próprio dele.
  const students = user.role === "coach" ? await Promise.all((await repo.listStudents(user.id)).map(({ profile }) => bundle(profile))) : undefined;
  // Aluno que recebe a ficha por link: o personal guardado aqui e os exercícios/alimentos dele (a ficha aponta para eles).
  let remoteCoach: BackupBundle | undefined;
  if (repo.mode === "local" && user.remoteCoach) {
    const coach = await localRepo.getProfile(user.remoteCoach.id);
    if (coach) {
      const [customExercises, customFoods] = await Promise.all([localRepo.listCustomExercises(coach.id), localRepo.listCustomFoods(coach.id)]);
      remoteCoach = { profile: coach, customExercises, customFoods };
    }
  }
  const sent = readSentKeys([user.id, ...(students ?? []).map((s) => s.profile.id)]);
  return buildBackup({ ...main, students, remoteCoach, sent }, now);
}

/**
 * Entrega o arquivo: compartilhar nativo quando o aparelho aceita arquivos (iPhone: "Salvar em Arquivos");
 * senão, download (o Chrome do Android recusa compartilhar .json). null quando a pessoa fecha o compartilhar.
 */
export async function deliverBackup(backup: Backup, now = new Date()): Promise<{ via: "share" | "download"; fileName: string } | null> {
  const fileName = backupFileName(now);
  const json = JSON.stringify(backup);
  if (typeof File !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const file = new File([json], fileName, { type: "application/json" });
    let shareable = false;
    try {
      shareable = navigator.canShare?.({ files: [file] }) ?? false;
    } catch {}
    if (shareable) {
      try {
        await navigator.share({ files: [file] });
        return { via: "share", fileName };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        // Sem permissão (o toque expirou) ou erro do aparelho: cai para o download.
      }
    }
  }
  downloadText(fileName, json, "application/json");
  return { via: "download", fileName };
}

/**
 * Botão "Fazer cópia de segurança" / "Fazer agora": monta, entrega e guarda a data da cópia.
 * A medição leva só a faixa de dias desde a cópia anterior e o caminho (nunca dados do arquivo).
 */
export async function makeBackup(repo: Repository, user: Profile, where: "conta" | "hoje" | "alunos" | "instalar"): Promise<{ via: "share" | "download"; fileName: string; students: number } | null> {
  const now = new Date();
  const previous = lastBackupAt();
  const backup = await collectBackup(repo, user, now);
  const done = await deliverBackup(backup, now);
  if (!done) return null;
  markBackupDone(now.toISOString());
  track("backup_shared", { dias_desde_ultima: backupAgeBucket(previous, now), via: done.via, onde: where, alunos: backup.students?.length ?? 0 });
  return { ...done, students: backup.students?.length ?? 0 };
}

/** Lê o arquivo da cópia (v1 "shape-real-backup.json" ou v2). null se não for uma cópia do app. */
export const parseBackup = parseBackupFile;

async function restoreBundle(b: BackupBundle, ownerOverride?: Partial<Profile>) {
  // Exercícios e alimentos próprios antes das fichas e dietas que apontam para eles.
  for (const e of b.customExercises ?? []) await localRepo.saveCustomExercise(b.profile.id, { ...e, custom: true });
  for (const f of b.customFoods ?? []) await localRepo.saveCustomFood(b.profile.id, f);
  await localRepo.saveProfile({ ...b.profile, ...ownerOverride });
  for (const p of b.programs ?? []) await localRepo.saveProgram({ ...p, ownerId: b.profile.id }, { keepUpdatedAt: true });
  if (b.sessions?.length) localRepo.saveSessionsBulk(b.sessions.map((s) => ({ ...s, userId: b.profile.id })));
  if (b.metrics?.length) localRepo.saveMetricsBulk(b.metrics.map((m) => ({ ...m, userId: b.profile.id })));
  if (b.diet) await localRepo.saveDiet({ ...b.diet, ownerId: b.profile.id });
}

/** Restaura a cópia neste aparelho (fotos não vão no arquivo). Devolve o perfil a abrir. */
export async function restoreBackup(b: Backup): Promise<{ profile: Profile; students: number }> {
  const now = new Date().toISOString();
  // Personal de quem recebe a ficha por link: contato local e exercícios/alimentos dele primeiro.
  const rc = b.remoteCoach;
  if (rc && rc.profile.id !== b.profile.id) {
    const existing = await localRepo.getProfile(rc.profile.id);
    if (!existing || existing.role === "coach") {
      for (const e of rc.customExercises ?? []) await localRepo.saveCustomExercise(rc.profile.id, { ...e, custom: true });
      for (const f of rc.customFoods ?? []) await localRepo.saveCustomFood(rc.profile.id, f);
      await localRepo.saveProfile({ ...rc.profile, role: "coach" });
    }
  }
  // O perfil principal primeiro: as fichas dos alunos usam os exercícios próprios do personal.
  await restoreBundle(b);
  for (const s of b.students ?? []) {
    await restoreBundle(s, { managedBy: b.profile.id });
    localRepo.linkDirect(b.profile.id, s.profile.id, now);
  }
  if (rc && b.profile.remoteCoach?.id === rc.profile.id) localRepo.linkDirect(rc.profile.id, b.profile.id, now);
  try {
    for (const [k, v] of Object.entries(b.sent ?? {})) if (SENT_KEY_RE.test(k)) localStorage.setItem(k, v);
  } catch {}
  // O conteúdo restaurado já tem cópia: o lembrete conta a partir da data do arquivo.
  if (b.exportedAt && Number.isFinite(Date.parse(b.exportedAt))) markBackupDone(new Date(Math.min(Date.parse(b.exportedAt), Date.now())).toISOString());
  return { profile: b.profile, students: b.students?.length ?? 0 };
}
