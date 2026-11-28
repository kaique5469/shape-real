"use client";

import { uid } from "@/lib/domain/ids";
import { SENT_SINCE_KEY, SENT_SUFFIXES, sentKeyOf } from "@/lib/domain/export";
import type { Food } from "@/lib/domain/foods";
import type { BodyMetric, DietPlan, Exercise, Invite, PhotoPose, Profile, Program, ProgressPhoto, Session, StudentDraft } from "@/lib/domain/types";
import { esquecerQuestionarioDoAluno, idsDasRodadas } from "@/lib/questionario-client";
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

/**
 * Cota estourada no modo local (o único em que este repositório grava). Um texto só (rodada 3, R3-6 A): no beta não há
 * conta na nuvem para oferecer. "Nada foi alterado" vale para a gravação que falhou; nas operações de várias gravações
 * (restaurar a cópia, abrir link de ficha, registrar treinos recebidos) vale pela foto de `comFotoDoArmazenamento`.
 */
export const TEXTO_COTA_LOCAL = "Não coube neste aparelho. Nada foi alterado. Libere espaço e tente de novo.";
/** A volta da foto também falhou: nunca mostrar sucesso. Padrão de `comFotoDoArmazenamento` (o caso da restauração). */
export const TEXTO_RESTAURACAO_INCOMPLETA = "A restauração ficou incompleta. Restaure de novo o mesmo arquivo.";

function write<T>(name: string, rows: T[]) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  } catch (e) {
    throw new DataError(TEXTO_COTA_LOCAL, "limit");
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

// ---- cópia de segurança -----------------------------------------------------
/** Quando a última cópia de segurança deste aparelho foi feita (some junto com os dados em "Apagar"). */
const LAST_BACKUP_KEY = PREFIX + "last-backup-at";
export const BACKUP_EVENT = "sr:backup";

export function lastBackupAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v && Number.isFinite(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

/** Guarda a data da cópia (só avança: restaurar uma cópia antiga não "atrasa" o lembrete) e avisa as telas abertas. */
export function markBackupDone(at: string = new Date().toISOString()) {
  try {
    const cur = lastBackupAt();
    if (cur && Date.parse(cur) >= Date.parse(at)) return;
    localStorage.setItem(LAST_BACKUP_KEY, at);
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new Event(BACKUP_EVENT));
  } catch {}
}

// ---- registro de envio (sr:sent:*) ---------------------------------------------
/** Prefixo das chaves de envio (fora de `sr:v1:`): lista de treinos enviados, log, registro da ficha e eco. */
const SENT_PREFIX = "sr:sent:";
/** Rascunho do treino em andamento (`sr:draft:{userId}`, ver workout-draft.ts): entra no "apagar tudo". */
const DRAFT_PREFIX = "sr:draft:";

/** Chaves do localStorage (por índice: funciona também com armazenamento simulado nos testes). */
function storageKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) out.push(k);
    }
  } catch {}
  return out;
}

// ---- foto do armazenamento (rodada 3, R3-6 A) ---------------------------------------
/**
 * A operação falhou e a volta à foto também falhou: o aparelho ficou com parte das gravações. A tela mostra a mensagem
 * (nunca sucesso). `causa`: o erro original da operação.
 */
export class ArmazenamentoIncompleto extends DataError {
  constructor(
    message: string,
    public readonly causa: unknown,
  ) {
    super(message, "limit");
    this.name = "ArmazenamentoIncompleto";
  }
}

/** Cota do localStorage estourada: a exceção do navegador (Chrome, Safari, Firefox) ou o DataError "limit" de `write`. */
export function ehErroDeCota(e: unknown): boolean {
  if (e instanceof DataError) return e.code === "limit";
  if (!e || typeof e !== "object") return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}

/** Chaves que entram na foto: os dados (`sr:v1:*`) e o registro de envio (`sr:sent:*`). O rascunho (`sr:draft:*`) fica fora. */
const naFoto = (k: string) => k.startsWith(PREFIX) || k.startsWith(SENT_PREFIX);

function tirarFoto(): Map<string, string> {
  const foto = new Map<string, string>();
  for (const k of storageKeys()) {
    if (!naFoto(k)) continue;
    const v = localStorage.getItem(k);
    if (v !== null) foto.set(k, v);
  }
  return foto;
}

/**
 * Devolve as chaves da foto ao que eram: apaga as novas (libera espaço) e regrava as que mudaram, primeiro as que
 * diminuem (a que cresceu volta ao tamanho antigo antes de a que encolheu voltar a crescer). true = conferido igual.
 */
