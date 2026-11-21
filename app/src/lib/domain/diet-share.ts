import { getFood, type Food } from "./foods";
import { dietTotals, sumItems } from "./nutrition";
import type { DietItem, DietPlan, MacroTargets } from "./types";

const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

function plural(label: string): string {
  const [first = "", ...rest] = label.split(" ");
  const p = /[rz]$/.test(first) ? `${first}es` : /[aeiouã]$/.test(first) ? `${first}s` : first;
  return [p, ...rest].join(" ");
}

/**
 * Medida caseira de uma porção ("3 colheres de servir", "½ unidade"), quando a quantidade
 * em gramas corresponde a um múltiplo de meia medida do alimento; senão, null.
 */
export function householdMeasure(food: Pick<Food, "unit"> | undefined, grams: number): string | null {
  if (!food?.unit || !food.unit.g || grams <= 0) return null;
  const n = grams / food.unit.g;
  const half = Math.round(n * 2) / 2;
  if (half < 0.5 || half > 12 || Math.abs(n - half) > 0.13) return null;
  const whole = Math.floor(half);
  const qty = half === 0.5 ? "½" : half % 1 ? `${whole} ½` : String(whole);
  return `${qty} ${half > 1 ? plural(food.unit.label) : food.unit.label}`;
}

const itemLine = (i: DietItem) => {
  const measure = householdMeasure(i.foodId ? getFood(i.foodId) : undefined, i.grams);
  return `• ${i.name} — ${int(i.grams)} g${measure ? ` (${measure})` : ""}`;
};

const macroLine = (t: MacroTargets) => `${int(t.kcal)} kcal · proteína ${int(t.proteinG)} g · carboidrato ${int(t.carbsG)} g · gordura ${int(t.fatG)} g`;

/**
 * Dieta em texto simples, no formato que funciona no WhatsApp (*negrito* com asteriscos, sem emoji):
 * metas, uma refeição por bloco com porções em gramas e medida caseira, totais e orientações.
 */
export function dietToText(diet: DietPlan, opts: { studentName?: string; coachName?: string } = {}): string {
  const out: string[] = [`*${opts.studentName ? `Plano alimentar — ${opts.studentName}` : diet.name.trim() || "Plano alimentar"}*`];
  out.push(`Metas do dia: ${macroLine(diet.targets)}`);

  for (const meal of diet.meals) {
    if (!meal.items.length) continue;
    const t = sumItems(meal.items);
    out.push("", `*${meal.name.trim() || "Refeição"}*${meal.time ? ` (${meal.time})` : ""}`);
    for (const i of meal.items) out.push(itemLine(i));
    out.push(`Subtotal: ${int(t.kcal)} kcal · ${int(t.proteinG)} g de proteína`);
  }

  if (diet.meals.some((m) => m.items.length)) out.push("", `*Total do dia*: ${macroLine(dietTotals(diet))}`);
  if (diet.notes?.trim()) out.push("", "*Orientações*", diet.notes.trim());
  if (opts.coachName) out.push("", `Enviado por ${opts.coachName}`);
  return out.join("\n");
}
