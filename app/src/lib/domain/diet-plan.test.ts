import { describe, expect, it } from "vitest";
import {
  MACRO_ORDER,
  ON_TARGET_TOLERANCE,
  adjustedNote,
  adjustingText,
  adjustingTitle,
  canAdjust,
  comparePlan,
  diffSrText,
  dietForLink,
  dietLinkSummary,
  dietOrigin,
  dietReplaceNotice,
  dietReplaceText,
  dietScreen,
  fmtDiff,
  fmtMacro,
  itemsBand,
  mealsChanged,
  metasOnlyText,
  originLine,
  planSummary,
  screenMode,
  targetsSourceLine,
  usePlanAction,
  type DietOrigin,
  type MacroComparison,
} from "./diet-plan";
import type { DietItem, DietPlan, MacroTargets, Meal } from "./types";

const metas: MacroTargets = { kcal: 1650, proteinG: 126, carbsG: 172, fatG: 51 };
const at = (cmp: MacroComparison[], key: MacroComparison["key"]) => cmp.find((c) => c.key === key)!;

describe("comparePlan (R9)", () => {
  it("1.650 × 1.647 → na meta, diferença −3", () => {
    const c = at(comparePlan(metas, { ...metas, kcal: 1647 }), "kcal");
    expect(c).toEqual({ key: "kcal", target: 1650, plan: 1647, diff: -3, status: "na_meta" });
  });
  it("1.650 × 1.733 → acima, +83", () => {
    const c = at(comparePlan(metas, { ...metas, kcal: 1733 }), "kcal");
    expect(c.status).toBe("acima");
    expect(c.diff).toBe(83);
  });
  it("1.650 × 1.567 → abaixo", () => {
    const c = at(comparePlan(metas, { ...metas, kcal: 1567 }), "kcal");
    expect(c.status).toBe("abaixo");
    expect(c.diff).toBe(-83);
  });
  it("os limites exatos de ±5% contam como na meta", () => {
    expect(ON_TARGET_TOLERANCE).toBe(0.05);
    expect(at(comparePlan(metas, { ...metas, kcal: 1732.5 }), "kcal").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, kcal: 1567.5 }), "kcal").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, proteinG: 132.3 }), "proteinG").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, proteinG: 119.7 }), "proteinG").status).toBe("na_meta");
    expect(at(comparePlan(metas, { ...metas, kcal: 1733 }), "kcal").status).toBe("acima");
    expect(at(comparePlan(metas, { ...metas, kcal: 1567 }), "kcal").status).toBe("abaixo");
  });
  it("meta 0: cardápio 0 → na meta; cardápio 10 → acima", () => {
    const zero = { ...metas, carbsG: 0 };
    expect(at(comparePlan(zero, { ...metas, carbsG: 0 }), "carbsG").status).toBe("na_meta");
    const c = at(comparePlan(zero, { ...metas, carbsG: 10 }), "carbsG");
    expect(c.status).toBe("acima");
    expect(c.diff).toBe(10);
  });
  it("segue a ordem de MACRO_ORDER (calorias, proteína, carboidrato, gordura)", () => {
    expect(MACRO_ORDER).toEqual(["kcal", "proteinG", "carbsG", "fatG"]);
    expect(comparePlan(metas, metas).map((c) => c.key)).toEqual(["kcal", "proteinG", "carbsG", "fatG"]);
  });
  it("arredonda a diferença, não o cardápio", () => {
    const c = at(comparePlan(metas, { ...metas, proteinG: 140.6 }), "proteinG");
    expect(c.plan).toBe(140.6);
    expect(c.diff).toBe(15);
  });
});

describe("fmtDiff", () => {
  it("na meta, sinal de mais, menos U+2212 e separador de milhar", () => {
    expect(fmtDiff({ diff: -3, status: "na_meta" })).toBe("na meta");
    expect(fmtDiff({ diff: 597, status: "acima" })).toBe("+597");
    expect(fmtDiff({ diff: -352, status: "abaixo" })).toBe("−352");
    expect(fmtDiff({ diff: -352, status: "abaixo" })).not.toContain("-");
    expect(fmtDiff({ diff: 1200, status: "acima" })).toBe("+1.200");
  });
  it("texto para leitor de tela só fora da meta", () => {
    expect(diffSrText("acima")).toBe("acima da meta");
    expect(diffSrText("abaixo")).toBe("abaixo da meta");
    expect(diffSrText("na_meta")).toBeNull();
  });
  it("macro com unidade e separador", () => {
    expect(fmtMacro("kcal", 1650)).toBe("1.650 kcal");
    expect(fmtMacro("proteinG", 125.6)).toBe("126 g");
  });
});

