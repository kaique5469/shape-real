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
    expect(r).toEqual({ added: 1, updated: 0, same: 0, mirrored: 1 });
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
    // O mesmo link de novo: nada mudou no treino, então ele "já estava no painel" (não é "atualizado").
    expect(again).toEqual({ added: 0, updated: 0, same: 1, mirrored: 0 });
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

// ---- UX0: registro de envio com evidência (sr:sent:*) ------------------------------------
const delivery = await import("./transfer-client");

describe("registro de envio (UX0)", () => {
  it("markSessionsPrepared grava canal e hora por treino, a lista antiga e :at", () => {
    delivery.markSessionsPrepared("a1", ["t1", "t2"], "whatsapp", "2026-11-23T21:40:00.000Z");
    expect(delivery.prepLog("a1")).toEqual({
      t1: { via: "whatsapp", at: "2026-11-23T21:40:00.000Z" },
      t2: { via: "whatsapp", at: "2026-11-23T21:40:00.000Z" },
    });
    expect([...sentSessionIds("a1")].sort()).toEqual(["t1", "t2"]);
    expect(storage.getItem("sr:sent:a1:at")).toBe("2026-11-23T21:40:00.000Z");
    // Reenvio por cópia: o toque mais novo vale.
    delivery.markSessionsPrepared("a1", ["t2"], "copy", "2026-11-24T10:00:00.000Z");
    expect(delivery.prepLog("a1").t2).toEqual({ via: "copy", at: "2026-11-24T10:00:00.000Z" });
    expect(delivery.prepLog("a1").t1?.via).toBe("whatsapp");
  });

  it("o log fica limitado a 200 treinos (saem os toques mais antigos)", () => {
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 205; i++) delivery.markSessionsPrepared("a1", [`t${i}`], "copy", new Date(base + i * 60_000).toISOString());
    const log = delivery.prepLog("a1");
    expect(Object.keys(log)).toHaveLength(200);
    expect(log.t0).toBeUndefined();
    expect(log.t4).toBeUndefined();
    expect(log.t5).toBeDefined();
    expect(log.t204).toBeDefined();
  });

  it("log ilegível no armazenamento não quebra nem inventa envio", () => {
    storage.setItem("sr:sent:a1:log", "{quebrado");
    expect(delivery.prepLog("a1")).toEqual({});
    storage.setItem("sr:sent:a1:log", JSON.stringify({ t1: { via: "pombo", at: "2026-11-23T21:40:00.000Z" } }));
    expect(delivery.prepLog("a1")).toEqual({});
  });

  it("markFichaPrepared grava o registro único da ficha e garante o marcador @desde", () => {
    expect(delivery.fichaSendRecord("s1")).toBeNull();
    expect(storage.getItem("sr:sent:@desde")).toBeNull();
    const rec = { at: "2026-11-20T17:02:00.000Z", via: "whatsapp" as const, programAt: "2026-11-19T10:00:00.000Z", dietAt: null };
    delivery.markFichaPrepared("s1", rec);
    expect(delivery.fichaSendRecord("s1")).toEqual(rec);
    const since = storage.getItem("sr:sent:@desde");
    expect(since).toBeTruthy();
    // O marcador não muda num segundo envio.
    delivery.markFichaPrepared("s1", { ...rec, at: "2026-11-21T10:00:00.000Z", via: "copy" });
    expect(storage.getItem("sr:sent:@desde")).toBe(since);
    expect(delivery.fichaSendRecord("s1")).toMatchObject({ at: "2026-11-21T10:00:00.000Z", via: "copy" });
    // Enviar não grava nada na ficha.
    expect(storage.getItem("sr:v1:programs")).toBeNull();
  });

  it("deliveryTrackingSince grava na primeira leitura e depois só lê", () => {
    expect(delivery.deliveryTrackingSince("2026-11-01T00:00:00.000Z")).toBe("2026-11-01T00:00:00.000Z");
    expect(delivery.deliveryTrackingSince("2026-11-30T00:00:00.000Z")).toBe("2026-11-01T00:00:00.000Z");
    storage.setItem("sr:sent:@desde", "lixo");
    expect(delivery.deliveryTrackingSince("2026-11-30T00:00:00.000Z")).toBe("2026-11-30T00:00:00.000Z");
  });

  it("recordFichaAck usa nextAck: um pacote de treinos mais antigo não faz o eco voltar atrás", () => {
    const novo = { programAt: "2026-11-20T10:00:00.000Z", treinosSentAt: "2026-11-23T18:40:00.000Z", registeredAt: "2026-11-23T19:00:00.000Z" };
    const antigo = { programAt: "2026-11-10T10:00:00.000Z", treinosSentAt: "2026-11-18T18:40:00.000Z", registeredAt: "2026-11-23T19:05:00.000Z" };
    delivery.recordFichaAck("s1", novo);
    delivery.recordFichaAck("s1", antigo);
    expect(delivery.fichaAckOf("s1")).toEqual(novo);
  });

  it("a cópia de segurança leva :log, :ficha e :ack e não leva @desde; restaurar devolve as chaves", async () => {
    await seedCoachDevice();
    delivery.markFichaPrepared("s1", { at: "2026-11-20T17:02:00.000Z", via: "copy", programAt: program.updatedAt, dietAt: null });
    delivery.recordFichaAck("s1", { programAt: program.updatedAt, treinosSentAt: "2026-11-23T18:40:00.000Z", registeredAt: "2026-11-23T19:00:00.000Z" });
    delivery.markSessionsPrepared("c1", ["x"], "whatsapp", "2026-11-22T10:00:00.000Z");
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-23T12:00:00Z"));
    expect(Object.keys(backup.sent ?? {}).sort()).toEqual(["sr:sent:c1", "sr:sent:c1:at", "sr:sent:c1:log", "sr:sent:s1:ack", "sr:sent:s1:ficha"]);
    expect(JSON.stringify(backup)).not.toContain("@desde");

    storage.clear();
    await restoreBackup(parseBackup(JSON.stringify(backup))!);
    expect(delivery.fichaSendRecord("s1")).toMatchObject({ via: "copy", programAt: program.updatedAt });
    expect(delivery.fichaAckOf("s1")?.programAt).toBe(program.updatedAt);
    expect(delivery.prepLog("c1").x?.via).toBe("whatsapp");
    expect(storage.getItem("sr:sent:@desde")).toBeNull();
  });

  it("restaurar a cópia não muda o updatedAt da dieta", async () => {
    await seedCoachDevice();
    const diet = { id: "d1", ownerId: "s1", createdBy: "c1", name: "Plano", targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 }, meals: [], updatedAt: "2026-11-10T09:00:00.000Z" };
    storage.setItem("sr:v1:diets", JSON.stringify([diet]));
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-23T12:00:00Z"));
    storage.clear();
    await restoreBackup(parseBackup(JSON.stringify(backup))!);
    expect((await localRepo.getDiet("s1"))?.updatedAt).toBe("2026-11-10T09:00:00.000Z");
  });

  it("deleteAccount apaga as chaves de envio do perfil removido; wipe apaga todas as sr:sent*", async () => {
    await seedCoachDevice();
    delivery.markFichaPrepared("s1", { at: "2026-11-20T17:02:00.000Z", via: "copy", programAt: program.updatedAt, dietAt: null });
    delivery.recordFichaAck("s1", { treinosSentAt: "2026-11-23T18:40:00.000Z", registeredAt: "2026-11-23T19:00:00.000Z" });
    delivery.markSessionsPrepared("s1", ["t1"], "copy");
    delivery.markFichaPrepared("s2", { at: "2026-11-20T17:02:00.000Z", via: "copy", programAt: null, dietAt: null });
    await localRepo.deleteAccount("s1");
    expect(storage.keys().filter((k) => k.startsWith("sr:sent:s1"))).toEqual([]);
    expect(delivery.fichaSendRecord("s2")).not.toBeNull();

    vi.stubGlobal("indexedDB", {
      deleteDatabase: () => {
        const req: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
    });
    storage.setItem("outra:chave", "fica");
    await localRepo.wipe();
    expect(storage.keys().filter((k) => k.startsWith("sr:sent"))).toEqual([]);
    expect(storage.keys().filter((k) => k.startsWith("sr:v1:"))).toEqual([]);
    expect(storage.getItem("outra:chave")).toBe("fica");
  });

  it("clearDeliveryKeys também sai por @/lib/transfer-client", () => {
    delivery.markSessionsPrepared("a9", ["t1"], "copy");
    delivery.clearDeliveryKeys("a9");
    expect(storage.keys().filter((k) => k.startsWith("sr:sent:a9"))).toEqual([]);
  });
});

