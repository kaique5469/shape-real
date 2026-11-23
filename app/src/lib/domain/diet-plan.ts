import type { MacroTargets } from "./types";

/**
 * Regras puras da tela Dieta (U3). Sem React e sem armazenamento: quem chama passa os dados e, quando houver,
 * a data já formatada. Vocabulário: "Metas do dia" é o alvo; "Cardápio" / "Total do cardápio" é o plano.
 * Nada aqui fala em "faltam", "passou" ou "consumido": o app não registra o que a pessoa comeu.
 */

export type MacroKey = keyof MacroTargets;

/** Ordem fixa de calorias e macros em toda a tela, no texto e no resumo da comparação. */
export const MACRO_ORDER: readonly MacroKey[] = ["kcal", "proteinG", "carbsG", "fatG"];

/**
 * Rótulos por macro: `long` na lista de metas, `short` no cabeçalho da tabela, `word` no meio de uma frase
 * ("Acima das metas em calorias e carboidrato.") e `compact` no card do Hoje.
 */
export const MACRO_LABEL: Record<MacroKey, { long: string; short: string; word: string; compact: string; unit: "kcal" | "g" }> = {
  kcal: { long: "Calorias", short: "kcal", word: "calorias", compact: "kcal", unit: "kcal" },
  proteinG: { long: "Proteína", short: "Proteína", word: "proteína", compact: "proteína", unit: "g" },
  carbsG: { long: "Carboidrato", short: "Carbo", word: "carboidrato", compact: "carbo", unit: "g" },
  fatG: { long: "Gordura", short: "Gordura", word: "gordura", compact: "gordura", unit: "g" },
};

/** Inteiro com separador de milhar pt-BR ("1.650"). */
export const fmtInt = (v: number): string => Math.round(v).toLocaleString("pt-BR");

/** "1.650 kcal" | "126 g". */
export const fmtMacro = (key: MacroKey, v: number): string => `${fmtInt(v)} ${MACRO_LABEL[key].unit}`;

/** Diferença de até 5% da meta conta como "na meta" (a mesma tolerância da tela antiga; a faixa de 108% saiu). */
export const ON_TARGET_TOLERANCE = 0.05;

export type PlanStatus = "na_meta" | "acima" | "abaixo";

export interface MacroComparison {
  key: MacroKey;
  target: number;
  plan: number;
  /** `Math.round(cardápio − meta)`. */
  diff: number;
  status: PlanStatus;
}

/** Folga para o limite exato de ±5% não cair fora por arredondamento binário. */
const EPS = 1e-9;

/**
 * R9 — Metas do dia × total do cardápio, por macro, na ordem de MACRO_ORDER.
 * Meta 0: "na_meta" só com o cardápio também em 0; senão "acima".
 */
export function comparePlan(targets: MacroTargets, totals: MacroTargets): MacroComparison[] {
  return MACRO_ORDER.map((key) => {
    const target = targets[key];
    const plan = totals[key];
    const diff = Math.round(plan - target);
    let status: PlanStatus;
    if (target === 0) status = plan === 0 ? "na_meta" : "acima";
    else if (Math.abs(plan - target) <= target * ON_TARGET_TOLERANCE + EPS) status = "na_meta";
    else status = plan > target ? "acima" : "abaixo";
    return { key, target, plan, diff, status };
  });
}

/** "na meta" | "+597" | "−352" | "+1.200" (pt-BR; o menos é U+2212, que leitor de tela lê como "menos"). */
export function fmtDiff(c: Pick<MacroComparison, "diff" | "status">): string {
  if (c.status === "na_meta") return "na meta";
  const sign = c.status === "acima" ? "+" : "−";
  return `${sign}${fmtInt(Math.abs(c.diff))}`;
}

/** Texto só para leitor de tela ao lado da diferença; `null` em "na meta" (a palavra já está visível). */
export function diffSrText(status: PlanStatus): string | null {
  return status === "acima" ? "acima da meta" : status === "abaixo" ? "abaixo da meta" : null;
}

/** "calorias", "calorias e carboidrato", "calorias, proteína e carboidrato". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} e ${words.at(-1)}`;
}

/**
 * R10 — Resumo da comparação (a legenda da tabela). `null` = cardápio sem itens.
 * Só acima e abaixo: "Acima das metas em … . Abaixo em … ."; só abaixo: "Abaixo das metas em … .".
 */
export function planSummary(cmp: readonly MacroComparison[] | null): string {
  if (!cmp) return "Monte o cardápio para comparar com as metas.";
  const ordered = MACRO_ORDER.map((k) => cmp.find((c) => c.key === k)).filter((c): c is MacroComparison => Boolean(c));
  const above = ordered.filter((c) => c.status === "acima").map((c) => MACRO_LABEL[c.key].word);
  const below = ordered.filter((c) => c.status === "abaixo").map((c) => MACRO_LABEL[c.key].word);
  if (!above.length && !below.length) return "O cardápio fecha com as metas do dia.";
  const out: string[] = [];
  if (above.length) out.push(`Acima das metas em ${joinWords(above)}.`);
  if (below.length) out.push(above.length ? `Abaixo em ${joinWords(below)}.` : `Abaixo das metas em ${joinWords(below)}.`);
  return out.join(" ");
}

/** Faixa de alimentos reconhecidos pelo analisador, para a medição (nunca o número nem a nota). */
export type ItemsBand = "0" | "1-5" | "6+";
export function itemsBand(n: number): ItemsBand {
  if (!(n > 0)) return "0";
  return n <= 5 ? "1-5" : "6+";
}
