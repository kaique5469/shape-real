import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyMetric, DietPlan, Exercise, Profile, Program, Session } from "@/lib/domain/types";

// R3-6 A (restaurar sem perder nada: foto em memória, validação, versão futura, plano que não desfaz edição mais nova),
// R3-13 ("Remover aluno" + restaurar não traz a saúde de volta no mesmo aparelho) e o R3-1 da restauração (a cópia de um
// aluno no aparelho do personal não regrava o perfil dele). Repositório local de verdade, localStorage em memória com
// falha injetável por chave. Dados fictícios.

class MemStorage {
  m = new Map<string, string>();
  falharEm: RegExp | null = null;
  travarDepoisDaFalha = false;
  private travado = false;
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
    if (this.travado || (this.falharEm && this.falharEm.test(k))) {
      if (this.travarDepoisDaFalha) this.travado = true;
      throw new DOMException("cota", "QuotaExceededError");
    }
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  reset() {
    this.m.clear();
    this.falharEm = null;
    this.travarDepoisDaFalha = false;
    this.travado = false;
  }
}
const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);

vi.mock("@/lib/app-context", async () => {
  const { LocalRepository } = await import("@/lib/data/local");
  return { localRepo: new LocalRepository() };
});
vi.mock("@/lib/analytics", () => ({ track: () => {}, reportError: () => {} }));

