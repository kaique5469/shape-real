import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alunoBase, anamneseBase } from "./anamnese-fixtures";
import type { Liberacao } from "./anamnese-types";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackup,
  chaveDoRegistro,
  copiaDeVersaoNova,
  CopiaRecusada,
  lerCopia,
  mesclarRestauracao,
  parseBackup,
  planoRestauracao,
  rodadasQueNaoVoltaram,
  SENT_KEY_RE,
  SENT_SUFFIXES,
  TEXTO_COPIA_INVALIDA,
  TEXTO_COPIA_VERSAO_NOVA,
  textoDoPlano,
  textoRodadasOmitidas,
  type AparelhoParaRestaurar,
  type Backup,
} from "./export";
import type { BodyMetric, DietPlan, Profile, Program, Session } from "./types";

// Rodada 3: restaurar (R3-6 A: validação, versão futura, plano que não desfaz edição mais nova) e R3-13 (aluno
// removido + restaurar não traz a saúde de volta no mesmo aparelho). Puro: sem armazenamento. Dados fictícios.

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const aluno = (id = "s1", extra: Partial<Profile> = {}): Profile => ({ id, name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1", ...extra });
const ficha = (id: string, ownerId: string, updatedAt: string, extra: Partial<Program> = {}): Program => ({
  id,
  ownerId,
  createdBy: "c1",
  name: "ABC",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [{ key: "A", title: "A", focus: ["peito"], exercises: [{ uid: "u1", exerciseId: "supino_reto_barra", name: "Supino", sets: 3, repsMin: 8, repsMax: 10, restSec: 90, loadKg: 40, technique: "normal" }] }],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt,
  ...extra,
});
const treino = (id: string, userId: string, carga = 40): Session => ({
  id,
  userId,
  startedAt: "2026-11-05T18:00:00Z",
  finishedAt: "2026-11-05T18:50:00Z",
  exercises: [{ uid: "e1", exerciseId: "supino_reto_barra", name: "Supino", sets: [{ loadKg: carga, reps: 10, done: true }] }],
  volumeKg: carga * 10,
  prs: [],
});
const medida = (id: string, userId: string, peso = 62): BodyMetric => ({ id, userId, date: "2026-11-10", weightKg: peso });
const dieta = (ownerId: string, updatedAt: string, nome = "Plano"): DietPlan => ({ id: "d1", ownerId, createdBy: "c1", name: nome, targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 }, meals: [], updatedAt });
const vazio = (): AparelhoParaRestaurar => ({ fichas: new Map(), dietas: new Map(), treinos: new Map(), medidas: new Map(), perfis: new Set() });
const copiaDoPersonal = (students: Backup["students"], extra: Partial<Backup> = {}): Backup => buildBackup({ profile: coach, students, ...extra }, new Date("2026-11-20T12:00:00Z"));

describe("lerCopia: validação antes da primeira gravação (R3-6 A.2)", () => {
  const boa = () => copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-01T10:00:00Z")], sessions: [treino("t1", "s1")] }]);

  it("cópia boa: lida, igual a parseBackup", () => {
    const r = lerCopia(JSON.stringify(boa()));
    expect("copia" in r && r.copia.students?.[0]?.profile.id).toBe("s1");
    expect(parseBackup(JSON.stringify(boa()))).not.toBeNull();
  });

  it("v = 99 ou format estranho → versao_nova (texto: atualize); parseBackup devolve null", () => {
    expect(lerCopia(JSON.stringify({ ...boa(), v: 99 }))).toEqual({ problema: "versao_nova" });
    expect(lerCopia(JSON.stringify({ ...boa(), format: "outro" }))).toEqual({ problema: "versao_nova" });
    expect(parseBackup(JSON.stringify({ ...boa(), v: BACKUP_VERSION + 1 }))).toBeNull();
    // Versão nova com outra estrutura: ainda é "atualize", não "não é cópia".
    expect(lerCopia(JSON.stringify({ format: BACKUP_FORMAT, v: 3, perfis: [] }))).toEqual({ problema: "versao_nova" });
    expect(TEXTO_COPIA_VERSAO_NOVA).toBe("Esta cópia é de uma versão mais nova do app. Atualize e tente de novo.");
  });

  it("sessions[].exercises = 'x', exercício sem exerciseId ou sem lista de séries → invalido", () => {
    const comTreino = (s: unknown) => JSON.stringify(copiaDoPersonal([{ profile: aluno(), sessions: [s as Session] }]));
    expect(lerCopia(comTreino({ id: "x1", startedAt: "2026-11-05T18:00:00Z", exercises: "x" }))).toEqual({ problema: "invalido" });
    expect(lerCopia(comTreino({ id: "x1", startedAt: "2026-11-05T18:00:00Z", exercises: ["x"] }))).toEqual({ problema: "invalido" });
    expect(lerCopia(comTreino({ id: "x1", startedAt: "2026-11-05T18:00:00Z", exercises: [{ name: "Supino", sets: [] }] }))).toEqual({ problema: "invalido" });
    expect(lerCopia(comTreino({ id: "x1", startedAt: "2026-11-05T18:00:00Z", exercises: [{ exerciseId: "supino", sets: "3" }] }))).toEqual({ problema: "invalido" });
    expect(lerCopia(comTreino({ id: "x1", startedAt: "2026-11-05T18:00:00Z" }))).toEqual({ problema: "invalido" });
    expect(TEXTO_COPIA_INVALIDA).toBe("Esse arquivo não é uma cópia do Shape Real.");
  });

  it("v que não é inteiro positivo → invalido; JSON quebrado → invalido", () => {
    expect(lerCopia(JSON.stringify({ ...boa(), v: "2" }))).toEqual({ problema: "invalido" });
    expect(lerCopia(JSON.stringify({ ...boa(), v: 0 }))).toEqual({ problema: "invalido" });
    expect(lerCopia("{quebrado")).toEqual({ problema: "invalido" });
  });

  it("NÃO recusa exercício próprio sem definição na cópia (cópias legítimas têm essa referência)", () => {
    const b = copiaDoPersonal([{ profile: aluno(), sessions: [{ ...treino("t1", "s1"), exercises: [{ uid: "e1", exerciseId: "custom_apagado", name: "Remada antiga", sets: [{ loadKg: null, reps: 10, done: true }] }] }] }]);
    expect("copia" in lerCopia(JSON.stringify(b))).toBe(true);
  });

  it("cópia v1 (sem format nem v) continua abrindo", () => {
    const v1 = { profile: aluno(), programs: [ficha("p1", "s1", "2026-11-01T10:00:00Z")], sessions: [treino("t1", "s1")] };
    expect("copia" in lerCopia(JSON.stringify(v1))).toBe(true);
    expect(copiaDeVersaoNova(v1)).toBe(false);
  });

  it("CopiaRecusada carrega o problema e o texto", () => {
    const e = new CopiaRecusada("versao_nova");
    expect([e.problema, e.message]).toEqual(["versao_nova", TEXTO_COPIA_VERSAO_NOVA]);
  });

  it("chaves de envio: `:decl` (R3-3) entra na cópia e volta; @desde e chaves estranhas não", () => {
    expect(SENT_SUFFIXES).toContain(":decl");
    expect(SENT_KEY_RE.test("sr:sent:a1:decl")).toBe(true);
    expect(SENT_KEY_RE.test("sr:sent:@desde")).toBe(false);
    expect(SENT_KEY_RE.test("sr:sent:a1:outra")).toBe(false);
    const b = lerCopia(JSON.stringify({ ...boa(), sent: { "sr:sent:a1:decl": "{}", "sr:sent:a1:x": "1" } }));
    expect("copia" in b && b.copia.sent).toEqual({ "sr:sent:a1:decl": "{}" });
  });
});

describe("planoRestauracao (R3-6 A.4)", () => {
  it("aparelho vazio → tudo entra e 0 mantidos", () => {
    const b = copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-01T10:00:00Z")], sessions: [treino("t1", "s1")], metrics: [medida("m1", "s1")], diet: dieta("s1", "2026-11-02T10:00:00Z") }]);
    const p = planoRestauracao(b, vazio());
    expect(p).toMatchObject({ mantidos: 0, deOutroPerfil: 0, entram: 4, iguais: 0, alunosQueJaEstao: 0, perfilJaEsta: false });
    expect(textoDoPlano(p)).toEqual(["Nenhum registro deste aparelho é mais novo que a cópia; 4 entram."]);
  });

  it("ficha local de 25/11 + cópia de 20/11 → fica a de 25/11; cópia mais nova → entra", () => {
    const ap = vazio();
    (ap.fichas as Map<string, Program>).set("p1", ficha("p1", "s1", "2026-11-25T10:00:00Z", { name: "ABC editada" }));
    (ap.fichas as Map<string, Program>).set("p2", ficha("p2", "s1", "2026-11-10T10:00:00Z", { active: false }));
    const b = copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-20T10:00:00Z"), ficha("p2", "s1", "2026-11-18T10:00:00Z", { active: false })] }]);
    const p = planoRestauracao(b, ap);
    expect(p.decisoes.get(chaveDoRegistro("ficha", "p1"))).toBe("fica");
    expect(p.decisoes.get(chaveDoRegistro("ficha", "p2"))).toBe("entra");
    expect(p).toMatchObject({ mantidos: 1, entram: 1 });
  });

  it("fuso: o mesmo instante em fusos diferentes é empate; com o mesmo conteúdo, igual", () => {
    const ap = vazio();
    (ap.fichas as Map<string, Program>).set("p1", ficha("p1", "s1", "2026-11-20T10:00:00-03:00"));
    const b = copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-20T13:00:00Z")] }]);
    // O conteúdo difere só no texto da data: empate pelo instante, conteúdo diferente → entra (como antes).
    expect(planoRestauracao(b, ap).decisoes.get("ficha:p1")).toBe("entra");
    (ap.fichas as Map<string, Program>).set("p1", ficha("p1", "s1", "2026-11-20T13:00:00Z", { active: false }));
    // Só a ficha ativa mudou no aparelho: igual (a escolha da ativa não é edição do conteúdo).
    expect(planoRestauracao(b, ap).decisoes.get("ficha:p1")).toBe("igual");
  });

  it("data ilegível nunca vence uma legível", () => {
    const ap = vazio();
    (ap.fichas as Map<string, Program>).set("p1", ficha("p1", "s1", "2026-11-01T10:00:00Z"));
    expect(planoRestauracao(copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "lixo")] }]), ap).decisoes.get("ficha:p1")).toBe("fica");
    (ap.fichas as Map<string, Program>).set("p1", ficha("p1", "s1", "lixo"));
    expect(planoRestauracao(copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-01T10:00:00Z")] }]), ap).decisoes.get("ficha:p1")).toBe("entra");
  });

  it("treino presente nos dois e diferente → fica o do aparelho; igual → igual (sem gravar)", () => {
    const ap = vazio();
    (ap.treinos as Map<string, Session>).set("t1", treino("t1", "s1", 50));
    (ap.treinos as Map<string, Session>).set("t2", treino("t2", "s1", 40));
    const b = copiaDoPersonal([{ profile: aluno(), sessions: [treino("t1", "s1", 40), treino("t2", "s1", 40)] }]);
    const p = planoRestauracao(b, ap);
    expect([p.decisoes.get("treino:t1"), p.decisoes.get("treino:t2")]).toEqual(["fica", "igual"]);
    expect(p).toMatchObject({ mantidos: 1, iguais: 1, entram: 0 });
  });

  it("medida presente nos dois e diferente → entra (o resto entra, como antes)", () => {
    const ap = vazio();
    (ap.medidas as Map<string, BodyMetric>).set("m1", medida("m1", "s1", 60));
    expect(planoRestauracao(copiaDoPersonal([{ profile: aluno(), metrics: [medida("m1", "s1", 62)] }]), ap).decisoes.get("medida:m1")).toBe("entra");
  });

  it("dieta: a do aparelho mais nova fica; a da cópia mais nova entra", () => {
    const ap = vazio();
    (ap.dietas as Map<string, DietPlan>).set("s1", dieta("s1", "2026-11-25T10:00:00Z", "Nova"));
    expect(planoRestauracao(copiaDoPersonal([{ profile: aluno(), diet: dieta("s1", "2026-11-20T10:00:00Z") }]), ap).decisoes.get("dieta:s1")).toBe("fica");
    (ap.dietas as Map<string, DietPlan>).set("s1", dieta("s1", "2026-11-10T10:00:00Z", "Velha"));
    expect(planoRestauracao(copiaDoPersonal([{ profile: aluno(), diet: dieta("s1", "2026-11-20T10:00:00Z") }]), ap).decisoes.get("dieta:s1")).toBe("entra");
  });

  it("id que já é de outro perfil deste aparelho: fica com o dono daqui (nada muda de dono)", () => {
    const ap = vazio();
    (ap.fichas as Map<string, Program>).set("p1", ficha("p1", "sA", "2026-11-01T10:00:00Z"));
    (ap.treinos as Map<string, Session>).set("t1", treino("t1", "sA"));
    (ap.medidas as Map<string, BodyMetric>).set("m1", medida("m1", "sA"));
    const daAluna: Backup = buildBackup({ profile: { ...aluno("a-local"), managedBy: undefined }, programs: [ficha("p1", "a-local", "2026-12-01T10:00:00Z")], sessions: [treino("t1", "a-local")], metrics: [medida("m1", "a-local")] });
    const p = planoRestauracao(daAluna, ap);
    expect(p).toMatchObject({ deOutroPerfil: 3, mantidos: 0, entram: 0 });
    expect(textoDoPlano(p)).toEqual(["Nada novo para entrar.", "3 registros da cópia já pertencem a outro perfil deste aparelho e ficam com ele."]);
  });

  it("ficha ativa: a escolha do aparelho fica (ativas por dono)", () => {
    const ap = vazio();
    (ap.fichas as Map<string, Program>).set("p9", ficha("p9", "s1", "2026-11-22T10:00:00Z"));
    const p = planoRestauracao(copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-01T10:00:00Z")] }]), ap);
    expect(p.ativas.get("s1")).toBe("p9");
  });

  it("restaurar o mesmo arquivo de novo: tudo igual, nada entra", () => {
    const b = copiaDoPersonal([{ profile: aluno(), programs: [ficha("p1", "s1", "2026-11-01T10:00:00Z")], sessions: [treino("t1", "s1")], metrics: [medida("m1", "s1")], diet: dieta("s1", "2026-11-02T10:00:00Z") }]);
    const ap: AparelhoParaRestaurar = {
      fichas: new Map([["p1", ficha("p1", "s1", "2026-11-01T10:00:00Z")]]),
      dietas: new Map([["s1", dieta("s1", "2026-11-02T10:00:00Z")]]),
      treinos: new Map([["t1", treino("t1", "s1")]]),
      medidas: new Map([["m1", medida("m1", "s1")]]),
      perfis: new Set(["c1", "s1"]),
    };
    const p = planoRestauracao(b, ap);
    expect(p).toMatchObject({ mantidos: 0, entram: 0, iguais: 4, alunosQueJaEstao: 1, perfilJaEsta: true });
    expect(textoDoPlano(p)).toEqual(["Nada novo para entrar. 4 registros já estão iguais.", "O cadastro dos alunos que já estão aqui volta ao da cópia."]);
  });

  it("textoDoPlano: singular e o texto do adendo", () => {
    expect(textoDoPlano({ mantidos: 1, deOutroPerfil: 0, entram: 1, iguais: 1, alunosQueJaEstao: 0, perfilJaEsta: true })).toEqual([
      "1 registro deste aparelho é mais novo que a cópia e fica como está; 1 entra. 1 registro já está igual.",
      "O seu cadastro volta ao da cópia.",
    ]);
    expect(textoDoPlano({ mantidos: 3, deOutroPerfil: 0, entram: 12, iguais: 0, alunosQueJaEstao: 2, perfilJaEsta: true })).toEqual([
      "3 registros deste aparelho são mais novos que a cópia e ficam como estão; 12 entram.",
      "O cadastro dos alunos que já estão aqui volta ao da cópia.",
    ]);
    expect(textoDoPlano({ mantidos: 2, deOutroPerfil: 0, entram: 0, iguais: 0, alunosQueJaEstao: 0, perfilJaEsta: false })[0]).toBe("2 registros deste aparelho são mais novos que a cópia e ficam como estão; nada novo entra.");
  });
});

