import { describe, expect, it } from "vitest";
import type { Anamnese, AnamneseAnswers } from "@/lib/domain/anamnese-types";
import { ANAMNESE_V, CONSENT_TEXT_ID, PARQ_TEXT_ID } from "@/lib/domain/anamnese-types";
import type { Profile } from "@/lib/domain/types";

const {
  CAMPOS_DO_FORMULARIO,
  MODO_BOTAO,
  MODO_DICA,
  MODO_ROTULO,
  PADROES_CRIACAO,
  formInicial,
  modoSugerido,
  patchDoFormulario,
  pedeRevogacao,
  perfilEditado,
  rascunhoRapido,
  rotaDepoisDoCadastro,
} = await import("./student-form-state");
const { conflicts } = await import("@/lib/domain/anamnese-ficha");

const HOJE = new Date(2026, 10, 26, 15);
const AGORA = HOJE.toISOString();

/** Aluno do cadastro rápido: só nome e telefone (o que `repo.createStudent` recebe). */
const rapido: Profile = { id: "s1", name: "Beatriz Lima", phone: "11912345678", role: "athlete", plan: "free", onboarded: true, createdAt: AGORA, managedBy: "c1" };

const respostas = (a: Partial<AnamneseAnswers> = {}): Anamnese => ({
  v: ANAMNESE_V,
  id: "r1",
  answeredAt: AGORA,
  by: "aluno",
  via: "link",
  modulos: [],
  parqText: PARQ_TEXT_ID,
  a: {
    nome: "Beatriz Lima",
    ano: 1999,
    sexo: "F",
    parq: [0, 0, 0, 0, 0, 0, 0],
    regular: "nao",
    condicoes: [],
    sintomas: [],
    remedios: 0,
    cirurgia: 0,
    gestacao: "nao",
    dor: 0,
    lesao: 0,
    objetivo: "gordura",
    experiencia: "nunca",
    dias: 2,
    minutos: 45,
    onde: "casa",
    equipamentos: ["halteres"],
    nutri: "nao",
    ...a,
  },
  consent: { at: AGORA, source: "aluno_questionario", textId: CONSENT_TEXT_ID },
});

const TREINO = ["goal", "level", "daysPerWeek", "sessionMinutes", "equipment"] as const;

describe("edição sem padrões (entrada 16)", () => {
  it("formInicial(perfil só com nome e telefone, 'edicao'): objetivo, nível, dias, tempo e local vazios ('Escolher')", () => {
    const f = formInicial(rapido, "edicao");
    for (const k of TREINO) expect(f[k]).toBe("");
    expect(f.name).toBe("Beatriz Lima");
    expect(f.phone).toBe("(11) 91234-5678");
    expect(f.consent).toBe(false);
  });
  it("patchDoFormulario depois de mudar só o telefone não traz objetivo, nível, dias, tempo nem local", () => {
    const f = { ...formInicial(rapido, "edicao"), phone: "(21) 98765-4321" };
    const patch = patchDoFormulario(f);
    expect(patch).toEqual({ name: "Beatriz Lima", phone: "21987654321" });
    for (const k of TREINO) expect(k in patch).toBe(false);
  });
  it("salvo assim, as respostas que chegam depois não mostram diferença nesses campos", () => {
    const salvo = perfilEditado(rapido, { ...formInicial(rapido, "edicao"), phone: "(21) 98765-4321" });
    for (const k of TREINO) expect(salvo[k]).toBeUndefined();
    const dif = conflicts(salvo, respostas(), HOJE).map((d) => d.campo);
    for (const k of TREINO) expect(dif).not.toContain(k);
  });
  it("controle: com os padrões de antes gravados, a mesma resposta mostraria diferenças falsas", () => {
    const comPadroes: Profile = { ...rapido, ...patchDoFormulario(formInicial(rapido, "criacao")) };
    const dif = conflicts(comPadroes, respostas(), HOJE).map((d) => d.campo);
    expect(dif).toEqual(expect.arrayContaining(["goal", "daysPerWeek", "sessionMinutes", "equipment"]));
  });
  it("campo que o perfil tem aparece preenchido na edição", () => {
    const f = formInicial({ ...rapido, goal: "forca", level: "avancado", daysPerWeek: 4, sessionMinutes: 75, equipment: "home", weightKg: 72.5 }, "edicao");
    expect([f.goal, f.level, f.daysPerWeek, f.sessionMinutes, f.equipment, f.weightKg]).toEqual(["forca", "avancado", "4", "75", "home", "72,5"]);
  });
});