const { localRepo } = await import("@/lib/app-context");
const { ArmazenamentoIncompleto, TEXTO_COTA_LOCAL, TEXTO_RESTAURACAO_INCOMPLETA, lastBackupAt } = await import("@/lib/data/local");
const { buildFichaPacket } = await import("@/lib/domain/transfer");
const { CopiaRecusada, lerCopia, textoRodadasOmitidas } = await import("@/lib/domain/export");
const { anamneseBase } = await import("@/lib/domain/anamnese-fixtures");
const { collectBackup, declaracoesDeEnvio, importFicha, markFichaPrepared, markSessionsPrepared, planejarRestauracao, restoreBackup } = await import("./transfer-client");
const { declareSessionsSent } = await import("./transfer-client");

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-10-01T10:00:00Z", phone: "11999990000", cref: "012345-G/SP" };
const sA: Profile = { id: "sA", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T10:00:00Z", managedBy: "c1" };
const sB: Profile = { id: "sB", name: "Beatriz Lima", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T10:00:00Z", managedBy: "c1" };
const remada: Exercise = { id: "custom_remada", name: "Remada articulada", group: "costas", implement: "maquina", pattern: "puxar_h", compound: true, custom: true };
const prog = (id: string, ownerId: string, name = "ABC", updatedAt = "2026-11-01T10:00:00Z", active = true): Program => ({
  id,
  ownerId,
  createdBy: "c1",
  name,
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [{ key: "A", title: "A", focus: ["peito"], exercises: [{ uid: "u1", exerciseId: "custom_remada", name: "Remada articulada", sets: 3, repsMin: 8, repsMax: 10, restSec: 90, loadKg: 40, technique: "normal" }] }],
  active,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt,
});
const sess = (id: string, userId: string, load = 40): Session => ({
  id,
  userId,
  programId: "pA",
  dayKey: "A",
  startedAt: "2026-11-05T18:00:00Z",
  finishedAt: "2026-11-05T18:50:00Z",
  exercises: [{ uid: "e1", exerciseId: "supino_reto_barra", name: "Supino", sets: [{ loadKg: load, reps: 10, done: true }] }],
  volumeKg: load * 10,
  prs: [],
});
const medida = (id: string, userId: string): BodyMetric => ({ id, userId, date: "2026-11-10", weightKg: 62 });
const dieta = (ownerId: string, updatedAt = "2026-11-02T10:00:00Z"): DietPlan => ({ id: `d-${ownerId}`, ownerId, createdBy: "c1", name: "Plano", targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 }, meals: [], updatedAt });

/** O arquivo como o diálogo lê (JSON → lerCopia). */
function ler<T>(backup: T): T {
  const r = lerCopia(JSON.stringify(backup));
  if (!("copia" in r)) throw new Error(`cópia recusada: ${r.problema}`);
  return r.copia as T;
}

/** Foto do armazenamento inteiro (o Map), para comparar antes e depois. */
const tudo = () => new Map(storage.m);
const contagens = async () => ({
  perfis: localRepo.listLocalProfiles().length,
  alunos: (await localRepo.listStudents("c1")).length,
  fichas: (await localRepo.listPrograms("sA")).length + (await localRepo.listPrograms("sB")).length,
  treinos: (await localRepo.listSessions("sA")).length + (await localRepo.listSessions("sB")).length,
  medidas: (await localRepo.listMetrics("sA")).length,
});

async function aparelhoDoPersonal() {
  await localRepo.saveProfile(coach);
  await localRepo.saveProfile(sA);
  await localRepo.saveProfile(sB);
  localRepo.linkDirect("c1", "sA", "2026-11-01T00:00:00Z");
  localRepo.linkDirect("c1", "sB", "2026-11-01T00:00:00Z");
  await localRepo.saveCustomExercise("c1", remada);
  await localRepo.saveCustomFood("c1", { id: "custom_pao", name: "Pão da padaria", aliases: [], kcal: 270, p: 9, c: 50, f: 3, category: "carbo" } as never);
  await localRepo.saveProgram(prog("pA", "sA"), { keepUpdatedAt: true });
  await localRepo.saveProgram(prog("pB", "sB"), { keepUpdatedAt: true });
  await localRepo.saveSession(sess("t1", "sA"));
  await localRepo.saveSession(sess("t2", "sB"));
  await localRepo.saveMetric(medida("m1", "sA"));
  await localRepo.saveDiet(dieta("sA"), { keepUpdatedAt: true });
  markFichaPrepared("sA", { at: "2026-11-02T10:00:00.000Z", via: "copy", programAt: "2026-11-01T10:00:00Z", dietAt: null });
}

beforeEach(() => storage.reset());

describe("foto em memória: cota no meio da restauração (QA-22)", () => {
  const alvos: [string, RegExp][] = [
    ["custom_exercises", /^sr:v1:custom_exercises$/],
    ["custom_foods", /^sr:v1:custom_foods$/],
    ["profiles", /^sr:v1:profiles$/],
    ["programs", /^sr:v1:programs$/],
    ["sessions", /^sr:v1:sessions$/],
    ["metrics", /^sr:v1:metrics$/],
    ["diets", /^sr:v1:diets$/],
    ["links", /^sr:v1:links$/],
    ["sr:sent", /^sr:sent:sA:ficha$/],
    ["marca de apagado", /^sr:v1:qapagado:/],
    ["data da cópia", /^sr:v1:last-backup-at$/],
  ];

  for (const [nome, alvo] of alvos) {
    it(`falha em ${nome}: o armazenamento fica igual ao de antes e a mensagem não fala de nuvem`, async () => {
      await aparelhoDoPersonal();
      const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T12:00:00Z"));
      backup.apagadas = { "rodada-velha": "2026-11-10T10:00:00.000Z" };
      // Aparelho com dados próprios diferentes (a volta tem o que regravar) e aparelho limpo.
      for (const prep of [async () => localRepo.saveProfile({ ...coach, name: "Rafael (aparelho)" }), async () => undefined]) {
        storage.reset();
        await prep();
        const antes = tudo();
        storage.falharEm = alvo;
        const erro = await restoreBackup(backup).then(
          () => null,
          (e: Error) => e,
        );
        storage.falharEm = null;
        expect(erro?.message, nome).toBe(TEXTO_COTA_LOCAL);
        expect(erro?.message).not.toMatch(/nuvem/);
        expect(tudo(), nome).toEqual(antes);
      }
    });
  }

  it("a volta também falha: 'A restauração ficou incompleta. Restaure de novo o mesmo arquivo.' (nunca sucesso)", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T12:00:00Z"));
    storage.reset();
    await localRepo.saveProfile({ ...coach, name: "Rafael (aparelho)" });
    storage.falharEm = /^sr:v1:sessions$/;
    storage.travarDepoisDaFalha = true;
    const erro = await restoreBackup(backup).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ArmazenamentoIncompleto);
    expect((erro as Error).message).toBe(TEXTO_RESTAURACAO_INCOMPLETA);
  });

  it("teste negativo: sem falha, nenhum resto da foto no armazenamento e o resultado de sempre", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T12:00:00Z"));
    storage.reset();
    const r = await restoreBackup(ler(backup));
    expect(r).toMatchObject({ profile: coach, students: 2, rodadasOmitidas: [] });
    expect([...storage.m.keys()].every((k) => k.startsWith("sr:v1:") || k.startsWith("sr:sent:"))).toBe(true);
    expect(await contagens()).toEqual({ perfis: 3, alunos: 2, fichas: 2, treinos: 2, medidas: 1 });
    expect(lastBackupAt()).toBe("2026-11-20T12:00:00.000Z");
  });
});