describe("situação do envio da ficha no aparelho do personal (U2b)", () => {
  const versions = async (id: string) => {
    const p = (await localRepo.listPrograms(id)).find((x) => x.active);
    return { programAt: p?.updatedAt ?? null, dietAt: null };
  };

  it("ficha de antes do registro: nada é afirmado; a 1ª leitura grava o marcador @desde", async () => {
    await seedCoachDevice();
    expect(storage.getItem("sr:sent:@desde")).toBeNull();
    expect(delivery.readFichaDelivery("s1", await versions("s1")).program).toEqual({ kind: "desconhecido" });
    expect(storage.getItem("sr:sent:@desde")).toBeTruthy();
  });

  it("toque grava as versões que foram; editar e salvar a ficha depois → 'mudou'; finalizar treino e copiar carga não mudam", async () => {
    await seedCoachDevice();
    delivery.markFichaPrepared("s1", { at: "2026-11-20T17:02:00.000Z", via: "copy", ...(await versions("s1")) });
    expect(delivery.readFichaDelivery("s1", await versions("s1")).program).toEqual({ kind: "enviado", at: "2026-11-20T17:02:00.000Z", via: "copy" });
    // Copiar a carga do aluno (receber treinos) grava com keepUpdatedAt: continua a mesma versão.
    await importTreinos(buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [treino("t1", "2026-11-21T10:00:00Z", 45, "s1")] }), "s1");
    expect(delivery.readFichaDelivery("s1", await versions("s1")).program.kind).toBe("enviado");
    // Edição de verdade (o editor grava sem a opção).
    const p = (await localRepo.listPrograms("s1")).find((x) => x.active)!;
    await localRepo.saveProgram({ ...p, name: "ABC Hipertrofia 2" });
    expect(delivery.readFichaDelivery("s1", await versions("s1")).program).toEqual({ kind: "mudou", sentAt: "2026-11-20T17:02:00.000Z", studentVersion: null });
  });

  it("aluno com ficha montada depois do marcador e nunca enviada → 'ainda não foi para o app'", async () => {
    delivery.deliveryTrackingSince("2026-11-01T00:00:00.000Z");
    await seedCoachDevice();
    await localRepo.saveProgram({ ...program, id: "p2", ownerId: "s1" });
    expect(delivery.readFichaDelivery("s1", await versions("s1")).program).toEqual({ kind: "nao_enviado" });
  });
});

