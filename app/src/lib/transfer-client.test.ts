import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyMetric, Exercise, Profile, Program, Session } from "@/lib/domain/types";

/** localStorage em memória: os testes rodam sem navegador. */
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  keys() {
    return [...this.m.keys()];
  }
}
const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);

// O cliente grava no repositório local de verdade (sem o resto do app: nuvem, demonstração, medição).
vi.mock("@/lib/app-context", async () => {
  const { LocalRepository } = await import("@/lib/data/local");
  return { localRepo: new LocalRepository() };
});
const tracked: { event: string; props: Record<string, unknown> }[] = [];
vi.mock("@/lib/analytics", () => ({
  track: (event: string, props: Record<string, unknown> = {}) => tracked.push({ event, props }),
  reportError: () => {},
}));

const { localRepo } = await import("@/lib/app-context");
const { lastBackupAt } = await import("@/lib/data/local");
const { buildFichaPacket, buildTreinosPacket } = await import("@/lib/domain/transfer");
const { collectBackup, importFicha, importTreinos, makeBackup, markSessionsSent, parseBackup, restoreBackup, sentSessionIds } = await import("./transfer-client");

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const student: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1" };
const remada: Exercise = { id: "custom_remada", name: "Remada articulada", group: "costas", implement: "maquina", pattern: "puxar_h", compound: true, custom: true };
const program: Program = {
  id: "p1",
  ownerId: "s1",
  createdBy: "c1",
  name: "ABC Hipertrofia",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [
    {
      key: "A",
      title: "Peito e costas",
      focus: ["peito"],
      exercises: [
        { uid: "u1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: 4, repsMin: 8, repsMax: 10, restSec: 120, loadKg: 40, technique: "normal" },
        { uid: "u2", exerciseId: "custom_remada", name: "Remada articulada", sets: 3, repsMin: 10, repsMax: 12, restSec: 90, loadKg: 30, technique: "normal" },
      ],
    },
  ],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};

function treino(id: string, startedAt: string, supino: number, userId = "aluno-local"): Session {
  return {
    id,
    userId,
    programId: "p1",
    dayKey: "A",
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + 50 * 60000).toISOString(),
    exercises: [{ uid: "e1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: [{ loadKg: 40, reps: 10, done: true }, { loadKg: supino, reps: 8, done: true }] }],
    volumeKg: 0,
    prs: [],
  };
}

async function seedCoachDevice() {
  await localRepo.saveProfile(coach);
  await localRepo.saveProfile(student);
  localRepo.linkDirect("c1", "s1", "2026-11-01T00:00:00Z");
  await localRepo.saveCustomExercise("c1", remada);
  await localRepo.saveProgram(program, { keepUpdatedAt: true });
}

const supinoLoad = async (ownerId: string) => (await localRepo.listPrograms(ownerId)).find((p) => p.active)?.days[0]?.exercises[0]?.loadKg;

beforeEach(() => {
  storage.clear();
  tracked.length = 0;
});

describe("recebimento dos treinos no aparelho do personal", () => {
  it("aluno treina com 42,5 kg e devolve: a ficha do personal passa a 42,5 e o reenvio leva a carga atual", async () => {
    await seedCoachDevice();
    const packet = buildTreinosPacket({ student: { ...student, id: "aluno-local" }, coachId: "c1", studentRef: "s1", sessions: [treino("t1", "2026-11-05T18:00:00Z", 42.5)] });
    const r = await importTreinos(packet, "s1");
    expect(r).toEqual({ added: 1, updated: 0, mirrored: 1 });
    expect(await supinoLoad("s1")).toBe(42.5);
    // Copiar a carga não conta como edição da ficha.
    expect((await localRepo.getProgram("p1"))?.updatedAt).toBe(program.updatedAt);

    // Reenvio sem editar → no celular da aluna a ficha continua com 42,5.
    const active = (await localRepo.listPrograms("s1")).find((p) => p.active)!;
    const ficha = buildFichaPacket({ coach, student, program: active, diet: null, customExercises: [remada], customFoods: [] });
    storage.clear();
    const aluna = await importFicha(ficha, null);
    expect(await supinoLoad(aluna.id)).toBe(42.5);
  });

  it("personal baixou a carga depois do treino: reimportar o mesmo link não desfaz a redução", async () => {
    await seedCoachDevice();
    const packet = buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [treino("t1", "2026-11-05T18:00:00Z", 42.5)] });
    await importTreinos(packet, "s1");
    const p = (await localRepo.getProgram("p1"))!;
    await localRepo.saveProgram({ ...p, days: [{ ...p.days[0]!, exercises: [{ ...p.days[0]!.exercises[0]!, loadKg: 37.5 }, p.days[0]!.exercises[1]!] }] });
    const again = await importTreinos(packet, "s1");
    expect(again).toEqual({ added: 0, updated: 1, mirrored: 0 });
    expect(await supinoLoad("s1")).toBe(37.5);
  });

  it("aluno que já tem a ficha: reenvio antigo não apaga a carga de um treino que ele ainda não devolveu", async () => {
    // Aparelho da aluna: ficha recebida e um treino feito depois, com 45 kg, ainda não enviado.
    const ficha = buildFichaPacket({ coach, student, program, diet: null, customExercises: [remada], customFoods: [] });
    const aluna = await importFicha(ficha, null);
    await localRepo.saveSession(treino("t2", "2026-11-09T18:00:00Z", 45, aluna.id));
    await importFicha(ficha, aluna);
    expect(await supinoLoad(aluna.id)).toBe(45);
    // Se o personal editou a ficha depois desse treino, vale a edição dele.
    await importFicha({ ...ficha, program: { ...program, updatedAt: "2026-11-10T08:00:00Z" } }, aluna);
    expect(await supinoLoad(aluna.id)).toBe(40);
  });

  it("medida da aluna na data da avaliação não apaga cintura nem % de gordura do personal", async () => {
    await seedCoachDevice();
    const avaliacao: BodyMetric = { id: "av1", userId: "s1", date: "2026-11-10", weightKg: 63.2, bodyFatPct: 24.5, waistCm: 71 };
    await localRepo.saveMetric(avaliacao);
    const packet = buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [], metrics: [{ id: "m1", userId: "aluno-local", date: "2026-11-10", weightKg: 62.8, thighCm: 55 }] });
    await importTreinos(packet, "s1");
    expect(await localRepo.listMetrics("s1")).toEqual([{ ...avaliacao, thighCm: 55 }]);
  });
});

