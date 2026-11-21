import { afterEach, describe, expect, it } from "vitest";
import { FOODS, registerCustomFoods } from "./foods";
import { analyzeDiet, buildDietTemplate, dietTotals, macroTargets, matchFood, parseDietText, parseFoodLine, searchFoods } from "./nutrition";
import type { ActivityLevel, Goal, Sex } from "./types";

const owner = { ownerId: "u1", createdBy: "u1" };
afterEach(() => registerCustomFoods([]));

/** Itens lidos de um texto, no formato "id:gramas". */
const read = (text: string) => parseDietText(text).meals.flatMap((m) => m.items).map((i) => `${i.foodId}:${i.grams}`);

describe("base de alimentos", () => {
  it("ids únicos, medida caseira em todos e calorias coerentes com os macros", () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(f.unit?.g, f.id).toBeGreaterThan(0);
      expect(f.kcal, f.id).toBeLessThanOrEqual(900);
      const fromMacros = 4 * f.p + 4 * f.c + 9 * f.f;
      // Vegetais (fibra) e bebidas alcoólicas fogem da conta 4-4-9; o resto fecha em até 15%.
      if (f.kcal > 40 && f.category !== "vegetal" && !["cerveja", "vinho", "destilado", "caipirinha"].includes(f.id)) {
        expect(Math.abs(fromMacros - f.kcal) / f.kcal, `${f.id}: ${f.kcal} kcal x ${Math.round(fromMacros)} pelos macros`).toBeLessThan(0.16);
      }
    }
  });

  it("busca sem acento, com todas as palavras e alimentos do usuário primeiro", () => {
    expect(searchFoods("pao queijo")[0]!.id).toBe("pao_de_queijo");
    expect(searchFoods("FEIJÃO preto")[0]!.id).toBe("feijao_preto");
    expect(searchFoods("xyzabc")).toEqual([]);
    registerCustomFoods([{ id: "custom_1", name: "Iogurte proteico de morango", aliases: ["iogurte proteico de morango"], kcal: 60, p: 9.4, c: 4.5, f: 0.5, unit: { label: "garrafa", g: 250 }, category: "outros" }]);
    expect(searchFoods("iogurte")[0]!.id).toBe("custom_1");
    expect(parseFoodLine("1 garrafa de iogurte proteico de morango").item?.grams).toBe(250);
  });

  it("o apelido mais longo vence e frases comuns caem no alimento certo", () => {
    const cases: [string, string][] = [
      ["arroz", "arroz_branco"], ["arroz integral", "arroz_integral"], ["feijão", "feijao_carioca"], ["feijão preto", "feijao_preto"], ["pão", "pao_frances"],
      ["pão de queijo", "pao_de_queijo"], ["pão de forma", "pao_forma"], ["pão integral", "pao_integral"], ["pão na chapa", "pao_na_chapa"], ["frango", "frango_peito"],
      ["coxa de frango", "frango_coxa"], ["frango à milanesa", "frango_milanesa"], ["bife", "patinho"], ["bife à milanesa", "bife_milanesa"], ["carne moída", "carne_moida"],
      ["ovo", "ovo"], ["ovo frito", "ovo_frito"], ["ovos mexidos", "ovo_mexido"], ["ovo de codorna", "ovo_codorna"], ["claras", "clara"], ["omelete", "omelete"],
      ["leite", "leite_integral"], ["leite desnatado", "leite_desnatado"], ["leite condensado", "leite_condensado"], ["leite de coco", "leite_coco"], ["café", "cafe"],
      ["café com leite", "cafe_com_leite"], ["iogurte", "iogurte_natural"], ["iogurte grego", "iogurte_grego"], ["queijo", "mucarela"], ["queijo minas", "queijo_minas"],
      ["requeijão", "requeijao"], ["batata", "batata_inglesa"], ["batata doce", "batata_doce"], ["batata frita", "batata_frita"], ["batata palha", "batata_palha"],
      ["mandioca frita", "mandioca_frita"], ["macarrão", "macarrao"], ["miojo", "macarrao_instantaneo"], ["salada", "salada"], ["salada de frutas", "salada_frutas"],
      ["salada de maionese", "salada_maionese"], ["coca", "refrigerante"], ["coca zero", "refrigerante_zero"], ["atum", "atum"], ["tilápia", "tilapia"],
      ["pasta de amendoim", "pasta_amendoim"], ["amendoim", "amendoim"], ["castanhas", "mix_castanhas"], ["whey", "whey"], ["açaí", "acai"], ["pizza", "pizza"],
      ["bolo de chocolate", "bolo_chocolate"], ["bolo", "bolo"], ["chocolate", "chocolate"], ["chocolate amargo", "chocolate_amargo"], ["tapioca", "tapioca"], ["cuscuz", "cuscuz"],
    ];
    for (const [phrase, id] of cases) expect(matchFood(phrase)?.id, phrase).toBe(id);
    expect(matchFood("xpto")).toBeUndefined();
  });
});

