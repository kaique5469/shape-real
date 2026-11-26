import { describe, expect, it, vi } from "vitest";
import { ANAMNESE_V, CONSENT_TEXT_ID, NAO_QUER, PARQ_TEXT_ID, REGIOES_COM_LADO, type AlertId, type Alerta, type Anamnese, type AnamneseAnswers, type Liberacao, type Parq, type WorkStyle } from "./anamnese-types";
import { EXERCISES, getExercise, normalize } from "./exercises";
import { analyzeLimitations, type GenerateInput } from "./generator";
import { getSystem, suggestSystem } from "./systems";
import { parsePacket, buildFichaPacket } from "./transfer";
import type { Profile, Program } from "./types";

/*
 * readAnamnese (track E) e motivoTetoModerado (track A) ficam com um dublê nestes testes: o que se testa aqui é o que o
 * track B faz com o resultado deles. O dublê de readAnamnese lê como o esquema tolerante faria com dado válido
 * (v maior que ANAMNESE_V → "versao_nova"); o de motivoTetoModerado devolve o motivo de "sem treino regular".
 */
vi.mock("./questionario-link", async (importOriginal) => {
  const real = await importOriginal<typeof import("./questionario-link")>();
  return {
    ...real,
    readAnamnese: (p: Profile, campo: "anamnese" | "anamnesePrev" = "anamnese") => {
      const v = p[campo] as unknown;
      if (v === undefined || v === null) return null;
      if (typeof v !== "object" || typeof (v as Anamnese).v !== "number") return "invalida";
      return (v as Anamnese).v > ANAMNESE_V ? "versao_nova" : (v as Anamnese);
    },
  };
});
vi.mock("./triagem", async (importOriginal) => {
  const real = await importOriginal<typeof import("./triagem")>();
  const alerta = (id: AlertId, nivel: Alerta["nivel"]): Alerta => ({ id, nivel, titulo: id, recomendado: "", porque: [], base: "", efeito: nivel === "vermelho" ? "trava" : "porta" });
  return {
    ...real,
    motivoTetoModerado: (an: Anamnese | undefined) => (an && an.a.regular !== "sim3m" ? "Sem treino regular nos últimos 3 meses" : null),
    // Dublê: PAR-Q 2 "sim" → vermelho; PAR-Q 7 "sim" → laranja; liberação registrada cobre os dois.
    travaEPorta: (an: Anamnese | undefined, c: { liberacoes: Liberacao[] }) => {
      const coberto = (id: AlertId) => c.liberacoes.some((l) => l.alertas.includes(id));
      const trava = an?.a.parq?.[1] === 1 && !coberto("A-PEITO") ? [alerta("A-PEITO", "vermelho")] : [];
      const porta = an?.a.parq?.[6] === 1 && !coberto("A-PARQ7") ? [alerta("A-PARQ7", "laranja")] : [];
      return { trava, porta };
    },
  };
});

const {
  FOCO_GRUPO,
  LIMITACOES_MAX,
  NAO_QUER_IDS,
  ajustesTexto,
  antesDeGerar,
  applyAnamnese,
  entradaInicial,
  errosLiberacao,
  motivosLevados,
  textoAntesDeGerar,
  avaliacaoPendente,
  contarAjustes,
  dataLiberacaoValida,
  diaLocal,
  avoidIdsFrom,
  conflicts,
  diffLimitacoes,
  emphasisFrom,
  limitationText,
  mergeLimitations,
  pickAiInput,
  sistemaCabe,
  suggestLevel,
  toGenerateInput,
  toProfilePatch,
} = await import("./anamnese-ficha");

const HOJE = new Date("2026-11-26T12:00:00.000Z");
const AGORA = HOJE.toISOString();
const CONSENT = { at: "2026-11-25T10:00:00.000Z", source: "aluno_questionario" as const, textId: CONSENT_TEXT_ID };

