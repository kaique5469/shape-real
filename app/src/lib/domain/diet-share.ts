import { getFood, type Food } from "./foods";
import { dietTotals, sumItems } from "./nutrition";
import { coachSignature } from "./cref";
import type { DietItem, DietPlan, MacroTargets, Sex } from "./types";

const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

const pluralWord = (w: string) => (/[rz]$/.test(w) ? `${w}es` : /[aeiouã]$/.test(w) ? `${w}s` : w);

/** Plural da medida: flexiona as palavras antes de "de" ou de um parêntese ("colheres de sopa", "unidades médias"). */
function plural(label: string): string {
  const words = label.split(" ");
  const stop = words.findIndex((w) => w === "de" || w.startsWith("("));
  return words.map((w, i) => (stop === -1 || i < stop ? pluralWord(w) : w)).join(" ");
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

/** Um alimento como no texto do WhatsApp, sem o marcador: "Arroz branco cozido — 135 g (3 colheres de servir)". */
export function dietItemText(i: Pick<DietItem, "name" | "grams" | "foodId">): string {
  const measure = householdMeasure(i.foodId ? getFood(i.foodId) : undefined, i.grams);
  return `${i.name} — ${int(i.grams)} g${measure ? ` (${measure})` : ""}`;
}

const itemLine = (i: DietItem) => `• ${dietItemText(i)}`;

/** "1.650 kcal · proteína 126 g · carboidrato 172 g · gordura 51 g" (metas ou total do cardápio). */
export function macroLine(t: MacroTargets): string {
  return `${int(t.kcal)} kcal · proteína ${int(t.proteinG)} g · carboidrato ${int(t.carbsG)} g · gordura ${int(t.fatG)} g`;
}

/**
 * Dieta em texto simples, no formato que funciona no WhatsApp (*negrito* com asteriscos, sem emoji):
 * metas do dia, uma refeição por bloco com porções em gramas e medida caseira, o total do cardápio (a soma do
 * plano, não o que a pessoa comeu), orientações e a assinatura do personal ("Nome · CREF …").
 * `adjustedNote` (U3 R5): cardápio ajustado no aparelho do aluno. Sai sem a assinatura do personal e termina com a
 * linha do ajuste ("Ajustado em 24/11 a partir do cardápio de Rafael Nunes."): o personal não assinou esse conteúdo.
 */
export function dietToText(diet: DietPlan, opts: { studentName?: string; coachName?: string; coachCref?: string; adjustedNote?: string | null } = {}): string {
  const out: string[] = [`*${opts.studentName ? `Plano alimentar — ${opts.studentName}` : diet.name.trim() || "Plano alimentar"}*`];
  out.push(`Metas do dia: ${macroLine(diet.targets)}`);

  for (const meal of diet.meals) {
    if (!meal.items.length) continue;
    const t = sumItems(meal.items);
    out.push("", `*${meal.name.trim() || "Refeição"}*${meal.time ? ` (${meal.time})` : ""}`);
    for (const i of meal.items) out.push(itemLine(i));
    out.push(`Subtotal: ${int(t.kcal)} kcal · ${int(t.proteinG)} g de proteína`);
  }

  if (diet.meals.some((m) => m.items.length)) out.push("", `*Total do cardápio*: ${macroLine(dietTotals(diet))}`);
  if (diet.notes?.trim()) out.push("", "*Orientações*", diet.notes.trim());
  const note = opts.adjustedNote?.trim();
  const signature = note ? null : coachSignature({ name: opts.coachName, cref: opts.coachCref });
  if (note) out.push("", note);
  else if (signature) out.push("", signature);
  return out.join("\n");
}

// ---- dados para calcular as metas (tela Dieta) -------------------------------------
export interface DietBodyInput {
  sex: Sex | "";
  birthYear: string;
  heightCm: string;
  weightKg: string;
}

export const DIET_CONSENT_ERROR = "Marque a autorização para guardar seus dados de saúde.";

/**
 * Confere sexo, ano de nascimento, altura e peso digitados em Dieta (os quatro calculam as metas).
 * `needsConsent`: a pessoa ainda não autorizou guardar dados de saúde; sem o checkbox marcado, nada é salvo.
 */
export function parseDietBody(
  f: DietBodyInput,
  opts: { thisYear: number; needsConsent: boolean; consent: boolean },
): { ok: true; data: { sex: Sex; birthYear: number; heightCm: number; weightKg: number } } | { ok: false; field: keyof DietBodyInput | "consent"; error: string } {
  const missing = (["sex", "birthYear", "heightCm", "weightKg"] as const).find((k) => !String(f[k]).trim());
  if (missing) return { ok: false, field: missing, error: "Para calcular as metas, preencha sexo, ano de nascimento, altura e peso." };
  const birthYear = Number(f.birthYear);
  const heightCm = Number(f.heightCm);
  const weightKg = Number(f.weightKg.replace(",", "."));
  if (!(birthYear >= opts.thisYear - 100 && birthYear <= opts.thisYear - 10)) return { ok: false, field: "birthYear", error: "Confira o ano de nascimento: use quatro dígitos, por exemplo 1994." };
  if (!(heightCm >= 120 && heightCm <= 230)) return { ok: false, field: "heightCm", error: "Confira a altura: use centímetros, por exemplo 172." };
  if (!(weightKg >= 30 && weightKg <= 300)) return { ok: false, field: "weightKg", error: "Confira o peso: use quilos, por exemplo 72,5." };
  if (opts.needsConsent && !opts.consent) return { ok: false, field: "consent", error: DIET_CONSENT_ERROR };
  return { ok: true, data: { sex: f.sex as Sex, birthYear, heightCm, weightKg } };
}