describe("leitor de texto livre", () => {
  it("lê quantidades, frações, medidas caseiras e unidades coladas ao número", () => {
    const cases: [string, string[]][] = [
      ["2 ovos", ["ovo:100"]],
      ["150g de frango grelhado", ["frango_peito:150"]],
      ["150 frango", ["frango_peito:150"]],
      ["frango grelhado 150g", ["frango_peito:150"]],
      ["arroz (100 g)", ["arroz_branco:100"]],
      ["1 concha de feijão", ["feijao_carioca:86"]],
      ["meia banana", ["banana:35"]],
      ["3 bananas", ["banana:210"]],
      ["2x pão francês", ["pao_frances:100"]],
      ["2 pães de queijo", ["pao_de_queijo:80"]],
      ["duas fatias de pão integral", ["pao_integral:50"]],
      ["pao de forma 2 fatias", ["pao_forma:50"]],
      ["3 colheres de arroz", ["arroz_branco:135"]],
      ["4 colheres de servir de arroz", ["arroz_branco:180"]],
      ["1 e 1/2 xícara de arroz", ["arroz_branco:240"]],
      ["meia xícara de aveia", ["aveia:40"]],
      ["2 colheres de sopa de pasta de amendoim", ["pasta_amendoim:30"]],
      ["1 colher de chá de azeite", ["azeite:5"]],
      ["2 colheres de feijão", ["feijao_carioca:50"]],
      ["200ml de leite", ["leite_integral:200"]],
      ["açaí 300ml", ["acai:300"]],
      ["1 lata de coca", ["refrigerante:350"]],
      ["2 latinhas de cerveja", ["cerveja:700"]],
      ["1 lata de atum", ["atum:120"]],
      ["1 scoop de whey", ["whey:30"]],
      ["um punhado de castanhas", ["mix_castanhas:30"]],
      ["1 filé de tilápia", ["tilapia:120"]],
      ["2 fatias de pizza", ["pizza:240"]],
      ["1 prato de macarrão", ["macarrao:250"]],
      ["3 claras", ["clara:99"]],
      ["ARROZ INTEGRAL", ["arroz_integral:135"]],
      ["leite", ["leite_integral:200"]],
    ];
    for (const [phrase, expected] of cases) expect(read(phrase), phrase).toEqual(expected);
  });

  it("separa alimentos ligados por vírgula, 'e', 'com' e mantém pratos de nome composto", () => {
    const cases: [string, string[]][] = [
      ["1 pão francês com requeijão", ["pao_frances:50", "requeijao:30"]],
      ["whey com banana", ["whey:30", "banana:70"]],
      ["pão com ovo", ["pao_frances:50", "ovo:50"]],
      ["arroz, feijão e bife", ["arroz_branco:135", "feijao_carioca:86", "patinho:100"]],
      ["café com leite", ["cafe_com_leite:200"]],
      ["café com leite e pão", ["cafe_com_leite:200", "pao_frances:50"]],
      ["1 copo de leite com achocolatado", ["leite_achocolatado:200"]],
      ["tapioca com queijo", ["tapioca:60", "mucarela:20"]],
      ["macarrão com carne moída", ["macarrao:220", "carne_moida:150"]],
      ["presunto e queijo", ["presunto:20", "mucarela:20"]],
      // Os ovos já são a omelete: não conta duas vezes.
      ["omelete com 3 ovos e queijo", ["ovo:150", "mucarela:20"]],
    ];
    for (const [phrase, expected] of cases) expect(read(phrase), phrase).toEqual(expected);
  });

  it("o que não reconhece volta em `unknown`, nunca some nem vira outro alimento", () => {
    const r = parseDietText("Almoço: 150g de arroz, xpto 3000 e 1 bife, bolinho da vó");
    expect(r.meals[0]!.items.map((i) => i.foodId)).toEqual(["arroz_branco", "patinho"]);
    expect(r.unknown).toEqual(["xpto 3000", "bolinho da vó"]);
    expect(parseFoodLine("xyzabc").item).toBeNull();
  });

  it("reconhece cabeçalhos de refeição, horários e listas com marcador", () => {
    const r = parseDietText(
      "Café da manhã: 2 ovos, 1 pão francês, café\n- ALMOÇO - 150g arroz, 1 concha feijão e 120g frango\n12h30 lanche: 1 banana\nJanta\n• omelete com 3 ovos\nCeia (22h): 1 iogurte\nPré-treino: whey\ncafé com leite e pão\nLanche da tarde 16:00 - 1 maçã",
    );
    expect(r.unknown).toEqual([]);
    expect(r.meals.map((m) => [m.name, m.time ?? null])).toEqual([
      ["Café da manhã", null],
      ["Almoço", null],
      ["Lanche", "12:30"],
      ["Jantar", null],
      ["Ceia", "22:00"],
      ["Pré-treino", null],
      ["Lanche da tarde", "16:00"],
    ]);
    expect(r.meals[0]!.items.map((i) => i.foodId)).toEqual(["ovo", "pao_frances", "cafe"]);
    // "café com leite e pão" sem cabeçalho continua na refeição anterior, como bebida — não vira "Café da manhã".
    expect(r.meals[5]!.items.map((i) => i.foodId)).toEqual(["whey", "cafe_com_leite", "pao_frances"]);
    expect(parseDietText("Jantar: xyzabc").meals).toEqual([]);
  });
});