describe("cópia de segurança", () => {
  it("personal: um arquivo com alunos e exercícios próprios; restaurar num aparelho limpo não deixa exercício faltando", async () => {
    await seedCoachDevice();
    await localRepo.saveSession(treino("t1", "2026-11-05T18:00:00Z", 42.5, "s1"));
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-22T12:00:00Z"));
    expect(backup.v).toBe(2);
    expect(backup.customExercises?.map((e) => e.id)).toEqual(["custom_remada"]);
    expect(backup.students?.map((s) => s.profile.id)).toEqual(["s1"]);

    storage.clear();
    const parsed = parseBackup(JSON.stringify(backup))!;
    const r = await restoreBackup(parsed);
    expect(r).toEqual({ profile: coach, students: 1 });
    const custom = new Set((await localRepo.listCustomExercises("c1")).map((e) => e.id));
    const used = (await localRepo.listPrograms("s1")).flatMap((p) => p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))).filter((id) => id.startsWith("custom_"));
    expect(used).toEqual(["custom_remada"]);
    expect(used.every((id) => custom.has(id))).toBe(true);
    expect(await localRepo.listSessions("s1")).toHaveLength(1);
    expect((await localRepo.listStudents("c1")).map((s) => s.profile.id)).toEqual(["s1"]);
    // A data da ficha é a da edição, não a da restauração.
    expect((await localRepo.getProgram("p1"))?.updatedAt).toBe(program.updatedAt);
    // O lembrete conta a partir da data do arquivo.
    expect(lastBackupAt()).toBe("2026-11-22T12:00:00.000Z");
  });

  it("aluno por link: o personal, os exercícios dele e os treinos já enviados voltam junto", async () => {
    const ficha = buildFichaPacket({ coach, student, program, diet: null, customExercises: [remada], customFoods: [] });
    const aluna = await importFicha(ficha, null);
    await localRepo.saveSession(treino("t1", "2026-11-05T18:00:00Z", 42.5, aluna.id));
    markSessionsSent(aluna.id, ["t1"]);
    const backup = await collectBackup(localRepo, (await localRepo.getProfile(aluna.id))!);
    expect(backup.remoteCoach?.profile.id).toBe("c1");
    expect(Object.keys(backup.sent ?? {})).toEqual([`sr:sent:${aluna.id}`, `sr:sent:${aluna.id}:at`]);

    storage.clear();
    await restoreBackup(parseBackup(JSON.stringify(backup))!);
    expect((await localRepo.listCustomExercises("c1")).map((e) => e.id)).toEqual(["custom_remada"]);
    expect(await localRepo.getCoach(aluna.id)).toEqual({ id: "c1", name: "Rafael Nunes" });
    expect([...sentSessionIds(aluna.id)]).toEqual(["t1"]);
    expect(await supinoLoad(aluna.id)).toBe(40);
  });

  it("sem compartilhar arquivos (Chrome do Android): baixa o arquivo, guarda a data e mede só faixa e caminho", async () => {
    await seedCoachDevice();
    const clicks: string[] = [];
    vi.stubGlobal("navigator", { share: async () => {}, canShare: () => false });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    vi.stubGlobal("document", { createElement: () => ({ click() { clicks.push(this.download); }, remove() {}, download: "", href: "" }), body: { appendChild: () => {} } });
    const r = await makeBackup(localRepo, coach, "conta");
    expect(r?.via).toBe("download");
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^shape-real-copia-\d{4}-\d{2}-\d{2}\.json$/);
    expect(lastBackupAt()).not.toBeNull();
    expect(tracked).toEqual([{ event: "backup_shared", props: { dias_desde_ultima: "nunca", via: "download", onde: "conta", alunos: 1 } }]);
  });

  it("com compartilhar arquivos (iPhone): abre o compartilhar; fechar sem salvar não conta como cópia", async () => {
    await seedCoachDevice();
    const shared: File[][] = [];
    let cancel = false;
    vi.stubGlobal("navigator", {
      canShare: (d: { files?: File[] }) => Boolean(d.files?.length),
      share: async (d: { files: File[] }) => {
        if (cancel) throw new DOMException("cancelado", "AbortError");
        shared.push(d.files);
      },
    });
    expect((await makeBackup(localRepo, coach, "hoje"))?.via).toBe("share");
    expect(shared[0]?.[0]?.type).toBe("application/json");
    expect(JSON.parse(await shared[0]![0]!.text())).toMatchObject({ format: "shape-real-copia", v: 2 });
    storage.removeItem("sr:v1:last-backup-at");
    cancel = true;
    expect(await makeBackup(localRepo, coach, "hoje")).toBeNull();
    expect(lastBackupAt()).toBeNull();
  });
});