describe("planSummary (R10)", () => {
  it("todos na meta", () => {
    expect(planSummary(comparePlan(metas, { kcal: 1647, proteinG: 125, carbsG: 172, fatG: 51 }))).toBe("O cardápio fecha com as metas do dia.");
  });
  it("calorias e carboidrato acima, proteína abaixo", () => {
    expect(planSummary(comparePlan(metas, { kcal: 2247, proteinG: 100, carbsG: 289, fatG: 52 }))).toBe("Acima das metas em calorias e carboidrato. Abaixo em proteína.");
  });
  it("três acima", () => {
    expect(planSummary(comparePlan(metas, { kcal: 2247, proteinG: 141, carbsG: 289, fatG: 52 }))).toBe("Acima das metas em calorias, proteína e carboidrato.");
  });
  it("só abaixo: a frase leva 'das metas'", () => {
    expect(planSummary(comparePlan(metas, { kcal: 1647, proteinG: 90, carbsG: 172, fatG: 51 }))).toBe("Abaixo das metas em proteína.");
  });
  it("a ordem do texto segue MACRO_ORDER mesmo com a lista fora de ordem", () => {
    const cmp = comparePlan(metas, { kcal: 2247, proteinG: 141, carbsG: 289, fatG: 80 }).reverse();
    expect(planSummary(cmp)).toBe("Acima das metas em calorias, proteína, carboidrato e gordura.");
  });
  it("sem itens (null)", () => {
    expect(planSummary(null)).toBe("Monte o cardápio para comparar com as metas.");
  });
  it("nunca usa o vocabulário de consumo", () => {
    const all = [
      planSummary(null),
      planSummary(comparePlan(metas, metas)),
      planSummary(comparePlan(metas, { kcal: 2247, proteinG: 90, carbsG: 289, fatG: 10 })),
    ].join(" ");
    expect(all).not.toMatch(/faltam|passou|consumid|você comeu|Total do\s+dia/i);
  });
});

describe("itemsBand", () => {
  it("0, 3 e 6", () => {
    expect(itemsBand(0)).toBe("0");
    expect(itemsBand(3)).toBe("1-5");
    expect(itemsBand(5)).toBe("1-5");
    expect(itemsBand(6)).toBe("6+");
    expect(itemsBand(40)).toBe("6+");
  });
  it("valor estranho cai em 0", () => {
    expect(itemsBand(-1)).toBe("0");
    expect(itemsBand(Number.NaN)).toBe("0");
  });
});

// ---- U3b ------------------------------------------------------------------------------------------------------------

/** dd/mm sem depender do fuso (os testes passam a data já no formato que a tela mostra). */
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const item = (uid: string, grams = 100): DietItem => ({ uid, name: "Arroz branco cozido", foodId: "arroz_branco", grams, kcal: grams * 1.3, proteinG: grams * 0.025, carbsG: grams * 0.28, fatG: grams * 0.002 });
const meal = (uid: string, items: DietItem[], time?: string): Meal => ({ uid, name: `Refeição ${uid}`, time, items });
const plan = (patch: Partial<DietPlan> = {}): DietPlan => ({
  id: "d1",
  ownerId: "aluna",
  createdBy: "rafa",
  name: "Plano alimentar de Juliana",
  targets: metas,
  meals: [meal("m1", [item("i1")], "07:00"), meal("m2", [item("i2", 150)], "12:30")],
  notes: "Beba água.",
  updatedAt: "2026-11-10T12:00:00Z",
  ...patch,
});
const rafael = { id: "rafa", name: "Rafael Nunes", recebido: { dietAt: "2026-11-10T12:00:00Z" } };
const personal = (o: Partial<Extract<DietOrigin, { kind: "personal" }>> = {}): DietOrigin => ({ kind: "personal", coachFirstName: "Rafael", coachFullName: "Rafael Nunes", versionAt: null, adjustedAt: null, ...o });