function voltarParaFoto(foto: Map<string, string>): boolean {
  try {
    for (const k of storageKeys()) if (naFoto(k) && !foto.has(k)) localStorage.removeItem(k);
    const mudaram: { k: string; v: string; libera: number }[] = [];
    for (const [k, v] of foto) {
      const atual = localStorage.getItem(k);
      if (atual !== v) mudaram.push({ k, v, libera: (atual?.length ?? 0) - v.length });
    }
    mudaram.sort((a, b) => b.libera - a.libera);
    for (const { k, v } of mudaram) localStorage.setItem(k, v);
    const agora = storageKeys().filter(naFoto);
    return agora.length === foto.size && agora.every((k) => localStorage.getItem(k) === foto.get(k));
  } catch {
    return false;
  }
}

/**
 * Roda `fn` com uma foto em memória das chaves `sr:v1:*` e `sr:sent:*` (valor ou ausência). Se `fn` lançar QUALQUER
 * erro, inclusive a cota no meio de várias gravações, o armazenamento volta à foto e:
 *  - cota → `DataError(TEXTO_COTA_LOCAL, "limit")` (nada foi alterado, conferido);
 *  - outro erro → o mesmo erro, intacto (os erros tipados de quem chama continuam reconhecíveis);
 *  - a volta também falhou → `ArmazenamentoIncompleto(incompleta)`.
 * Sem marcador no armazenamento (seria mais uma gravação que pode falhar). Fica fora: o rascunho do treino
 * (`sr:draft:*`), outras chaves e as fotos (IndexedDB). Usar em `restoreBackup`, `importFicha` e `importTreinos`, sem
 * try/catch vazio dentro de `fn` (uma gravação engolida não volta). Pode ser aninhada. Uma gravação de outra aba feita
 * enquanto `fn` espera é desfeita junto, se `fn` falhar (as gravações locais são síncronas; a janela é curta).
 */
export async function comFotoDoArmazenamento<T>(fn: () => T | Promise<T>, incompleta: string = TEXTO_RESTAURACAO_INCOMPLETA): Promise<T> {
  const foto = tirarFoto();
  try {
    return await fn();
  } catch (erro) {
    const raiz = erro instanceof ArmazenamentoIncompleto ? erro.causa : erro;
    if (!voltarParaFoto(foto)) throw new ArmazenamentoIncompleto(incompleta, raiz);
    if (ehErroDeCota(raiz)) throw new DataError(TEXTO_COTA_LOCAL, "limit");
    throw raiz;
  }
}

/**
 * Apaga as chaves de envio de um perfil (`sr:sent:{id}`, `:at`, `:log`, `:ficha`, `:ack`). Chamada ao remover
 * o perfil (aluno removido pelo personal, exclusão da conta). Também exportada por `@/lib/transfer-client`.
 */
export function clearDeliveryKeys(profileId: string) {
  try {
    for (const suffix of SENT_SUFFIXES) localStorage.removeItem(sentKeyOf(profileId, suffix));
  } catch {}
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

interface Owned<T> {
  ownerId: string;
  item: T;
}

// Ordem das listas: a mesma em listSessions/listPrograms/listMetrics e no painel (listStudents), que lê cada coleção uma vez.
const porInicioDesc = (a: Session, b: Session) => b.startedAt.localeCompare(a.startedAt);
const porAtivaEEdicao = (a: Program, b: Program) => Number(b.active) - Number(a.active) || b.updatedAt.localeCompare(a.updatedAt);
const porDataAsc = (a: BodyMetric, b: BodyMetric) => a.date.localeCompare(b.date);

/** Linhas de uma coleção agrupadas por dono, só dos ids pedidos, na ordem em que estão gravadas. */
function agruparPor<T>(rows: readonly T[], dono: (r: T) => string, ids: ReadonlySet<string>): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const id = dono(r);
    if (!ids.has(id)) continue;
    const lista = out.get(id);
    if (lista) lista.push(r);
    else out.set(id, [r]);
  }
  return out;
}

