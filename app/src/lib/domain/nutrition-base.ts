import { getFood, type Food } from "./foods";
import { normalize } from "./exercises";
import { uid } from "./ids";
import type { ActivityLevel, DietItem, DietPlan, Goal, MacroTargets, Meal, Profile, Sex } from "./types";

/**
 * Metas (TMB, gasto do dia, macros), itens e totais da dieta e o cardápio-base. Saiu de nutrition.ts na correção da revisão
 * da rodada 3: data/demo.ts (no pacote de TODAS as telas, pelo app-context) e diet-share.ts (rotas de link) só usam isto,
 * e o leitor de texto livre do R3-5, que ficou em nutrition.ts, ia junto para todas as telas. nutrition.ts reexporta tudo
 * daqui: nenhum importador antigo nem teste muda de import.
 */

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

/**
 * Metas de macros: déficit ou superávit moderado, proteína por kg e gordura mínima.
 * Para quem está com IMC acima de 30, proteína e gordura usam o peso equivalente a IMC 30
 * (senão a conta por kg de peso total dá números que ninguém come).
 */
export function macroTargets(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
}): MacroTargets & { tdee: number } {
  const maintenance = tdee(input.sex, input.weightKg, input.heightCm, input.age, input.activity);
  const floor = input.sex === "M" ? 1500 : 1200;
  let kcal = maintenance;
  if (input.goal === "emagrecimento") kcal = maintenance * 0.8;
  if (input.goal === "hipertrofia") kcal = maintenance * 1.1;
  if (input.goal === "forca") kcal = maintenance * 1.05;
  kcal = Math.round(Math.max(kcal, floor) / 10) * 10;

  const h = input.heightCm / 100;
  const refKg = Math.min(input.weightKg, 30 * h * h);
  const proteinPerKg = input.goal === "emagrecimento" || input.goal === "hipertrofia" ? 2.0 : input.goal === "forca" ? 1.8 : 1.6;
  // Proteína nunca passa de 35% das calorias; gordura fica entre 0,8 g/kg e 30% das calorias.
  let proteinG = Math.round(Math.min(refKg * proteinPerKg, (kcal * 0.35) / 4));
  let fatG = Math.round(Math.min(Math.max(refKg * (input.goal === "emagrecimento" ? 0.8 : 0.9), (kcal * 0.2) / 9), (kcal * 0.3) / 9));
  let carbsG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
  // Piso de carboidrato (treino sem carboidrato rende mal): tira primeiro da gordura, depois da proteína.
  const minCarbs = 100;
  if (carbsG < minCarbs) {
    const minFat = Math.round((kcal * 0.2) / 9);
    fatG = Math.max(minFat, Math.round((kcal - proteinG * 4 - minCarbs * 4) / 9));
    carbsG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
    if (carbsG < minCarbs) {
      proteinG = Math.max(Math.round(refKg * 1.4), Math.round((kcal - fatG * 9 - minCarbs * 4) / 4));
      carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
    }
  }
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

export function round1(v: number) {
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

/** Papel de cada alimento do cardápio-base no ajuste às metas. */
type Role = "P" | "C" | "F" | "fixo";
interface BaseItem {
  id: string;
  g: number;
  role: Role;
  /** Teto da porção (g): acima disso entra outra refeição, não um prato maior. */
  max: number;
}
const it = (id: string, g: number, role: Role, max: number): BaseItem => ({ id, g, role, max });

/**
 * Nota do cardápio gerado (R3-12). Sem "mantendo a quantidade": a própria base desmente a troca grama por grama (arroz
 * cozido tem mais que o dobro do carboidrato da batata; o ovo, quase 4 vezes a gordura do frango). A troca é editando o
 * item, que recalcula o dia. A frase da água fica até a decisão do dono. Dietas já salvas guardam a nota antiga.
 */
export const NOTA_CARDAPIO_BASE =
  "Cardápio de referência montado para as suas metas. Para trocar um alimento, edite o item: o total do dia é recalculado. Beba cerca de 35 ml de água por kg de peso ao longo do dia.";

/**
 * Monta um cardápio-base com comida do dia a dia que fecha proteína, carboidrato e gordura da meta.
 * Fontes de proteína, de carboidrato e de gordura escalam separadamente, com teto por porção;
 * metas altas ganham lanche da manhã e ceia em vez de pratos gigantes.
 */
export function buildDietTemplate(targets: MacroTargets, owner: { ownerId: string; createdBy: string }): DietPlan {
  const big = targets.kcal >= 2500;
  const huge = targets.kcal >= 3100;
  const small = targets.kcal < 1700;
  // Meta de proteína baixa: tira o suplemento antes de encolher a carne.
  const lowProtein = targets.proteinG < 110;
  const base: { name: string; time: string; items: BaseItem[] }[] = [
    { name: "Café da manhã", time: "07:00", items: [it("pao_frances", 50, "C", 150), it("ovo", 100, "P", 200), it("mucarela", 20, "F", 40), it("banana", 70, "C", 140), it("cafe", 100, "fixo", 100)] },
    ...(big ? [{ name: "Lanche da manhã", time: "10:00", items: [it("maca", 130, "C", 260), it("mix_castanhas", 20, "F", 40)] }] : []),
    { name: "Almoço", time: "12:30", items: [it("arroz_branco", 135, "C", 400), it("feijao_carioca", 86, "C", 172), it("frango_peito", 130, "P", 250), it("salada", 60, "fixo", 60), it("azeite", 6, "F", 18)] },
    { name: "Lanche da tarde", time: "16:00", items: [it("iogurte_natural", 170, "fixo", 170), it("aveia", 30, "C", 75), ...(lowProtein ? [] : [it("whey", 30, "P", 45)]), ...(small ? [] : [it("morango", 120, "fixo", 120)])] },
    { name: "Jantar", time: "20:00", items: [it("batata_doce", 150, "C", 400), it("patinho", 120, "P", 220), it("legumes", 100, "fixo", 100), it("azeite", 6, "F", 18)] },
    ...(huge ? [{ name: "Ceia", time: "22:00", items: [it("leite_integral", 200, "fixo", 200), it("pao_integral", 50, "C", 100), it("banana", 70, "C", 140), it("pasta_amendoim", 15, "F", 30)] }] : []),
  ];
  const all = base.flatMap((m) => m.items);
  const scale: Record<Role, number> = { P: 1, C: 1, F: 1, fixo: 1 };
  const grams = (i: BaseItem) => Math.min(i.max, i.g * scale[i.role]);
  const sum = (k: "p" | "c" | "f", pred: (i: BaseItem) => boolean) => all.filter(pred).reduce((a, i) => a + (getFood(i.id)![k] * grams(i)) / 100, 0);
  // Cada papel fecha o seu macro, descontando o que os outros alimentos já trazem; repete porque um mexe no outro.
  const solve = (role: Exclude<Role, "fixo">, k: "p" | "c" | "f", target: number) => {
    const others = sum(k, (i) => i.role !== role);
    const own = all.filter((i) => i.role === role).reduce((a, i) => a + (getFood(i.id)![k] * i.g) / 100, 0);
    scale[role] = Math.min(3, Math.max(0.25, (target - others) / Math.max(1, own)));
  };
  for (let n = 0; n < 8; n++) {
    solve("P", "p", targets.proteinG);
    solve("F", "f", targets.fatG);
    solve("C", "c", targets.carbsG);
  }
  // Arredonda para a medida caseira (meia unidade, meia fatia, meio scoop) ou para 5 g.
  const tidy = (i: BaseItem) => {
    const food = getFood(i.id)!;
    const g = grams(i);
    const label = normalize(food.unit?.label ?? "");
    // Ovo vai em unidades inteiras; pão, fatias e scoop aceitam meia medida.
    const step = food.unit && /^(unidade|fatia|scoop)/.test(label) ? (food.category === "proteina" ? food.unit.g : Math.max(5, food.unit.g / 2)) : g >= 100 ? 10 : 5;
    return Math.max(step, Math.round(g / step) * step);
  };
  const meals: Meal[] = base.map((m) => ({ uid: uid(), name: m.name, time: m.time, items: m.items.map((i) => itemFromFood(getFood(i.id)!, i.role === "fixo" ? i.g : tidy(i))) }));

  // Ajuste fino depois do arredondamento: o arroz fecha o carboidrato, o frango a proteína e o azeite a gordura.
  const lunch = meals.find((m) => m.name === "Almoço")!;
  const nudge = (id: string, key: "carbsG" | "proteinG" | "fatG", per100: number, step: number, min: number, max: number) => {
    const at = lunch.items.findIndex((x) => x.foodId === id);
    if (at === -1) return;
    const gap = targets[key] - sumItems(meals.flatMap((m) => m.items))[key];
    const cur = lunch.items[at]!;
    const next = Math.min(max, Math.max(min, Math.round((cur.grams + (gap / per100) * 100) / step) * step));
    if (next !== cur.grams) lunch.items[at] = { ...itemFromFood(getFood(id)!, next), uid: cur.uid };
  };
  for (let n = 0; n < 2; n++) {
    nudge("frango_peito", "proteinG", getFood("frango_peito")!.p, 10, 60, 280);
    nudge("azeite", "fatG", 100, 1, 2, 20);
    nudge("arroz_branco", "carbsG", getFood("arroz_branco")!.c, 5, 45, 450);
  }
  return {
    id: uid(),
    ownerId: owner.ownerId,
    createdBy: owner.createdBy,
    name: "Cardápio base",
    targets,
    meals,
    notes: NOTA_CARDAPIO_BASE,
    updatedAt: new Date().toISOString(),
  };
}
