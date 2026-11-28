import { afterEach, describe, expect, it } from "vitest";
import { dietToText } from "./diet-share";
import { FOODS, ML_IGUAL_G, getFood, registerCustomFoods } from "./foods";
import {
  NOTA_CARDAPIO_BASE,
  PEDIDO_PARCIAL,
  analisarLeitura,
  analyzeDiet,
  analyzeDietText,
  buildDietTemplate,
  comGramas,
  descartarNaoLido,
  dietTotals,
  editarItem,
  itensAConferir,
  parseDietText,
  removerItem,
  revisarAnalise,
  SEM_ALIMENTOS_NA_CONTA,
  totalParcial,
} from "./nutrition";
import type { DietPlan, Meal } from "./types";

/**
 * Handoff de 26/11 (R3-5 e R3-12) com os acréscimos do estudo 2: matriz do leitor pelo caminho real (`parseDietText` e
 * `analyzeDietText`, os da tela), total parcial, revisão editável e a nota do cardápio.
 */
const METAS = { kcal: 2300, proteinG: 160, carbsG: 260, fatG: 70 };
const owner = { ownerId: "u1", createdBy: "u1" };
afterEach(() => registerCustomFoods([]));

const itens = (text: string) => parseDietText(text).meals.flatMap((m) => m.items);
const lido = (text: string) => itens(text).map((i) => `${i.foodId}:${i.grams}`);
/** Um único item lido e a leitura dele. */
const um = (text: string) => {
  const r = parseDietText(text);
  const all = r.meals.flatMap((m) => m.items);
  expect(all, text).toHaveLength(1);
  return { item: all[0]!, leitura: r.leitura[all[0]!.uid]!, unknown: r.unknown };
};
const textos = (a: { summary: string; highlights: string[]; adjustments: string[] }) => [a.summary, ...a.highlights, ...a.adjustments];

describe("matriz do leitor (R3-5, PDF de 26/11 + estudo 2)", () => {
  const MATRIZ: [string, string][] = [
    ["100 g de frango", "frango_peito:100"],
    ["0,5 kg de frango", "frango_peito:500"],
    ["200 ml de leite", "leite_integral:200"],
    ["1 l de água", "agua:1000"],
    ["2 ovos", "ovo:100"],
    ["1 pacote de Doritos 100 g", "salgadinho_pacote:100"],
    ["1 pacote de bolacha 100g", "biscoito_maizena:100"],
    ["2 pacotes de 100 g cada de bolacha", "biscoito_maizena:200"],
    ["1 garrafa de 500 ml de água", "agua:500"],
    ["1 lata de refrigerante", "refrigerante:350"],
    ["1,5 colher de sopa de azeite", "azeite:18"],
    ["1/2 xícara de aveia", "aveia:40"],
    ["meia xícara de aveia", "aveia:40"],
    ["1 concha de feijão", "feijao_carioca:86"],
    ["1 scoop de whey", "whey:30"],
    ["1 copo de suco de 300 ml", "suco_laranja:300"],
    ["300 ml de suco", "suco_laranja:300"],
    ["100g de arroz cru", "arroz_cru:100"],
    ["100 g de arroz cru", "arroz_cru:100"],
    ["150g de arroz", "arroz_branco:150"],
  ];
  for (const [entrada, esperado] of MATRIZ) {
    it(`${entrada} → ${esperado}, sem pedir conferência`, () => {
      const { item, leitura } = um(entrada);
      expect(`${item.foodId}:${item.grams}`).toBe(esperado);
      expect(leitura.confira).toBeUndefined();
      expect(leitura.entrada).toBe(entrada);
    });
  }

  it("arroz e feijão: dois itens (o primeiro não engole o segundo)", () => {
    expect(lido("arroz e feijão")).toEqual(["arroz_branco:135", "feijao_carioca:86"]);
  });

  it("2 scoops de whey 40g (e 'de 40 g'): confira com as duas leituras; a menor vai no total provisório", () => {
    for (const entrada of ["2 scoops de whey 40g", "2 scoops de whey de 40 g"]) {
      const { item, leitura } = um(entrada);
      expect(item.foodId).toBe("whey");
      expect(leitura.confira).toBeTruthy();
      expect(leitura.opcoes).toEqual([
        { rotulo: "40 g no total", grams: 40 },
        { rotulo: "40 g cada (2 × 40 g = 80 g)", grams: 80 },
      ]);
      expect(item.grams).toBe(40);
    }
  });

  it("'cada' e 'no total' tiram a dúvida", () => {
    expect(um("2 pacotes de 100 g cada de bolacha").leitura.confira).toBeUndefined();
    expect(lido("2 pacotes de 100 g de bolacha no total")).toEqual(["biscoito_maizena:100"]);
    expect(lido("2 pacotes de bolacha de 100 g cada")).toEqual(["biscoito_maizena:200"]);
  });

  it("frango frito: a aproximação aparece (o que a pessoa escreveu e o nome lido)", () => {
    const { item, leitura } = um("frango frito");
    expect(item.name).toBe("Filé de frango à milanesa");
    expect(leitura).toMatchObject({ entrada: "frango frito", aproximado: true });
    expect(um("100 g de frango").leitura.aproximado).toBeUndefined();
    expect(um("100g de arroz cru").leitura.aproximado).toBeUndefined();
  });

  it("'1 garrafa de 500 ml' e '2 pacotes de 100 g cada', sem alimento: não reconhecido, nunca some nem vira outro alimento", () => {
    for (const entrada of ["1 garrafa de 500 ml", "2 pacotes de 100 g cada"]) {
      const r = parseDietText(entrada);
      expect(r.meals, entrada).toEqual([]);
      expect(r.unknown, entrada).toEqual([entrada]);
    }
  });

  it("vírgula decimal não separa alimentos: '0,5 kg' e '1,5 colher' no meio de uma lista", () => {
    expect(lido("Almoço: 0,5 kg de frango, 2 ovos, 1,5 colher de sopa de azeite")).toEqual(["frango_peito:500", "ovo:100", "azeite:18"]);
    expect(lido("2 ovos,1 pão francês")).toEqual(["ovo:100", "pao_frances:50"]);
  });
});

