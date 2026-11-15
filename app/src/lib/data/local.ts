"use client";

import { uid } from "@/lib/domain/ids";
import type { BodyMetric, DietPlan, Invite, PhotoPose, Profile, Program, ProgressPhoto, Session } from "@/lib/domain/types";
import { DataError, summarizeStudent, type Repository } from "./repository";

/**
 * Modo local: tudo fica no navegador. Coleções em localStorage (JSON) e fotos em
 * IndexedDB (localStorage tem ~5 MB). Serve para usar sem conta e para a demonstração.
 */
const PREFIX = "sr:v1:";

interface Link {
  coachId: string;
  studentId: string;
  since: string;
}
interface Intent {
  userId: string;
  plan: string;
  at: string;
}

function read<T>(name: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PREFIX + name) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function write<T>(name: string, rows: T[]) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  } catch (e) {
    throw new DataError("Armazenamento do navegador cheio. Exporte seus dados ou crie uma conta na nuvem.", "limit");
  }
}

function upsert<T extends { id: string }>(name: string, row: T): T {
  const rows = read<T>(name);
  const i = rows.findIndex((r) => r.id === row.id);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
  write(name, rows);
  return row;
}

function remove(name: string, id: string) {
  write(
    name,
    read<{ id: string }>(name).filter((r) => r.id !== id),
  );
}

