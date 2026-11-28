import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FichaLinkMatch } from "@/lib/domain/link-identity";
import type { DietPlan, Profile, Program, Session } from "@/lib/domain/types";

// R3-1 (P0): identidade nos links. Spec de 26/11 + adendo do estudo 2 (item 1 "Ver como aluno", item 2 casos que faltam,
// perfis de entrada). Grava no repositório local de verdade sobre um localStorage em memória. Dados fictícios.

/** localStorage em memória com falha injetável por chave (QuotaExceededError) e "cota acabou" (falha tudo depois). */
class MemStorage {
  m = new Map<string, string>();
  falharEm: RegExp | null = null;
  /** Depois da primeira falha, toda gravação falha (a cota acabou de vez: a volta da foto também não grava). */
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
const { ArmazenamentoIncompleto, TEXTO_COTA_LOCAL } = await import("@/lib/data/local");
const { buildFichaPacket, buildTreinosPacket, parsePacket } = await import("@/lib/domain/transfer");
const L = await import("@/lib/domain/link-identity");
const { fichaAckOf, importFicha, importTreinos, perfisNesteAparelho, TEXTO_FICHA_INCOMPLETA } = await import("./transfer-client");

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-10-01T10:00:00Z", phone: "11999990000", cref: "012345-G/SP" };
const outroCoach: Profile = { id: "c9", name: "Camila Duarte", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-10-01T10:00:00Z" };
const sA: Profile = { id: "sA", name: "Aluno A", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T10:00:00Z", managedBy: "c1", weightKg: 80 };
const sB: Profile = { id: "sB", name: "Beatriz Lima", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T10:00:00Z", managedBy: "c1" };
const prog = (id: string, ownerId: string, createdBy = "c1", updatedAt = "2026-11-01T10:00:00Z"): Program => ({
  id,
  ownerId,
  createdBy,
  name: `Ficha ${id}`,
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [{ key: "A", title: "A", focus: ["peito"], exercises: [{ uid: "u1", exerciseId: "supino_reto_barra", name: "Supino", sets: 3, repsMin: 8, repsMax: 10, restSec: 90, loadKg: 40, technique: "normal" }] }],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt,
});
const dieta = (id: string, ownerId: string): DietPlan => ({ id, ownerId, createdBy: "c1", name: `Dieta ${id}`, targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 }, meals: [], updatedAt: "2026-11-02T10:00:00Z" });
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
const fichaDe = (c: Profile, aluno: Profile, programa: Program | null, diet: DietPlan | null = null) => buildFichaPacket({ coach: c, student: aluno, program: programa, diet, customExercises: [], customFoods: [] });

/**
 * Foto comparável dos dados (`sr:v1:*` e `sr:sent:*`). `sr:sent:@desde` fica fora: `deliveryTrackingSince` grava numa
 * simples leitura. Comparar a foto inteira (e não contar `setItem`, que daria falso negativo).
 */
const dados = () => [...storage.m.entries()].filter(([k]) => (k.startsWith("sr:v1:") || k.startsWith("sr:sent:")) && k !== "sr:sent:@desde").sort(([a], [b]) => a.localeCompare(b));

async function aparelhoDoPersonal() {
  await localRepo.saveProfile(coach);
  await localRepo.saveProfile(sA);
  await localRepo.saveProfile(sB);
  localRepo.linkDirect("c1", "sA", "2026-11-01T00:00:00Z");
  localRepo.linkDirect("c1", "sB", "2026-11-01T00:00:00Z");
  await localRepo.saveProgram(prog("pA", "sA"), { keepUpdatedAt: true });
  await localRepo.saveDiet(dieta("dA", "sA"), { keepUpdatedAt: true });
  await localRepo.saveSession(sess("t1", "sA"));
}

/** Celular do aluno A: abriu o link de A (c1/sA) e treinou uma vez. */
async function celularDoAlunoA(): Promise<Profile> {
  const a = await importFicha(fichaDe(coach, sA, prog("pA", "sA"), dieta("dA", "sA")), null, { consent: true });
  await localRepo.saveSession(sess("tA1", a.id, 42.5));
  return (await localRepo.getProfile(a.id))!;
}

beforeEach(() => storage.reset());

describe("'Ver como aluno' + link do próprio aluno (adendo, item 1)", () => {
  it("o repro termina com a ficha no mesmo dono, 1 aluno no painel e o contato do personal intacto (link antigo, sem telefone nem CREF)", async () => {
    await aparelhoDoPersonal();
    const personalAntes = await localRepo.getProfile("c1");
    const linkAntigo = fichaDe({ ...coach, phone: undefined, cref: undefined }, sA, prog("pA", "sA"), dieta("dA", "sA"));
    // /abrir com returnTo passava `null` como perfil atual.
    const criado = await importFicha(linkAntigo, null, { consent: true });
    const fichasDeA = await localRepo.listPrograms("sA");
    expect(fichasDeA).toHaveLength(1);
    expect(fichasDeA[0]).toMatchObject({ id: "pA", ownerId: "sA" });
    expect((await localRepo.getDiet("sA"))?.id).toBe("dA");
    expect((await localRepo.listStudents("c1")).map((s) => s.profile.id).sort()).toEqual(["sA", "sB"]);
    expect(await localRepo.getProfile("c1")).toEqual(personalAntes);
    expect(await localRepo.listSessions("sA")).toHaveLength(1);
    // O que o link criou (perfil de entrada novo, fora do painel) tem ficha e dieta com ids próprios.
    const fichasNovas = await localRepo.listPrograms(criado.id);
    expect(fichasNovas).toHaveLength(1);
    expect(fichasNovas[0]!.id).not.toBe("pA");
    expect((await localRepo.getDiet(criado.id))?.id).not.toBe("dA");
  });

  it("passando o registro do aluno do personal como perfil atual: tratado como 'novo', o registro do aluno fica igual", async () => {
    await aparelhoDoPersonal();
    const antes = await localRepo.getProfile("sA");
    expect(L.fichaLinkMatch(fichaDe(coach, sA, prog("pA", "sA")), sA)).toBe("novo");
    await expect(importFicha(fichaDe(coach, sA, prog("pA", "sA")), sA, { target: "update" })).rejects.toBeInstanceOf(L.SemPerfilParaAtualizar);
    expect(await localRepo.getProfile("sA")).toEqual(antes);
  });

  it("teste negativo: o aluno de verdade reabrindo o próprio link atualiza a ficha pelo mesmo id e mantém os treinos", async () => {
    const a = await celularDoAlunoA();
    const reenvio = fichaDe(coach, sA, { ...prog("pA", "sA"), name: "Ficha nova", updatedAt: "2026-11-20T10:00:00Z" });
    expect(L.fichaLinkMatch(reenvio, a)).toBe("mesmo");
    const depois = await importFicha(reenvio, a, { consent: true });
    expect(depois.id).toBe(a.id);
    const fichas = await localRepo.listPrograms(a.id);
    expect(fichas.map((f) => [f.id, f.name])).toEqual([["pA", "Ficha nova"]]);
    expect((await localRepo.listSessions(a.id)).map((s) => s.id)).toEqual(["tA1"]);
    // O contato do personal no celular do aluno continua sendo atualizado pelo link (é contato).
    expect((await localRepo.getProfile("c1"))?.cref).toBe("012345-G/SP");
  });
});

describe("A ativo + link de B (QA-01)", () => {
  const linkDeB = () => fichaDe(coach, sB, prog("pB", "sB"), dieta("dB", "sB"));

  it("sem escolha: erro tipado e zero mutação", async () => {
    const a = await celularDoAlunoA();
    expect(L.fichaLinkMatch(linkDeB(), a)).toBe("outro_aluno");
    const antes = dados();
    await expect(importFicha(linkDeB(), a, { consent: true })).rejects.toBeInstanceOf(L.ConfirmacaoNecessaria);
    expect(dados()).toEqual(antes);
  });

  it("inverter o repro: target 'update' sem allowRelink lança LinkDeOutraPessoa e não grava", async () => {
    const a = await celularDoAlunoA();
    const antes = dados();
    await expect(importFicha(linkDeB(), a, { target: "update", consent: true })).rejects.toBeInstanceOf(L.LinkDeOutraPessoa);
    expect(dados()).toEqual(antes);
  });

  it("'Criar perfil separado para Beatriz': perfil novo; A fica igual (perfil, fichas, dieta e treinos)", async () => {
    const a = await celularDoAlunoA();
    const perfilA = await localRepo.getProfile(a.id);
    const fichasA = await localRepo.listPrograms(a.id);
    const dietaA = await localRepo.getDiet(a.id);
    const b = await importFicha(linkDeB(), a, { target: "new", consent: true });
    expect(b.id).not.toBe(a.id);
    expect(b.remoteCoach).toMatchObject({ id: "c1", studentRef: "sB" });
    expect(await localRepo.getProfile(a.id)).toEqual(perfilA);
    expect(await localRepo.listPrograms(a.id)).toEqual(fichasA);
    expect(await localRepo.getDiet(a.id)).toEqual(dietaA);
    expect((await localRepo.listSessions(a.id)).map((s) => s.id)).toEqual(["tA1"]);
    expect((await localRepo.listPrograms(b.id)).map((p) => [p.id, p.active])).toEqual([["pB", true]]);
    expect((await localRepo.listSessions(b.id))).toEqual([]);
    // Os dois perfis aparecem na lista de entrada; o contato do personal, não.
    expect(L.perfisDeEntrada(localRepo.listLocalProfiles()).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("o perfil do link já está no celular (etapa 2: o /abrir atualiza, nunca duplica)", () => {
  const linkDeB = (nome = "Ficha B") => fichaDe(coach, sB, { ...prog("pB", "sB"), name: nome, updatedAt: "2026-11-20T10:00:00Z" }, dieta("dB", "sB"));

  it("A aberto e o perfil de B criado antes ('Criar perfil separado'): o reenvio de B atualiza B; A e o número de perfis ficam", async () => {
    const a = await celularDoAlunoA();
    const b = await importFicha(fichaDe(coach, sB, prog("pB", "sB"), dieta("dB", "sB")), a, { target: "new", consent: true });
    await localRepo.saveSession(sess("tB1", b.id, 30));
    const perfisAntes = localRepo.listLocalProfiles().length;
    const perfilA = await localRepo.getProfile(a.id);
    // O /abrir acha B pelos ids (nunca pelo nome) e oferece "Atualizar o perfil de Beatriz" (B como perfil atual: "mesmo").
    const dono = L.perfilDoLinkNoAparelho(linkDeB(), localRepo.listLocalProfiles());
    expect(dono?.id).toBe(b.id);
    expect(L.fichaLinkMatch(linkDeB(), dono)).toBe("mesmo");
    const depois = await importFicha(linkDeB("Ficha B nova"), dono, { target: "update", consent: true });
    expect(depois.id).toBe(b.id);
    expect(localRepo.listLocalProfiles()).toHaveLength(perfisAntes);
    expect((await localRepo.listPrograms(b.id)).map((f) => [f.id, f.name])).toEqual([["pB", "Ficha B nova"]]);
    expect((await localRepo.listSessions(b.id)).map((s) => s.id)).toEqual(["tB1"]);
    expect(await localRepo.getProfile(a.id)).toEqual(perfilA);
  });

  it("sem perfil aberto (depois de 'Sair'): o link de A atualiza o perfil de A que já está aqui (mesmos treinos, nenhum perfil novo)", async () => {
    const a = await celularDoAlunoA();
    const perfisAntes = localRepo.listLocalProfiles().length;
    const reenvio = fichaDe(coach, sA, { ...prog("pA", "sA"), name: "Ficha nova", updatedAt: "2026-11-20T10:00:00Z" });
    const dono = L.perfilDoLinkNoAparelho(reenvio, localRepo.listLocalProfiles());
    expect(dono?.id).toBe(a.id);
    const depois = await importFicha(reenvio, dono, { consent: true });
    expect(depois.id).toBe(a.id);
    expect(localRepo.listLocalProfiles()).toHaveLength(perfisAntes);
    expect((await localRepo.listSessions(a.id)).map((s) => s.id)).toEqual(["tA1"]);
  });

  it("teste negativo: no aparelho do personal, o registro do aluno (managedBy) nunca é o perfil do link", async () => {
    await aparelhoDoPersonal();
    expect(L.perfilDoLinkNoAparelho(fichaDe(coach, sA, prog("pA", "sA")), localRepo.listLocalProfiles())).toBeNull();
  });
});

describe("outro personal (QA-01, fluxo explícito)", () => {
  const linkDeOutro = () => fichaDe(outroCoach, { ...sA, id: "sC", name: "Aluno A" }, prog("pC", "sC", "c9"));

  it("sem escolha e sem allowRelink: nada muda", async () => {
    const a = await celularDoAlunoA();
    expect(L.fichaLinkMatch(linkDeOutro(), a)).toBe("outro_personal");
    const antes = dados();
    await expect(importFicha(linkDeOutro(), a)).rejects.toBeInstanceOf(L.ConfirmacaoNecessaria);
    await expect(importFicha(linkDeOutro(), a, { target: "update" })).rejects.toBeInstanceOf(L.LinkDeOutraPessoa);
    expect(dados()).toEqual(antes);
  });

  it("'Trocar de personal neste perfil': os treinos ficam (mesmos ids) e o remoteCoach passa ao novo", async () => {
    const a = await celularDoAlunoA();
    const treinosAntes = (await localRepo.listSessions(a.id)).map((s) => s.id);
    const depois = await importFicha(linkDeOutro(), a, { target: "update", allowRelink: true, consent: true });
    expect(depois.id).toBe(a.id);
    expect(depois.remoteCoach).toMatchObject({ id: "c9", studentRef: "sC" });
    expect((await localRepo.listSessions(a.id)).map((s) => s.id)).toEqual(treinosAntes);
    const fichas = await localRepo.listPrograms(a.id);
    expect(fichas.find((f) => f.active)?.id).toBe("pC");
    expect(fichas.map((f) => f.id).sort()).toEqual(["pA", "pC"]);
    // O contato do personal anterior não vira "perfil de entrada" (a ficha antiga dele continua no perfil).
    expect((await perfisNesteAparelho()).map((p) => p.profile.id)).toEqual([a.id]);
  });
});

describe("legado e solo: confirmação explícita", () => {
  it("legado (vínculo sem studentRef): sem escolha não grava; 'Sou eu' atualiza e mantém o histórico", async () => {
    const legado: Profile = { id: "a-local", name: "Aluno A", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-10-01T10:00:00Z", remoteCoach: { id: "c1", name: "Rafael Nunes", studentRef: "" } };
    await localRepo.saveProfile(legado);
    await localRepo.saveSession(sess("old", "a-local"));
    const link = fichaDe(coach, sA, prog("pA", "sA"));
    expect(L.fichaLinkMatch(link, legado)).toBe("legado");
    const antes = dados();
    await expect(importFicha(link, legado)).rejects.toBeInstanceOf(L.ConfirmacaoNecessaria);
    expect(dados()).toEqual(antes);
    const depois = await importFicha(link, legado, { target: "update" });
    expect(depois.id).toBe("a-local");
    expect(depois.remoteCoach?.studentRef).toBe("sA");
    expect((await localRepo.listSessions("a-local")).map((s) => s.id)).toEqual(["old"]);
  });

  it("solo (primeiro vínculo): 'Sou eu' liga o personal neste perfil e cria o contato", async () => {
    const solo: Profile = { id: "eu", name: "Ana Souza", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-10-01T10:00:00Z", weightKg: 60 };
    await localRepo.saveProfile(solo);
    await localRepo.saveSession(sess("meu", "eu"));
    const link = fichaDe(coach, { ...sA, weightKg: 70 }, prog("pA", "sA"));
    expect(L.fichaLinkMatch(link, solo)).toBe("solo");
    const depois = await importFicha(link, solo, { target: "update" });
    expect(depois.remoteCoach).toMatchObject({ id: "c1", studentRef: "sA" });
    // O que a pessoa já informou fica (o cadastro do personal só completa).
    expect(depois.weightKg).toBe(60);
    expect(await localRepo.getProfile("c1")).toMatchObject({ role: "coach", cref: "012345-G/SP" });
    expect(await localRepo.getCoach("eu")).toEqual({ id: "c1", name: "Rafael Nunes" });
    expect((await localRepo.listSessions("eu")).map((s) => s.id)).toEqual(["meu"]);
  });
});

describe("cancelar = zero escrita em cada estado que pede confirmação (adendo, item 2)", () => {
  const casos: { nome: FichaLinkMatch; perfil: () => Promise<Profile>; link: () => ReturnType<typeof fichaDe> }[] = [
    { nome: "legado", perfil: async () => localRepo.saveProfile({ id: "x", name: "X", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-10-01T10:00:00Z", remoteCoach: { id: "c1", name: "Rafael", studentRef: "" } }), link: () => fichaDe(coach, sA, prog("pA", "sA")) },
    { nome: "solo", perfil: async () => localRepo.saveProfile({ id: "x", name: "X", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-10-01T10:00:00Z" }), link: () => fichaDe(coach, sA, prog("pA", "sA")) },
    { nome: "outro_aluno", perfil: celularDoAlunoA, link: () => fichaDe(coach, sB, prog("pB", "sB")) },
    { nome: "outro_personal", perfil: celularDoAlunoA, link: () => fichaDe(outroCoach, sB, prog("pC", "sB", "c9")) },
  ];
  for (const c of casos) {
    it(`${c.nome}: a tela de escolha e o "Voltar" não gravam nada`, async () => {
      const perfil = await c.perfil();
      const link = c.link();
      const antes = dados();
      const match = L.fichaLinkMatch(link, perfil);
      expect(match).toBe(c.nome);
      const tela = L.telaDoLink(match, { perfil, aluno: link.student.name, personal: link.coach.name });
      expect(tela?.acoes.map((a) => a.acao)).toContain("voltar");
      // "Voltar" não chama nada; um save sem escolha (bug de tela) também não grava.
      await expect(importFicha(link, perfil, { consent: true })).rejects.toBeInstanceOf(L.ErroDeIdentidadeDoLink);
      expect(dados()).toEqual(antes);
    });
  }

  it("/receber, escolha manual: escolher e voltar não grava; registrar sem a confirmação também não", async () => {
    await aparelhoDoPersonal();
    const antes = dados();
    const pk = buildTreinosPacket({ student: { ...sB, id: "local-b" }, coachId: "c1", studentRef: "s9", sessions: [sess("tB1", "local-b")] });
    const alunos = await localRepo.listStudents("c1");
    expect(L.alvoInicialDoRetorno(pk, alunos)).toBeNull();
    expect(L.retornoPedeConfirmacao(pk, "sA", "c1")).toEqual({ outroAluno: true, outroPersonal: false });
    await expect(importTreinos(pk, "sA", { coachId: "c1" })).rejects.toBeInstanceOf(L.RetornoPedeConfirmacao);
    expect(dados()).toEqual(antes);
  });
});

describe("mesmo aluno, link repetido e link corrompido (QA-03, QA-04)", () => {
  it("mesmo vínculo: atualiza só ficha e dieta e preserva os treinos", async () => {
    const a = await celularDoAlunoA();
    await importFicha(fichaDe(coach, sA, { ...prog("pA", "sA"), name: "ABC 2", updatedAt: "2026-11-21T10:00:00Z" }, { ...dieta("dA", "sA"), name: "Dieta 2" }), a);
    expect((await localRepo.listPrograms(a.id)).map((p) => p.name)).toEqual(["ABC 2"]);
    expect((await localRepo.getDiet(a.id))?.name).toBe("Dieta 2");
    expect((await localRepo.listSessions(a.id)).map((s) => s.id)).toEqual(["tA1"]);
  });

  it("o mesmo link duas vezes: idempotente (um perfil de aluno, uma ficha)", async () => {
    const link = fichaDe(coach, sA, prog("pA", "sA"));
    const a = await importFicha(link, null);
    await importFicha(link, (await localRepo.getProfile(a.id))!);
    expect(localRepo.listLocalProfiles().filter((p) => p.role === "athlete")).toHaveLength(1);
    expect(await localRepo.listPrograms(a.id)).toHaveLength(1);
  });

  it("link corrompido: não vira pacote (nada é gravado)", () => {
    expect(parsePacket({ kind: "ficha", v: 1 })).toBeNull();
    expect(parsePacket("lixo")).toBeNull();
    expect(storage.m.size).toBe(0);
  });
});

describe("importTreinos: retorno de B no painel com A (QA-02)", () => {
  it("nunca escolha silenciosa: sem confirmação, erro e nada gravado; com confirmação, grava em A e não grava o eco", async () => {
    await aparelhoDoPersonal();
    const pkB = buildTreinosPacket({ student: { ...sB, id: "local-b" }, coachId: "c1", studentRef: "sB", sessions: [sess("tB1", "local-b")], ficha: { programAt: "2026-11-01T10:00:00Z" } });
    const antes = dados();
    await expect(importTreinos(pkB, "sA", { coachId: "c1" })).rejects.toBeInstanceOf(L.RetornoPedeConfirmacao);
    expect(dados()).toEqual(antes);
    const r = await importTreinos(pkB, "sA", { coachId: "c1", confirmedOther: true });
    expect(r.added).toBe(1);
    expect((await localRepo.listSessions("sA")).map((s) => s.id).sort()).toEqual(["t1", "tB1"]);
    // O eco da versão nunca é prova de identidade: escolhido à mão, não grava `:ack`.
    expect(fichaAckOf("sA")).toBeNull();
  });

  it("link de outro personal com o mesmo studentRef: pede a confirmação (aviso antes de registrar)", async () => {
    await aparelhoDoPersonal();
    const pk = buildTreinosPacket({ student: sA, coachId: "c9", studentRef: "sA", sessions: [sess("tX", "sA")] });
    const antes = dados();
    await expect(importTreinos(pk, "sA", { coachId: "c1" })).rejects.toMatchObject({ outroAluno: false, outroPersonal: true });
    expect(dados()).toEqual(antes);
    expect((await importTreinos(pk, "sA", { coachId: "c1", confirmedOther: true })).added).toBe(1);
  });

  it("teste negativo: o aluno do link, do mesmo personal, registra sem pergunta", async () => {
    await aparelhoDoPersonal();
    const pk = buildTreinosPacket({ student: sA, coachId: "c1", studentRef: "sA", sessions: [sess("t2", "sA")] });
    expect((await importTreinos(pk, "sA", { coachId: "c1" })).added).toBe(1);
  });
});

describe("ObjetoDeOutroPerfil (ficha do pacote com outro dono)", () => {
  it("aparelho dividido: atualizar o perfil próprio com a ficha do aluno do painel → erro, nada gravado; perfil novo → id novo", async () => {
    await aparelhoDoPersonal();
    const eu: Profile = { id: "eu", name: "Aluno A", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-10-01T10:00:00Z", remoteCoach: { id: "c1", name: "Rafael Nunes", studentRef: "sA" } };
    await localRepo.saveProfile(eu);
    const link = fichaDe(coach, sA, prog("pA", "sA"), dieta("dA", "sA"));
    expect(L.fichaLinkMatch(link, eu)).toBe("mesmo");
    const antes = dados();
    await expect(importFicha(link, eu)).rejects.toBeInstanceOf(L.ObjetoDeOutroPerfil);
    expect(dados()).toEqual(antes);
    const personalAntes = await localRepo.getProfile("c1");
    const novo = await importFicha(link, eu, { target: "new" });
    expect((await localRepo.listPrograms("sA")).map((p) => [p.id, p.ownerId])).toEqual([["pA", "sA"]]);
    expect((await localRepo.listPrograms(novo.id))[0]!.id).not.toBe("pA");
    expect(await localRepo.getProfile("c1")).toEqual(personalAntes);
    expect((await localRepo.listStudents("c1")).map((s) => s.profile.id).sort()).toEqual(["sA", "sB"]);
  });
});

describe("foto do armazenamento no importFicha e no importTreinos (R3-6 A)", () => {
  it("cota estourando no meio do link de ficha: o armazenamento volta igual e a mensagem é a de cota, sem 'nuvem'", async () => {
    for (const alvo of [/^sr:v1:programs$/, /^sr:v1:diets$/, /^sr:v1:links$/, /^sr:v1:custom_exercises$/]) {
      storage.reset();
      const a = await celularDoAlunoA();
      const antes = dados();
      storage.falharEm = alvo;
      const link = { ...fichaDe(coach, sA, { ...prog("pA", "sA"), updatedAt: "2026-11-21T10:00:00Z" }, dieta("dA", "sA")), exercises: [{ id: "custom_x", name: "X", group: "costas", implement: "maquina", pattern: "puxar_h", compound: true }] } as ReturnType<typeof fichaDe>;
      const erro = await importFicha(link, a, { consent: true }).then(
        () => null,
        (e: Error) => e,
      );
      storage.falharEm = null;
      expect(erro?.message, String(alvo)).toBe(TEXTO_COTA_LOCAL);
      expect(erro?.message).not.toMatch(/nuvem/);
      expect(dados(), String(alvo)).toEqual(antes);
    }
  });

  it("perfil novo com cota estourando na dieta: nenhum perfil novo fica no aparelho", async () => {
    const antes = dados();
    storage.falharEm = /^sr:v1:diets$/;
    await expect(importFicha(fichaDe(coach, sA, prog("pA", "sA"), dieta("dA", "sA")), null)).rejects.toThrow(TEXTO_COTA_LOCAL);
    storage.falharEm = null;
    expect(dados()).toEqual(antes);
    expect(localRepo.listLocalProfiles()).toEqual([]);
  });

  it("cota estourando no meio dos treinos recebidos (medidas ou o eco): volta igual", async () => {
    for (const alvo of [/^sr:v1:metrics$/, /^sr:sent:sA:ack$/, /^sr:v1:programs$/]) {
      storage.reset();
      await aparelhoDoPersonal();
      const antes = dados();
      storage.falharEm = alvo;
      const pk = buildTreinosPacket({ student: sA, coachId: "c1", studentRef: "sA", sessions: [sess("t2", "sA", 45)], metrics: [{ id: "m1", userId: "x", date: "2026-11-10", weightKg: 79 }], ficha: { programAt: "2026-11-01T10:00:00Z" } });
      await expect(importTreinos(pk, "sA", { coachId: "c1" }), String(alvo)).rejects.toThrow(TEXTO_COTA_LOCAL);
      storage.falharEm = null;
      expect(dados(), String(alvo)).toEqual(antes);
    }
  });

  it("a volta também falha (a cota acabou de vez): ArmazenamentoIncompleto com o texto do link, nunca sucesso", async () => {
    const a = await celularDoAlunoA();
    storage.falharEm = /^sr:v1:programs$/;
    storage.travarDepoisDaFalha = true;
    // Versão nova da ficha: o perfil muda (`remoteCoach.recebido`) antes da ficha falhar, e a volta precisa regravá-lo.
    const erro = await importFicha(fichaDe(coach, sA, { ...prog("pA", "sA"), name: "Nova", updatedAt: "2026-11-21T10:00:00Z" }), a).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ArmazenamentoIncompleto);
    expect((erro as Error).message).toBe(TEXTO_FICHA_INCOMPLETA);
  });

  it("teste negativo: sem falha, nada da foto sobra no armazenamento", async () => {
    await celularDoAlunoA();
    expect([...storage.m.keys()].every((k) => k.startsWith("sr:v1:") || k.startsWith("sr:sent:"))).toBe(true);
  });
});

describe("Perfis neste aparelho (perfis de entrada lidos do aparelho)", () => {
  it("aparelho do personal: só o personal (os alunos dele ficam fora), com o último treino registrado como último uso", async () => {
    await aparelhoDoPersonal();
    const lista = await perfisNesteAparelho();
    expect(lista.map((p) => [p.profile.id, p.rotulo])).toEqual([["c1", "Personal"]]);
    expect(lista[0]!.ultimoUso).toBe("2026-11-05T18:00:00Z");
  });

  it("celular do aluno: só o aluno (o contato do personal fica fora); dois alunos, o usado por último primeiro", async () => {
    const a = await celularDoAlunoA();
    const b = await importFicha(fichaDe(coach, sB, prog("pB", "sB")), a, { target: "new" });
    await localRepo.saveSession({ ...sess("tB9", b.id), startedAt: "2026-12-01T18:00:00Z" });
    const lista = await perfisNesteAparelho();
    expect(lista.map((p) => p.profile.id)).toEqual([b.id, a.id]);
    expect(lista.every((p) => p.rotulo === "Aluno")).toBe(true);
    expect(lista.some((p) => p.profile.id === "c1")).toBe(false);
  });

  it("nenhum perfil: lista vazia (só leitura, nada gravado)", async () => {
    expect(await perfisNesteAparelho()).toEqual([]);
    expect(storage.m.size).toBe(0);
  });
});