describe("R3-13: aluno removido + restaurar (mesclarRestauracao com atual null)", () => {
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  const lib = (id: string, registradoEm: string): Liberacao => ({ id, por: "medico", data: registradoEm.slice(0, 10), alertas: ["A-PARQ7"], registradoEm });
  const naCopia = alunoBase({
    anamnese: anamneseBase({}, { id: "rodada-2", answeredAt: "2026-11-10T10:00:00-03:00" }),
    anamnesePrev: anamneseBase({}, { id: "rodada-1", answeredAt: "2026-10-01T10:00:00-03:00" }),
    liberacoes: [lib("l1", "2026-11-11T10:00:00-03:00")],
    weightKg: 62,
    consentHealthAt: "2026-10-01T09:00:00-03:00",
    consentSource: "personal",
  });
  const REMOVIDO_EM = "2026-11-22T09:00:00-03:00";

  it("marcas de 'Remover aluno' depois da cópia: sem anamnese, sem anamnesePrev, sem liberações anteriores; o resto volta", () => {
    const apagadas = new Map([
      ["rodada-2", REMOVIDO_EM],
      ["rodada-1", REMOVIDO_EM],
    ]);
    const r = mesclarRestauracao(null, naCopia, apagadas);
    expect(r.anamnese).toBeUndefined();
    expect(r.anamnesePrev).toBeUndefined();
    expect(r.liberacoes).toBeUndefined();
    // Cadastro volta (restaurar é ato explícito).
    expect([r.name, r.weightKg, r.managedBy, r.consentHealthAt]).toEqual([naCopia.name, 62, naCopia.managedBy, naCopia.consentHealthAt]);
    expect(rodadasQueNaoVoltaram(naCopia, r, apagadas)).toBe(REMOVIDO_EM);
    expect(textoRodadasOmitidas({ nome: "Marina Costa", em: REMOVIDO_EM })).toBe("As respostas de saúde de Marina apagadas neste aparelho em 22/11 não voltaram com a cópia.");
  });

  it("só a rodada atual marcada: a anterior (respondida antes da marca) também não volta, como no caso com perfil", () => {
    const r = mesclarRestauracao(null, naCopia, new Map([["rodada-2", REMOVIDO_EM]]));
    expect(r.anamnese).toBeUndefined();
    expect(r.anamnesePrev).toBeUndefined();
  });

  it("liberação registrada depois da marca fica", () => {
    const comNova = { ...naCopia, liberacoes: [lib("l1", "2026-11-11T10:00:00-03:00"), lib("l2", "2026-11-23T10:00:00-03:00")] };
    const r = mesclarRestauracao(null, comNova, new Map([["rodada-2", REMOVIDO_EM]]));
    expect(r.liberacoes?.map((l) => l.id)).toEqual(["l2"]);
  });

  it("teste negativo: sem marca (aparelho limpo) → a cópia como veio; nada omitido", () => {
    const r = mesclarRestauracao(null, naCopia);
    expect(r).toEqual(naCopia);
    expect(rodadasQueNaoVoltaram(naCopia, r, new Map())).toBeNull();
  });

  it("teste negativo: marca de outra rodada (não é da cópia) → a cópia como veio", () => {
    expect(mesclarRestauracao(null, naCopia, new Map([["rodada-x", REMOVIDO_EM]]))).toEqual(naCopia);
  });

  it("com perfil no aparelho, a mescla de sempre continua (D-32)", () => {
    const atual = { ...naCopia, weightKg: 63 };
    expect(mesclarRestauracao(atual, naCopia).anamnese?.id).toBe("rodada-2");
  });
});
