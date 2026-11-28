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
const { CopiaRecusada, lerCopia, textoRodadasOmitidas } = await import("@/lib/domain/restauracao");
const { anamneseBase } = await import("@/lib/domain/anamnese-fixtures");
const { collectBackup, declaracoesDeEnvio, importFicha, markFichaPrepared, markSessionsPrepared, planejarRestauracao, restoreBackup } = await import("./transfer-client");
const { declareSessionsSent, fichaSendRecord, prepLog, recordFichaAck, fichaAckOf, sentSessionIds } = await import("./transfer-client");
const { toProfilePatch } = await import("@/lib/domain/anamnese-ficha");
const { HOJE } = await import("@/lib/domain/anamnese-fixtures");

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

describe("correção da revisão: restaurar uma cópia antiga não desfaz o registro de envio feito depois dela", () => {
  const aluno: Profile = { id: "al1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T10:00:00Z", remoteCoach: { id: "c1", name: "Rafael Nunes", studentRef: "sA" } };
  const treino = (id: string, startedAt: string): Session => ({ ...sess(id, "al1"), startedAt, finishedAt: startedAt });
  const estado = () => ({ lista: [...sentSessionIds("al1")].sort(), log: prepLog("al1"), decl: declaracoesDeEnvio("al1") });

  it("aluno: o 'Já enviei' e o toque de cópia feitos depois da cópia sobrevivem; o plano diz 'Nada novo para entrar'", async () => {
    await localRepo.saveProfile(aluno);
    await localRepo.saveSession(treino("t0", "2026-11-04T18:00:00Z"));
    markSessionsPrepared("al1", ["t0"], "copy", "2026-11-04T19:00:00.000Z");
    declareSessionsSent("al1", ["t0"], "2026-11-04T19:05:00.000Z");
    const backup = ler(await collectBackup(localRepo, aluno, new Date("2026-11-05T10:00:00Z")));
    // Depois da cópia: treino novo, copiado e declarado.
    await localRepo.saveSession(treino("t1", "2026-11-06T18:00:00Z"));
    markSessionsPrepared("al1", ["t1"], "copy", "2026-11-06T19:00:00.000Z");
    declareSessionsSent("al1", ["t1"], "2026-11-06T19:05:00.000Z");
    const antes = estado();
    expect(planejarRestauracao(backup)).toMatchObject({ entram: 0, mantidos: 0 });
    await restoreBackup(backup);
    expect(estado()).toEqual(antes);
    expect(declaracoesDeEnvio("al1").t1?.enviei).toBe("2026-11-06T19:05:00.000Z");
  });

  it("aluno: toque e declaração mais novos NA CÓPIA (outro aparelho) entram; os do aparelho ficam", async () => {
    await localRepo.saveProfile(aluno);
    markSessionsPrepared("al1", ["t0"], "copy", "2026-11-04T19:00:00.000Z");
    const velho = ler(await collectBackup(localRepo, aluno, new Date("2026-11-05T10:00:00Z")));
    markSessionsPrepared("al1", ["t0"], "whatsapp", "2026-11-08T19:00:00.000Z");
    declareSessionsSent("al1", ["t0"], "2026-11-08T19:05:00.000Z");
    const novo = ler(await collectBackup(localRepo, aluno, new Date("2026-11-09T10:00:00Z")));
    storage.reset();
    await localRepo.saveProfile(aluno);
    markSessionsPrepared("al1", ["t9"], "copy", "2026-11-07T19:00:00.000Z");
    await restoreBackup(novo);
    await restoreBackup(velho);
    expect(prepLog("al1")).toEqual({ t0: { via: "whatsapp", at: "2026-11-08T19:00:00.000Z" }, t9: { via: "copy", at: "2026-11-07T19:00:00.000Z" } });
    expect(declaracoesDeEnvio("al1").t0?.enviei).toBe("2026-11-08T19:05:00.000Z");
    expect([...sentSessionIds("al1")].sort()).toEqual(["t0", "t9"]);
  });

  it("personal: o registro de envio da ficha e o eco feitos depois da cópia sobrevivem", async () => {
    await aparelhoDoPersonal();
    recordFichaAck("sA", { programAt: "2026-11-01T10:00:00Z", treinosSentAt: "2026-11-03T10:00:00.000Z", registeredAt: "2026-11-03T11:00:00.000Z" });
    const backup = ler(await collectBackup(localRepo, coach, new Date("2026-11-04T10:00:00Z")));
    await localRepo.saveProgram(prog("pA", "sA", "ABC nova", "2026-11-10T10:00:00Z"), { keepUpdatedAt: true });
    markFichaPrepared("sA", { at: "2026-11-10T11:00:00.000Z", via: "whatsapp", programAt: "2026-11-10T10:00:00Z", dietAt: null });
    recordFichaAck("sA", { programAt: "2026-11-10T10:00:00Z", treinosSentAt: "2026-11-12T10:00:00.000Z", registeredAt: "2026-11-12T11:00:00.000Z" });
    await restoreBackup(backup);
    expect((await localRepo.getProgram("pA"))?.name).toBe("ABC nova");
    expect(fichaSendRecord("sA")).toMatchObject({ at: "2026-11-10T11:00:00.000Z", programAt: "2026-11-10T10:00:00Z" });
    expect(fichaAckOf("sA")?.treinosSentAt).toBe("2026-11-12T10:00:00.000Z");
  });

  it("teste negativo: num aparelho limpo, as chaves da cópia entram como vieram", async () => {
    await aparelhoDoPersonal();
    const backup = ler(await collectBackup(localRepo, coach, new Date("2026-11-04T10:00:00Z")));
    storage.reset();
    await restoreBackup(backup);
    for (const [k, v] of Object.entries(backup.sent ?? {})) expect(storage.getItem(k)).toBe(v);
    expect(fichaSendRecord("sA")).toMatchObject({ at: "2026-11-02T10:00:00.000Z", via: "copy" });
  });
});