describe("validação antes da 1ª escrita e versão futura", () => {
  it("arquivo com sessions[0].exercises = 'x' ou v = 99: recusado, sem escrita", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach);
    const ruim = { ...backup, students: [{ ...backup.students![0]!, sessions: [{ id: "x1", startedAt: "2026-11-05T18:00:00Z", exercises: "x" }] }] };
    expect(lerCopia(JSON.stringify(ruim))).toEqual({ problema: "invalido" });
    expect(lerCopia(JSON.stringify({ ...backup, v: 99 }))).toEqual({ problema: "versao_nova" });
    storage.reset();
    const antes = tudo();
    // Mesmo chamada direto (sem passar pela leitura do arquivo), a restauração recusa a versão futura.
    await expect(restoreBackup({ ...backup, v: 99 })).rejects.toBeInstanceOf(CopiaRecusada);
    await expect(restoreBackup({ ...backup, format: "outro" as never })).rejects.toBeInstanceOf(CopiaRecusada);
    expect(tudo()).toEqual(antes);
  });

  it("restaurar o mesmo arquivo 2 vezes dá as mesmas contagens; a segunda não tem nada a entrar", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T12:00:00Z"));
    storage.reset();
    await restoreBackup(backup);
    const primeira = await contagens();
    const plano = planejarRestauracao(backup);
    expect(plano).toMatchObject({ entram: 0, mantidos: 0, deOutroPerfil: 0 });
    const r = await restoreBackup(backup);
    expect(await contagens()).toEqual(primeira);
    expect(r.plano.entram).toBe(0);
  });
});