describe("cru nunca vira cozido calado (R3-5)", () => {
  it("arroz, macarrão e feijão crus têm entrada própria (peso seco)", () => {
    expect(lido("100 g de macarrão cru")).toEqual(["macarrao_cru:100"]);
    expect(lido("80 g de feijão cru")).toEqual(["feijao_cru:80"]);
    for (const id of ["arroz_cru", "macarrao_cru", "feijao_cru"]) expect(getFood(id)?.name, id).toMatch(/cru/);
  });

  it("cru sem entrada crua: o item de preparo vem marcado 'confira', com o motivo", () => {
    for (const [entrada, id] of [
      ["macarrão integral cru", "macarrao"],
      ["ovo cru", "ovo"],
      ["100 g de frango cru", "frango_peito"],
    ] as const) {
      const { item, leitura } = um(entrada);
      expect(item.foodId, entrada).toBe(id);
      expect(leitura.confira, entrada).toMatch(/cru/);
    }
  });

  it("negativo: o que se come cru não pede conferência", () => {
    for (const entrada of ["tomate cru", "cenoura crua", "salada crua", "100 g de arroz cru"]) expect(um(entrada).leitura.confira, entrada).toBeUndefined();
  });
});

describe("ml e unidades (R3-5)", () => {
  it("líquido com 1 ml ≈ 1 g: converte e mostra a conversão", () => {
    expect(um("200 ml de leite").leitura).toMatchObject({ medida: "ml", conversao: "200 ml ≈ 200 g (leite integral: 1 ml ≈ 1 g)" });
    expect(um("1 l de água").leitura.conversao).toBe("1 l ≈ 1.000 g (água: 1 ml ≈ 1 g)");
    expect(um("1,5 l de água").leitura.conversao).toBe("1,5 l ≈ 1.500 g (água: 1 ml ≈ 1 g)");
    expect(um("1 copo de suco de 300 ml").leitura.conversao).toBe("300 ml ≈ 300 g (suco de laranja natural: 1 ml ≈ 1 g)");
  });

  it("ml de alimento sem densidade conhecida (azeite, alimento do usuário): pede conferência, nunca trata ml como g calado", () => {
    const azeite = um("100 ml de azeite");
    expect(azeite.leitura.confira).toMatch(/ml/);
    expect(azeite.leitura.conversao).toBeUndefined();
    registerCustomFoods([{ id: "custom_1", name: "Shake da casa", aliases: ["shake da casa"], kcal: 90, p: 8, c: 10, f: 2, unit: { label: "copo", g: 300 }, category: "outros" }]);
    expect(um("250 ml de shake da casa").leitura.confira).toMatch(/ml/);
  });

  it("toda id da lista de ml existe na base e é de algo que se bebe ou toma de colher", () => {
    for (const id of ML_IGUAL_G) expect(getFood(id), id).toBeDefined();
    expect(ML_IGUAL_G.has("azeite")).toBe(false);
    expect(ML_IGUAL_G.has("mel")).toBe(false);
  });

  it("pacote sem peso e sem medida própria: usa 100 g e pede o peso; com medida própria (miojo), não", () => {
    const bolacha = um("1 pacote de bolacha");
    expect(bolacha.item.grams).toBe(100);
    expect(bolacha.leitura.confira).toMatch(/pacote/);
    const miojo = um("1 pacote de miojo");
    expect(miojo.item.grams).toBe(80);
    expect(miojo.leitura.confira).toBeUndefined();
  });

  it("acima de 3 kg num item: fica com 3 kg e pede conferência", () => {
    const { item, leitura } = um("5 kg de frango");
    expect(item.grams).toBe(3000);
    expect(leitura.confira).toMatch(/3\.000 g/);
  });

  it("regressão: medida no começo continua valendo e vence a porção padrão", () => {
    expect(lido("açaí 300ml")).toEqual(["acai:300"]);
    expect(lido("1 lata de atum 170g")).toEqual(["atum:170"]);
    expect(lido("1 pacote de Doritos")).toEqual(["salgadinho_pacote:45"]);
  });
});