describe("/receber: novo, atualizado e já no painel (U2d)", () => {
  it("o mesmo pacote de novo → { added: 0, updated: 0, same: 1, mirrored: 0 }, sem regravar", async () => {
    await seedCoachDevice();
    const packet = buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [treino("t1", "2026-11-05T18:00:00Z", 42.5)] });
    expect(await importTreinos(packet, "s1")).toEqual({ added: 1, updated: 0, same: 0, mirrored: 1 });
    expect(await importTreinos(packet, "s1")).toEqual({ added: 0, updated: 0, same: 1, mirrored: 0 });
    // Pelo link (nulos tirados, ordem de chaves do JSON) continua igual.
    const viaLink = JSON.parse(JSON.stringify(packet, (_k, v) => (v === null ? undefined : v)));
    expect(await importTreinos(viaLink, "s1")).toEqual({ added: 0, updated: 0, same: 1, mirrored: 0 });
    expect(await localRepo.listSessions("s1")).toHaveLength(1);
  });

  it("anotação mudada → updated 1; um treino novo junto → added 1", async () => {
    await seedCoachDevice();
    const t1 = treino("t1", "2026-11-05T18:00:00Z", 42.5);
    await importTreinos(buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [t1] }), "s1");
    const r = await importTreinos(buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [{ ...t1, note: "ombro ok" }, treino("t2", "2026-11-07T18:00:00Z", 42.5)] }), "s1");
    expect(r).toMatchObject({ added: 1, updated: 1, same: 0 });
    expect((await localRepo.listSessions("s1")).find((s) => s.id === "t1")?.note).toBe("ombro ok");
  });
});