export class LocalRepository implements Repository {
  readonly mode = "local" as const;
  // Tudo fica num aparelho só: convite por código não alcança outro celular,
  // então o personal cadastra o aluno diretamente.
  readonly capabilities = { invites: false, managedStudents: true };

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
      .sort(porAtivaEEdicao);
  }
  async getProgram(id: string) {
    return read<Program>("programs").find((p) => p.id === id) ?? null;
  }
  /**
   * `keepUpdatedAt`: grava sem marcar como alteração da ficha (restaurar a cópia, copiar a carga que o aluno
   * fez). `updatedAt` diz quando a ficha foi editada de fato; o recebimento de treinos depende disso.
   */
  async saveProgram(program: Program, opts?: { keepUpdatedAt?: boolean }) {
    const saved = upsert("programs", { ...program, updatedAt: opts?.keepUpdatedAt && program.updatedAt ? program.updatedAt : new Date().toISOString() });
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
      .sort(porInicioDesc);
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
  async saveSession(session: Session) {
    return upsert("sessions", session);
  }
  /** Grava várias sessões de uma vez (carga de dados de exemplo sem reescrever a coleção a cada item). */
  saveSessionsBulk(sessions: Session[]) {
    const ids = new Set(sessions.map((s) => s.id));
    write("sessions", [...read<Session>("sessions").filter((s) => !ids.has(s.id)), ...sessions]);
  }
  saveMetricsBulk(metrics: BodyMetric[]) {
    const ids = new Set(metrics.map((m) => m.id));
    write("metrics", [...read<BodyMetric>("metrics").filter((m) => !ids.has(m.id)), ...metrics]);
  }
  async deleteSession(id: string) {
    remove("sessions", id);
  }

  // medidas ------------------------------------------------------------------
  async listMetrics(userId: string) {
    return read<BodyMetric>("metrics")
      .filter((m) => m.userId === userId)
      .sort(porDataAsc);
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
  /** `keepUpdatedAt`: grava sem marcar como alteração da dieta (restaurar a cópia). Igual a `saveProgram`. */
  async saveDiet(diet: DietPlan, opts?: { keepUpdatedAt?: boolean }) {
    const others = read<DietPlan>("diets").filter((d) => d.ownerId !== diet.ownerId);
    const saved = { ...diet, updatedAt: opts?.keepUpdatedAt && diet.updatedAt ? diet.updatedAt : new Date().toISOString() };
    write("diets", [...others, saved]);
    return saved;
  }

  // personal -----------------------------------------------------------------
  /**
   * Painel do personal. Lê cada coleção UMA vez (rodada 3, R3-6) e agrupa por aluno: com 100 alunos, antes eram 300
   * JSON.parse das coleções inteiras. O resultado é o mesmo de chamar listSessions/listPrograms/listMetrics por aluno
   * (mesmos filtros e mesma ordem; há teste de equivalência). Nada muda no formato gravado.
   */
  async listStudents(coachId: string) {
    const links = read<Link>("links").filter((l) => l.coachId === coachId);
    if (!links.length) return [];
    const perfis = new Map<string, Profile>();
    // O primeiro perfil com o id vale (como o `find` de antes).
    for (const p of read<Profile>("profiles")) if (!perfis.has(p.id)) perfis.set(p.id, p);
    const ids = new Set(links.map((l) => l.studentId).filter((id) => perfis.has(id)));
    const sessoes = agruparPor(read<Session>("sessions"), (s) => s.userId, ids);
    const fichas = agruparPor(read<Program>("programs"), (p) => p.ownerId, ids);
    const medidas = agruparPor(read<BodyMetric>("metrics"), (m) => m.userId, ids);
    const out = [];
    for (const l of links) {
      const p = perfis.get(l.studentId);
      if (!p) continue;
      out.push(
        summarizeStudent(
          p,
          l.since,
          [...(sessoes.get(p.id) ?? [])].sort(porInicioDesc),
          [...(fichas.get(p.id) ?? [])].sort(porAtivaEEdicao),
          [...(medidas.get(p.id) ?? [])].sort(porDataAsc),
        ),
      );
    }
    return out;
  }
  async createStudent(coachId: string, draft: StudentDraft) {
    const now = new Date().toISOString();
    // Marco do registro de envios (U2b): gravado antes da primeira ficha deste aluno existir, para ela nunca
    // cair em "sem informação" por o marco ter sido lido pela primeira vez só depois.
    try {
      if (!localStorage.getItem(SENT_SINCE_KEY)) localStorage.setItem(SENT_SINCE_KEY, now);
    } catch {}
    const profile: Profile = {
      ...draft,
      name: draft.name.trim(),
      id: uid(),
      role: "athlete",
      plan: "free",
      onboarded: true,
      managedBy: coachId,
      createdAt: now,
      // Autorização de dados de saúde: só a que veio no cadastro (o personal marcou "O aluno autorizou
      // registrar estes dados de saúde"). Nada é carimbado sozinho.
      // Migração da nuvem: a RPC create_managed_student (supabase/migrations/0002) ainda grava
      // consent_health_at = now() para todo aluno; deve passar a usar student_data.consentHealthAt
      // (e guardar consentSource) em vez de now().
      consentHealthAt: draft.consentHealthAt || undefined,
      consentSource: draft.consentHealthAt ? draft.consentSource : undefined,
    };
    await this.saveProfile(profile);
    this.linkDirect(coachId, profile.id, now);
    return profile;
  }
  async createInvite(coachId: string, _studentId?: string) {
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

  // personalizados ------------------------------------------------------------
  async listCustomExercises(ownerId: string) {
    return read<Owned<Exercise>>("custom_exercises")
      .filter((r) => r.ownerId === ownerId)
      .map((r) => r.item);
  }
  async saveCustomExercise(ownerId: string, exercise: Exercise) {
    const rows = read<Owned<Exercise>>("custom_exercises").filter((r) => !(r.ownerId === ownerId && r.item.id === exercise.id));
    write("custom_exercises", [...rows, { ownerId, item: { ...exercise, custom: true } }]);
    return exercise;
  }
  async deleteCustomExercise(ownerId: string, id: string) {
    write(
      "custom_exercises",
      read<Owned<Exercise>>("custom_exercises").filter((r) => !(r.ownerId === ownerId && r.item.id === id)),
    );
  }
  async listCustomFoods(ownerId: string) {
    return read<Owned<Food>>("custom_foods")
      .filter((r) => r.ownerId === ownerId)
      .map((r) => r.item);
  }
  async saveCustomFood(ownerId: string, food: Food) {
    const rows = read<Owned<Food>>("custom_foods").filter((r) => !(r.ownerId === ownerId && r.item.id === food.id));
    write("custom_foods", [...rows, { ownerId, item: food }]);
    return food;
  }
  async deleteCustomFood(ownerId: string, id: string) {
    write(
      "custom_foods",
      read<Owned<Food>>("custom_foods").filter((r) => !(r.ownerId === ownerId && r.item.id === id)),
    );
  }

  async recordUpgradeIntent(userId: string, plan: string) {
    write("intents", [...read<Intent>("intents"), { userId, plan, at: new Date().toISOString() }]);
  }

  async deleteAccount(userId: string) {
    // Rodadas do questionário do perfil apagado: só os ids, lidos antes de o perfil sumir (spec §5.7 e §11.2).
    let rodadas: string[] = [];
    try {
      rodadas = idsDasRodadas(read<Profile>("profiles").find((p) => p.id === userId));
    } catch {}
    for (const photo of await this.listPhotos(userId)) await this.deletePhoto(photo);
    write("profiles", read<Profile>("profiles").filter((p) => p.id !== userId));
    write("programs", read<Program>("programs").filter((p) => p.ownerId !== userId));
    write("sessions", read<Session>("sessions").filter((s) => s.userId !== userId));
    write("metrics", read<BodyMetric>("metrics").filter((m) => m.userId !== userId));
    write("diets", read<DietPlan>("diets").filter((d) => d.ownerId !== userId));
    write("links", read<Link>("links").filter((l) => l.studentId !== userId && l.coachId !== userId));
    write("custom_exercises", read<Owned<Exercise>>("custom_exercises").filter((r) => r.ownerId !== userId));
    write("custom_foods", read<Owned<Food>>("custom_foods").filter((r) => r.ownerId !== userId));
    clearDeliveryKeys(userId);
    // Rascunho do junto (`sr:v1:qrascunho:aluno-{id}`) e `sr:v1:qapagado:{id}` de cada rodada (só a data): a mensagem
    // antiga do WhatsApp não traz a saúde de volta sem aviso em /receber.
    try {
      esquecerQuestionarioDoAluno(userId, rodadas, new Date().toISOString());
    } catch {}
  }

  /**
   * Apaga todos os dados locais ("Apagar dados deste aparelho" e "Apagar tudo e recomeçar"): `sr:v1:*`, o registro de
   * envio (`sr:sent:*`, inclusive `@desde`), o rascunho do treino em andamento (`sr:draft:*`, com cargas) e as fotos.
   * No aparelho do personal isso inclui os alunos dele; `deleteAccount` sozinho deixaria esses dados órfãos.
   */
  async wipe() {
    storageKeys()
      .filter((k) => k.startsWith(PREFIX) || k.startsWith(SENT_PREFIX) || k.startsWith(DRAFT_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
    await new Promise<void>((res) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => res();
    });
  }
}