describe("total parcial nunca vira conselho como se fosse total (R3-5, QA-19)", () => {
  it("só '200 g de jabuticabaçu': nada de totais nem de ajustes, nada de 'abaixo da meta' ou 'Faltam'", () => {
    const a = analyzeDietText("200 g de jabuticabaçu", METAS, 80);
    for (const t of textos(a)) expect(t).not.toMatch(/abaixo da meta|Faltam|acima da meta|dentro da faixa/);
    expect(a.meals).toEqual([]);
    expect(a.highlights).toEqual([]);
    expect(a.adjustments).toEqual([]);
    expect(a.unknown).toEqual(["200 g de jabuticabaçu"]);
  });

  it("1 linha desconhecida e 2 conhecidas: resumo 'parcial', sem ajuste de déficit, com o pedido para completar", () => {
    const a = analyzeDietText("2 ovos\nfeijoada\n200 g de jabuticabaçu", METAS, 80);
    expect(a.parcial).toBe(true);
    expect(a.summary).toMatch(/1 item não reconhecido: total parcial\.$/);
    for (const t of textos(a)) expect(t).not.toMatch(/abaixo da meta|acima da meta|dentro da faixa|Faltam cerca|Distribua a proteína|Não encontrei salada/);
    expect(a.adjustments[0]).toBe(PEDIDO_PARCIAL);
    expect(PEDIDO_PARCIAL).toBe("Complete ou corrija os itens não lidos para ver o que ajustar.");
  });

  it("com 2 linhas não lidas no jantar (repro do estudo): nada de '47% abaixo da meta… falta comida para treinar'", () => {
    const a = analyzeDietText("Café: 2 ovos, 2 pães franceses\nAlmoço: 300g de arroz, 1 concha de feijão, 200g de frango, salada\nJantar: 2 pamonhas, 1 prato de sarapatel", METAS, 80);
    expect(a.unknown).toEqual(["2 pamonhas", "1 prato de sarapatel"]);
    expect(a.summary).toContain("2 itens não reconhecidos: total parcial");
    for (const t of textos(a)) expect(t).not.toMatch(/abaixo da meta|falta comida/);
  });

  it("item 'confira' também deixa o total parcial (com o pedido de conferir)", () => {
    const a = analyzeDietText("2 scoops de whey 40g, 2 ovos", METAS, 80);
    expect(a.parcial).toBe(true);
    expect(a.conferir).toBe(1);
    expect(a.summary).toMatch(/1 item para conferir: total parcial\.$/);
    expect(a.adjustments[0]).toBe("Confira os itens marcados para ver o que ajustar.");
    const ambos = analyzeDietText("2 scoops de whey 40g, 2 ovos, bolinho da vó", METAS, 80);
    expect(ambos.summary).toMatch(/1 item não reconhecido e 1 item para conferir: total parcial\.$/);
  });

  it("parcial mantém o que continua verdade com mais comida (proteína em dia, guloseima, gordura alta)", () => {
    const a = analyzeDietText("Almoço: 500g de frango, 3 fatias de pizza, bolinho da vó", METAS, 80);
    expect(a.parcial).toBe(true);
    expect(a.highlights.some((h) => h.startsWith("Proteína em dia"))).toBe(true);
    expect(a.adjustments.some((h) => /^Pizza/.test(h))).toBe(true);
  });

  it("texto todo reconhecido: igual a hoje (sem 'parcial', mesmas dicas do motor)", () => {
    const text = "Café: 2 ovos, 1 pão francês\nAlmoço: 150g de arroz, 1 concha de feijão, 130g de frango, salada\nJantar: 200g de batata doce e 120g de patinho";
    const a = analyzeDietText(text, METAS, 80);
    expect(a.parcial).toBe(false);
    expect(a.conferir).toBe(0);
    expect(a.summary).toMatch(/^8 alimentos lidos em 3 refeições: [\d.]+ kcal e \d+ g de proteína \(valores aproximados\)\.$/);
    const antes = analyzeDiet(parseDietText(text).meals, METAS, 80);
    expect(a.highlights).toEqual(antes.highlights);
    expect(a.adjustments).toEqual(antes.adjustments);
    expect(a.adjustments.join(" ")).toMatch(/abaixo da meta|Faltam/); // com o total completo, o conselho de falta continua
  });

  it("totalParcial serve para a demo da landing (mesma regra, sem metas)", () => {
    expect(totalParcial(parseDietText("2 ovos, 1 pacote de bolacha 100g"))).toBe(false);
    expect(totalParcial(parseDietText("2 ovos, 1 pamonha"))).toBe(true);
    expect(totalParcial(parseDietText("2 ovos, 2 scoops de whey 40g"))).toBe(true);
    expect(totalParcial({ meals: [], unknown: [] })).toBe(false);
  });
});