describe("dietScreen e canAdjust (R0, R1)", () => {
  const base = { mode: "self" as const, editing: false, dirty: false, hasDraftOrDiet: true };
  it("self com itens e sem edição → leitura (personal e próprio)", () => {
    expect(dietScreen({ ...base, saved: plan(), origin: personal() })).toBe("leitura");
    expect(dietScreen({ ...base, saved: plan(), origin: { kind: "proprio" } })).toBe("leitura");
  });
  it("self do personal sem itens → leitura_metas", () => {
    expect(dietScreen({ ...base, saved: plan({ meals: [meal("m1", [])] }), origin: personal() })).toBe("leitura_metas");
    expect(dietScreen({ ...base, saved: plan({ meals: [] }), origin: personal() })).toBe("leitura_metas");
  });
  it("self próprio sem itens → edicao_propria", () => {
    expect(dietScreen({ ...base, saved: plan({ createdBy: "aluna", meals: [meal("m1", [])] }), origin: { kind: "proprio" } })).toBe("edicao_propria");
  });
  it("self sem dieta → vazio", () => {
    expect(dietScreen({ ...base, hasDraftOrDiet: false, saved: null, origin: null })).toBe("vazio");
  });
  it("self do personal com alterações (ou em edição) → ajuste", () => {
    expect(dietScreen({ ...base, dirty: true, saved: plan(), origin: personal() })).toBe("ajuste");
    expect(dietScreen({ ...base, editing: true, saved: plan(), origin: personal() })).toBe("ajuste");
    // Rascunho restaurado (sessionStorage): chega com alterações e abre em ajuste, mesmo sem versão salva.
    expect(dietScreen({ ...base, dirty: true, saved: null, origin: personal() })).toBe("ajuste");
  });
  it("self próprio em edição → edicao_propria", () => {
    expect(dietScreen({ ...base, editing: true, saved: plan({ createdBy: "aluna" }), origin: { kind: "proprio" } })).toBe("edicao_propria");
    expect(dietScreen({ ...base, dirty: true, saved: null, origin: { kind: "proprio" } })).toBe("edicao_propria");
  });
  it("coach → coach, com ou sem dieta", () => {
    expect(dietScreen({ ...base, mode: "coach", saved: plan(), origin: null })).toBe("coach");
    expect(dietScreen({ ...base, mode: "coach", hasDraftOrDiet: false, saved: null, origin: null })).toBe("coach");
  });
  it("o botão só aparece na leitura e fora de 'Ver como aluno'", () => {
    expect(canAdjust("leitura", false)).toBe(true);
    expect(canAdjust("leitura", true)).toBe(false);
    expect(canAdjust("leitura_metas", false)).toBe(false);
    expect(canAdjust("ajuste", false)).toBe(false);
    expect(canAdjust("edicao_propria", false)).toBe(false);
  });
  it("modo da medição", () => {
    expect(screenMode("ajuste")).toBe("edicao");
    expect(screenMode("edicao_propria")).toBe("edicao");
    expect(screenMode("leitura_metas")).toBe("leitura_metas");
    expect(screenMode("vazio")).toBe("vazio");
  });
});

describe("dietOrigin, originLine, targetsSourceLine e adjustedNote (R2, R5)", () => {
  it("próprio → 'Montado por você', sem linha de metas e sem nota", () => {
    const o = dietOrigin(plan({ createdBy: "aluna" }), "aluna", { remoteCoach: rafael });
    expect(o).toEqual({ kind: "proprio" });
    expect(originLine(o, day)).toBe("Montado por você");
    expect(targetsSourceLine(o)).toBeNull();
    expect(adjustedNote(o, day)).toBeNull();
    // Plano antigo sem autor também é tratado como próprio.
    expect(dietOrigin(plan({ createdBy: "" }), "aluna")).toEqual({ kind: "proprio" });
  });
  it("personal com a versão recebida (U2c) → 'versão de 10/11' e 'Definidas por Rafael.'", () => {
    const o = dietOrigin(plan(), "aluna", { remoteCoach: rafael });
    expect(o).toEqual({ kind: "personal", coachFirstName: "Rafael", coachFullName: "Rafael Nunes", versionAt: "2026-11-10T12:00:00Z", adjustedAt: null });
    expect(originLine(o, day)).toBe("Cardápio de Rafael · versão de 10/11");
    expect(targetsSourceLine(o)).toBe("Definidas por Rafael.");
    expect(adjustedNote(o, day)).toBeNull();
  });
  it("com adjustedAt → 'ajustado por você em 24/11' e a nota com o nome completo", () => {
    const o = dietOrigin(plan({ adjustedAt: "2026-11-24T15:00:00Z" }), "aluna", { remoteCoach: rafael });
    expect(originLine(o, day)).toBe("Cardápio de Rafael · ajustado por você em 24/11");
    expect(adjustedNote(o, day)).toBe("Ajustado em 24/11 a partir do cardápio de Rafael Nunes.");
  });
  it("sem a versão recebida (sem U2c, mesmo aparelho ou dado antigo) → só 'Cardápio de Rafael'", () => {
    const o = dietOrigin(plan(), "aluna", { remoteCoach: { id: "rafa", name: "Rafael Nunes" } });
    expect(originLine(o, day)).toBe("Cardápio de Rafael");
  });
  it("'Ver como aluno': o nome vem de returnTo, sem data", () => {
    const o = dietOrigin(plan(), "aluna", { returnTo: { id: "rafa", name: "Rafael Nunes" } });
    expect(originLine(o, day)).toBe("Cardápio de Rafael");
    expect(targetsSourceLine(o)).toBe("Definidas por Rafael.");
  });
  it("personal sem nome (id não bate, ou nome provisório) → 'do personal'", () => {
    const outro = dietOrigin(plan({ createdBy: "outro", adjustedAt: "2026-11-24T15:00:00Z" }), "aluna", { remoteCoach: rafael });
    expect(outro).toMatchObject({ kind: "personal", coachFirstName: null, versionAt: null });
    expect(originLine({ ...outro, adjustedAt: null } as DietOrigin, day)).toBe("Cardápio do personal");
    expect(targetsSourceLine(outro)).toBe("Definidas pelo personal.");
    expect(adjustedNote(outro, day)).toBe("Ajustado em 24/11 a partir do cardápio do personal.");
    const provisorio = dietOrigin(plan(), "aluna", { remoteCoach: { ...rafael, name: "Personal" } });
    expect(originLine(provisorio, day)).toBe("Cardápio do personal · versão de 10/11");
  });
  it("a data da versão só vem do personal atual: cardápio de outro personal não herda a data", () => {
    const o = dietOrigin(plan({ createdBy: "antigo" }), "aluna", { remoteCoach: rafael });
    expect(o).toMatchObject({ versionAt: null });
  });
});