describe("plano de restauração (R3-6 A.4)", () => {
  it("ficha editada em 25/11 e treino corrigido depois da cópia de 20/11 ficam como estão", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T10:00:00Z"));
    await localRepo.saveProgram(prog("pA", "sA", "ABC editada", "2026-11-25T10:00:00Z"), { keepUpdatedAt: true });
    await localRepo.saveSession(sess("t1", "sA", 50));
    const plano = planejarRestauracao(backup);
    expect(plano.mantidos).toBe(2);
    const r = await restoreBackup(backup);
    expect(r.plano.mantidos).toBe(2);
    expect((await localRepo.getProgram("pA"))).toMatchObject({ name: "ABC editada", updatedAt: "2026-11-25T10:00:00Z" });
    expect((await localRepo.listSessions("sA"))[0]?.exercises[0]?.sets[0]?.loadKg).toBe(50);
  });

  it("cenário provável: recuperar um aluno removido por engano não desfaz as edições recentes dos outros alunos", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date(Date.now() - 60_000));
    // Depois da cópia: a ficha e um treino de Beatriz mudam, e Marina é removida por engano.
    await localRepo.saveProgram(prog("pB", "sB", "Ficha nova da Beatriz", new Date().toISOString()), { keepUpdatedAt: true });
    await localRepo.saveSession(sess("t2", "sB", 55));
    await localRepo.deleteAccount("sA");
    await restoreBackup(backup);
    expect((await localRepo.listStudents("c1")).map((s) => s.profile.id).sort()).toEqual(["sA", "sB"]);
    expect((await localRepo.listPrograms("sA")).map((p) => p.id)).toEqual(["pA"]);
    expect((await localRepo.listSessions("sA")).map((s) => s.id)).toEqual(["t1"]);
    expect((await localRepo.getProgram("pB"))?.name).toBe("Ficha nova da Beatriz");
    expect((await localRepo.listSessions("sB"))[0]?.exercises[0]?.sets[0]?.loadKg).toBe(55);
  });

  it("a ficha ativa escolhida no aparelho continua ativa", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T10:00:00Z"));
    await localRepo.saveProgram(prog("pA2", "sA", "Ficha 2", "2026-11-22T10:00:00Z"));
    expect((await localRepo.listPrograms("sA")).find((p) => p.active)?.id).toBe("pA2");
    await restoreBackup(backup);
    expect((await localRepo.listPrograms("sA")).find((p) => p.active)?.id).toBe("pA2");
  });

  it("teste negativo: aparelho vazio → tudo entra e o plano mostra 0 mantidos", async () => {
    await aparelhoDoPersonal();
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T10:00:00Z"));
    storage.reset();
    const plano = planejarRestauracao(backup);
    expect(plano).toMatchObject({ mantidos: 0, deOutroPerfil: 0, iguais: 0, alunosQueJaEstao: 0, perfilJaEsta: false });
    expect(plano.entram).toBeGreaterThan(0);
    // Planejar só lê.
    expect(storage.m.size).toBe(0);
  });
});

describe("R3-13: 'Remover aluno' + restaurar no mesmo aparelho", () => {
  // O aviso usa o fuso do aparelho.
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
  const comSaude = (): Profile => ({
    ...sA,
    anamnese: anamneseBase({}, { id: "rodada-1", answeredAt: "2026-11-02T10:00:00Z" }),
    liberacoes: [{ id: "l1", por: "medico", data: "2026-11-03", alertas: ["A-PARQ7"], registradoEm: "2026-11-03T10:00:00Z" }],
  });

  it("o aluno volta com fichas e treinos, sem anamnese, sem anamnesePrev e sem as liberações; o aviso cita o aluno e a data", async () => {
    await aparelhoDoPersonal();
    await localRepo.saveProfile(comSaude());
    const backup = await collectBackup(localRepo, coach, new Date(Date.now() - 60_000));
    await localRepo.deleteAccount("sA");
    const marca = storage.getItem("sr:v1:qapagado:rodada-1");
    expect(marca).not.toBeNull();
    const r = await restoreBackup(backup);
    const volta = (await localRepo.getProfile("sA"))!;
    expect(volta.anamnese).toBeUndefined();
    expect(volta.anamnesePrev).toBeUndefined();
    expect(volta.liberacoes).toBeUndefined();
    expect((await localRepo.listPrograms("sA")).map((p) => p.id)).toEqual(["pA"]);
    expect((await localRepo.listSessions("sA")).map((s) => s.id)).toEqual(["t1"]);
    expect(r.rodadasOmitidas).toHaveLength(1);
    expect(r.rodadasOmitidas[0]).toMatchObject({ alunoId: "sA", nome: "Marina Costa" });
    const texto = textoRodadasOmitidas(r.rodadasOmitidas[0]!);
    expect(texto).toMatch(/^As respostas de saúde de Marina apagadas neste aparelho em \d{2}\/\d{2} não voltaram com a cópia\.$/);
  });

  it("teste negativo: aparelho limpo, sem marca → a anamnese volta (limite do modo local)", async () => {
    await aparelhoDoPersonal();
    await localRepo.saveProfile(comSaude());
    const backup = await collectBackup(localRepo, coach, new Date(Date.now() - 60_000));
    storage.reset();
    const r = await restoreBackup(backup);
    expect((await localRepo.getProfile("sA"))?.anamnese?.id).toBe("rodada-1");
    expect(r.rodadasOmitidas).toEqual([]);
  });

  it("teste negativo: marca anterior à cópia → a mescla de sempre (D-32)", async () => {
    await aparelhoDoPersonal();
    await localRepo.saveProfile(comSaude());
    const backup = await collectBackup(localRepo, coach, new Date("2026-11-20T12:00:00Z"));
    await localRepo.deleteAccount("sA");
    storage.setItem("sr:v1:qapagado:rodada-1", JSON.stringify({ at: "2026-11-19T12:00:00.000Z" }));
    await restoreBackup(backup);
    expect((await localRepo.getProfile("sA"))?.anamnese?.id).toBe("rodada-1");
  });
});

