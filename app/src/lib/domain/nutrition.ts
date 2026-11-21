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
  | "punhado" | "prato" | "pedaco" | "pegador" | "tigela" | "garrafa" | "dose" | "sache" | "posta" | "porcao";

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

/** Lê um trecho com um único alimento ("2 colheres de sopa de arroz", "frango 150g", "pão de forma 2 fatias", "banana"). */
function parseSingle(raw: string): DietItem | null {
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
  const food = findAlias(canon(foodText))?.food ?? findAlias(canon(t))?.food;
  if (!food) return null;
  const n = qty ?? 1;
  let grams: number;
  if (u.unit === "g" || u.unit === "ml") grams = n;
  else if (u.unit === "kg" || u.unit === "l") grams = n * 1000;
  else if (u.unit) grams = n * unitGrams(u.unit, u.sub, food);
  else if (qty !== null && qty > 20) grams = qty; // "150 frango" → gramas
  else if (qty === null) grams = defaultGrams(food);
  else grams = n * (food.unit?.g ?? 100);
  return itemFromFood(food, Math.min(3000, Math.max(1, grams)));
}

/**
 * Lê um trecho que pode ter mais de um alimento ligado por "com", "e" ou "mais".
 * Pratos com nome composto ("café com leite", "pão na chapa") ficam inteiros.
 */
function parsePiece(raw: string): { items: DietItem[]; unknown: string[] } {
  const items: DietItem[] = [];
  const unknown: string[] = [];
  const text = raw.trim().replace(/\s+/g, " ");
  if (!/[a-z]/.test(plain(text))) return { items, unknown };
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
    const item = parseSingle(part);
    if (item) items.push(item);
    else if (canon(part).replace(/\b(?:de|do|da|e|com|um|uma|pouco|muito|bem|mais|sem|acucar|adocante|sal)\b/g, "").replace(/[^a-z]/g, "").length >= 3) unknown.push(part.trim());
  }
  // "Omelete com 3 ovos e queijo": os ovos já são a omelete — não conta duas vezes.
  if (items.length > 1 && items[0]!.foodId?.startsWith("omelete") && items.slice(1).some((i) => i.foodId === "ovo" || i.foodId === "clara")) items.shift();
  return { items, unknown };
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
export function parseDietText(text: string): { meals: Meal[]; unknown: string[] } {
  const meals: Meal[] = [];
  const unknown: string[] = [];
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
    for (const chunk of itemsText.split(/[,;]|\s\/\s|\s\+\s|\.(?=\s|$)/)) {
      if (!chunk.trim()) continue;
      const parsed = parsePiece(chunk);
      current.items.push(...parsed.items);
      unknown.push(...parsed.unknown);
    }
  }
  return { meals: meals.filter((m) => m.items.length), unknown };
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
    const scoops = Math.max(1, Math.round(gap / 24));
    const eggs = Math.max(1, Math.round(gap / 6.5));
    adjustments.push(
      `Faltam cerca de ${gap} g de proteína. Equivale a ${Math.max(30, Math.round((gap / 0.32) / 10) * 10)} g de frango grelhado, ${scoops} ${scoops === 1 ? "scoop" : "scoops"} de whey ou ${eggs} ${eggs === 1 ? "ovo" : "ovos"}.`,
    );
  }
  if (kcalRatio > 1.12) adjustments.push(`Calorias ${Math.round((kcalRatio - 1) * 100)}% acima da meta (${totals.kcal} de ${targets.kcal} kcal). Reduza primeiro as porções de carboidrato ou gordura.`);
  else if (kcalRatio < 0.85) adjustments.push(`Calorias ${Math.round((1 - kcalRatio) * 100)}% abaixo da meta (${totals.kcal} de ${targets.kcal} kcal). Se o dia foi isso mesmo, falta comida para treinar e recuperar bem; se faltou anotar algo, complete.`);
  else highlights.push(`Calorias dentro da faixa: ${totals.kcal} de ${targets.kcal} kcal.`);
  if (fatRatio > 1.3) adjustments.push(`Gordura alta (${Math.round(totals.fatG)} g). Atenção a frituras, queijos e óleos.`);

  const proteinMeals = meals.filter((m) => sumItems(m.items).proteinG >= 20).length;
  if (meals.length >= 3 && proteinMeals >= 3) highlights.push(`Proteína bem distribuída: ${proteinMeals} refeições com 20 g ou mais.`);
  else if (meals.length >= 3) adjustments.push("Distribua a proteína: pelo menos 20 g em três refeições do dia.");

  const hasVeg = meals.some((m) => m.items.some((i) => getFood(i.foodId ?? "")?.category === "vegetal"));
  const hasFruit = meals.some((m) => m.items.some((i) => getFood(i.foodId ?? "")?.category === "fruta"));
  if (!hasVeg) adjustments.push("Não encontrei salada nem legumes. Inclua no almoço e no jantar: dão fibra e saciedade.");
  if (hasFruit && hasVeg) highlights.push("Frutas e vegetais presentes.");
  const junk = meals.flatMap((m) => m.items).filter((i) => TREATS.has(i.foodId ?? ""));
  if (junk.length) {
    const names = [...new Set(junk.map((j) => j.name.replace(/\s*\(.*?\)/g, "").toLowerCase()))];
    const kcal = junk.reduce((a, j) => a + j.kcal, 0);
    adjustments.push(`${names.join(", ")}: cerca de ${kcal} kcal do dia. Cabe com moderação, desde que entre na conta.`);
  }
  if (weightKg && totals.proteinG / weightKg > 3) adjustments.push("Proteína acima de 3 g/kg não traz ganho extra; troque parte por carboidrato.");

  let score = 100;
  score -= Math.min(35, Math.abs(1 - kcalRatio) * 100);
  score -= Math.min(30, Math.max(0, 0.9 - protRatio) * 100);
  score -= hasVeg ? 0 : 10;
  score -= Math.min(10, junk.length * 4);
  return { score: Math.max(0, Math.round(score)), totals, highlights, adjustments };
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
    notes: "Cardápio de referência. Pode trocar um alimento por outro do mesmo tipo (arroz por batata ou macarrão, frango por carne magra, peixe ou ovos) mantendo a quantidade. Beba cerca de 35 ml de água por kg de peso ao longo do dia.",
    updatedAt: new Date().toISOString(),
  };
}