describe("metas e análise", () => {
  it("metas coerentes: déficit no emagrecimento e macros que fecham as calorias", () => {
    const t = macroTargets({ sex: "M", weightKg: 80, heightCm: 178, age: 30, activity: "moderado", goal: "emagrecimento" });
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(t.proteinG).toBe(160);
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal)).toBeLessThan(10);
  });

  it("nenhum adulto plausível recebe meta absurda", () => {
    const acts: ActivityLevel[] = ["sedentario", "leve", "moderado", "alto", "atleta"];
    const goals: Goal[] = ["hipertrofia", "forca", "emagrecimento", "condicionamento", "saude"];
    for (const sex of ["M", "F"] as Sex[])
      for (const weightKg of [45, 55, 70, 90, 110, 140])
        for (const age of [18, 35, 55, 72])
          for (const activity of acts)
            for (const goal of goals) {
              const heightCm = sex === "M" ? 176 : 163;
              const t = macroTargets({ sex, weightKg, heightCm, age, activity, goal });
              const label = `${sex} ${weightKg} kg ${age} anos ${activity} ${goal}`;
              expect(t.kcal, label).toBeGreaterThanOrEqual(sex === "M" ? 1500 : 1200);
              expect(t.kcal, label).toBeLessThan(6000);
              expect(t.carbsG, label).toBeGreaterThanOrEqual(90);
              expect(t.proteinG, label).toBeGreaterThanOrEqual(60);
              expect(t.proteinG, label).toBeLessThanOrEqual(230);
              expect(t.proteinG * 4, label).toBeLessThanOrEqual(t.kcal * 0.36);
              expect(t.fatG * 9, label).toBeGreaterThanOrEqual(t.kcal * 0.19);
              expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal), label).toBeLessThan(25);
            }
  });

  it("feedback aponta falta de proteína, excessos e o que entrou na conta", () => {
    const low = analyzeDiet(parseDietText("Almoço: 300g arroz, 1 concha feijão, salada").meals, { kcal: 2200, proteinG: 160, carbsG: 250, fatG: 70 }, 80);
    expect(low.adjustments.some((a) => a.includes("proteína"))).toBe(true);
    expect(low.score).toBeLessThan(80);
    const junk = analyzeDiet(parseDietText("Jantar: 3 fatias de pizza e 1 lata de coca").meals, { kcal: 2200, proteinG: 160, carbsG: 250, fatG: 70 });
    expect(junk.adjustments.some((a) => /pizza/.test(a) && /refrigerante/.test(a))).toBe(true);
  });
});

describe("cardápio-base", () => {
  it("fecha calorias, proteína, carboidrato e gordura perto da meta, com porções plausíveis", () => {
    const grid = [
      { kcal: 1200, proteinG: 100, carbsG: 110, fatG: 40 },
      { kcal: 1520, proteinG: 133, carbsG: 132, fatG: 51 },
      { kcal: 1700, proteinG: 140, carbsG: 150, fatG: 55 },
      { kcal: 2120, proteinG: 99, carbsG: 305, fatG: 56 },
      { kcal: 2400, proteinG: 170, carbsG: 270, fatG: 70 },
      { kcal: 3020, proteinG: 163, carbsG: 426, fatG: 74 },
      { kcal: 3600, proteinG: 225, carbsG: 450, fatG: 100 },
    ];
    for (const targets of grid) {
      const d = buildDietTemplate(targets, owner);
      const t = dietTotals(d);
      const label = `${targets.kcal} kcal`;
      expect(Math.abs(t.kcal - targets.kcal) / targets.kcal, label).toBeLessThan(0.05);
      expect(Math.abs(t.proteinG - targets.proteinG) / targets.proteinG, label).toBeLessThan(0.08);
      expect(Math.abs(t.carbsG - targets.carbsG) / targets.carbsG, label).toBeLessThan(0.08);
      expect(Math.abs(t.fatG - targets.fatG) / targets.fatG, label).toBeLessThan(0.12);
      expect(d.meals.length, label).toBeGreaterThanOrEqual(4);
      expect(d.meals.length, label).toBeLessThanOrEqual(6);
      const items = d.meals.flatMap((m) => m.items);
      // Nada de prato gigante: nenhuma porção acima de 450 g e nenhuma carne acima de 280 g.
      for (const i of items) expect(i.grams, `${label} ${i.name}`).toBeLessThanOrEqual(450);
      for (const i of items.filter((x) => ["frango_peito", "patinho"].includes(x.foodId ?? ""))) expect(i.grams, `${label} ${i.name}`).toBeLessThanOrEqual(280);
      expect(items.some((i) => i.foodId === "salada" || i.foodId === "legumes"), label).toBe(true);
      expect(items.some((i) => ["banana", "maca", "morango"].includes(i.foodId ?? "")), label).toBe(true);
    }
  });
});