describe("R3-1 na restauração: perfis não mudam de dono", () => {
  async function copiaDaAluna() {
    const aluna = await importFicha(buildFichaPacket({ coach, student: sA, program: prog("pA", "sA"), diet: null, customExercises: [remada], customFoods: [] }), null, { consent: true });
    await localRepo.saveSession({ ...sess("t1", aluna.id), userId: aluna.id });
    markSessionsPrepared(aluna.id, ["t1"], "copy", "2026-11-06T10:00:00.000Z");
    declareSessionsSent(aluna.id, ["t1"], "2026-11-06T10:05:00.000Z");
    return collectBackup(localRepo, (await localRepo.getProfile(aluna.id))!, new Date("2026-11-07T12:00:00Z"));
  }

  it("a cópia da aluna restaurada no aparelho do personal deixa o perfil dele igual, o painel e os dados de Marina intactos", async () => {
    const backup = await copiaDaAluna();
    storage.reset();
    await aparelhoDoPersonal();
    await localRepo.saveSession(sess("t1", "sA")); // o mesmo treino, registrado pelo personal em /receber
    const personal = await localRepo.getProfile("c1");
    const exercicios = await localRepo.listCustomExercises("c1");
    const fichasDeA = await localRepo.listPrograms("sA");
    const treinosDeA = await localRepo.listSessions("sA");
    const r = await restoreBackup(ler(backup));
    expect(await localRepo.getProfile("c1")).toEqual(personal);
    expect(await localRepo.listCustomExercises("c1")).toEqual(exercicios);
    expect((await localRepo.listStudents("c1")).map((s) => s.profile.id).sort()).toEqual(["sA", "sB"]);
    expect(await localRepo.listPrograms("sA")).toEqual(fichasDeA);
    expect(await localRepo.listSessions("sA")).toEqual(treinosDeA);
    expect(r.plano.deOutroPerfil).toBeGreaterThan(0);
  });

  it("teste negativo: a cópia da aluna num aparelho limpo continua criando o contato do personal (com o vínculo e as declarações)", async () => {
    const backup = await copiaDaAluna();
    const alunaId = backup.profile.id;
    storage.reset();
    await restoreBackup(backup);
    expect(await localRepo.getProfile("c1")).toMatchObject({ role: "coach", name: "Rafael Nunes" });
    expect(await localRepo.getCoach(alunaId)).toEqual({ id: "c1", name: "Rafael Nunes" });
    expect((await localRepo.listCustomExercises("c1")).map((e) => e.id)).toEqual(["custom_remada"]);
    expect(declaracoesDeEnvio(alunaId).t1?.enviei).toBe("2026-11-06T10:05:00.000Z");
  });

  it("no celular da aluna, o contato que já existe não volta ao da cópia (telefone novo fica)", async () => {
    const backup = await copiaDaAluna();
    const c = (await localRepo.getProfile("c1"))!;
    await localRepo.saveProfile({ ...c, phone: "11888887777" });
    await restoreBackup(backup);
    expect((await localRepo.getProfile("c1"))?.phone).toBe("11888887777");
  });
});