describe("correção da revisão (R3-13): 'Remover aluno' + restaurar não traz a saúde tirada do questionário", () => {
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  async function alunaComQuestionario(extra: Partial<Profile> = {}) {
    await aparelhoDoPersonal();
    const an = anamneseBase({ dor: 1, dorOnde: [{ r: "joelho", l: "e" }], condicoes: ["osteoporose"] } as never, { id: "rodada-1", answeredAt: "2026-11-02T10:00:00Z" });
    const patch = toProfilePatch(an, HOJE);
    const p: Profile = { ...sA, ...patch, name: sA.name, managedBy: "c1", anamnese: an, passosFeitos: { liberacao: "2026-11-03T10:00:00Z", gerar_ficha: "2026-11-03T11:00:00Z" }, ...extra };
    await localRepo.saveProfile(p);
    return p;
  }

  it("sem tokens, sem as limitações do questionário, sem peso e altura das respostas e sem passo clínico; o aviso continua", async () => {
    const antes = await alunaComQuestionario();
    expect(antes.limitacoesDoQuestionario?.length).toBeGreaterThan(0);
    expect([antes.weightKg, antes.heightCm]).toEqual([62, 165]);
    const backup = await collectBackup(localRepo, coach, new Date(Date.now() - 60_000));
    await localRepo.deleteAccount("sA");
    const r = await restoreBackup(ler(backup));
    const volta = (await localRepo.getProfile("sA"))!;
    expect(volta.anamnese).toBeUndefined();
    expect(volta.limitacoesDoQuestionario).toBeUndefined();
    expect(volta.limitations).toBeUndefined();
    expect(volta.weightKg).toBeUndefined();
    expect(volta.heightCm).toBeUndefined();
    expect(volta.passosFeitos).toEqual({ gerar_ficha: "2026-11-03T11:00:00Z" });
    // O resto do cadastro volta (restaurar é ato explícito).
    expect([volta.name, volta.managedBy, volta.goal]).toEqual([antes.name, "c1", antes.goal]);
    expect(r.rodadasOmitidas).toHaveLength(1);
    expect(textoRodadasOmitidas(r.rodadasOmitidas[0]!)).toMatch(/^As respostas de saúde de Marina apagadas neste aparelho em \d{2}\/\d{2} não voltaram com a cópia\.$/);
  });

  it("o texto do personal nas limitações e a medida registrada por ele com outro valor ficam", async () => {
    const base = await alunaComQuestionario();
    await localRepo.saveProfile({ ...base, limitations: `evitar agachamento livre; ${base.limitations}`, weightKg: 64 });
    const backup = await collectBackup(localRepo, coach, new Date(Date.now() - 60_000));
    await localRepo.deleteAccount("sA");
    await restoreBackup(ler(backup));
    const volta = (await localRepo.getProfile("sA"))!;
    expect(volta.limitations).toBe("evitar agachamento livre");
    expect(volta.weightKg).toBe(64);
    expect(volta.heightCm).toBeUndefined();
  });

  it("teste negativo: aparelho limpo (sem marca) → tudo volta como veio, inclusive o cadastro tirado do questionário", async () => {
    const antes = await alunaComQuestionario();
    const backup = await collectBackup(localRepo, coach, new Date(Date.now() - 60_000));
    storage.reset();
    const r = await restoreBackup(ler(backup));
    const volta = (await localRepo.getProfile("sA"))!;
    expect(r.rodadasOmitidas).toEqual([]);
    expect([volta.limitations, volta.limitacoesDoQuestionario, volta.weightKg, volta.heightCm]).toEqual([antes.limitations, antes.limitacoesDoQuestionario, 62, 165]);
  });
});

describe("correção da revisão: a cópia de um aluno grava o contato do personal criado (sr:v1:contatos)", () => {
  it("aparelho limpo: o personal da cópia vira contato gravado; a cópia do próprio personal tira o id da lista", async () => {
    const aluna = await importFicha(buildFichaPacket({ coach, student: sA, program: prog("pA", "sA"), diet: null, customExercises: [remada], customFoods: [] }), null, { consent: true });
    const backup = await collectBackup(localRepo, (await localRepo.getProfile(aluna.id))!, new Date("2026-11-07T12:00:00Z"));
    storage.reset();
    await restoreBackup(ler(backup));
    expect(JSON.parse(storage.getItem("sr:v1:contatos") ?? "[]")).toEqual(["c1"]);
    // Depois, a cópia do próprio personal restaurada aqui: ele é quem usa o aparelho, não um contato.
    await aparelhoDoPersonal();
    const doPersonal = await collectBackup(localRepo, coach, new Date("2026-11-20T12:00:00Z"));
    await restoreBackup(ler(doPersonal));
    expect(JSON.parse(storage.getItem("sr:v1:contatos") ?? "[]")).toEqual([]);
  });
});