function an(a: AnamneseAnswers, extra: Partial<Anamnese> = {}): Anamnese {
  return { v: ANAMNESE_V, id: "r1", answeredAt: "2026-11-25T10:00:00.000Z", by: "aluno", via: "link", modulos: [], parqText: PARQ_TEXT_ID, a, consent: CONSENT, ...extra };
}
function aluno(p: Partial<Profile> = {}): Profile {
  return { id: "s1", name: "Ana Souza", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T00:00:00.000Z", managedBy: "c1", ...p };
}
const tokens = (a: AnamneseAnswers) => limitationText(a, HOJE).tokens;
const labelsOf = (t: string) => analyzeLimitations(t).labels;
const ctx = (liberacoes: Liberacao[] = []) => ({ hoje: HOJE, liberacoes });

// ───────────────────────── Limitações canônicas (spec §8.3) ─────────────────────────

describe("limitationText: cada token é reconhecido pelo motor", () => {
  const TABELA: [string, string][] = [
    ["cervical", "cervical"],
    ["ombro direito", "ombro"],
    ["ombro esquerdo", "ombro"],
    ["ombros", "ombro"],
    ["cotovelo direito", "cotovelo"],
    ["cotovelo esquerdo", "cotovelo"],
    ["cotovelos", "cotovelo"],
    ["punho direito", "punho"],
    ["punho esquerdo", "punho"],
    ["punhos", "punho"],
    ["lombar", "lombar"],
    ["quadril direito", "quadril"],
    ["quadril esquerdo", "quadril"],
    ["quadril direito e esquerdo", "quadril"],
    ["joelho direito", "joelho"],
    ["joelho esquerdo", "joelho"],
    ["joelhos", "joelho"],
    ["tornozelo direito", "tornozelo ou pé"],
    ["tornozelo esquerdo", "tornozelo ou pé"],
    ["tornozelos", "tornozelo ou pé"],
    ["artrose", "idade ou artrose"],
    ["osteoporose", "idade ou artrose"],
    ["pressão alta", "pressão ou coração"],
    ["cardiopatia", "pressão ou coração"],
    ["gestante", "gestação"],
    ["pós-parto", "pós-parto"],
    ["idoso", "idade ou artrose"],
  ];

  it.each(TABELA)("“%s” → %s", (token, label) => {
    const plan = analyzeLimitations(token);
    expect(plan.labels).toContain(label);
    expect(plan.unrecognized).toBe(false);
  });

  it("as respostas de dor geram exatamente os tokens da tabela (lado, os dois lados e sem lado)", () => {
    const dor = (r: (typeof REGIOES_COM_LADO)[number] | "pescoco" | "lombar", l?: "d" | "e" | "ambos") => tokens({ dor: 1, dorOnde: [{ r, ...(l ? { l } : {}) }] });
    expect(dor("pescoco")).toEqual(["cervical"]);
    expect(dor("lombar")).toEqual(["lombar"]);
    expect(dor("ombro", "d")).toEqual(["ombro direito"]);
    expect(dor("ombro", "e")).toEqual(["ombro esquerdo"]);
    expect(dor("ombro", "ambos")).toEqual(["ombros"]);
    expect(dor("cotovelo", "ambos")).toEqual(["cotovelos"]);
    expect(dor("punho", "ambos")).toEqual(["punhos"]);
    expect(dor("joelho", "ambos")).toEqual(["joelhos"]);
    expect(dor("tornozelo", "ambos")).toEqual(["tornozelos"]);
    expect(dor("quadril", "ambos")).toEqual(["quadril direito e esquerdo"]);
    expect(dor("joelho")).toEqual(["joelho"]);
    // Dor marcada "não": nada vira token (resposta oculta não conta).
    expect(tokens({ dor: 0, dorOnde: [{ r: "joelho", l: "d" }] })).toEqual([]);
  });

  it("'quadril direito e esquerdo' é quadril; 'quadris' não casa a regra do motor (por isso a forma por extenso)", () => {
    expect(labelsOf("quadril direito e esquerdo")).toEqual(["quadril"]);
    expect(labelsOf("quadris")).not.toContain("quadril");
    expect(analyzeLimitations("quadris").unrecognized).toBe(true);
  });

  it("nenhum token possível contém palavra de negação (sem, nenhum, nenhuma, nao tenho, nao sinto)", () => {
    const todos = new Set<string>();
    for (const r of [...REGIOES_COM_LADO, "pescoco", "lombar"] as const)
      for (const l of [undefined, "d", "e", "ambos"] as const) for (const t of tokens({ dor: 1, dorOnde: [{ r, ...(l ? { l } : {}) }] })) todos.add(t);
    const tudo: AnamneseAnswers = {
      ano: 1950,
      regular: "nao",
      dor: 1,
      dorOnde: [{ r: "joelho", l: "d" }],
      condicoes: ["artrose", "osteoporose", "pressao", "coracao"],
      pressaoControle: "naoSei",
      quedas: 1,
    };
    for (const t of tokens(tudo)) todos.add(t);
    for (const t of tokens({ gestacao: "gravida" })) todos.add(t);
    for (const t of tokens({ gestacao: "pp3" })) todos.add(t);
    expect(todos.size).toBeGreaterThanOrEqual(25);
    for (const t of todos) expect(normalize(t), t).not.toMatch(/\b(sem|nenhum|nenhuma|nao tenho|nao sinto)\b/);
  });

  it("texto combinado 'joelho direito; lombar; pressão alta' reconhece os 3 rótulos", () => {
    const a: AnamneseAnswers = { regular: "nao", dor: 1, dorOnde: [{ r: "joelho", l: "d" }, { r: "lombar" }], condicoes: ["pressao"], pressaoControle: "controlada" };
    const { texto } = limitationText(a, HOJE);
    expect(texto).toBe("joelho direito; lombar; pressão alta");
    const plan = analyzeLimitations(texto);
    expect(plan.labels).toEqual(expect.arrayContaining(["joelho", "lombar", "pressão ou coração"]));
    expect(plan.unrecognized).toBe(false);
  });

  it("parte de cima das costas, outro lugar e lesão antiga vão para naoAdaptado, nunca para o texto", () => {
    const a: AnamneseAnswers = {
      dor: 1,
      dorOnde: [{ r: "costasAlta" }, { r: "outro", t: "dor no meio das costas" }],
      lesao: 1,
      lesaoQual: "Fratura no tornozelo em 2019",
    };
    const { texto, tokens: t, naoAdaptado } = limitationText(a, HOJE);
    expect(texto).toBe("");
    expect(t).toEqual([]);
    expect(naoAdaptado).toEqual([
      "Não adaptado pelo gerador: parte de cima ou meio das costas. Revise os exercícios à mão.",
      "Não adaptado pelo gerador: “dor no meio das costas”. Ajuste à mão.",
      "Lesão antiga: “Fratura no tornozelo em 2019”. Se ainda limita, descreva em Limitações.",
    ]);
    // O texto que iria para o motor não casa a regra de lombar (nem nenhuma outra).
    expect(analyzeLimitations(texto).labels).toEqual([]);
    expect(labelsOf("dor no meio das costas")).toContain("lombar"); // por isso o texto livre fica fora
  });

  it("'pressão alta': com controle 'não sei' e com aluno não ativo; não com pressão controlada em aluno ativo", () => {
    expect(tokens({ condicoes: ["pressao"], pressaoControle: "naoSei", regular: "sim3m" })).toContain("pressão alta");
    expect(tokens({ condicoes: ["pressao"], pressaoControle: "asVezes", regular: "sim3m" })).toContain("pressão alta");
    expect(tokens({ condicoes: ["pressao"], pressaoControle: "alta", regular: "sim3m" })).toContain("pressão alta");
    expect(tokens({ condicoes: ["pressao"], pressaoControle: "controlada", regular: "pouco" })).toContain("pressão alta");
    expect(tokens({ condicoes: ["pressao"], pressaoControle: "controlada", regular: "sim3m" })).not.toContain("pressão alta");
    // Sem a condição, o controle sozinho não vira token (o remédio de pressão é assunto da triagem).
    expect(tokens({ condicoes: [], pressaoControle: "alta", regular: "nao" })).not.toContain("pressão alta");
  });

  it("'artrose' só com dor em joelho, quadril, lombar, costas altas ou pescoço", () => {
    for (const r of ["joelho", "quadril", "lombar", "costasAlta", "pescoco"] as const) expect(tokens({ condicoes: ["artrose"], dor: 1, dorOnde: [{ r }] }), r).toContain("artrose");
    expect(tokens({ condicoes: ["artrose"], dor: 0 })).not.toContain("artrose");
    expect(tokens({ condicoes: ["artrose"], dor: 1, dorOnde: [{ r: "punho", l: "d" }] })).not.toContain("artrose");
    expect(tokens({ condicoes: ["osteoporose"] })).toContain("osteoporose");
    expect(tokens({ condicoes: ["coracao"] })).toContain("cardiopatia");
    expect(tokens({ condicoes: "pessoal" })).toEqual([]);
  });

  it("'pós-parto' com pp3 e com pp12 + assoalho; nunca na gestante (gestante vira 'gestante')", () => {
    expect(tokens({ gestacao: "pp3" })).toEqual(["pós-parto"]);
    expect(tokens({ gestacao: "pp3", assoalho: 0 })).toEqual(["pós-parto"]);
    expect(tokens({ gestacao: "pp12", assoalho: 1 })).toEqual(["pós-parto"]);
    expect(tokens({ gestacao: "pp12", assoalho: 0 })).toEqual([]);
    expect(tokens({ gestacao: "gravida", assoalho: 1 })).toEqual(["gestante"]);
    expect(tokens({ gestacao: "nao" })).toEqual([]);
  });

  it("'idoso' para 66 anos não ativo e para 66 com queda; não para 66 ativo sem queda", () => {
    const ano = HOJE.getFullYear() - 66;
    expect(tokens({ ano, regular: "nao" })).toContain("idoso");
    expect(tokens({ ano, regular: "sim3m", quedas: 1 })).toContain("idoso");
    expect(tokens({ ano, regular: "sim3m", medoCair: 1 })).toContain("idoso");
    expect(tokens({ ano, regular: "sim3m", quedas: 0, instavel: 0, medoCair: 0 })).not.toContain("idoso");
    expect(tokens({ ano: HOJE.getFullYear() - 60, regular: "nao" })).not.toContain("idoso");
    expect(tokens({ regular: "nao" })).not.toContain("idoso"); // idade desconhecida, sem queda
    // A-QUEDA vale com idade desconhecida e tem o token como efeito; queda respondida abaixo de 65 (resposta oculta) não conta.
    expect(tokens({ regular: "sim3m", quedas: 1 })).toContain("idoso");
    expect(tokens({ ano: HOJE.getFullYear() - 50, regular: "sim3m", quedas: 1 })).not.toContain("idoso");
  });
});

describe("mapas do treino (spec §4.8)", () => {
  it("todos os ids de NAO_QUER_IDS existem em EXERCISES, e todo 'não quero' tem pelo menos um", () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const n of NAO_QUER) {
      expect(NAO_QUER_IDS[n].length, n).toBeGreaterThan(0);
      for (const id of NAO_QUER_IDS[n]) expect(ids.has(id), `${n}: ${id}`).toBe(true);
    }
  });

  it("avoidIdsFrom junta sem repetir; emphasisFrom usa FOCO_GRUPO (até 3)", () => {
    expect(avoidIdsFrom({ naoQuer: ["agachamento", "terra"] })).toEqual(["agachamento_livre", "agachamento_frontal", "levantamento_terra", "levantamento_terra_sumo"]);
    expect(avoidIdsFrom({ naoQuer: [] })).toEqual([]);
    expect(avoidIdsFrom({})).toEqual([]);
    expect(emphasisFrom({ foco: ["gluteos", "pernas", "bracos"] })).toEqual(["gluteos", "quadriceps", "biceps"]);
    expect(FOCO_GRUPO).toEqual({ gluteos: "gluteos", pernas: "quadriceps", abdomen: "abdomen", bracos: "biceps", costas: "costas", peito: "peito", ombros: "ombros" });
    for (const g of Object.values(FOCO_GRUPO)) expect(EXERCISES.some((e) => e.group === g), g).toBe(true);
  });
});