describe("textos do ajuste (B)", () => {
  it("com nome", () => {
    expect(adjustingTitle(personal())).toBe("Ajustando o cardápio de Rafael");
    expect(adjustingText(personal())).toEqual({
      alert: "Os ajustes ficam só neste celular e não aparecem no app de Rafael. Se Rafael mandar um cardápio novo, o novo substitui estes ajustes.",
      saved: "Ajustes salvos neste aparelho. Eles não aparecem no app de Rafael.",
      locked: "As metas são de Rafael. Para mudar, fale com Rafael.",
    });
  });
  it("sem nome", () => {
    const o = personal({ coachFirstName: null, coachFullName: null });
    expect(adjustingTitle(o)).toBe("Ajustando o cardápio do personal");
    expect(adjustingText(o).saved).toBe("Ajustes salvos neste aparelho. Eles não aparecem no app do personal.");
    expect(adjustingText(o).alert).toContain("Se o personal mandar um cardápio novo");
  });
  it("nenhum texto afirma envio ou recebimento", () => {
    const all = [adjustingTitle(personal()), ...Object.values(adjustingText(personal()))].join(" ");
    expect(all).not.toMatch(/enviad|recebeu|Rafael viu/i);
  });
});

describe("mealsChanged ('Salvar ajustes' sem mudança)", () => {
  const meals = plan().meals;
  it("igual (mesmo conteúdo em outro objeto) → false", () => {
    expect(mealsChanged(meals, JSON.parse(JSON.stringify(meals)) as Meal[])).toBe(false);
  });
  it("gramas, horário, nome, ordem, alimento novo ou refeição removida → true", () => {
    expect(mealsChanged(meals, [{ ...meals[0]!, items: [item("i1", 250)] }, meals[1]!])).toBe(true);
    expect(mealsChanged(meals, [{ ...meals[0]!, time: "07:30" }, meals[1]!])).toBe(true);
    expect(mealsChanged(meals, [{ ...meals[0]!, name: "Café" }, meals[1]!])).toBe(true);
    expect(mealsChanged(meals, [meals[1]!, meals[0]!])).toBe(true);
    expect(mealsChanged(meals, [meals[0]!, { ...meals[1]!, items: [...meals[1]!.items, item("i3")] }])).toBe(true);
    expect(mealsChanged(meals, [meals[0]!])).toBe(true);
  });
});