describe("revisão: itens editáveis antes das dicas, e editar recalcula (R3-5)", () => {
  it("editar a porção de um item muda kcal e proteína do dia", () => {
    const l = parseDietText("Almoço: 100g de frango, 150g de arroz");
    const antes = analisarLeitura(l, METAS, 80);
    const frango = l.meals[0]!.items[0]!;
    const depois = analisarLeitura(editarItem(l, frango.uid, 200), METAS, 80);
    expect(depois.totals.kcal).toBe(antes.totals.kcal + 159);
    expect(depois.totals.proteinG).toBeCloseTo(antes.totals.proteinG + 32, 1);
    expect(depois.meals[0]!.items[0]!).toMatchObject({ uid: frango.uid, foodId: "frango_peito", grams: 200 });
    expect(l.meals[0]!.items[0]!.grams).toBe(100); // a leitura original não muda
  });

  it("escolher uma das opções confirma o item: deixa de pedir conferência e o total deixa de ser parcial", () => {
    const l = parseDietText("2 scoops de whey 40g, 2 ovos");
    const whey = itensAConferir(l)[0]!;
    const opcao = l.leitura[whey.uid]!.opcoes![1]!;
    const r = editarItem(l, whey.uid, opcao.grams);
    expect(r.leitura[whey.uid]).toMatchObject({ editado: true });
    expect(r.leitura[whey.uid]!.confira).toBeUndefined();
    const a = analisarLeitura(r, METAS, 80);
    expect(a.parcial).toBe(false);
    expect(a.meals.flatMap((m) => m.items).find((i) => i.uid === whey.uid)?.grams).toBe(80);
  });

  it("remover item tira da conta; refeição vazia sai", () => {
    const l = parseDietText("Café: 2 ovos\nAlmoço: 150g de arroz");
    const ovo = l.meals[0]!.items[0]!;
    const r = removerItem(l, ovo.uid);
    expect(r.meals.map((m) => m.name)).toEqual(["Almoço"]);
    expect(r.leitura[ovo.uid]).toBeUndefined();
    expect(analisarLeitura(r, METAS).totals.kcal).toBe(192);
  });

  it("descartar um trecho não lido é decisão da pessoa e tira o 'parcial'", () => {
    const l = parseDietText("2 ovos, bolinho da vó");
    expect(analisarLeitura(l, METAS).parcial).toBe(true);
    const r = descartarNaoLido(l, 0);
    expect(r.unknown).toEqual([]);
    expect(analisarLeitura(r, METAS).parcial).toBe(false);
  });

  it("item sem alimento na base (vindo da IA) escala na mesma proporção; a análise da IA não vira parcial", () => {
    const ia = { uid: "x1", name: "Marmita da tia", grams: 400, kcal: 600, proteinG: 30, carbsG: 70, fatG: 20 };
    expect(comGramas(ia, 200)).toEqual({ uid: "x1", name: "Marmita da tia", grams: 200, kcal: 300, proteinG: 15, carbsG: 35, fatG: 10 });
    const meals: Meal[] = [{ uid: "m1", name: "Almoço", items: [ia] }];
    expect(analisarLeitura({ meals, unknown: [] }, METAS).parcial).toBe(false);
  });

  it("quantidade inválida na edição não quebra: limites de 1 g a 3 kg", () => {
    const item = itens("100 g de frango")[0]!;
    expect(comGramas(item, 0).grams).toBe(1);
    expect(comGramas(item, 99999).grams).toBe(3000);
    expect(comGramas(item, Number.NaN).grams).toBe(100);
  });

  it("leitura ausente (resposta antiga do servidor, sem `leitura`): só o não reconhecido conta para o parcial", () => {
    const { meals, unknown } = parseDietText("2 ovos, 2 scoops de whey 40g");
    expect(analisarLeitura({ meals, unknown }, METAS).parcial).toBe(false);
    expect(analisarLeitura({ meals, unknown: ["xpto"] }, METAS).parcial).toBe(true);
  });

  it("0, 1 e muitos alimentos", () => {
    expect(analyzeDietText("", METAS).meals).toEqual([]);
    expect(analyzeDietText("2 ovos", METAS).summary).toMatch(/^1 alimento lido em 1 refeição/);
    const muitos = Array.from({ length: 30 }, () => "1 banana").join(", ");
    const a = analyzeDietText(muitos, METAS);
    expect(a.summary).toMatch(/^30 alimentos lidos em 1 refeição/);
    expect(Object.keys(a.leitura)).toHaveLength(30);
  });
});