// ---- IndexedDB mínimo para imagens ----------------------------------------
const DB_NAME = "shape-real";
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key: string, value: string) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key: string): Promise<string | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const req = db.transaction("photos").objectStore("photos").get(key);
    req.onsuccess = () => res(req.result as string | undefined);
    req.onerror = () => rej(req.error);
  });
}
async function idbDel(key: string) {
  const db = await idb();
  await new Promise<void>((res) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(key);
    tx.oncomplete = () => res();
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export class LocalRepository implements Repository {
  readonly mode = "local" as const;

  // perfis -------------------------------------------------------------------
  async getProfile(userId: string) {
    return read<Profile>("profiles").find((p) => p.id === userId) ?? null;
  }
  async saveProfile(profile: Profile) {
    return upsert("profiles", profile);
  }
  listLocalProfiles(): Profile[] {
    return read<Profile>("profiles");
  }

  // fichas -------------------------------------------------------------------
  async listPrograms(ownerId: string) {
    return read<Program>("programs")
      .filter((p) => p.ownerId === ownerId)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.updatedAt.localeCompare(a.updatedAt));
  }
  async getProgram(id: string) {
    return read<Program>("programs").find((p) => p.id === id) ?? null;
  }
  async saveProgram(program: Program) {
    const saved = upsert("programs", { ...program, updatedAt: new Date().toISOString() });
    if (saved.active) await this.setActiveProgram(saved.ownerId, saved.id);
    return saved;
  }
  async deleteProgram(id: string) {
    remove("programs", id);
  }
  async setActiveProgram(ownerId: string, programId: string) {
    write(
      "programs",
      read<Program>("programs").map((p) => (p.ownerId === ownerId ? { ...p, active: p.id === programId } : p)),
    );
  }

  // sessões ------------------------------------------------------------------
  async listSessions(userId: string, opts?: { limit?: number }) {
    const rows = read<Session>("sessions")
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
  async saveSession(session: Session) {
    return upsert("sessions", session);
  }
  async deleteSession(id: string) {
    remove("sessions", id);
  }

  // medidas ------------------------------------------------------------------
  async listMetrics(userId: string) {
    return read<BodyMetric>("metrics")
      .filter((m) => m.userId === userId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async saveMetric(metric: BodyMetric) {
    return upsert("metrics", metric);
  }
  async deleteMetric(id: string) {
    remove("metrics", id);
  }

  // fotos --------------------------------------------------------------------
  async listPhotos(userId: string) {
    const meta = read<Omit<ProgressPhoto, "url">>("photos").filter((p) => p.userId === userId);
    const out: ProgressPhoto[] = [];
    for (const m of meta) {
      const url = await idbGet(m.id).catch(() => undefined);
      if (url) out.push({ ...m, url });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  async addPhoto(userId: string, image: Blob, meta: { date: string; pose: PhotoPose }) {
    const id = uid();
    const url = await blobToDataUrl(image);
    await idbSet(id, url);
    upsert("photos", { id, userId, date: meta.date, pose: meta.pose });
    return { id, userId, url, ...meta };
  }
  async deletePhoto(photo: ProgressPhoto) {
    await idbDel(photo.id).catch(() => undefined);
    remove("photos", photo.id);
  }

  // dieta --------------------------------------------------------------------
  async getDiet(ownerId: string) {
    return read<DietPlan>("diets").find((d) => d.ownerId === ownerId) ?? null;
  }
  async saveDiet(diet: DietPlan) {
    const others = read<DietPlan>("diets").filter((d) => d.ownerId !== diet.ownerId);
    const saved = { ...diet, updatedAt: new Date().toISOString() };
    write("diets", [...others, saved]);
    return saved;
  }

  // personal -----------------------------------------------------------------
  async listStudents(coachId: string) {
    const links = read<Link>("links").filter((l) => l.coachId === coachId);
    const profiles = read<Profile>("profiles");
    const out = [];
    for (const l of links) {
      const p = profiles.find((x) => x.id === l.studentId);
      if (!p) continue;
      out.push(
        summarizeStudent(p, l.since, await this.listSessions(p.id), await this.listPrograms(p.id), await this.listMetrics(p.id)),
      );
    }
    return out;
  }
  async createInvite(coachId: string) {
    const code = Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
    const invite: Invite = { code, coachId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    write("invites", [...read<Invite>("invites"), invite]);
    return invite;
  }
  async acceptInvite(code: string, studentId: string) {
    const invites = read<Invite>("invites");
    const inv = invites.find((i) => i.code === code.trim().toUpperCase());
    if (!inv) throw new DataError("Código não encontrado. Confira com seu personal.", "not_found");
    if (inv.usedBy) throw new DataError("Este código já foi usado. Peça um novo ao seu personal.", "invalid");
    if (new Date(inv.expiresAt) < new Date()) throw new DataError("Código expirado. Peça um novo ao seu personal.", "invalid");
    if (inv.coachId === studentId) throw new DataError("Você não pode ser aluno de si mesmo.", "invalid");
    inv.usedBy = studentId;
    write("invites", invites);
    const links = read<Link>("links").filter((l) => l.studentId !== studentId);
    write("links", [...links, { coachId: inv.coachId, studentId, since: new Date().toISOString() }]);
    const coach = await this.getProfile(inv.coachId);
    return { coachName: coach?.name ?? "seu personal" };
  }
  async unlinkStudent(coachId: string, studentId: string) {
    write(
      "links",
      read<Link>("links").filter((l) => !(l.coachId === coachId && l.studentId === studentId)),
    );
  }
  async getCoach(studentId: string) {
    const link = read<Link>("links").find((l) => l.studentId === studentId);
    if (!link) return null;
    const coach = await this.getProfile(link.coachId);
    return coach ? { id: coach.id, name: coach.name } : null;
  }
  /** Usado pela demonstração para criar vínculos diretamente. */
  linkDirect(coachId: string, studentId: string, since: string) {
    write("links", [...read<Link>("links").filter((l) => l.studentId !== studentId), { coachId, studentId, since }]);
  }

  async recordUpgradeIntent(userId: string, plan: string) {
    write("intents", [...read<Intent>("intents"), { userId, plan, at: new Date().toISOString() }]);
  }

  async deleteAccount(userId: string) {
    for (const photo of await this.listPhotos(userId)) await this.deletePhoto(photo);
    write("profiles", read<Profile>("profiles").filter((p) => p.id !== userId));
    write("programs", read<Program>("programs").filter((p) => p.ownerId !== userId));
    write("sessions", read<Session>("sessions").filter((s) => s.userId !== userId));
    write("metrics", read<BodyMetric>("metrics").filter((m) => m.userId !== userId));
    write("diets", read<DietPlan>("diets").filter((d) => d.ownerId !== userId));
    write("links", read<Link>("links").filter((l) => l.studentId !== userId && l.coachId !== userId));
  }

  /** Apaga todos os dados locais (botão "Apagar dados deste aparelho"). */
  async wipe() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
    await new Promise<void>((res) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => res();
    });
  }
}
