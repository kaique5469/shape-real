import type { DietPlan, MacroTargets, Meal, Profile } from "./types";

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

// ---- U3b: de quem é o cardápio e o que a tela mostra --------------------------------------------------------------

/** "Personal" é o nome provisório de quem ainda não preencheu o próprio nome: não serve para assinar nem citar. */
function usableName(name: string | null | undefined): string | null {
  const v = name?.trim();
  return v && v !== "Personal" ? v : null;
}

/**
 * Quem montou o plano aberto (R2), no aparelho de quem segue a dieta.
 *  - `proprio`: a própria pessoa montou (ou o plano não diz quem montou).
 *  - `personal`: montado por um personal. O nome vem do personal atual (`remoteCoach`) ou de quem está vendo como o
 *    aluno (`returnTo`), só quando o id bate com `createdBy`; sem nome, os textos dizem "do personal".
 *    `versionAt`: a versão que chegou pelo último link desse personal (`remoteCoach.recebido.dietAt`, U2c), a mesma
 *    data que o personal vê ("Juliana está com a versão de 10/11"). Sem esse dado, a linha sai sem data.
 *    `adjustedAt`: quando a pessoa ajustou o cardápio neste aparelho.
 */
export type DietOrigin =
  | { kind: "proprio" }
  | { kind: "personal"; coachFirstName: string | null; coachFullName: string | null; versionAt: string | null; adjustedAt: string | null };

export function dietOrigin(
  diet: Pick<DietPlan, "createdBy" | "adjustedAt">,
  ownerId: string,
  ctx: {
    remoteCoach?: Pick<NonNullable<Profile["remoteCoach"]>, "id" | "name" | "recebido"> | null;
    returnTo?: { id: string; name: string } | null;
  } = {},
): DietOrigin {
  if (!diet.createdBy || diet.createdBy === ownerId) return { kind: "proprio" };
  const rc = ctx.remoteCoach && ctx.remoteCoach.id === diet.createdBy ? ctx.remoteCoach : null;
  const full = usableName(rc?.name) ?? (ctx.returnTo && ctx.returnTo.id === diet.createdBy ? usableName(ctx.returnTo.name) : null);
  return {
    kind: "personal",
    coachFullName: full,
    coachFirstName: full ? (full.split(/\s+/)[0] ?? full) : null,
    versionAt: rc?.recebido?.dietAt ?? null,
    adjustedAt: diet.adjustedAt ?? null,
  };
}

/**
 * Estado da tela (R0), no aparelho de quem segue a dieta (`mode: "self"`) ou do personal (`coach`).
 * `saved` é a versão lida do repositório (ou acabada de gravar); `hasDraftOrDiet`, se há algo na tela (salvo ou
 * rascunho). Plano do personal: leitura quando nada está em edição; senão, ajuste (só as refeições mudam).
 * Plano próprio: leitura quando salvo e com itens; senão, edição (inclui as metas), como antes.
 */
export type DietScreen = "leitura" | "leitura_metas" | "ajuste" | "edicao_propria" | "vazio" | "coach";

export function dietScreen(i: { mode: "self" | "coach"; editing: boolean; dirty: boolean; saved: Pick<DietPlan, "meals"> | null; hasDraftOrDiet: boolean; origin: DietOrigin | null }): DietScreen {
  if (i.mode === "coach") return "coach";
  if (!i.hasDraftOrDiet) return "vazio";
  const reading = !i.editing && !i.dirty && i.saved !== null;
  const items = Boolean(i.saved?.meals.some((m) => m.items.length));
  if (i.origin?.kind === "personal") return reading ? (items ? "leitura" : "leitura_metas") : "ajuste";
  return reading && items ? "leitura" : "edicao_propria";
}

/** R1: "Ajustar cardápio" / "Editar dieta" só na leitura e fora de "Ver como aluno" (lá o personal edita na aba Dieta). */
export function canAdjust(screen: DietScreen, byCoach: boolean): boolean {
  return screen === "leitura" && !byCoach;
}

/** Modo da tela para a medição (`section_viewed.modo`). */
export function screenMode(screen: Exclude<DietScreen, "coach">): "leitura" | "leitura_metas" | "edicao" | "vazio" {
  return screen === "ajuste" || screen === "edicao_propria" ? "edicao" : screen;
}