describe("nota do cardápio sem 'mantendo a quantidade' (R3-12)", () => {
  it("a nota do cardápio gerado não promete troca grama por grama e manda editar o item", () => {
    for (const targets of [METAS, { kcal: 1500, proteinG: 110, carbsG: 150, fatG: 50 }, { kcal: 3400, proteinG: 200, carbsG: 420, fatG: 95 }]) {
      const d = buildDietTemplate(targets, owner);
      expect(d.notes).not.toMatch(/mesma quantidade|mantendo a quantidade/);
      expect(d.notes).toBe(NOTA_CARDAPIO_BASE);
    }
    expect(NOTA_CARDAPIO_BASE).toContain("Para trocar um alimento, edite o item: o total do dia é recalculado.");
    expect(NOTA_CARDAPIO_BASE).toContain("35 ml de água por kg"); // a frase da água fica até a decisão do dono
  });

  it("a própria base desmente a troca na mesma quantidade (por que a frase saiu)", () => {
    const by = (id: string) => FOODS.find((f) => f.id === id)!;
    expect(by("arroz_branco").c).toBeGreaterThan(2 * by("batata_inglesa").c);
    expect(by("ovo").f).toBeGreaterThan(3 * by("frango_peito").f);
  });

  it("negativo: o cardápio gerado continua batendo as metas", () => {
    const t = dietTotals(buildDietTemplate(METAS, owner));
    expect(Math.abs(t.kcal - METAS.kcal) / METAS.kcal).toBeLessThan(0.05);
    expect(Math.abs(t.proteinG - METAS.proteinG) / METAS.proteinG).toBeLessThan(0.08);
  });

  it("negativo: dieta antiga salva no aparelho mantém a nota antiga (dado do usuário não é reescrito)", () => {
    const antiga = "Cardápio de referência. Pode trocar um alimento por outro do mesmo tipo (arroz por batata ou macarrão, frango por carne magra, peixe ou ovos) mantendo a quantidade. Beba cerca de 35 ml de água por kg de peso ao longo do dia.";
    const diet: DietPlan = { ...buildDietTemplate(METAS, owner), notes: antiga };
    expect(diet.notes).toBe(antiga);
    expect(dietToText(diet)).toContain(antiga);
  });
});