describe("eco da versão da ficha (U2c)", async () => {
  const { receivedFichaVersao, fichaVersionsOf } = await import("./transfer-client");
  const fichaPk = (p: Program = program, d: Parameters<typeof buildFichaPacket>[0]["diet"] = null) => buildFichaPacket({ coach, student, program: p, diet: d, customExercises: [remada], customFoods: [] });
  const diet = { id: "d1", ownerId: "s1", createdBy: "c1", name: "Plano", targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 }, meals: [{ uid: "m1", name: "Café", items: [{ uid: "i1", name: "Ovo", grams: 50, kcal: 70, proteinG: 6, carbsG: 0, fatG: 5 }] }], updatedAt: "2026-11-02T10:00:00.000Z" };

  describe("importFicha grava remoteCoach.recebido (aparelho do aluno)", () => {
    it("a versão vem do pacote, antes de a ficha ser gravada com a hora local", async () => {
      const aluna = await importFicha(fichaPk(program, diet), null);
      expect(aluna.remoteCoach?.recebido).toEqual({ programAt: program.updatedAt, dietAt: diet.updatedAt });
      expect((await localRepo.getProfile(aluna.id))?.remoteCoach?.recebido).toEqual({ programAt: program.updatedAt, dietAt: diet.updatedAt });
      // A ficha local ganhou a hora da importação; a versão guardada é a do personal.
      expect((await localRepo.getProgram("p1"))?.updatedAt).not.toBe(program.updatedAt);
    });

    it("pacote sem dieta mantém o dietAt anterior com o mesmo personal", async () => {
      const aluna = await importFicha(fichaPk(program, diet), null);
      const again = await importFicha(fichaPk({ ...program, updatedAt: "2026-11-12T10:00:00.000Z" }), aluna);
      expect(again.remoteCoach?.recebido).toEqual({ programAt: "2026-11-12T10:00:00.000Z", dietAt: diet.updatedAt });
    });

    it("ficha de outro personal zera o que não veio", async () => {
      const aluna = await importFicha(fichaPk(program, diet), null);
      const outro = buildFichaPacket({ coach: { ...coach, id: "c9", name: "Camila Souza" }, student, program: { ...program, id: "p9", updatedAt: "2026-11-15T10:00:00.000Z" }, diet: null, customExercises: [remada], customFoods: [] });
      const depois = await importFicha(outro, aluna);
      expect(depois.remoteCoach).toMatchObject({ id: "c9", recebido: { programAt: "2026-11-15T10:00:00.000Z" } });
      expect(depois.remoteCoach?.recebido).not.toHaveProperty("dietAt");
    });
  });

  describe("importTreinos grava o eco (aparelho do personal)", () => {
    const echo = { programAt: program.updatedAt };
    const pk = (over: { ficha?: { programAt?: string; dietAt?: string }; coachId?: string; studentRef?: string; now?: string } = {}) =>
      buildTreinosPacket({ student, coachId: over.coachId ?? "c1", studentRef: over.studentRef ?? "s1", sessions: [treino("t1", "2026-11-05T18:00:00Z", 40)], ficha: "ficha" in over ? over.ficha : echo, now: new Date(over.now ?? "2026-11-22T10:00:00.000Z") });

    it("só com packet.ficha, o personal deste aparelho (coachId) e o mesmo aluno", async () => {
      await seedCoachDevice();
      await importTreinos(pk(), "s1"); // sem coachId: não grava
      expect(delivery.fichaAckOf("s1")).toBeNull();
      await importTreinos(pk(), "s1", { coachId: "c2" }); // outro personal
      expect(delivery.fichaAckOf("s1")).toBeNull();
      await importTreinos(pk({ ficha: undefined }), "s1", { coachId: "c1" }); // link antigo, sem eco
      expect(delivery.fichaAckOf("s1")).toBeNull();
      await importTreinos(pk({ studentRef: "outro-aluno" }), "s1", { coachId: "c1" }); // aluno escolhido à mão
      expect(delivery.fichaAckOf("s1")).toBeNull();
      await importTreinos(pk(), "s1", { coachId: "c1" });
      expect(delivery.fichaAckOf("s1")).toMatchObject({ programAt: program.updatedAt, treinosSentAt: "2026-11-22T10:00:00.000Z" });
      expect(delivery.fichaAckOf("s1")).not.toHaveProperty("dietAt");
    });

    it("um pacote antigo (mais velho) registrado depois não faz o eco voltar atrás", async () => {
      await seedCoachDevice();
      await importTreinos(pk({ ficha: { programAt: "2026-11-20T10:00:00.000Z" }, now: "2026-11-23T10:00:00.000Z" }), "s1", { coachId: "c1" });
      await importTreinos(pk({ ficha: { programAt: "2026-11-01T10:00:00.000Z" }, now: "2026-11-18T10:00:00.000Z" }), "s1", { coachId: "c1" });
      expect(delivery.fichaAckOf("s1")?.programAt).toBe("2026-11-20T10:00:00.000Z");
    });

    it("de ponta a ponta: copiar, aluna salva e manda o treino, registrar → 'está com a ficha atual'; editar → 'mudou'", async () => {
      // Personal copia a mensagem (registro único com as versões que foram).
      await seedCoachDevice();
      const versions = await fichaVersionsOf("s1");
      expect(versions).toEqual({ programAt: program.updatedAt, dietAt: null });
      delivery.markFichaPrepared("s1", { at: "2026-11-20T17:02:00.000Z", via: "copy", ...versions });
      const ficha = fichaPk((await localRepo.listPrograms("s1")).find((p) => p.active)!);
      const coachDevice = JSON.stringify([...storage.keys()].map((k) => [k, storage.getItem(k)]));

      // Aparelho da aluna: abre o link e manda um treino; o pacote leva a versão que chegou.
      storage.clear();
      const aluna = await importFicha(ficha, null);
      const treinos = buildTreinosPacket({ student: aluna, coachId: aluna.remoteCoach!.id, studentRef: aluna.remoteCoach!.studentRef, sessions: [treino("t9", "2026-11-21T18:00:00Z", 40, aluna.id)], ficha: aluna.remoteCoach!.recebido });
      expect(treinos.ficha).toEqual({ programAt: program.updatedAt });

      // De volta ao personal: registra em /receber.
      storage.clear();
      for (const [k, v] of JSON.parse(coachDevice) as [string, string][]) storage.setItem(k, v);
      expect(await receivedFichaVersao(treinos, "s1", "c1")).toBe("atual");
      await importTreinos(treinos, "s1", { coachId: "c1" });
      const d = delivery.readFichaDelivery("s1", await fichaVersionsOf("s1"));
      expect(d.program).toMatchObject({ kind: "confirmado" });

      // O personal edita e salva: deixa de estar confirmado.
      const p = (await localRepo.listPrograms("s1")).find((x) => x.active)!;
      await localRepo.saveProgram({ ...p, name: "ABC Hipertrofia 2" });
      expect(delivery.readFichaDelivery("s1", await fichaVersionsOf("s1")).program).toEqual({ kind: "mudou", sentAt: "2026-11-20T17:02:00.000Z", studentVersion: program.updatedAt });
      expect(await receivedFichaVersao(treinos, "s1", "c1")).toBe("anterior");
      expect(await receivedFichaVersao(treinos, "s1", "c2")).toBe("sem_info");
      expect(await receivedFichaVersao({ ...treinos, ficha: undefined }, "s1", "c1")).toBe("sem_info");
    });
  });
});