describe("dietReplaceNotice e dietReplaceText (R7)", () => {
  it("pacote sem dieta → null", () => {
    expect(dietReplaceNotice(plan({ adjustedAt: "2026-11-24T15:00:00Z" }), "aluna", false)).toBeNull();
  });
  it("sem dieta local → null", () => {
    expect(dietReplaceNotice(null, "aluna", true)).toBeNull();
  });
  it("mesmo personal sem ajuste → null", () => {
    expect(dietReplaceNotice(plan(), "aluna", true)).toBeNull();
  });
  it("qualquer dieta local com adjustedAt → ajustes", () => {
    expect(dietReplaceNotice(plan({ adjustedAt: "2026-11-24T15:00:00Z" }), "aluna", true)).toBe("ajustes");
    expect(dietReplaceNotice(plan({ createdBy: "outro", adjustedAt: "2026-11-24T15:00:00Z" }), "aluna", true)).toBe("ajustes");
  });
  it("montada pela própria pessoa, com itens → proprio; sem itens → null", () => {
    expect(dietReplaceNotice(plan({ createdBy: "aluna" }), "aluna", true)).toBe("proprio");
    expect(dietReplaceNotice(plan({ createdBy: "aluna", meals: [meal("m1", [])] }), "aluna", true)).toBeNull();
  });
  it("outro personal sem ajuste → null (não é 'o cardápio que você montou')", () => {
    expect(dietReplaceNotice(plan({ createdBy: "outro" }), "aluna", true)).toBeNull();
  });
  it("os dois textos", () => {
    expect(dietReplaceText("ajustes", "Rafael", "2026-11-24T15:00:00Z", day)).toBe(
      "Você ajustou o cardápio em 24/11. O cardápio novo de Rafael substitui esses ajustes. Se quiser manter algo, combine com Rafael antes de atualizar.",
    );
    expect(dietReplaceText("proprio", "Rafael", undefined, day)).toBe("O cardápio que você montou neste celular será substituído pelo de Rafael.");
  });
  it("sem nome utilizável do personal", () => {
    expect(dietReplaceText("proprio", "Personal", undefined, day)).toBe("O cardápio que você montou neste celular será substituído pelo do seu personal.");
    expect(dietReplaceText("ajustes", null, "2026-11-24T15:00:00Z", day)).toBe(
      "Você ajustou o cardápio em 24/11. O cardápio novo do seu personal substitui esses ajustes. Se quiser manter algo, combine com o seu personal antes de atualizar.",
    );
  });
});

describe("usePlanAction (R12)", () => {
  it("coach → usar; self sem dieta ou próprio → usar_meu; self do personal → null", () => {
    expect(usePlanAction("coach", plan(), "aluna")).toBe("usar");
    expect(usePlanAction("self", null, "aluna")).toBe("usar_meu");
    expect(usePlanAction("self", plan({ createdBy: "aluna" }), "aluna")).toBe("usar_meu");
    expect(usePlanAction("self", plan(), "aluna")).toBeNull();
  });
});

describe("U3c: dieta só com metas e orientações vai pelo link", () => {
  it("dieta com itens, só com orientações ou só com metas vai; sem dieta, não", () => {
    expect(dietForLink(plan())).toEqual(plan());
    const soMetas = plan({ meals: [meal("m1", [])], notes: undefined });
    expect(dietForLink(soMetas)).toBe(soMetas);
    const soOrientacoes = plan({ meals: [], targets: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } });
    expect(dietForLink(soOrientacoes)).toBe(soOrientacoes);
    expect(dietForLink(null)).toBeNull();
    expect(dietForLink(undefined)).toBeNull();
  });
  it("só uma dieta sem nada (metas zeradas, sem itens, sem orientações) fica de fora", () => {
    expect(dietForLink(plan({ meals: [meal("m1", [])], notes: "  ", targets: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } }))).toBeNull();
  });
  it("linha do /abrir: refeições e metas com separador; sem refeições, metas e orientações", () => {
    expect(dietLinkSummary(plan({ meals: [meal("a", [item("1")]), meal("b", [item("2")]), meal("c", [item("3")]), meal("d", [item("4")]), meal("e", [])] }))).toBe(
      "4 refeições · metas de 1.650 kcal por dia",
    );
    expect(dietLinkSummary(plan({ meals: [meal("a", [item("1")])] }))).toBe("1 refeição · metas de 1.650 kcal por dia");
    expect(dietLinkSummary(plan({ meals: [] }))).toBe("Metas do dia e orientações");
    expect(dietLinkSummary(plan({ meals: [meal("a", [])], notes: " " }))).toBe("Metas do dia");
  });
  it("texto do cardápio em leitura_metas", () => {
    expect(metasOnlyText({ notes: "Beba água." })).toBe("Este plano tem só as metas do dia e as orientações, sem cardápio por refeição.");
    expect(metasOnlyText({})).toBe("Este plano tem só as metas do dia, sem cardápio por refeição.");
  });
});