describe("revisão na tela: cada correção refaz a análise (R3-5, etapa 2)", () => {
  it("motor: escolher a opção da quantidade ambígua tira o parcial e as dicas voltam a comparar com a meta", () => {
    const l = analyzeDietText("Café: 2 scoops de whey 40g, 2 ovos\nAlmoço: 150g de arroz, 130g de frango, salada", METAS, 70);
    expect(l.parcial).toBe(true);
    expect(l.adjustments.join(" ")).not.toMatch(/abaixo da meta|Faltam/);
    const whey = itensAConferir(l)[0]!;
    const opcao = l.leitura[whey.uid]!.opcoes![1]!;
    const r = revisarAnalise(editarItem(l, whey.uid, opcao.grams), METAS, 70, false);
    expect(r.parcial).toBe(false);
    expect(r.conferir).toBe(0);
    expect(r.totals.proteinG).toBeGreaterThan(l.totals.proteinG);
    expect(r.summary).not.toMatch(/parcial/);
    expect([...r.highlights, ...r.adjustments].join(" ")).toMatch(/meta|faixa/);
  });

  it("motor: 'Não contar' no único trecho não lido deixa o total inteiro; remover tudo diz que não há alimento", () => {
    const l = analyzeDietText("200 g de jabuticabaçu\n2 ovos", METAS, 70);
    expect(l.parcial).toBe(true);
    const sem = revisarAnalise(descartarNaoLido(l, 0), METAS, 70, false);
    expect(sem.parcial).toBe(false);
    expect(sem.unknown).toEqual([]);
    const vazio = revisarAnalise(removerItem(sem, sem.meals[0]!.items[0]!.uid), METAS, 70, false);
    expect(vazio.meals).toEqual([]);
    expect(vazio.summary).toBe(SEM_ALIMENTOS_NA_CONTA);
    expect(vazio.adjustments).toEqual([]);
    expect(vazio.highlights).toEqual([]);
  });

  it("IA: a correção refaz totais e resumo, e as dicas da IA saem (o motor não inventa 'sem salada')", () => {
    const ia: Meal[] = [
      {
        uid: "m1",
        name: "Almoço",
        items: [
          { uid: "a", name: "Arroz com feijão", grams: 200, kcal: 260, proteinG: 8, carbsG: 50, fatG: 2 },
          { uid: "b", name: "Salada verde", grams: 100, kcal: 20, proteinG: 1, carbsG: 3, fatG: 0 },
        ],
      },
    ];
    const r = revisarAnalise(editarItem({ meals: ia, unknown: [] }, "a", 400), METAS, 70, true);
    expect(r.totals.kcal).toBe(540);
    expect(r.highlights).toEqual([]);
    expect(r.adjustments).toEqual([]);
    expect(r.summary).toMatch(/^2 alimentos lidos em 1 refeição: 540 kcal/);
  });
});
