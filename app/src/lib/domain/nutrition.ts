import { allFoods, foodsVersion, getFood, ML_IGUAL_G, type Food } from "./foods";
import { normalize } from "./exercises";
import { uid } from "./ids";
import { itemFromFood, round1, sumItems } from "./nutrition-base";
import type { DietItem, MacroTargets, Meal } from "./types";

/**
 * Metas, itens, totais e o cardápio-base moram em nutrition-base.ts (fora do pacote de todas as telas); reexportados aqui
 * para os importadores de sempre. Aqui fica o leitor de texto livre e a análise da dieta.
 */
export { ACTIVITY_FACTOR, ACTIVITY_LABEL, bmr, buildDietTemplate, dietTotals, itemFromFood, macroTargets, NOTA_CARDAPIO_BASE, sumItems, targetsForProfile, tdee } from "./nutrition-base";

// ---------------------------------------------------------------------------
// Leitor de texto livre: "2 ovos, 1 pão francês com requeijão, 150g de frango"
// ---------------------------------------------------------------------------

/** Minúsculo e sem acento, mantendo números, "/", "," e "." (frações e decimais). */
function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/.,%+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Singular aproximado de uma palavra já sem acento (o mesmo corte vale para o texto e para os apelidos). */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/(oes|aes)$/.test(word)) return word.slice(0, -3) + "ao";
  if (/eis$/.test(word)) return word.slice(0, -3) + "el";
  if (/ns$/.test(word)) return word.slice(0, -2) + "m";
  if (/(res|zes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Texto pronto para casar com apelidos: sem acento, minúsculo, pontuação vira espaço, palavras no singular. */
function canon(text: string): string {
  return plain(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

interface AliasEntry {
  alias: string;
  re: RegExp;
  food: Food;
  /** Prato com nome composto ("café com leite", "arroz e feijão"): não deve ser partido em "com"/"e". */
  composite: boolean;
}
let aliasIndex: AliasEntry[] = [];
let aliasIndexVersion = -1;

/** Índice de apelidos (maior primeiro), reconstruído quando os alimentos personalizados mudam. */
function aliases(): AliasEntry[] {
  if (aliasIndexVersion !== foodsVersion()) {
    const seen = new Set<string>();
    aliasIndex = allFoods()
      .flatMap((f) => [...f.aliases, f.name.replace(/\(.*?\)/g, " ")].map((a) => ({ alias: canon(a), food: f })))
      .filter((e) => e.alias.length > 1 && !seen.has(e.alias) && Boolean(seen.add(e.alias)))
      .sort((a, b) => b.alias.length - a.alias.length)
      .map((e) => ({
        ...e,
        composite: / (com|e) /.test(e.alias),
        re: new RegExp(`(^| )${e.alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}( |$)`),
      }));
    aliasIndexVersion = foodsVersion();
  }
  return aliasIndex;
}

function findAlias(canonText: string, compositeOnly = false): AliasEntry | undefined {
  return aliases().find((a) => (!compositeOnly || a.composite) && a.re.test(canonText));
}

/** Alimento citado no texto (o apelido mais longo vence; plural e acento não importam). */
export function matchFood(text: string): Food | undefined {
  return findAlias(canon(text))?.food;
}

/** Busca para o seletor de alimentos: todas as palavras, sem acento; os do usuário primeiro, depois os nomes mais curtos. */
export function searchFoods(query: string, limit = 40): Food[] {
  const words = canon(query).split(" ").filter(Boolean);
  const all = allFoods();
  if (!words.length) return all.slice(0, limit);
  const custom = (f: Food) => (f.id.startsWith("custom_") ? 0 : 1);
  return all
    .filter((f) => {
      const hay = [f.name, ...f.aliases].map(canon).join(" | ");
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => custom(a) - custom(b) || a.name.length - b.name.length)
    .slice(0, limit);
}

/** Inteiro com separador de milhar pt-BR ("1.650"), para os textos do analisador baterem com a tela. */
const kc = (v: number) => Math.round(v).toLocaleString("pt-BR");

const WORD_NUM: Record<string, number> = { meia: 0.5, meio: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const toNum = (v: string) => parseFloat(v.replace(",", "."));

/** Quantidade no começo do texto: "2", "1/2", "1 e meia", "2-3", "2x", "meia", "duas". */
function readQuantity(t: string): { qty: number | null; rest: string } {
  let m = t.match(new RegExp(`^(${NUM})\\s*/\\s*(\\d+)\\s*`));
  if (m && toNum(m[2]!) > 0) return { qty: toNum(m[1]!) / toNum(m[2]!), rest: t.slice(m[0].length) };
  m = t.match(new RegExp(`^(${NUM})\\s+e\\s+(?:meia|meio|1/2)\\b\\s*`));
  if (m) return { qty: toNum(m[1]!) + 0.5, rest: t.slice(m[0].length) };
  m = t.match(new RegExp(`^(${NUM})\\s*(?:-|a|ou)\\s*(${NUM})(?![\\d/])\\s*`));
  if (m && toNum(m[2]!) > toNum(m[1]!)) return { qty: (toNum(m[1]!) + toNum(m[2]!)) / 2, rest: t.slice(m[0].length) };
  m = t.match(new RegExp(`^(${NUM})\\s*(?:x(?![a-z])\\s*)?`));
  if (m) return { qty: toNum(m[1]!), rest: t.slice(m[0].length) };
  m = t.match(/^(meia|meio|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\b\s*/);
  if (m) {
    const after = t.slice(m[0].length);
    const half = after.match(/^e\s+(?:meia|meio)\b\s*/);
    return half ? { qty: WORD_NUM[m[1]!]! + 0.5, rest: after.slice(half[0].length) } : { qty: WORD_NUM[m[1]!]!, rest: after };
  }
  return { qty: null, rest: t };
}

type UnitKey =
  | "g" | "kg" | "ml" | "l" | "colher" | "concha" | "fatia" | "xicara" | "copo" | "pote" | "lata" | "unidade" | "file" | "bife" | "scoop"
  | "punhado" | "prato" | "pedaco" | "pegador" | "tigela" | "garrafa" | "dose" | "sache" | "posta" | "porcao" | "pacote";

const UNIT_PATTERNS: [RegExp, UnitKey][] = [
  [/^(?:kg|kilo|quilo)\b/, "kg"],
  [/^(?:g|gr|grama)\b/, "g"],
  [/^ml\b/, "ml"],
  [/^(?:l|litro)\b/, "l"],
  [/^colher(?:\s+\(?de\s+(sopa|cha|servir|sobremesa|cafe|arroz)\)?)?(?:\s+(?:cheia|rasa))?\b/, "colher"],
  [/^concha\b/, "concha"],
  [/^fatia\b/, "fatia"],
  [/^xicara\b/, "xicara"],
  [/^copo\b/, "copo"],
  [/^pote\b/, "pote"],
  [/^lat(?:a|inha)\b/, "lata"],
  [/^(?:unidade|unid|und|un)\b/, "unidade"],
  [/^file\b/, "file"],
  [/^bife\b/, "bife"],
  [/^(?:scoop|medida|dosador)\b/, "scoop"],
  [/^(?:punhado|mao cheia)\b/, "punhado"],
  [/^prato\b/, "prato"],
  [/^pedaco\b/, "pedaco"],
  [/^pegador\b/, "pegador"],
  [/^(?:tigela|bowl|cumbuca)\b/, "tigela"],
  [/^garrafa\b/, "garrafa"],
  [/^dose\b/, "dose"],
  [/^sache\b/, "sache"],
  [/^posta\b/, "posta"],
  [/^porcao\b/, "porcao"],
  [/^(?:pacote|pacotinho|saco|saquinho)\b/, "pacote"],
];

const GENERIC_UNIT_G: Partial<Record<UnitKey, number>> = {
  concha: 90, fatia: 30, xicara: 200, copo: 200, pote: 170, lata: 350, file: 120, bife: 100, scoop: 30, punhado: 30, prato: 250,
  pedaco: 80, pegador: 110, tigela: 250, garrafa: 500, dose: 50, sache: 10, posta: 150, porcao: 100,
};

/** Gramas de uma medida caseira para um alimento: a medida da própria base quando é a mesma, senão um valor usual. */
function unitGrams(unit: UnitKey, sub: string | undefined, food: Food): number {
  const label = canon(food.unit?.label ?? "");
  const own = food.unit?.g ?? 100;
  const first = label.split(" ")[0] ?? "";
  if (unit === "colher") {
    if (sub === "cha" || sub === "cafe") return 5;
    if (sub === "sobremesa") return 10;
    const wants = sub === "servir" || sub === "arroz" ? "servir" : "sopa";
    if (first === "colher") {
      const has = label.includes("servir") ? "servir" : label.includes("cha") ? "cha" : "sopa";
      if (!sub || has === wants) return own;
      if (has === "servir") return Math.round(own / 2);
      if (has === "sopa") return wants === "servir" ? own * 2 : own;
      return wants === "servir" ? 45 : 15;
    }
    if (wants === "servir" && sub) return 45;
    // "2 colheres de feijão", "1 colher de frango desfiado": colher de sopa cheia de comida, não de pó ou óleo.
    return food.category === "carbo" || food.category === "proteina" || food.category === "vegetal" ? (food.kcal > 300 ? 15 : 25) : 15;
  }
  if (unit === "unidade" || unit === "porcao") return own;
  if (first === unit || (unit === "lata" && label.includes("lata")) || (unit === "copo" && label.includes("copo")) || (unit === "scoop" && /scoop|medida|dosador/.test(label))) return own;
  if (unit === "prato" && food.category === "vegetal") return 80;
  if (unit === "xicara" && food.category === "carbo") return food.kcal > 300 ? 80 : 160; // seco (aveia, granola) pesa metade do cozido
  return GENERIC_UNIT_G[unit] ?? own;
}

const FILLER = /^(?:(?:comi|tomei|bebi|mais|depois|tambem|ainda|e|com|de|do|da|um pouco de|pouco de|bastante)\s+)+/;

/** Unidade no começo do texto (já no singular). `afterNumber`: "g", "l" e "un" só valem depois de um número. */
function readUnit(text: string, afterNumber: boolean): { unit?: UnitKey; sub?: string; rest: string } {
  const t = text.replace(/^(?:de|do|da)\s+/, "");
  for (const [re, key] of UNIT_PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    if (!afterNumber && ["g", "kg", "ml", "l", "unidade"].includes(key)) continue;
    return { unit: key, sub: m[1], rest: t.slice(m[0].length).replace(/^\s*(?:de|do|da|com)\s+/, " ").trim() };
  }
  return { rest: t };
}

/** Porção usual quando a pessoa não diz a quantidade ("arroz, feijão e bife"). */
function defaultGrams(food: Food): number {
  const g = food.unit?.g ?? 100;
  const label = canon(food.unit?.label ?? "");
  if (label.startsWith("colher de servir")) return g * 3;
  if (label.startsWith("pegador")) return g * 2;
  if (label.startsWith("colher de sopa") && food.category === "carbo" && food.kcal < 300) return g * 2;
  return g;
}

const singularWords = (t: string) => t.split(" ").map(singular).join(" ");

/**
 * Como o app leu um trecho (R3-5), para a revisão antes das dicas. Não é salvo: depois que a pessoa confere, os gramas
 * do item são a verdade (a dieta e o link guardam só o `DietItem`).
 */
export interface LeituraItem {
  /** O trecho como a pessoa escreveu. */
  entrada: string;
  /** Por que conferir, numa frase curta. Ausente = lido sem dúvida. Enquanto houver, o total é parcial. */
  confira?: string;
  /** Leituras possíveis de uma quantidade ambígua; a primeira é a usada no total provisório. */
  opcoes?: { rotulo: string; grams: number }[];
  /** Conversão feita, à vista: "200 ml ≈ 200 g (leite integral: 1 ml ≈ 1 g)". */
  conversao?: string;
  /** "ml" quando a pessoa escreveu em ml ou litro e 1 ml ≈ 1 g (o número editável vale para os dois). */
  medida?: "g" | "ml";
  /** O nome lido não é o que a pessoa escreveu ("frango frito" lido como "Filé de frango à milanesa"): a tela mostra. */
  aproximado?: boolean;
  /** A pessoa corrigiu a quantidade na revisão. */
  editado?: boolean;
}

/** Texto lido, item por item: refeições, o que não foi reconhecido e como cada item foi lido (pela `uid`). */
export interface LeituraDieta {
  meals: Meal[];
  unknown: string[];
  leitura: Record<string, LeituraItem>;
}

/** Teto de um item (g). Acima disso o item fica com o teto e pede conferência. */
const MAX_ITEM_G = 3000;
const PREPARO = /(?:^| )(?:cozid[oa]|assad[oa]|grelhad[oa]|frit[oa]|refogad[oa]|hidratad[oa]|estourad[oa]|torrad[oa])(?: |$)/;
const fmtQtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
/** Nome do alimento dentro de uma frase ("leite integral", "suco de laranja natural"). */
const nomeNaFrase = (f: Food) => f.name.replace(/\s*\(.*?\)/g, "").trim().toLowerCase();

/** Medida explícita no trecho ("100 g", "0,5 kg", "300 ml", "1 l"), em g ou ml. */
function lerMedida(text: string): { valor: number; un: "g" | "ml"; litro: boolean } | null {
  const m = text.match(new RegExp(`(?:^|\\s)(${NUM})\\s*(kg|kilos?|quilos?|g|gr|gramas?|ml|l|litros?)(?![a-z])`));
  if (!m) return null;
  const n = toNum(m[1]!);
  if (!(n > 0)) return null;
  const u = m[2]!;
  if (/^(?:kg|kilo|quilo)/.test(u)) return { valor: n * 1000, un: "g", litro: false };
  if (/^(?:g|gr|grama)/.test(u)) return { valor: n, un: "g", litro: false };
  if (u === "ml") return { valor: n, un: "ml", litro: false };
  return { valor: n * 1000, un: "ml", litro: true };
}

/** Lê um trecho com um único alimento ("2 colheres de sopa de arroz", "frango 150g", "pão de forma 2 fatias", "banana"). */
function parseSingle(raw: string): { item: DietItem; leitura: LeituraItem } | null {
  const t = plain(raw).replace(/%/g, " ").replace(FILLER, "");
  if (!t) return null;
  let { qty, rest } = readQuantity(t);
  let u = readUnit(singularWords(rest), qty !== null);
  let foodText = u.unit ? u.rest : rest;
  if (qty === null && !u.unit) {
    // Quantidade depois do nome: "frango grelhado 150g", "arroz 100 g", "pão de forma 2 fatias", "banana 2".
    const at = t.search(/(?<=[a-z] )\d/);
    if (at > 0) {
      const tail = readQuantity(t.slice(at));
      const tailUnit = readUnit(singularWords(tail.rest), true);
      if (tail.qty !== null && (tailUnit.unit || !tail.rest.trim())) {
        qty = tail.qty;
        u = tailUnit;
        foodText = t.slice(0, at);
      }
    }
  }
  const hit = findAlias(canon(foodText)) ?? findAlias(canon(t));
  if (!hit) return null;
  const food = hit.food;
  const leitura: LeituraItem = { entrada: raw.trim().replace(/\s+/g, " ") };
  const confira: string[] = [];
  const n = qty ?? 1;
  const nome = nomeNaFrase(food);
  let grams: number;
  let ml: { valor: number; litro: boolean } | null = null;
  const pesoOuVolume = u.unit === "g" || u.unit === "kg" || u.unit === "ml" || u.unit === "l";
  // Medida explícita depois de uma contagem ("1 pacote de bolacha 100g", "1 copo de suco de 300 ml") vence a porção padrão.
  const medida = pesoOuVolume || (qty === null && !u.unit) ? null : lerMedida(foodText);
  if (u.unit === "g") grams = n;
  else if (u.unit === "kg") grams = n * 1000;
  else if (u.unit === "ml" || u.unit === "l") {
    grams = u.unit === "l" ? n * 1000 : n;
    ml = { valor: grams, litro: u.unit === "l" };
  } else if (medida) {
    const cada = /(?:^| )cada(?: |$)/.test(t);
    const noTotal = /(?:^| )(?:no total|ao todo|total)(?: |$)/.test(t);
    const un = medida.un === "ml" ? "ml" : "g";
    if (n === 1 || noTotal) grams = medida.valor;
    else if (cada) grams = n * medida.valor;
    else {
      // "2 scoops de whey 40g": 40 g no total ou 40 g cada? Não adivinha: as duas leituras, a menor no total provisório.
      const total = { rotulo: `${fmtQtd(medida.valor)} ${un} no total`, grams: medida.valor };
      const porUnidade = { rotulo: `${fmtQtd(medida.valor)} ${un} cada (${fmtQtd(n)} × ${fmtQtd(medida.valor)} ${un} = ${fmtQtd(n * medida.valor)} ${un})`, grams: n * medida.valor };
      leitura.opcoes = total.grams <= porUnidade.grams ? [total, porUnidade] : [porUnidade, total];
      grams = leitura.opcoes[0]!.grams;
      confira.push(`${fmtQtd(medida.valor)} ${un} no total ou cada um?`);
    }
    if (medida.un === "ml") ml = { valor: grams, litro: medida.litro && grams === medida.valor };
  } else if (u.unit === "pacote" && canon(food.unit?.label ?? "").split(" ")[0] !== "pacote") {
    // Pacote sem peso e sem medida própria na base: usa 100 g por pacote e pede o peso.
    grams = n * 100;
    confira.push("Quantos gramas tem o pacote? Usei 100 g por pacote.");
  } else if (u.unit) grams = n * unitGrams(u.unit, u.sub, food);
  else if (qty !== null && qty > 20) grams = qty; // "150 frango" → gramas
  else if (qty === null) grams = defaultGrams(food);
  else grams = n * (food.unit?.g ?? 100);
  // ml → g só quando 1 ml ≈ 1 g; senão o app não sabe o peso e pede para conferir.
  if (ml) {
    if (ML_IGUAL_G.has(food.id)) {
      leitura.medida = "ml";
      leitura.conversao = `${ml.litro ? `${fmtQtd(ml.valor / 1000)} l` : `${kc(ml.valor)} ml`} ≈ ${kc(grams)} g (${nome}: 1 ml ≈ 1 g)`;
    } else confira.push(`Medida em ml: confira quantos gramas de ${nome}.`);
  }
  // "cru" nunca vira "cozido" calado: sem entrada crua, o item lido é de preparo e a pessoa confere.
  if (/(?:^| )crua?(?: |$)/.test(canon(t)) && !/(?:^| )crua?(?: |$)/.test(canon(food.name)) && PREPARO.test(canon(food.name)))
    confira.push(`Você escreveu “cru” e a base só tem ${nome}. Confira.`);
  if (grams > MAX_ITEM_G) confira.push(`Mais de ${kc(MAX_ITEM_G)} g num item: usei ${kc(MAX_ITEM_G)} g. Confira.`);
  // Aproximação: alguma palavra do que foi casado não está no nome lido ("frango frito" → "Filé de frango à milanesa").
  const doNome = new Set(canon(food.name.replace(/\(.*?\)/g, " ")).split(" "));
  if (hit.alias.split(" ").some((w) => !doNome.has(w))) leitura.aproximado = true;
  if (confira.length) leitura.confira = confira.join(" ");
  return { item: itemFromFood(food, Math.min(MAX_ITEM_G, Math.max(1, grams))), leitura };
}

/**
 * Lê um trecho que pode ter mais de um alimento ligado por "com", "e" ou "mais".
 * Pratos com nome composto ("café com leite", "pão na chapa") ficam inteiros.
 */
function parsePiece(raw: string): { items: DietItem[]; unknown: string[]; leitura: Record<string, LeituraItem> } {
  const items: DietItem[] = [];
  const unknown: string[] = [];
  const leitura: Record<string, LeituraItem> = {};
  const text = raw.trim().replace(/\s+/g, " ");
  if (!/[a-z]/.test(plain(text))) return { items, unknown, leitura };
  // "1 e 1/2 xícara", "2 e meia colheres": o "e" faz parte do número, não separa alimentos.
  const guarded = text.replace(/(\d)\s+e\s+(meia|meio|1\/2)\b/gi, "$1\u0001$2");
  // Separa em "e", "com", "mais", mas mantém inteiro o prato de nome composto ("café com leite", "arroz e feijão").
  const tokens = guarded.split(/\s+(e|com|mais|\+)\s+/i);
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    let part = tokens[i]!;
    while (i + 2 < tokens.length) {
      const next = tokens[i + 2]!;
      const joined = `${part} ${tokens[i + 1]} ${next}`;
      const hit = findAlias(canon(joined), true);
      if (!hit || hit.re.test(canon(part)) || hit.re.test(canon(next))) break;
      part = joined;
      i += 2;
    }
    parts.push(part.replace(/\u0001/g, " e "));
  }
  for (const part of parts) {
    if (!/[a-z]{2}/.test(plain(part))) continue;
    const lido = parseSingle(part);
    if (lido) {
      items.push(lido.item);
      leitura[lido.item.uid] = lido.leitura;
    } else if (canon(part).replace(/\b(?:de|do|da|e|com|um|uma|pouco|muito|bem|mais|sem|acucar|adocante|sal)\b/g, "").replace(/[^a-z]/g, "").length >= 3) unknown.push(part.trim());
  }
  // "Omelete com 3 ovos e queijo": os ovos já são a omelete — não conta duas vezes.
  if (items.length > 1 && items[0]!.foodId?.startsWith("omelete") && items.slice(1).some((i) => i.foodId === "ovo" || i.foodId === "clara")) delete leitura[items.shift()!.uid];
  return { items, unknown, leitura };
}

export interface ParsedLine {
  raw: string;
  item: DietItem | null;
}

/** Lê uma linha com um alimento (o primeiro, se houver mais de um). */
export function parseFoodLine(raw: string): ParsedLine {
  return { raw, item: parsePiece(raw).items[0] ?? null };
}

const MEAL_WORDS = "cafe da manha|desjejum|colacao|lanche da manha|lanche da tarde|lanche da noite|lanche|almoco|jantar|janta|ceia|pre[- ]?treino|pos[- ]?treino|merenda";
const TIME = String.raw`(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:h(?:rs?)?|min)?`;
// "Almoço:", "ALMOÇO - arroz", "12h30 almoço", "Lanche da tarde (16h): ...". "Café" sozinho só é refeição com ":" ou "-" (senão é a bebida).
const MEAL_RE = new RegExp(`^(?:as\\s+)?(?:${TIME}\\s*[-–:]?\\s*)?(${MEAL_WORDS}|cafe(?=\\s*(?:\\(|[:\\-–]|$)))\\b\\s*(?:\\(?\\s*(?:as\\s+)?${TIME}\\s*\\)?)?\\s*[:\\-–]?\\s*(.*)$`);
const BULLET = /^\s*(?:[-–•*·>]+|\d{1,2}[.)])\s+/;

/** Divide o texto em refeições (cabeçalhos conhecidos, horários ou linhas terminadas em ":") e itens. */
export function parseDietText(text: string): LeituraDieta {
  const meals: Meal[] = [];
  const unknown: string[] = [];
  const leitura: Record<string, LeituraItem> = {};
  let current: Meal | null = null;
  const pad = (v: string) => v.padStart(2, "0");

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.replace(BULLET, "").trim();
    if (!line) continue;
    // Mesmo comprimento do original (só troca letras acentuadas), para recortar o resto da linha depois.
    const n = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
    const mm = n.match(MEAL_RE);
    let itemsText = line;
    if (mm) {
      const hour = mm[1] ?? mm[4];
      const minute = mm[2] ?? mm[5];
      const rest = mm[6] ?? "";
      const name = MEAL_LABEL[mm[3]!.replace(/[- ]/g, " ").replace("pre treino", "pre-treino").replace("pos treino", "pos-treino")] ?? capitalize(mm[3]!);
      current = { uid: uid(), name, items: [], ...(hour && Number(hour) < 24 ? { time: `${pad(hour)}:${pad(minute ?? "00")}` } : {}) };
      meals.push(current);
      // O resto da linha, no texto original (mesmo comprimento que o normalizado).
      itemsText = rest ? line.slice(line.length - rest.length) : "";
    } else if (/:$/.test(line) && line.length <= 40) {
      current = { uid: uid(), name: capitalize(line.replace(/:$/, "").trim()), items: [] };
      meals.push(current);
      itemsText = "";
    }
    if (!itemsText.trim()) continue;
    if (!current) {
      current = { uid: uid(), name: "Refeição", items: [] };
      meals.push(current);
    }
    // A vírgula entre dígitos é decimal ("0,5 kg", "1,5 colher"), não separa alimentos.
    for (const chunk of itemsText.split(/(?<!\d),|,(?!\d)|;|\s\/\s|\s\+\s|\.(?=\s|$)/)) {
      if (!chunk.trim()) continue;
      const parsed = parsePiece(chunk);
      current.items.push(...parsed.items);
      unknown.push(...parsed.unknown);
      Object.assign(leitura, parsed.leitura);
    }
  }
  return { meals: meals.filter((m) => m.items.length), unknown, leitura };
}

const MEAL_LABEL: Record<string, string> = {
  "cafe da manha": "Café da manhã",
  cafe: "Café da manhã",
  desjejum: "Café da manhã",
  colacao: "Lanche da manhã",
  "lanche da manha": "Lanche da manhã",
  "lanche da tarde": "Lanche da tarde",
  "lanche da noite": "Lanche da noite",
  lanche: "Lanche",
  almoco: "Almoço",
  jantar: "Jantar",
  janta: "Jantar",
  ceia: "Ceia",
  "pre-treino": "Pré-treino",
  "pos-treino": "Pós-treino",
  merenda: "Lanche",
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Feedback determinístico (base do "Análise da dieta" sem IA)
// ---------------------------------------------------------------------------

/** Itens que valem um alerta de moderação (frituras, doces, lanches, refrigerante e álcool). */
const TREATS = new Set([
  "refrigerante", "cerveja", "vinho", "destilado", "caipirinha", "batata_frita", "mandioca_frita", "batata_palha", "salgadinho_pacote", "chocolate", "pizza",
  "coxinha", "salgadinho_festa", "pastel", "x_burger", "cachorro_quente", "nuggets", "macarrao_instantaneo", "biscoito_recheado", "sorvete", "milkshake",
  "brigadeiro", "bolo_chocolate", "leite_condensado", "creme_avela", "bacon", "linguica", "salsicha", "mortadela", "acai",
]);

export interface DietFeedback {
  score: number;
  totals: MacroTargets;
  highlights: string[];
  adjustments: string[];
}


/** Pedido que substitui os ajustes de falta quando o total é parcial (R3-5). */
export const PEDIDO_PARCIAL = "Complete ou corrija os itens não lidos para ver o que ajustar.";
const PEDIDO_CONFERIR = "Confira os itens marcados para ver o que ajustar.";
const PEDIDO_AMBOS = "Complete ou corrija os itens não lidos e confira os marcados para ver o que ajustar.";

/**
 * Dicas pelo motor de regras. `parcial` (R3-5): há linha não reconhecida ou item a conferir, então o total é só o que foi
 * lido. Fica o que continua verdade com mais comida (proteína em dia, gordura alta, guloseimas, frutas e vegetais
 * presentes); sai tudo o que nasce da falta ou da comparação com a meta (calorias dentro, acima ou abaixo, "Faltam
 * cerca de…", "Distribua a proteína", "Não encontrei salada"), e entra o pedido para completar.
 */
export function analyzeDiet(meals: Meal[], targets: MacroTargets, weightKg?: number, opts: { parcial?: boolean; pedido?: string } = {}): DietFeedback {
  const parcial = !!opts.parcial;
  const totals = sumItems(meals.flatMap((m) => m.items));
  const highlights: string[] = [];
  const adjustments: string[] = [];
  const pct = (v: number, t: number) => (t > 0 ? v / t : 1);

  const kcalRatio = pct(totals.kcal, targets.kcal);
  const protRatio = pct(totals.proteinG, targets.proteinG);
  const fatRatio = pct(totals.fatG, targets.fatG);

  if (parcial) adjustments.push(opts.pedido ?? PEDIDO_PARCIAL);
  if (protRatio >= 0.9) highlights.push(`Proteína em dia: ${Math.round(totals.proteinG)} g de ${targets.proteinG} g.`);
  else if (!parcial) {
    const gap = Math.round(targets.proteinG - totals.proteinG);
    const scoops = Math.max(1, Math.round(gap / 24));
    const eggs = Math.max(1, Math.round(gap / 6.5));
    adjustments.push(
      `Faltam cerca de ${gap} g de proteína. Equivale a ${Math.max(30, Math.round((gap / 0.32) / 10) * 10)} g de frango grelhado, ${scoops} ${scoops === 1 ? "scoop" : "scoops"} de whey ou ${eggs} ${eggs === 1 ? "ovo" : "ovos"}.`,
    );
  }
  if (parcial) {
    // Total parcial: nada de comparar calorias com a meta.
  } else if (kcalRatio > 1.12) adjustments.push(`Calorias ${Math.round((kcalRatio - 1) * 100)}% acima da meta (${kc(totals.kcal)} de ${kc(targets.kcal)} kcal). Reduza primeiro as porções de carboidrato ou gordura.`);
  else if (kcalRatio < 0.85) adjustments.push(`Calorias ${Math.round((1 - kcalRatio) * 100)}% abaixo da meta (${kc(totals.kcal)} de ${kc(targets.kcal)} kcal). Se o dia foi isso mesmo, falta comida para treinar e recuperar bem; se faltou anotar algo, complete.`);
  else highlights.push(`Calorias dentro da faixa: ${kc(totals.kcal)} de ${kc(targets.kcal)} kcal.`);
  if (fatRatio > 1.3) adjustments.push(`Gordura alta (${Math.round(totals.fatG)} g). Atenção a frituras, queijos e óleos.`);

  const proteinMeals = meals.filter((m) => sumItems(m.items).proteinG >= 20).length;
  if (meals.length >= 3 && proteinMeals >= 3) highlights.push(`Proteína bem distribuída: ${proteinMeals} refeições com 20 g ou mais.`);
  else if (meals.length >= 3 && !parcial) adjustments.push("Distribua a proteína: pelo menos 20 g em três refeições do dia.");

  const hasVeg = meals.some((m) => m.items.some((i) => getFood(i.foodId ?? "")?.category === "vegetal"));
  const hasFruit = meals.some((m) => m.items.some((i) => getFood(i.foodId ?? "")?.category === "fruta"));
  if (!hasVeg && !parcial) adjustments.push("Não encontrei salada nem legumes. Inclua no almoço e no jantar: dão fibra e saciedade.");
  if (hasFruit && hasVeg) highlights.push("Frutas e vegetais presentes.");
  const junk = meals.flatMap((m) => m.items).filter((i) => TREATS.has(i.foodId ?? ""));
  if (junk.length) {
    const names = [...new Set(junk.map((j) => j.name.replace(/\s*\(.*?\)/g, "").toLowerCase()))];
    const kcal = junk.reduce((a, j) => a + j.kcal, 0);
    adjustments.push(`${capitalize(names.join(", "))}: cerca de ${kc(kcal)} kcal do dia. Cabe com moderação, desde que entre na conta.`);
  }
  if (weightKg && totals.proteinG / weightKg > 3) adjustments.push("Proteína acima de 3 g/kg não traz ganho extra; troque parte por carboidrato.");

  let score = 100;
  score -= Math.min(35, Math.abs(1 - kcalRatio) * 100);
  score -= Math.min(30, Math.max(0, 0.9 - protRatio) * 100);
  score -= hasVeg ? 0 : 10;
  score -= Math.min(10, junk.length * 4);
  return { score: Math.max(0, Math.round(score)), totals, highlights, adjustments };
}

/** Análise completa pelo motor de regras (a mesma no servidor e no aparelho, com a IA desligada ou sem internet). */
export interface DietTextAnalysis extends DietFeedback, LeituraDieta {
  summary: string;
  /** Há linha não reconhecida ou item a conferir: o total é só o que foi lido e nenhum ajuste nasce da falta. */
  parcial: boolean;
  /** Itens lidos que pedem conferência (ainda nas refeições). */
  conferir: number;
}

/** Itens das refeições cuja leitura pede conferência. */
export function itensAConferir(l: Pick<LeituraDieta, "meals"> & { leitura?: LeituraDieta["leitura"] }): DietItem[] {
  const leitura = l.leitura ?? {};
  return l.meals.flatMap((m) => m.items).filter((i) => !!leitura[i.uid]?.confira);
}

/** O total é parcial: alguma linha não foi reconhecida ou algum item lido pede conferência. */
export function totalParcial(l: Pick<LeituraDieta, "meals" | "unknown"> & { leitura?: LeituraDieta["leitura"] }): boolean {
  return l.unknown.length > 0 || itensAConferir(l).length > 0;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Analisa uma leitura (do texto ou já revisada pela pessoa) contra as metas. Puro; a mesma conta para a tela e o servidor. */
export function analisarLeitura(l: Pick<LeituraDieta, "meals" | "unknown"> & { leitura?: LeituraDieta["leitura"] }, targets: MacroTargets, weightKg?: number): DietTextAnalysis {
  const meals = l.meals.filter((m) => m.items.length);
  const unknown = [...l.unknown];
  const leitura = l.leitura ?? {};
  const conferir = itensAConferir({ meals, leitura }).length;
  const parcial = unknown.length > 0 || conferir > 0;
  const count = meals.reduce((n, m) => n + m.items.length, 0);
  if (!count) {
    // Nenhum alimento lido: nada de totais nem de ajustes (zero não é "100% abaixo da meta").
    return {
      meals: [],
      unknown,
      leitura: {},
      totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      score: 0,
      summary: "Não reconheci os alimentos. Escreva a quantidade e o nome, por exemplo: “2 ovos, 1 pão francês”.",
      highlights: [],
      adjustments: [],
      parcial: unknown.length > 0,
      conferir: 0,
    };
  }
  const pedido = unknown.length && conferir ? PEDIDO_AMBOS : unknown.length ? PEDIDO_PARCIAL : PEDIDO_CONFERIR;
  const fb = analyzeDiet(meals, targets, weightKg, { parcial, pedido });
  const pendencias = [
    unknown.length ? plural(unknown.length, "item não reconhecido", "itens não reconhecidos") : null,
    conferir ? plural(conferir, "item para conferir", "itens para conferir") : null,
  ].filter(Boolean);
  const lidos = `${plural(count, "alimento lido", "alimentos lidos")} em ${plural(meals.length, "refeição", "refeições")}: ${kc(fb.totals.kcal)} kcal e ${Math.round(fb.totals.proteinG)} g de proteína (valores aproximados)`;
  const summary = parcial ? `${lidos} · ${pendencias.join(" e ")}: total parcial.` : `${lidos}.`;
  const usadas = new Set(meals.flatMap((m) => m.items.map((i) => i.uid)));
  const leituraUsada = Object.fromEntries(Object.entries(leitura).filter(([uid]) => usadas.has(uid)));
  return { meals, unknown, leitura: leituraUsada, totals: fb.totals, score: fb.score, summary, highlights: fb.highlights, adjustments: fb.adjustments, parcial, conferir };
}

/** Lê o texto "como no WhatsApp" e analisa contra as metas, sem rede e sem IA. */
export function analyzeDietText(text: string, targets: MacroTargets, weightKg?: number): DietTextAnalysis {
  return analisarLeitura(parseDietText(text), targets, weightKg);
}

/**
 * O item com outra quantidade (g; com 1 ml ≈ 1 g, o mesmo número em ml). Recalcula pela base quando o alimento é
 * conhecido; item sem alimento na base (vindo da IA) escala os macros na mesma proporção. Mesma `uid`.
 */
export function comGramas(item: DietItem, grams: number): DietItem {
  const g = Math.min(MAX_ITEM_G, Math.max(1, Math.round(Number.isFinite(grams) ? grams : item.grams)));
  const food = item.foodId ? getFood(item.foodId) : undefined;
  if (food) return { ...itemFromFood(food, g), uid: item.uid, name: item.name };
  if (item.grams <= 0) return { ...item, grams: g };
  const k = g / item.grams;
  return { ...item, grams: g, kcal: Math.round(item.kcal * k), proteinG: round1(item.proteinG * k), carbsG: round1(item.carbsG * k), fatG: round1(item.fatG * k) };
}

/**
 * Revisão (R3-5): a pessoa corrige a quantidade de um item (ou escolhe uma das `opcoes`). O item deixa de pedir
 * conferência (a quantidade agora é dela) e fica marcado como editado. Devolve uma leitura nova; a original não muda.
 */
export function editarItem<T extends Pick<LeituraDieta, "meals" | "unknown"> & { leitura?: LeituraDieta["leitura"] }>(l: T, uid: string, grams: number): T & { leitura: LeituraDieta["leitura"] } {
  const leitura = { ...(l.leitura ?? {}) };
  let achou = false;
  const meals = l.meals.map((m) => ({
    ...m,
    items: m.items.map((i) => {
      if (i.uid !== uid) return i;
      achou = true;
      return comGramas(i, grams);
    }),
  }));
  if (!achou) return { ...l, leitura };
  const antes = leitura[uid];
  leitura[uid] = { entrada: antes?.entrada ?? "", ...(antes?.aproximado ? { aproximado: true } : {}), ...(antes?.medida ? { medida: antes.medida } : {}), editado: true };
  return { ...l, meals, leitura };
}

/** Revisão: tira um item da conta. Refeição que fica vazia sai. */
export function removerItem<T extends Pick<LeituraDieta, "meals" | "unknown"> & { leitura?: LeituraDieta["leitura"] }>(l: T, uid: string): T & { leitura: LeituraDieta["leitura"] } {
  const leitura = { ...(l.leitura ?? {}) };
  delete leitura[uid];
  const meals = l.meals.map((m) => ({ ...m, items: m.items.filter((i) => i.uid !== uid) })).filter((m) => m.items.length);
  return { ...l, meals, leitura };
}

/** Resumo quando a revisão tirou tudo da conta (nada lido e nada pendente). */
export const SEM_ALIMENTOS_NA_CONTA = "Nenhum alimento na conta. Escreva de novo o que comeu e toque em Analisar.";

/**
 * Refaz a análise depois de uma correção na revisão (R3-5: editar, escolher, remover, "Não contar"). Leitura do motor:
 * tudo refeito pela mesma conta (resumo, parcial, dicas). Leitura da IA (`daIA`): refaz totais e resumo, e as dicas saem,
 * porque eram da leitura anterior e o motor não as refaz (os itens da IA não têm alimento da base: "sem salada" erraria).
 */
export function revisarAnalise(l: Pick<LeituraDieta, "meals" | "unknown"> & { leitura?: LeituraDieta["leitura"] }, targets: MacroTargets, weightKg: number | undefined, daIA: boolean): DietTextAnalysis {
  const a = analisarLeitura(l, targets, weightKg);
  if (!a.meals.length && !a.unknown.length) return { ...a, summary: SEM_ALIMENTOS_NA_CONTA, parcial: false };
  return daIA ? { ...a, highlights: [], adjustments: [] } : a;
}

/** Revisão: a pessoa diz que um trecho não lido não conta ("só café", rabisco). Decisão dela, nunca automática. */
export function descartarNaoLido<T extends Pick<LeituraDieta, "unknown">>(l: T, index: number): T {
  return { ...l, unknown: l.unknown.filter((_, i) => i !== index) };
}

