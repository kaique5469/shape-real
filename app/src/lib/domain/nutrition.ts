import { allFoods, foodsVersion, getFood, type Food } from "./foods";
import { normalize } from "./exercises";
import { uid } from "./ids";
import type { ActivityLevel, DietItem, DietPlan, Goal, MacroTargets, Meal, Profile, Sex } from "./types";

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  alto: 1.725,
  atleta: 1.9,
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentario: "Sedentário (trabalho sentado, sem treino)",
  leve: "Leve (treina 1–3x/semana)",
  moderado: "Moderado (treina 3–5x/semana)",
  alto: "Alto (treina 6–7x ou trabalho físico)",
  atleta: "Atleta (2 treinos/dia)",
};

/** Taxa metabólica basal — Mifflin-St Jeor. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "M" ? base + 5 : base - 161);
}

export function tdee(sex: Sex, weightKg: number, heightCm: number, age: number, activity: ActivityLevel): number {
  return Math.round(bmr(sex, weightKg, heightCm, age) * ACTIVITY_FACTOR[activity]);
}

/** Metas de macros: déficit/superávit moderado e proteína por kg de peso. */
export function macroTargets(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
}): MacroTargets & { tdee: number } {
  const maintenance = tdee(input.sex, input.weightKg, input.heightCm, input.age, input.activity);
  let kcal = maintenance;
  if (input.goal === "emagrecimento") kcal = Math.max(maintenance * 0.8, input.sex === "M" ? 1500 : 1200);
  if (input.goal === "hipertrofia") kcal = maintenance * 1.1;
  if (input.goal === "forca") kcal = maintenance * 1.05;
  kcal = Math.round(kcal / 10) * 10;

  const proteinPerKg = input.goal === "emagrecimento" ? 2.2 : input.goal === "hipertrofia" ? 2.0 : input.goal === "forca" ? 1.8 : 1.6;
  const proteinG = Math.round(input.weightKg * proteinPerKg);
  const fatG = Math.round(Math.max(input.weightKg * 0.9, (kcal * 0.22) / 9));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG, tdee: maintenance };
}

export function targetsForProfile(p: Profile, now = new Date()): (MacroTargets & { tdee: number }) | null {
  if (!p.sex || !p.weightKg || !p.heightCm || !p.birthYear) return null;
  return macroTargets({
    sex: p.sex,
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    age: now.getFullYear() - p.birthYear,
    activity: p.activity ?? "moderado",
    goal: p.goal ?? "saude",
  });
}

export function itemFromFood(food: Food, grams: number): DietItem {
  const k = grams / 100;
  return {
    uid: uid(),
    foodId: food.id,
    name: food.name,
    grams: Math.round(grams),
    kcal: Math.round(food.kcal * k),
    proteinG: round1(food.p * k),
    carbsG: round1(food.c * k),
    fatG: round1(food.f * k),
  };
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

export function sumItems(items: DietItem[]): MacroTargets {
  const t = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, proteinG: a.proteinG + i.proteinG, carbsG: a.carbsG + i.carbsG, fatG: a.fatG + i.fatG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG) };
}

export function dietTotals(diet: Pick<DietPlan, "meals">): MacroTargets {
  return sumItems(diet.meals.flatMap((m) => m.items));
}

// ---------------------------------------------------------------------------
// Leitor de texto livre: "2 ovos, 1 pão francês, 150g de frango"
// ---------------------------------------------------------------------------

const UNIT_RE =
  /^(\d+(?:[.,]\d+)?|meia|meio|uma|um|duas|dois|tres|três)\s*(kg|g|gr|gramas?|ml|l|litros?|un|unid(?:ade)?s?|colher(?:es)?(?:\s+de\s+(?:sopa|cha|servir))?|conchas?|fatias?|scoops?|x[ií]caras?|fil[eé]s?|potes?|copos?|latas?|bifes?|pedaços?|punhados?|tigelas?|pegadores?)?\s*(?:de\s+|do\s+|da\s+)?(.+)$/i;

const WORD_NUM: Record<string, number> = { meia: 0.5, meio: 0.5, uma: 1, um: 1, duas: 2, dois: 2, tres: 3, "três": 3 };

interface AliasEntry {
  alias: string;
  re: RegExp;
  food: Food;
}
let aliasIndex: AliasEntry[] = [];
let aliasIndexVersion = -1;

/** Índice de apelidos (maior primeiro), reconstruído quando os alimentos personalizados mudam. */
function aliases(): AliasEntry[] {
  if (aliasIndexVersion !== foodsVersion()) {
    aliasIndex = allFoods()
      .flatMap((f) => [...f.aliases, f.name].map((a) => ({ alias: normalize(a), food: f })))
      .filter((e) => e.alias.length > 1)
      .sort((a, b) => b.alias.length - a.alias.length)
      .map((e) => ({ ...e, re: new RegExp(`(^|[^a-z0-9])${e.alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^a-z0-9]|$)`) }));
    aliasIndexVersion = foodsVersion();
  }
  return aliasIndex;
}