/**
 * Linha de origem do cardápio (formato de data dd/mm por quem chama):
 * "Montado por você" | "Cardápio de Rafael · ajustado por você em 24/11" | "Cardápio de Rafael · versão de 10/11" |
 * "Cardápio de Rafael" | "Cardápio do personal".
 */
export function originLine(o: DietOrigin, day: (iso: string) => string): string {
  if (o.kind === "proprio") return "Montado por você";
  const base = o.coachFirstName ? `Cardápio de ${o.coachFirstName}` : "Cardápio do personal";
  if (o.adjustedAt) return `${base} · ajustado por você em ${day(o.adjustedAt)}`;
  if (o.versionAt) return `${base} · versão de ${day(o.versionAt)}`;
  return base;
}

/** Quem definiu as metas, só no plano do personal. No próprio, nenhuma linha (as metas não vêm do cardápio). */
export function targetsSourceLine(o: DietOrigin): string | null {
  if (o.kind === "proprio") return null;
  return o.coachFirstName ? `Definidas por ${o.coachFirstName}.` : "Definidas pelo personal.";
}

/**
 * R5: linha que entra no lugar da assinatura "Nome · CREF" (texto do WhatsApp e impressão) quando a pessoa ajustou o
 * cardápio do personal neste aparelho. Regra geral: conteúdo alterado no aparelho do aluno não leva a assinatura do
 * personal. null = sem ajuste (a assinatura continua como antes).
 */
export function adjustedNote(o: DietOrigin, day: (iso: string) => string): string | null {
  if (o.kind !== "personal" || !o.adjustedAt) return null;
  return `Ajustado em ${day(o.adjustedAt)} a partir do cardápio ${o.coachFullName ? `de ${o.coachFullName}` : "do personal"}.`;
}

/** Título do alerta do ajuste ("Ajustando o cardápio de Rafael"). */
export function adjustingTitle(o: DietOrigin): string {
  return o.kind === "personal" && o.coachFirstName ? `Ajustando o cardápio de ${o.coachFirstName}` : "Ajustando o cardápio do personal";
}

/** Texto do alerta do ajuste (B) e a mensagem depois de salvar com mudança. */
export function adjustingText(o: DietOrigin): { alert: string; saved: string; locked: string } {
  const who = o.kind === "personal" && o.coachFirstName ? o.coachFirstName : null;
  const app = who ? `no app de ${who}` : "no app do personal";
  return {
    alert: `Os ajustes ficam só neste celular e não aparecem ${app}. Se ${who ?? "o personal"} mandar um cardápio novo, o novo substitui estes ajustes.`,
    saved: `Ajustes salvos neste aparelho. Eles não aparecem ${app}.`,
    // Sem gênero do personal no aparelho: o nome se repete no lugar de "ele"/"ela".
    locked: who ? `As metas são de ${who}. Para mudar, fale com ${who}.` : "As metas são do personal. Para mudar, fale com o personal.",
  };
}

/**
 * As refeições mudaram em relação à versão salva? (nome, horário, ordem, alimentos e gramas). "Salvar ajustes" sem
 * mudança só volta à leitura, sem gravar `adjustedAt` (senão o app afirmaria um ajuste que não houve).
 */
export function mealsChanged(a: readonly Meal[], b: readonly Meal[]): boolean {
  const key = (meals: readonly Meal[]) =>
    JSON.stringify(meals.map((m) => [m.uid, m.name, m.time ?? "", m.items.map((i) => [i.uid, i.foodId ?? "", i.name, i.grams, i.kcal, i.proteinG, i.carbsG, i.fatG])]));
  return key(a) !== key(b);
}

// ---- U3b R7: aviso antes de o link substituir a dieta (/abrir) ------------------------------------------------------

export type ReplaceNotice = "ajustes" | "proprio" | null;