// ───────────────────────── Nível e cadastro (spec §8.1) ─────────────────────────

describe("suggestLevel", () => {
  it("cada experiência × parado; nunca 'avancado'", () => {
    expect(suggestLevel({ experiencia: "nunca" })).toEqual({ level: "iniciante", voltandoDePausa: false });
    expect(suggestLevel({ experiencia: "m3" })).toEqual({ level: "iniciante", voltandoDePausa: false });
    expect(suggestLevel({ experiencia: "m12" })).toEqual({ level: "intermediario", voltandoDePausa: false });
    expect(suggestLevel({ experiencia: "a3" })).toEqual({ level: "intermediario", voltandoDePausa: false });
    expect(suggestLevel({ experiencia: "mais3" })).toEqual({ level: "intermediario", nota: "Pode ser avançado: confirme na primeira aula", voltandoDePausa: false });
    // Parado de 3 a 12 meses ou mais de 1 ano: volta a iniciante (sem a nota de avançado).
    for (const parado of ["m12", "mais12"] as const) for (const experiencia of ["m3", "m12", "a3", "mais3"] as const) expect(suggestLevel({ experiencia, parado, regular: "nao" }), `${experiencia}/${parado}`).toEqual({ level: "iniciante", voltandoDePausa: false });
    // Parado de 1 a 3 meses: mantém a base e marca "Voltando de pausa".
    expect(suggestLevel({ experiencia: "a3", parado: "m3", regular: "pouco" })).toEqual({ level: "intermediario", voltandoDePausa: true });
    expect(suggestLevel({ experiencia: "mais3", parado: "m3", regular: "nao" })).toMatchObject({ level: "intermediario", voltandoDePausa: true, nota: "Pode ser avançado: confirme na primeira aula" });
    expect(suggestLevel({ experiencia: "m3", parado: "m3", regular: "nao" })).toEqual({ level: "iniciante", voltandoDePausa: true });
    // Parado há menos de 1 mês não muda nada.
    expect(suggestLevel({ experiencia: "a3", parado: "m1", regular: "pouco" })).toEqual({ level: "intermediario", voltandoDePausa: false });
    for (const experiencia of ["nunca", "m3", "m12", "a3", "mais3", undefined] as const)
      for (const parado of ["m1", "m3", "m12", "mais12", undefined] as const) expect(suggestLevel({ experiencia, parado }).level).not.toBe("avancado");
  });
});

describe("toProfilePatch", () => {
  it("mapeia goal, nível, dias, tempo, equipment, activity, foco e identidade", () => {
    const p = toProfilePatch(an({ nome: "  Ana   Souza ", ano: 1990, sexo: "F", altura: 165, peso: 62.5, objetivo: "massa", experiencia: "m12", dias: 4, minutos: 60, onde: "academia", trabalho: "sentado", foco: ["gluteos"] }), HOJE);
    expect(p).toEqual({ name: "Ana Souza", birthYear: 1990, sex: "F", heightCm: 165, weightKg: 62.5, goal: "hipertrofia", level: "intermediario", daysPerWeek: 4, sessionMinutes: 60, equipment: "academia", activity: "sedentario", emphasis: ["gluteos"] });
  });

  it("objetivo → goal (tabela §4.8)", () => {
    const goal = (objetivo: AnamneseAnswers["objetivo"]) => toProfilePatch(an({ objetivo }), HOJE).goal;
    expect([goal("massa"), goal("forca"), goal("gordura"), goal("folego"), goal("esporte"), goal("saude"), goal("semDor")]).toEqual(["hipertrofia", "forca", "emagrecimento", "condicionamento", "condicionamento", "saude", "saude"]);
  });

  it("equipment: condomínio → home; casa com item → home; casa ou ar livre com 'nada' → peso_corporal", () => {
    const eq = (a: AnamneseAnswers) => toProfilePatch(an(a), HOJE).equipment;
    expect(eq({ onde: "academia" })).toBe("academia");
    expect(eq({ onde: "condominio", equipamentos: ["halteres"] })).toBe("home");
    expect(eq({ onde: "casa", equipamentos: ["halteres", "elasticos"] })).toBe("home");
    expect(eq({ onde: "casa", equipamentos: ["nada"] })).toBe("peso_corporal");
    expect(eq({ onde: "livre", equipamentos: ["nada"] })).toBe("peso_corporal");
    expect(eq({})).toBeUndefined();
  });

  it("activity: sentado → sedentário; em pé → leve; andando → moderado; turnos e sem trabalho não gravam", () => {
    const act = (trabalho: AnamneseAnswers["trabalho"]) => toProfilePatch(an({ trabalho }), HOJE).activity;
    expect([act("sentado"), act("pe"), act("andando"), act("turnos"), act("nenhum")]).toEqual(["sedentario", "leve", "moderado", undefined, undefined]);
  });

  it("sexo 'prefiro não dizer' não grava; healthOmitted não grava peso, altura nem limitações", () => {
    expect(toProfilePatch(an({ sexo: "nd" }), HOJE).sex).toBeUndefined();
    const p = toProfilePatch(an({ altura: 170, peso: 80, dor: 1, dorOnde: [{ r: "lombar" }], objetivo: "gordura" }, { healthOmitted: true, consent: undefined }), HOJE);
    expect(p).toEqual({ goal: "emagrecimento" });
  });

  it("limitações: texto canônico e tokens rastreados", () => {
    const p = toProfilePatch(an({ dor: 1, dorOnde: [{ r: "joelho", l: "e" }] }), HOJE);
    expect(p.limitations).toBe("joelho esquerdo");
    expect(p.limitacoesDoQuestionario).toEqual(["joelho esquerdo"]);
  });
});

// ───────────────────────── Mescla (spec §8.2) ─────────────────────────