export function matchFood(text: string): Food | undefined {
  const t = normalize(text);
  return aliases().find(({ re }) => re.test(t))?.food;
}

export interface ParsedLine {
  raw: string;
  item: DietItem | null;
}

export function parseFoodLine(raw: string): ParsedLine {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { raw, item: null };
  const m = normalize(text).match(UNIT_RE);
  let qty = 1;
  let unit: string | undefined;
  let rest = normalize(text);
  if (m) {
    const n = m[1]!;
    qty = WORD_NUM[n] ?? parseFloat(n.replace(",", "."));
    unit = m[2];
    rest = m[3] ?? rest;
  }
  const food = matchFood(rest) ?? matchFood(text);
  if (!food) return { raw, item: null };

  let grams: number;
  if (unit && /^(g|gr|grama)/.test(unit)) grams = qty;
  else if (unit && /^kg/.test(unit)) grams = qty * 1000;
  else if (unit && /^ml/.test(unit)) grams = qty;
  else if (unit && /^l/.test(unit)) grams = qty * 1000;
  else if (m && !unit && qty > 20) grams = qty; // "150 frango" → gramas
  else grams = qty * (food.unit?.g ?? 100);
  return { raw, item: itemFromFood(food, grams) };
}

/** Divide texto em refeições (linhas terminadas em ":" ou nomes conhecidos) e itens. */
export function parseDietText(text: string): { meals: Meal[]; unknown: string[] } {
  const meals: Meal[] = [];
  const unknown: string[] = [];
  let current: Meal | null = null;
  const MEAL_NAME = /^(cafe da manha|cafe|desjejum|lanche(?: da manha| da tarde)?|almoco|jantar|janta|ceia|pre[- ]treino|pos[- ]treino)\b\s*[:\-–]?\s*(.*)$/;

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const n = normalize(line);
    const mm = n.match(MEAL_NAME);
    let itemsText = line;
    if (mm || /:$/.test(line)) {
      const name = mm ? capitalize(line.split(/[:\-–]/)[0]!.trim()) : capitalize(line.replace(/:$/, ""));
      current = { uid: uid(), name, items: [] };
      meals.push(current);
      itemsText = mm ? line.slice(line.length - (mm[2]?.length ?? 0)) : "";
    }
    if (!itemsText.trim()) continue;
    if (!current) {
      current = { uid: uid(), name: "Refeição", items: [] };
      meals.push(current);
    }
    for (const chunk of itemsText.split(/,|;|\+|\s+e\s+|\s+com\s+/i)) {
      if (!chunk.trim()) continue;
      const parsed = parseFoodLine(chunk);
      if (parsed.item) current.items.push(parsed.item);
      else unknown.push(chunk.trim());
    }
  }
  return { meals: meals.filter((m) => m.items.length), unknown };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Feedback determinístico (base do "Análise da dieta" sem IA)
// ---------------------------------------------------------------------------

export interface DietFeedback {
  score: number;
  totals: MacroTargets;
  highlights: string[];
  adjustments: string[];
}

export function analyzeDiet(meals: Meal[], targets: MacroTargets, weightKg?: number): DietFeedback {
  const totals = sumItems(meals.flatMap((m) => m.items));
  const highlights: string[] = [];
  const adjustments: string[] = [];
  const pct = (v: number, t: number) => (t > 0 ? v / t : 1);

  const kcalRatio = pct(totals.kcal, targets.kcal);
  const protRatio = pct(totals.proteinG, targets.proteinG);
  const fatRatio = pct(totals.fatG, targets.fatG);

  if (protRatio >= 0.9) highlights.push(`Proteína em dia: ${Math.round(totals.proteinG)} g de ${targets.proteinG} g.`);
  else {
    const gap = Math.round(targets.proteinG - totals.proteinG);
    adjustments.push(
      `Faltam ~${gap} g de proteína. Ex.: ${Math.round((gap / 32) * 100)} g de frango, ${Math.ceil(gap / 24)} scoop(s) de whey ou ${Math.ceil(gap / 6.5)} ovos.`,
    );
  }
  if (kcalRatio > 1.12) adjustments.push(`Calorias ${Math.round((kcalRatio - 1) * 100)}% acima da meta (${totals.kcal} de ${targets.kcal} kcal). Reduza porções de carboidrato ou gordura primeiro.`);
  else if (kcalRatio < 0.85) adjustments.push(`Calorias ${Math.round((1 - kcalRatio) * 100)}% abaixo da meta (${totals.kcal} de ${targets.kcal} kcal). Comer pouco demais atrapalha treino e recuperação.`);
  else highlights.push(`Calorias dentro da faixa: ${totals.kcal} de ${targets.kcal} kcal.`);
  if (fatRatio > 1.3) adjustments.push(`Gordura alta (${Math.round(totals.fatG)} g). Atenção a frituras, queijos e óleos.`);

  const proteinMeals = meals.filter((m) => sumItems(m.items).proteinG >= 20).length;
  if (meals.length >= 3 && proteinMeals >= 3) highlights.push(`Proteína distribuída em ${proteinMeals} refeições — ótimo para síntese muscular.`);
  else if (meals.length >= 3) adjustments.push("Distribua a proteína: busque ≥ 20 g em pelo menos 3 refeições.");

  const hasVeg = meals.some((m) => m.items.some((i) => getFood(i.foodId ?? "")?.category === "vegetal"));
  const hasFruit = meals.some((m) => m.items.some((i) => getFood(i.foodId ?? "")?.category === "fruta"));
  if (!hasVeg) adjustments.push("Não encontrei vegetais. Inclua salada ou legumes no almoço e no jantar (fibras e saciedade).");
  if (hasFruit && hasVeg) highlights.push("Frutas e vegetais presentes.");
  const junk = meals.flatMap((m) => m.items).filter((i) => ["refrigerante", "cerveja", "batata_frita", "chocolate", "pizza"].includes(i.foodId ?? ""));
  if (junk.length) adjustments.push(`Ultraprocessados/álcool: ${junk.map((j) => j.name.toLowerCase()).join(", ")}. Cabem com moderação — some na meta.`);
  if (weightKg && totals.proteinG / weightKg > 3) adjustments.push("Proteína acima de 3 g/kg não traz ganho extra; troque parte por carboidrato.");

  let score = 100;
  score -= Math.min(35, Math.abs(1 - kcalRatio) * 100);
  score -= Math.min(30, Math.max(0, 0.9 - protRatio) * 100);
  score -= hasVeg ? 0 : 10;
  score -= Math.min(10, junk.length * 4);
  return { score: Math.max(0, Math.round(score)), totals, highlights, adjustments };
}