describe("ficha recebida por link: autorização de saúde e CREF", () => {
  // O personal já tinha a autorização da aluna no aparelho dele: ela não viaja no link.
  const withConsent: Profile = { ...student, limitations: "Dor no joelho", consentHealthAt: "2026-10-01T00:00:00Z", consentSource: "personal" };
  const signed = () => buildFichaPacket({ coach: { ...coach, cref: "012345-G/SP", phone: "11999990000" }, student: withConsent, program, diet: null, customExercises: [remada], customFoods: [] });

  it("sem o toque em salvar com autorização, nenhuma data de autorização é gravada", async () => {
    const aluna = await importFicha(signed(), null);
    expect(aluna.consentHealthAt).toBeUndefined();
    expect(aluna.consentSource).toBeUndefined();
    expect((await localRepo.getProfile(aluna.id))?.consentHealthAt).toBeUndefined();
  });

  it("com { consent: true } a autorização fica registrada como vinda do link", async () => {
    const aluna = await importFicha(signed(), null, { consent: true });
    expect(aluna.consentHealthAt).toBeTruthy();
    expect(aluna.consentSource).toBe("aluno_link");
    expect((await localRepo.getProfile(aluna.id))?.consentSource).toBe("aluno_link");
  });

  it("o CREF do personal chega ao remoteCoach e ao contato do personal neste aparelho", async () => {
    const aluna = await importFicha(signed(), null);
    expect(aluna.remoteCoach).toMatchObject({ id: "c1", name: "Rafael Nunes", cref: "012345-G/SP" });
    expect((await localRepo.getProfile("c1"))?.cref).toBe("012345-G/SP");
  });
});