describe("conflicts", () => {
  it("vazio no cadastro não gera diferença; dias diferentes → padrão 'cadastro'; sexo diferente → padrão 'resposta'", () => {
    const respostas = an({ sexo: "F", ano: 1990, dias: 4, minutos: 45, objetivo: "gordura", peso: 70 });
    expect(conflicts(aluno(), respostas, HOJE)).toEqual([]);
    const d = conflicts(aluno({ sex: "M", birthYear: 1991, daysPerWeek: 3, sessionMinutes: 45, goal: "emagrecimento", weightKg: 72 }), respostas, HOJE);
    expect(d.map((x) => [x.campo, x.padrao])).toEqual([
      ["birthYear", "resposta"],
      ["sex", "resposta"],
      ["weightKg", "cadastro"],
      ["daysPerWeek", "cadastro"],
    ]);
    expect(d.find((x) => x.campo === "daysPerWeek")).toEqual({ campo: "daysPerWeek", rotulo: "Dias por semana", cadastro: "3 dias", resposta: "4 dias", padrao: "cadastro" });
    expect(d.find((x) => x.campo === "sex")).toMatchObject({ cadastro: "Masculino", resposta: "Feminino" });
  });

  it("foco compara como conjunto; limitações não entram (têm a linha própria)", () => {
    expect(conflicts(aluno({ emphasis: ["quadriceps", "gluteos"] }), an({ foco: ["gluteos", "pernas"] }), HOJE)).toEqual([]);
    expect(conflicts(aluno({ emphasis: ["peito"] }), an({ foco: ["gluteos"] }), HOJE)).toEqual([{ campo: "emphasis", rotulo: "Foco", cadastro: "Peito", resposta: "Glúteos", padrao: "cadastro" }]);
    expect(conflicts(aluno({ limitations: "ombro" }), an({ dor: 1, dorOnde: [{ r: "lombar" }] }), HOJE)).toEqual([]);
  });
});