/** Monta um cardápio-base que bate as metas, a partir de modelos de refeições brasileiras. */
export function buildDietTemplate(targets: MacroTargets, owner: { ownerId: string; createdBy: string }): DietPlan {
  const f = (id: string, g: number) => itemFromFood(getFood(id)!, g);
  // Proporções de um dia típico; a escala ajusta pelas calorias da meta.
  const base: { name: string; time: string; items: [string, number][] }[] = [
    { name: "Café da manhã", time: "07:00", items: [["pao_frances", 50], ["ovo", 100], ["mucarela", 20], ["banana", 70], ["cafe", 100]] },
    { name: "Almoço", time: "12:30", items: [["arroz_branco", 150], ["feijao_carioca", 86], ["frango_peito", 140], ["salada", 60], ["azeite", 5]] },
    { name: "Lanche da tarde", time: "16:00", items: [["iogurte_natural", 170], ["aveia", 30], ["whey", 30], ["morango", 100]] },
    { name: "Jantar", time: "20:00", items: [["batata_doce", 200], ["patinho", 130], ["legumes", 100], ["azeite", 5]] },
  ];
  // Passo 1: fontes de proteína escalam para bater a meta de proteína.
  // Passo 2: carboidratos/gorduras/frutas/laticínios escalam para fechar as calorias.
  const fixed = (id: string) => getFood(id)!.category === "vegetal" || id === "cafe";
  const isProt = (id: string) => getFood(id)!.category === "proteina";
  const all = base.flatMap((m) => m.items);
  const sumOf = (pred: (id: string) => boolean, k: "p" | "kcal", gs = all) => gs.filter(([id]) => pred(id)).reduce((a, [id, g]) => a + (getFood(id)![k] * g) / 100, 0);
  // Alterna os dois ajustes algumas vezes: carboidratos também trazem proteína.
  let protScale = 1;
  let flexScale = 1;
  for (let it = 0; it < 6; it++) {
    const cur: [string, number][] = all.map(([id, g]) => [id, fixed(id) ? g : g * (isProt(id) ? protScale : flexScale)]);
    const protOthers = sumOf((id) => !isProt(id), "p", cur);
    const protBase = sumOf(isProt, "p", all);
    protScale = Math.min(2.5, Math.max(0.2, (targets.proteinG - protOthers) / Math.max(1, protBase)));
    const after: [string, number][] = all.map(([id, g]) => [id, fixed(id) ? g : g * (isProt(id) ? protScale : flexScale)]);
    const kcalFixed = sumOf((id) => isProt(id) || fixed(id), "kcal", after);
    const kcalFlexBase = sumOf((id) => !isProt(id) && !fixed(id), "kcal", all);
    flexScale = Math.min(2.5, Math.max(0.3, (targets.kcal - kcalFixed) / Math.max(1, kcalFlexBase)));
  }
  const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);
  const meals: Meal[] = base.map((m) => ({
    uid: uid(),
    name: m.name,
    time: m.time,
    items: m.items.map(([id, g]) => f(id, fixed(id) ? g : round5(g * (isProt(id) ? protScale : flexScale)))),
  }));
  return {
    id: uid(),
    ownerId: owner.ownerId,
    createdBy: owner.createdBy,
    name: "Cardápio base",
    targets,
    meals,
    notes: "Cardápio de referência. Troque alimentos pelos equivalentes que você gosta mantendo as quantidades de macros.",
    updatedAt: new Date().toISOString(),
  };
}