describe("criação pelo formulário completo (regressão)", () => {
  it("formInicial(null, 'criacao') mantém os padrões de hoje", () => {
    const f = formInicial(null, "criacao");
    expect({ goal: f.goal, level: f.level, daysPerWeek: f.daysPerWeek, sessionMinutes: f.sessionMinutes, equipment: f.equipment }).toEqual(PADROES_CRIACAO);
    expect(PADROES_CRIACAO).toEqual({ goal: "hipertrofia", level: "iniciante", daysPerWeek: "3", sessionMinutes: "60", equipment: "academia" });
    expect([f.name, f.phone, f.limitations, f.sex, f.birthYear, f.heightCm, f.weightKg, f.activity, f.coachNotes]).toEqual(["", "", "", "", "", "", "", "", ""]);
    expect(f.consent).toBe(false);
  });
  it("o patch do formulário completo grava os padrões escolhidos", () => {
    expect(patchDoFormulario({ ...formInicial(null, "criacao"), name: " Ana  Souza " })).toEqual({ name: "Ana Souza", goal: "hipertrofia", level: "iniciante", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia" });
  });
});

describe("patchDoFormulario e perfilEditado", () => {
  it("números com vírgula; limitações cortadas em 1.000", () => {
    const f = { ...formInicial(null, "edicao"), name: "Ana", weightKg: "72,5", heightCm: "168", birthYear: "1990", limitations: "x".repeat(1200) };
    const p = patchDoFormulario(f);
    expect(p.weightKg).toBe(72.5);
    expect(p.heightCm).toBe(168);
    expect(p.birthYear).toBe(1990);
    expect(p.limitations).toHaveLength(1000);
  });
  it("campo apagado pelo personal sai do cadastro; o que o formulário não controla fica", () => {
    const p: Profile = {
      ...rapido,
      goal: "forca",
      limitations: "hérnia lombar",
      coachNotes: "treina cedo",
      anamnese: respostas(),
      passosFeitos: { dieta: AGORA },
      consentHealthAt: AGORA,
      consentSource: "personal",
    };
    const r = perfilEditado(p, { ...formInicial(p, "edicao"), goal: "", limitations: "  ", coachNotes: "" });
    expect(r.goal).toBeUndefined();
    expect(r.limitations).toBeUndefined();
    expect(r.coachNotes).toBeUndefined();
    expect(r.anamnese).toBe(p.anamnese);
    expect(r.passosFeitos).toEqual({ dieta: AGORA });
    expect(r.consentHealthAt).toBe(AGORA);
    expect(r.id).toBe("s1");
  });
  it("termos do app nas limitações só continuam rastreados se ainda estão no texto", () => {
    const p: Profile = { ...rapido, limitations: "condromalácia; joelho direito; lombar", limitacoesDoQuestionario: ["joelho direito", "lombar"] };
    expect(perfilEditado(p, { ...formInicial(p, "edicao"), limitations: "condromalácia; Joelho Direito." }).limitacoesDoQuestionario).toEqual(["joelho direito"]);
    expect(perfilEditado(p, { ...formInicial(p, "edicao"), limitations: "" }).limitacoesDoQuestionario).toBeUndefined();
  });
  it("lista de campos controlados tem os 14 campos do formulário", () => {
    expect(CAMPOS_DO_FORMULARIO).toHaveLength(14);
  });
});

describe("revogação ao desmarcar a autorização", () => {
  const comSaude: Profile = { ...rapido, consentHealthAt: AGORA, consentSource: "aluno_questionario", anamnese: respostas() };
  it("pede confirmação só quando a autorização valia, foi desmarcada e há saúde do questionário", () => {
    expect(pedeRevogacao(comSaude, { consent: false })).toBe(true);
    expect(pedeRevogacao(comSaude, { consent: true })).toBe(false);
    expect(pedeRevogacao({ ...comSaude, anamnese: { ...respostas(), healthOmitted: true } }, { consent: false })).toBe(false);
    expect(pedeRevogacao({ ...comSaude, consentHealthAt: undefined, consentSource: undefined }, { consent: false })).toBe(false);
    expect(pedeRevogacao(null, { consent: false })).toBe(false);
  });
});

describe("cadastro rápido (spec §5.1)", () => {
  it("textos de cada escolha", () => {
    expect(MODO_ROTULO).toEqual({ agora: "Preencher agora", whatsapp: "Mandar pelo WhatsApp", depois: "Depois" });
    expect(MODO_DICA).toEqual({ agora: "Com o aluno do seu lado, neste aparelho.", whatsapp: "Ele responde no celular dele, sem cadastro.", depois: "Só salvar o nome por enquanto." });
    expect(MODO_BOTAO).toEqual({ agora: "Começar o questionário", whatsapp: "Salvar e mandar", depois: "Salvar aluno" });
  });
  it("padrão: sem jeito definido, muda para WhatsApp quando o telefone é digitado", () => {
    expect(modoSugerido(undefined, "")).toBe("agora");
    expect(modoSugerido(undefined, "(11) 9123")).toBe("agora");
    expect(modoSugerido(undefined, "(11) 91234-5678")).toBe("whatsapp");
  });
  it("padrão: com jeito definido, o do atendimento", () => {
    expect(modoSugerido({ atendimento: "academia" }, "(11) 91234-5678")).toBe("agora");
    expect(modoSugerido({ atendimento: "online" }, "")).toBe("whatsapp");
    expect(modoSugerido({ atendimento: "turmas" }, "")).toBe("whatsapp");
  });
  it("grava só nome e telefone", () => {
    expect(rascunhoRapido({ name: "  Beatriz   Lima ", phone: "(11) 91234-5678" })).toEqual({ name: "Beatriz Lima", phone: "11912345678" });
    expect(rascunhoRapido({ name: "Beatriz", phone: "" })).toEqual({ name: "Beatriz" });
  });
  it("destino depois de salvar, com rede", () => {
    expect(rotaDepoisDoCadastro(rapido, "agora", true)).toEqual({ href: "/questionario?aluno=s1" });
    expect(rotaDepoisDoCadastro(rapido, "whatsapp", true)).toEqual({ href: "/alunos/s1?novo=1&pedir=1" });
    expect(rotaDepoisDoCadastro(rapido, "depois", true)).toEqual({ href: "/alunos/s1?novo=1" });
    expect(rotaDepoisDoCadastro(rapido, "completo", true)).toEqual({ href: "/alunos/s1?novo=1" });
  });
  it("sem rede: 'Preencher agora' abre o questionário; o resto fica em /alunos com o aviso", () => {
    const aviso = { aviso: "Beatriz Lima foi salvo. Sem internet: a página de Beatriz Lima abre quando o sinal voltar." };
    expect(rotaDepoisDoCadastro(rapido, "agora", false)).toEqual({ href: "/questionario?aluno=s1" });
    expect(rotaDepoisDoCadastro(rapido, "whatsapp", false)).toEqual(aviso);
    expect(rotaDepoisDoCadastro(rapido, "depois", false)).toEqual(aviso);
    expect(rotaDepoisDoCadastro(rapido, "completo", false)).toEqual(aviso);
  });
  it("id com caractere especial vai codificado", () => {
    expect(rotaDepoisDoCadastro({ id: "a b", name: "X" }, "agora", true)).toEqual({ href: "/questionario?aluno=a%20b" });
  });
});