/**
 * R7, lido da dieta deste aparelho quando o link traz dieta e a pessoa já usa o app (`updating`):
 *  - ajustada aqui (`adjustedAt`, de qualquer personal) → "ajustes";
 *  - montada pela própria pessoa e com itens → "proprio";
 *  - senão → null (inclusive cardápio de OUTRO personal sem ajuste: a frase atual "a dieta passa a ser a nova de
 *    {personal}" basta; dizer "o cardápio que você montou" seria afirmar uma autoria falsa).
 */
export function dietReplaceNotice(local: Pick<DietPlan, "createdBy" | "adjustedAt" | "meals"> | null | undefined, userId: string, packetHasDiet: boolean): ReplaceNotice {
  if (!packetHasDiet || !local) return null;
  if (local.adjustedAt) return "ajustes";
  if (local.createdBy === userId && local.meals.some((m) => m.items.length)) return "proprio";
  return null;
}

/** Texto do aviso R7 (data dd/mm por quem chama). Sem nome utilizável do personal: "o seu personal". */
export function dietReplaceText(kind: Exclude<ReplaceNotice, null>, coachFirstName: string | null, adjustedAt: string | null | undefined, day: (iso: string) => string): string {
  const name = usableName(coachFirstName);
  if (kind === "proprio") return `O cardápio que você montou neste celular será substituído pelo ${name ? `de ${name}` : "do seu personal"}.`;
  const when = adjustedAt ? ` em ${day(adjustedAt)}` : "";
  return `Você ajustou o cardápio${when}. O cardápio novo ${name ? `de ${name}` : "do seu personal"} substitui esses ajustes. Se quiser manter algo, combine com ${name ?? "o seu personal"} antes de atualizar.`;
}

// ---- U3b R12: "Usar como cardápio" no analisador ------------------------------------------------------------------

/** "usar" (personal) | "usar_meu" (plano próprio ou sem plano) | null (plano do personal, no aparelho do aluno). */
export type UsePlanAction = "usar" | "usar_meu" | null;
export function usePlanAction(mode: "self" | "coach", diet: Pick<DietPlan, "createdBy"> | null, ownerId: string): UsePlanAction {
  if (mode === "coach") return "usar";
  if (!diet || !diet.createdBy || diet.createdBy === ownerId) return "usar_meu";
  return null;
}

// ---- U3c: dieta só com metas e orientações também vai pelo link -----------------------------------------------------

/** Algum alimento em alguma refeição. */
export const dietHasItems = (d: Pick<DietPlan, "meals">): boolean => d.meals.some((m) => m.items.length > 0);

/**
 * A dieta que vai no link da ficha (U3c): a salva com itens, orientações ou metas. Uma dieta salva sempre tem metas,
 * então na prática é `diet !== null`; só uma dieta sem nada (metas zeradas, sem itens e sem orientações) fica de fora.
 * Substitui a regra antiga "só com itens", que deixava de fora quem passa só metas e orientações (o caminho que o app
 * recomenda ao personal sem CRN).
 */
export function dietForLink<D extends Pick<DietPlan, "meals" | "notes" | "targets">>(diet: D | null | undefined): D | null {
  if (!diet) return null;
  const hasTargets = MACRO_ORDER.some((k) => diet.targets[k] > 0);
  return dietHasItems(diet) || Boolean(diet.notes?.trim()) || hasTargets ? diet : null;
}

/**
 * Linha da dieta no /abrir (G): "4 refeições · metas de 1.650 kcal por dia"; sem refeições com itens (U3c):
 * "Metas do dia e orientações" ou "Metas do dia".
 */
export function dietLinkSummary(diet: Pick<DietPlan, "meals" | "notes" | "targets">): string {
  const n = diet.meals.filter((m) => m.items.length).length;
  if (n) return `${n} ${n === 1 ? "refeição" : "refeições"} · metas de ${fmtInt(diet.targets.kcal)} kcal por dia`;
  return diet.notes?.trim() ? "Metas do dia e orientações" : "Metas do dia";
}

/** Texto do "Cardápio do dia" no plano do personal sem itens (estado `leitura_metas`, R15). */
export function metasOnlyText(diet: Pick<DietPlan, "notes">): string {
  return diet.notes?.trim()
    ? "Este plano tem só as metas do dia e as orientações, sem cardápio por refeição."
    : "Este plano tem só as metas do dia, sem cardápio por refeição.";
}