describe("mergeLimitations e diffLimitacoes", () => {
  it("junta sem repetir trecho igual (sem acento e sem caixa) e não marca como do app o que o personal já tinha", () => {
    expect(mergeLimitations("Joelho direito", [], ["joelho direito"])).toEqual({ texto: "Joelho direito", doApp: [] });
    expect(mergeLimitations("Pressão alta.", [], ["pressao alta"])).toEqual({ texto: "Pressão alta.", doApp: [] });
    expect(mergeLimitations(undefined, [], ["joelho direito", "lombar"])).toEqual({ texto: "joelho direito; lombar", doApp: ["joelho direito", "lombar"] });
    expect(mergeLimitations("", [], [])).toEqual({ texto: "", doApp: [] });
  });

  it("nunca perde nem altera o texto do personal", () => {
    const personal = "Dor no ombro ao supinar, cuidado com desenvolvimento;evitar barra";
    const r = mergeLimitations(personal, [], ["lombar"]);
    expect(r.texto.startsWith(personal)).toBe(true);
    expect(r.texto).toBe(`${personal}; lombar`);
    expect(r.doApp).toEqual(["lombar"]);
    // Trecho do personal que contém o token não é confundido com ele (só trecho igual conta).
    expect(mergeLimitations("sem dor lombar há 1 ano", [], ["lombar"]).texto).toBe("sem dor lombar há 1 ano; lombar");
  });

  it("rodada nova sem dor tira 'joelho direito' posto pelo app e mantém o texto do personal", () => {
    const r = mergeLimitations("Cuidado com impacto; joelho direito", ["joelho direito"], []);
    expect(r).toEqual({ texto: "Cuidado com impacto", doApp: [] });
    // O token que continua vindo fica, e continua sendo do app.
    expect(mergeLimitations("Cuidado com impacto; joelho direito; lombar", ["joelho direito", "lombar"], ["lombar"])).toEqual({ texto: "Cuidado com impacto; lombar", doApp: ["lombar"] });
    // Token do app que o personal reescreveu não é mais do app e não sai.
    expect(mergeLimitations("joelho direito (menisco)", ["joelho direito"], [])).toEqual({ texto: "joelho direito (menisco)", doApp: [] });
  });

  it("diffLimitacoes mostra Sai e Entra e o texto final", () => {
    const p = aluno({ limitations: "Cuidado com impacto; joelho direito", limitacoesDoQuestionario: ["joelho direito"] });
    const d = diffLimitacoes(p, an({ dor: 1, dorOnde: [{ r: "lombar" }] }), HOJE);
    expect(d).toEqual({ sai: ["joelho direito"], entra: ["lombar"], texto: "Cuidado com impacto; lombar", doApp: ["lombar"], excede: false });
    // healthOmitted: nada muda.
    expect(diffLimitacoes(p, an({}, { healthOmitted: true }), HOJE)).toEqual({ sai: [], entra: [], texto: "Cuidado com impacto; joelho direito", doApp: ["joelho direito"], excede: false });
  });

  it("texto combinado de 1.000 caracteres é aceito; 1.001 excede e as limitações não mudam", () => {
    const respostas = an({ dor: 1, dorOnde: [{ r: "lombar" }] }); // acrescenta "; lombar" (8 caracteres)
    const ate = (n: number) => "x".repeat(n);
    const ok = diffLimitacoes(aluno({ limitations: ate(LIMITACOES_MAX - 8) }), respostas, HOJE);
    expect(ok.texto.length).toBe(1000);
    expect(ok.excede).toBe(false);
    const longo = aluno({ limitations: ate(LIMITACOES_MAX - 7) });
    const ruim = diffLimitacoes(longo, respostas, HOJE);
    expect(ruim.texto.length).toBe(1001);
    expect(ruim.excede).toBe(true);
    const depois = applyAnamnese(longo, respostas, {}, AGORA);
    expect(depois.limitations).toBe(longo.limitations);
    expect(depois.limitacoesDoQuestionario).toBeUndefined();
    expect(depois.anamnese?.id).toBe("r1"); // o resto é registrado
  });

  it("parsePacket aceita uma ficha com limitações de 1.000 caracteres (pior caso do texto combinado)", () => {
    const coach: Profile = { id: "c1", name: "Carla Personal", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-11-01T00:00:00.000Z" };
    const student = aluno({ limitations: `${"x".repeat(992)}; lombar` });
    expect(student.limitations!.length).toBe(1000);
    const packet = buildFichaPacket({ coach, student, program: null, diet: null, customExercises: [], customFoods: [], now: HOJE });
    const parsed = parsePacket(JSON.parse(JSON.stringify(packet)));
    expect(parsed?.kind).toBe("ficha");
    expect((parsed as { student: { limitations?: string } }).student.limitations).toBe(student.limitations);
    // E 1.001 não passa: por isso a mescla não deixa o texto crescer além do teto.
    const grande = buildFichaPacket({ coach, student: aluno({ limitations: "x".repeat(1001) }), program: null, diet: null, customExercises: [], customFoods: [], now: HOJE });
    expect(parsePacket(JSON.parse(JSON.stringify(grande)))).toBeNull();
  });
});

describe("applyAnamnese", () => {
  const respostas = an({ nome: "Ana Souza", ano: 1990, sexo: "F", objetivo: "gordura", experiencia: "m12", dias: 4, minutos: 45, onde: "academia", dor: 1, dorOnde: [{ r: "lombar" }], foco: ["gluteos"] });

  it("cadastro vazio: preenche tudo sem perguntar, grava a autorização do questionário e o recebimento", () => {
    const p = applyAnamnese(aluno({ coachNotes: "Prefere treinar cedo" }), respostas, {}, AGORA);
    expect(p).toMatchObject({ birthYear: 1990, sex: "F", goal: "emagrecimento", level: "intermediario", daysPerWeek: 4, sessionMinutes: 45, equipment: "academia", emphasis: ["gluteos"], limitations: "lombar", limitacoesDoQuestionario: ["lombar"] });
    expect(p.coachNotes).toBe("Prefere treinar cedo");
    expect(p.consentHealthAt).toBe(CONSENT.at);
    expect(p.consentSource).toBe("aluno_questionario");
    expect(p.anamnese).toEqual({ ...respostas, receivedAt: AGORA });
    expect(p.anamnesePrev).toBeUndefined();
  });

  it("diferenças seguem a escolha; sem escolha, o padrão da linha (sexo e ano: resposta; o resto: cadastro)", () => {
    const antes = aluno({ sex: "M", birthYear: 1991, daysPerWeek: 3, goal: "hipertrofia" });
    const padrao = applyAnamnese(antes, respostas, {}, AGORA);
    expect(padrao).toMatchObject({ sex: "F", birthYear: 1990, daysPerWeek: 3, goal: "hipertrofia" });
    const escolhido = applyAnamnese(antes, respostas, { daysPerWeek: "resposta", sex: "cadastro" }, AGORA);
    expect(escolhido).toMatchObject({ sex: "M", birthYear: 1990, daysPerWeek: 4, goal: "hipertrofia" });
  });

  it("mantém a autorização já confirmada (data e origem originais)", () => {
    const p = applyAnamnese(aluno({ consentHealthAt: "2026-10-01T00:00:00.000Z", consentSource: "personal" }), respostas, {}, AGORA);
    expect(p.consentHealthAt).toBe("2026-10-01T00:00:00.000Z");
    expect(p.consentSource).toBe("personal");
    // Data antiga sem origem em aluno do personal não vale: a do questionário entra.
    const velho = applyAnamnese(aluno({ consentHealthAt: "2025-01-01T00:00:00.000Z" }), respostas, {}, AGORA);
    expect(velho.consentHealthAt).toBe(CONSENT.at);
    expect(velho.consentSource).toBe("aluno_questionario");
  });

  it("healthOmitted: não grava autorização nem campos de saúde, e limitações não mudam", () => {
    const semSaude = an({ objetivo: "gordura", altura: 170, peso: 80 }, { healthOmitted: true, consent: undefined });
    const antes = aluno({ limitations: "ombro direito", limitacoesDoQuestionario: ["ombro direito"] });
    const p = applyAnamnese(antes, semSaude, {}, AGORA);
    expect(p.consentHealthAt).toBeUndefined();
    expect(p.weightKg).toBeUndefined();
    expect(p.heightCm).toBeUndefined();
    expect(p.limitations).toBe("ombro direito");
    expect(p.limitacoesDoQuestionario).toEqual(["ombro direito"]);
    expect(p.goal).toBe("emagrecimento");
  });

  it("limitações 'manter' não muda nada; 'aplicar' (padrão) faz a mescla", () => {
    const antes = aluno({ limitations: "Cuidado com impacto; joelho direito", limitacoesDoQuestionario: ["joelho direito"] });
    expect(applyAnamnese(antes, respostas, { limitacoes: "manter" }, AGORA)).toMatchObject({ limitations: antes.limitations, limitacoesDoQuestionario: ["joelho direito"] });
    expect(applyAnamnese(antes, respostas, {}, AGORA)).toMatchObject({ limitations: "Cuidado com impacto; lombar", limitacoesDoQuestionario: ["lombar"] });
  });

  it("rodada: id novo leva a atual para anamnesePrev; mesmo id substitui sem mexer em anamnesePrev", () => {
    const r0 = an({ objetivo: "massa" }, { id: "r0", answeredAt: "2026-06-01T10:00:00.000Z", overrides: [{ at: "2026-06-02T10:00:00.000Z", alertas: ["A-DOENCA"] }] });
    const r1 = applyAnamnese(aluno({ anamnese: r0 }), respostas, {}, AGORA);
    expect(r1.anamnese?.id).toBe("r1");
    expect(r1.anamnesePrev).toBe(r0);
    const bem = aluno({ anamnese: { ...respostas, overrides: [{ at: "2026-11-25T12:00:00.000Z", alertas: ["A-PARQ7"] }], vistoEm: "2026-11-25T12:00:00.000Z" }, anamnesePrev: r0 });
    const reenviado = applyAnamnese(bem, an({ ...respostas.a, dias: 5 }), {}, AGORA);
    expect(reenviado.anamnesePrev).toBe(r0);
    expect(reenviado.anamnese?.a.dias).toBe(5);
    // O "Seguir mesmo assim" registrado nesta rodada fica; o selo de visto, não.
    expect(reenviado.anamnese?.overrides).toEqual([{ at: "2026-11-25T12:00:00.000Z", alertas: ["A-PARQ7"] }]);
    expect(reenviado.anamnese?.vistoEm).toBeUndefined();
  });

  it("limpa o pedido pendente quando é a resposta dele; outro pedido continua", () => {
    const pedido = { id: "r1", at: "2026-11-20T10:00:00.000Z", modulos: [], packed: "x" };
    expect(applyAnamnese(aluno({ anamnesePedido: pedido }), respostas, {}, AGORA).anamnesePedido).toBeUndefined();
    expect(applyAnamnese(aluno({ anamnesePedido: { ...pedido, id: "r9" } }), respostas, {}, AGORA).anamnesePedido?.id).toBe("r9");
  });

  it("modo junto não ganha receivedAt; o perfil de entrada não é alterado", () => {
    const antes = aluno();
    const copia = JSON.parse(JSON.stringify(antes));
    const p = applyAnamnese(antes, { ...respostas, via: "junto", by: "personal", consent: { ...CONSENT, source: "personal" } }, {}, AGORA);
    expect(p.anamnese?.receivedAt).toBeUndefined();
    expect(p.consentSource).toBe("personal");
    expect(antes).toEqual(copia);
  });
});

// ───────────────────────── Gerador (spec §8.5) ─────────────────────────

describe("sistemaCabe", () => {
  it("a divisão precisa de no máximo os dias do aluno; a livre sempre cabe", () => {
    expect(sistemaCabe("abc", 3)).toBe(true);
    expect(sistemaCabe("abcd", 3)).toBe(false);
    expect(sistemaCabe("ab", 2)).toBe(true);
    expect(sistemaCabe("ppl6", 5)).toBe(false);
    expect(sistemaCabe("livre", 2)).toBe(true);
  });
});

describe("toGenerateInput", () => {
  const respostas = an({ nome: "Ana Souza", objetivo: "massa", experiencia: "mais3", regular: "sim3m", dias: 3, minutos: 60, onde: "casa", equipamentos: ["halteres", "elasticos"], naoQuer: ["afundo"], foco: ["gluteos"], dor: 1, dorOnde: [{ r: "joelho", l: "d" }] });
  const mesclado = (extra: Partial<Profile> = {}, a: Anamnese = respostas) => applyAnamnese(aluno(extra), a, {}, AGORA);

  it("usa o cadastro já mesclado, o foco, os 'não quero' e mostra o porquê de cada linha", () => {
    const f = toGenerateInput(mesclado(), undefined, HOJE, ctx())!;
    expect(f.input).toEqual({
      goal: "hipertrofia",
      level: "intermediario",
      daysPerWeek: 3,
      sessionMinutes: 60,
      equipment: "home",
      limitations: "joelho direito",
      system: f.input.system,
      emphasis: ["gluteos"],
      avoidIds: ["afundo", "passada", "afundo_smith", "agachamento_bulgaro"],
    });
    expect(f.nivelNota).toBe("Pode ser avançado: confirme na primeira aula");
    expect(f.tetoMotivo).toBeNull();
    expect(f.input.intensityCap).toBeUndefined();
    const textos = f.motivos.map((m) => m.texto);
    expect(textos).toEqual(
      expect.arrayContaining([
        "Objetivo: Hipertrofia",
        "Nível sugerido: Intermediário (confirme)",
        "3× por semana, 60 min",
        "Local: Em casa; tem: halteres, elásticos",
        "Limitações consideradas: joelho",
        "Foco: Glúteos",
        "Fora da ficha a pedido de Ana: afundo e passada",
      ]),
    );
    for (const m of f.motivos) if (!m.texto.startsWith("Intensidade")) expect(m.porque.length, m.texto).toBeGreaterThan(0);
    expect(f.motivos.find((m) => m.texto.startsWith("Objetivo"))!.porque).toEqual([{ pergunta: "Objetivo", resposta: "Ganhar massa muscular" }]);
    expect(f.cuidados).toEqual([]);
  });

  it("divisão: ws.divisao quando cabe; senão suggestSystem com aviso", () => {
    const cabe = toGenerateInput(mesclado(), { divisao: "ab" }, HOJE, ctx())!;
    expect(cabe.input.system).toBe("ab");
    expect(cabe.motivos.map((m) => m.texto)).toContain("Divisão: AB (seu padrão)");
    expect(cabe.avisos).toEqual([]);
    const naoCabe = toGenerateInput(mesclado(), { divisao: "abcd" }, HOJE, ctx())!;
    expect(naoCabe.input.system).not.toBe("abcd");
    expect(naoCabe.avisos).toEqual([`ABCD precisa de 4 dias; Ana tem 3: usamos ${getSystem(naoCabe.input.system!).short}.`]);
    expect(naoCabe.motivos.map((m) => m.texto)).toContain(`Divisão: ${getSystem(naoCabe.input.system!).short} (sugerida para 3 dias)`);
    // Sem padrão, a preferida do aluno (quando cabe).
    expect(toGenerateInput(mesclado({ preferredSystem: "ppl" }), undefined, HOJE, ctx())!.input.system).toBe("ppl");
  });

  it("intensityCap 'moderada' quando há motivo de teto (aluno não ativo)", () => {
    const parado = mesclado({}, an({ ...respostas.a, regular: "nao" }));
    const f = toGenerateInput(parado, undefined, HOJE, ctx())!;
    expect(f.input.intensityCap).toBe("moderada");
    expect(f.tetoMotivo).toBe("Sem treino regular nos últimos 3 meses");
    expect(f.motivos.map((m) => m.texto)).toContain("Intensidade moderada: Sem treino regular nos últimos 3 meses");
  });

  it("durationWeeks e dias/tempo de reserva vêm do jeito de trabalhar", () => {
    const ws: WorkStyle = { semanas: 6, dias: 4, minutos: 45 };
    const f = toGenerateInput(mesclado(), ws, HOJE, ctx())!;
    expect(f.durationWeeks).toBe(6);
    expect(f.motivos.map((m) => m.texto)).toContain("Validade: 6 semanas (seu padrão)");
    // Sem dias e tempo no cadastro, o padrão do personal serve de reserva.
    const semRotina = toGenerateInput(mesclado({}, an({ objetivo: "massa" })), ws, HOJE, ctx())!;
    expect(semRotina.input).toMatchObject({ daysPerWeek: 4, sessionMinutes: 45 });
  });

  it("resumoCurto 'ABC · 4×60 min · sem …' e aviso de dias fora de 2 a 6", () => {
    const f = toGenerateInput(mesclado(), { divisao: "abc" }, HOJE, ctx())!;
    expect(f.resumoCurto).toBe("ABC · 3×60 min · sem afundo");
    const muitos = toGenerateInput(mesclado({}, an({ ...respostas.a, dias: 7, naoQuer: ["afundo", "saltos", "correr"] })), { divisao: "abc" }, HOJE, ctx())!;
    expect(muitos.input.daysPerWeek).toBe(6);
    expect(muitos.avisos).toContain("Ana disse 7 dias; a ficha trabalha com 2 a 6.");
    expect(muitos.resumoCurto).toBe("ABC · 6×60 min · sem afundo, saltos e mais 1");
    const um = toGenerateInput(mesclado({}, an({ ...respostas.a, dias: 1, naoQuer: [] })), undefined, HOJE, ctx())!;
    expect(um.input.daysPerWeek).toBe(2);
    expect(um.avisos).toContain("Ana disse 1 dia; a ficha trabalha com 2 a 6.");
    expect(um.resumoCurto).not.toContain("sem");
  });

  it("'Não adaptado' inclui as regiões de §8.3 e as restrições da liberação", () => {
    const comCostas = mesclado({}, an({ ...respostas.a, dorOnde: [{ r: "costasAlta" }] }));
    const lib: Liberacao = { id: "l1", por: "medico", data: "2026-11-20", restricoes: "Sem carga acima da cabeça", alertas: ["A-DOENCA"], registradoEm: "2026-11-26T10:00:00.000Z" };
    const f = toGenerateInput(comCostas, undefined, HOJE, ctx([lib]))!;
    expect(f.naoAdaptado).toEqual(["Não adaptado pelo gerador: parte de cima ou meio das costas. Revise os exercícios à mão.", "Restrições da liberação: Sem carga acima da cabeça. Ajuste a ficha à mão."]);
  });

  it("null sem respostas e com respostas ilegíveis (versão nova ou danificadas)", () => {
    expect(toGenerateInput(aluno(), undefined, HOJE, ctx())).toBeNull();
    expect(toGenerateInput(aluno({ anamnese: { ...respostas, v: ANAMNESE_V + 1 } }), undefined, HOJE, ctx())).toBeNull();
    expect(toGenerateInput(aluno({ anamnese: "lixo" as unknown as Anamnese }), undefined, HOJE, ctx())).toBeNull();
  });

  it("a entrada sugerida gera uma ficha válida no motor, sem os exercícios recusados", async () => {
    const { generateProgram } = await import("./generator");
    const f = toGenerateInput(mesclado(), { divisao: "abc" }, HOJE, ctx())!;
    const p: Program = generateProgram({ ...(f.input as GenerateInput), seed: 7 }, { ownerId: "s1", createdBy: "c1" });
    const ids = p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    for (const id of f.input.avoidIds!) expect(ids).not.toContain(id);
    for (const id of ids) expect(getExercise(id), id).toBeDefined();
  });
});

describe("pickAiInput", () => {
  it("devolve só goal, level, daysPerWeek, sessionMinutes, equipment, system, limitations, emphasis, seed e notes", () => {
    const tudo = {
      goal: "hipertrofia",
      level: "iniciante",
      daysPerWeek: 3,
      sessionMinutes: 60,
      equipment: "academia",
      system: "abc",
      limitations: "joelho direito",
      emphasis: ["gluteos"],
      seed: 3,
      notes: "quero terra",
      avoidIds: ["afundo"],
      intensityCap: "moderada",
      anamnese: { a: { condicoes: ["pressao"] } },
      naoQuer: ["afundo"],
    } as unknown as GenerateInput & { notes?: string };
    const out = pickAiInput(tudo);
    expect(Object.keys(out).sort()).toEqual(["daysPerWeek", "emphasis", "equipment", "goal", "level", "limitations", "notes", "seed", "sessionMinutes", "system"]);
    expect(JSON.stringify(out)).not.toMatch(/afundo|moderada|pressao/);
    // Campos ausentes não aparecem como chave.
    expect(Object.keys(pickAiInput({ goal: "saude", level: "iniciante", daysPerWeek: 2, sessionMinutes: 30, equipment: "home", system: "fullbody" }))).not.toContain("notes");
  });
});

describe("antesDeGerar e avaliacaoPendente (trava, porta e respostas ilegíveis)", () => {
  const parq = (i: number): Parq => [0, 0, 0, 0, 0, 0, 0].map((v, k) => (k === i ? 1 : v)) as Parq;
  const lib = (alertas: AlertId[]): Liberacao => ({ id: "l1", por: "medico", data: "2026-11-26", alertas, registradoEm: AGORA });

  it("sem questionário: livre (o gerador segue como hoje) e sem faixa no editor", () => {
    expect(antesDeGerar(aluno(), HOJE)).toEqual({ modo: "livre" });
    expect(avaliacaoPendente(aluno(), HOJE)).toBe(false);
  });

  it("vermelho aberto → trava; com a liberação registrada → livre", () => {
    const p = aluno({ anamnese: an({ parq: parq(1) }) });
    expect(antesDeGerar(p, HOJE)).toMatchObject({ modo: "trava", alertas: [{ id: "A-PEITO" }] });
    expect(avaliacaoPendente(p, HOJE)).toBe(true);
    const liberado = { ...p, liberacoes: [lib(["A-PEITO"])] };
    expect(antesDeGerar(liberado, HOJE)).toEqual({ modo: "livre" });
    expect(avaliacaoPendente(liberado, HOJE)).toBe(false);
  });

  it("laranja aberto → porta; vermelho e laranja juntos → trava primeiro", () => {
    expect(antesDeGerar(aluno({ anamnese: an({ parq: parq(6) }) }), HOJE)).toMatchObject({ modo: "porta", alertas: [{ id: "A-PARQ7" }] });
    const ambos = an({ parq: [0, 1, 0, 0, 0, 0, 1] });
    expect(antesDeGerar(aluno({ anamnese: ambos }), HOJE).modo).toBe("trava");
    expect(antesDeGerar(aluno({ anamnese: ambos, liberacoes: [lib(["A-PEITO"])] }), HOJE).modo).toBe("porta");
  });

  it("respostas ilegíveis: trava com o problema (o gerador mostra a frase de §6.1)", () => {
    expect(antesDeGerar(aluno({ anamnese: { ...an({}), v: ANAMNESE_V + 1 } }), HOJE)).toEqual({ modo: "trava", alertas: [], problema: "versao_nova" });
    expect(antesDeGerar(aluno({ anamnese: "x" as unknown as Anamnese }), HOJE)).toEqual({ modo: "trava", alertas: [], problema: "invalida" });
    expect(avaliacaoPendente(aluno({ anamnese: "x" as unknown as Anamnese }), HOJE)).toBe(true);
  });
});

describe("contarAjustes (ajustes_n)", () => {
  const inicial: Partial<GenerateInput> = { goal: "hipertrofia", level: "iniciante", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", limitations: "joelho direito", emphasis: ["gluteos"] };

  it("conta goal, level, dias, minutos, equipment, system e limitations; foco e seed não contam", () => {
    expect(contarAjustes(inicial, inicial)).toBe(0);
    expect(contarAjustes(inicial, { ...inicial, emphasis: [], seed: 9 })).toBe(0);
    expect(contarAjustes(inicial, { ...inicial, daysPerWeek: 4, system: "abcd" })).toBe(2);
    expect(contarAjustes(inicial, { ...inicial, goal: "forca", level: "intermediario", daysPerWeek: 4, sessionMinutes: 45, equipment: "home", system: "fullbody", limitations: "" })).toBe(7);
    // Espaço a mais na limitação não é ajuste.
    expect(contarAjustes(inicial, { ...inicial, limitations: " joelho direito " })).toBe(0);
    expect(contarAjustes({ ...inicial, limitations: undefined }, { ...inicial, limitations: "" })).toBe(0);
  });
});

describe("data da liberação (nunca futura)", () => {
  const hoje = new Date(2026, 10, 26, 23, 30); // 26/11/2026 à noite, no fuso do aparelho

  it("hoje e o passado valem; amanhã, data inexistente e formato errado não", () => {
    expect(diaLocal(hoje)).toBe("2026-11-26");
    expect(dataLiberacaoValida("2026-11-26", hoje)).toBe(true);
    expect(dataLiberacaoValida("2025-03-10", hoje)).toBe(true);
    expect(dataLiberacaoValida("2026-11-27", hoje)).toBe(false);
    expect(dataLiberacaoValida("2027-01-01", hoje)).toBe(false);
    expect(dataLiberacaoValida("2026-02-30", hoje)).toBe(false);
    expect(dataLiberacaoValida("26/11/2026", hoje)).toBe(false);
    expect(dataLiberacaoValida("", hoje)).toBe(false);
  });
});

describe("rótulos", () => {
  it("atividade na linha de diferença usa o mesmo nome curto de ACTIVITY_LABEL", async () => {
    const { ACTIVITY_LABEL } = await import("./nutrition");
    const d = conflicts(aluno({ activity: "alto" }), an({ trabalho: "sentado" }), HOJE);
    expect(d).toEqual([{ campo: "activity", rotulo: "Atividade no dia a dia", cadastro: ACTIVITY_LABEL.alto.split(" (")[0], resposta: ACTIVITY_LABEL.sedentario.split(" (")[0], padrao: "cadastro" }]);
  });
});

// ───────────────────────── Etapa 2: estado inicial do gerador, lista da prévia, diálogos ─────────────────────────

describe("entradaInicial (estado do gerador e program.sugerido)", () => {
  it("sem questionário nem jeito: os padrões de antes (e a divisão sugerida, que segue as respostas)", () => {
    const e = entradaInicial(aluno(), undefined, null, true);
    expect(e).toEqual({
      goal: "hipertrofia",
      level: "intermediario",
      daysPerWeek: 3,
      sessionMinutes: 60,
      equipment: "academia",
      system: suggestSystem(3, "intermediario", { emphasis: [], equipment: "academia", goal: "hipertrofia" }),
      limitations: "",
      emphasis: [],
      avoidIds: [],
      teto: false,
      sistemaEscolhido: false,
    });
  });

  it("preferida do aluno trava a sugestão automática, como antes (sem conferir os dias)", () => {
    const e = entradaInicial(aluno({ preferredSystem: "ppl", daysPerWeek: 2 }), undefined, null, true);
    expect(e).toMatchObject({ system: "ppl", sistemaEscolhido: true, daysPerWeek: 2 });
  });

  it("personal para aluno: dias, tempo e local do jeito como reserva; divisão preferida quando cabe; validade padrão", () => {
    const ws: WorkStyle = { atendimento: "casa", dias: 4, minutos: 45, semanas: 6, divisao: "abcd" };
    const e = entradaInicial(aluno(), ws, null, true);
    expect(e).toMatchObject({ daysPerWeek: 4, sessionMinutes: 45, equipment: "home", system: "abcd", sistemaEscolhido: true, durationWeeks: 6 });
    // O cadastro vence a reserva; a divisão que não cabe nos dias do aluno fica de fora.
    const curto = entradaInicial(aluno({ daysPerWeek: 2, sessionMinutes: 30, equipment: "academia" }), ws, null, true);
    expect(curto).toMatchObject({ daysPerWeek: 2, sessionMinutes: 30, equipment: "academia", sistemaEscolhido: false });
    expect(curto.system).not.toBe("abcd");
  });

  it("aluno para si e modelo do personal: nada do jeito de trabalhar entra", () => {
    const e = entradaInicial(aluno(), { dias: 5, minutos: 30, semanas: 12, divisao: "ab", atendimento: "casa" }, null, false);
    expect(e).toMatchObject({ daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", sistemaEscolhido: false });
    expect(e.durationWeeks).toBeUndefined();
  });

  it("com questionário: os campos de toGenerateInput, o 'não quero fazer' e a caixa de intensidade marcada", () => {
    const p = aluno({ goal: "emagrecimento", level: "iniciante", daysPerWeek: 3, sessionMinutes: 45, equipment: "home", limitations: "joelho direito", emphasis: ["gluteos"], anamnese: an({ objetivo: "gordura", regular: "nao", naoQuer: ["afundo"] }) });
    const ficha = toGenerateInput(p, { semanas: 8 }, HOJE, ctx())!;
    const e = entradaInicial(p, { semanas: 8 }, ficha, true);
    expect(e).toMatchObject({ goal: "emagrecimento", level: "iniciante", daysPerWeek: 3, sessionMinutes: 45, equipment: "home", limitations: "joelho direito", emphasis: ["gluteos"], teto: true, durationWeeks: 8 });
    expect(e.system).toBe(ficha.input.system);
    expect(e.avoidIds).toEqual(NAO_QUER_IDS.afundo);
    // Sem nenhuma escolha mudada, ajustes_n = 0.
    expect(contarAjustes(e, e)).toBe(0);
  });
});

describe("motivosLevados e ajustesTexto (lista 'O que a ficha levou em conta')", () => {
  const base = { motivos: [{ texto: "Objetivo: Hipertrofia", porque: [] }, { texto: "Intensidade moderada: Sem treino regular nos últimos 3 meses", porque: [] }], tetoMotivo: "Sem treino regular nos últimos 3 meses" };

  it("caixa marcada com motivo: a linha fica; desmarcada: sai", () => {
    expect(motivosLevados(base, true).map((m) => m.texto)).toEqual(["Objetivo: Hipertrofia", "Intensidade moderada: Sem treino regular nos últimos 3 meses"]);
    expect(motivosLevados(base, false).map((m) => m.texto)).toEqual(["Objetivo: Hipertrofia"]);
  });

  it("marcada pelo personal sem motivo do questionário: 'marcada por você'", () => {
    const sem = { motivos: [{ texto: "Objetivo: Hipertrofia", porque: [] }], tetoMotivo: null };
    expect(motivosLevados(sem, true).map((m) => m.texto)).toEqual(["Objetivo: Hipertrofia", "Intensidade moderada: marcada por você"]);
    expect(motivosLevados(sem, false)).toEqual(sem.motivos);
  });

  it("ajustes: nada com 0; singular e plural", () => {
    expect(ajustesTexto(0)).toBeNull();
    expect(ajustesTexto(1)).toBe("Você mudou 1 escolha em relação a esta lista: a ficha usa as suas.");
    expect(ajustesTexto(3)).toBe("Você mudou 3 escolhas em relação a esta lista: a ficha usa as suas.");
  });
});

describe("textoAntesDeGerar (diálogo de spec §6.4)", () => {
  const al = (id: AlertId, nivel: Alerta["nivel"], titulo: string): Alerta => ({ id, nivel, titulo, recomendado: "", porque: [], base: "", efeito: nivel === "vermelho" ? "trava" : "porta" });

  it("livre: sem diálogo", () => {
    expect(textoAntesDeGerar({ modo: "livre" }, "Ana Souza")).toBeNull();
  });

  it("trava: títulos, frase literal, [Registrar liberação] e nenhum 'Seguir mesmo assim'", () => {
    const t = textoAntesDeGerar({ modo: "trava", alertas: [al("A-PEITO", "vermelho", "Dor no peito")] }, "Ana Souza")!;
    expect(t).toEqual({
      titulo: "Antes de gerar a ficha de Ana",
      itens: ["Dor no peito"],
      texto: "Registre a liberação para gerar a ficha com estas respostas. Você ainda pode montar a ficha do zero.",
      registrar: true,
      seguir: false,
      conversei: "Conversei com Ana sobre isso",
    });
  });

  it("porta: [Registrar liberação] e [Seguir mesmo assim] com a caixa 'Conversei com {aluno} sobre isso'", () => {
    const t = textoAntesDeGerar({ modo: "porta", alertas: [al("A-PARQ7", "laranja", "Sabe de outra razão")] }, "Ana Souza")!;
    expect(t).toMatchObject({ titulo: "Antes de gerar a ficha de Ana", itens: ["Sabe de outra razão"], texto: null, registrar: true, seguir: true, conversei: "Conversei com Ana sobre isso" });
  });

  it("respostas ilegíveis: a frase de §6.1, só [Voltar]", () => {
    const t = textoAntesDeGerar({ modo: "trava", alertas: [], problema: "versao_nova" }, "Ana")!;
    expect(t).toMatchObject({ itens: [], registrar: false, seguir: false, texto: "Respostas de uma versão mais nova do app. Atualize para ver. Você ainda pode montar a ficha do zero." });
    expect(textoAntesDeGerar({ modo: "trava", alertas: [], problema: "invalida" }, "Ana")!.texto).toBe("As respostas deste aluno estão danificadas. Peça o questionário de novo. Você ainda pode montar a ficha do zero.");
  });
});

describe("errosLiberacao (formulário 'Registrar liberação')", () => {
  const hoje = new Date(2026, 10, 26, 10, 0);
  const ok = { por: "medico" as const, data: "2026-11-26", modo: "livre" as const, restricoes: "", alertas: ["A-PEITO" as AlertId] };

  it("quem, data de hoje, sem restrição e um ponto marcado: pode gravar", () => {
    expect(errosLiberacao(ok, hoje)).toEqual({});
    expect(errosLiberacao({ ...ok, modo: "restricoes", restricoes: "sem impacto" }, hoje)).toEqual({});
  });

  it("sem quem, data futura ou inválida, restrições vazias e nenhum ponto: uma mensagem por campo", () => {
    expect(errosLiberacao({ ...ok, por: undefined }, hoje)).toEqual({ por: "Escolha quem liberou." });
    expect(errosLiberacao({ ...ok, data: "2026-11-27" }, hoje)).toEqual({ data: "A data não pode ser depois de hoje." });
    expect(errosLiberacao({ ...ok, data: "" }, hoje)).toEqual({ data: "Confira a data." });
    expect(errosLiberacao({ ...ok, modo: "restricoes", restricoes: "  " }, hoje)).toEqual({ restricoes: "Escreva as restrições ou marque “Atividade sem restrição”." });
    expect(errosLiberacao({ ...ok, alertas: [] }, hoje)).toEqual({ alertas: "Marque pelo menos um ponto." });
  });
});
