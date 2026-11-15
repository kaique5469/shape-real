/**
 * Base de alimentos comuns no Brasil, valores por 100 g (aproximados, referência
 * TACO/UNICAMP e USDA para itens ausentes). `unit` é o peso típico de 1 unidade/porção
 * caseira, usado pelo leitor de texto ("2 ovos", "1 concha de feijão").
 */
export interface Food {
  id: string;
  name: string;
  aliases: string[];
  kcal: number;
  p: number;
  c: number;
  f: number;
  unit?: { label: string; g: number };
  category: "proteina" | "carbo" | "gordura" | "fruta" | "laticinio" | "vegetal" | "outros";
}

export const FOODS: Food[] = [
  { id: "arroz_branco", name: "Arroz branco cozido", aliases: ["arroz branco", "arroz"], kcal: 128, p: 2.5, c: 28.1, f: 0.2, unit: { label: "colher de servir", g: 45 }, category: "carbo" },
  { id: "arroz_integral", name: "Arroz integral cozido", aliases: ["arroz integral"], kcal: 124, p: 2.6, c: 25.8, f: 1.0, unit: { label: "colher de servir", g: 45 }, category: "carbo" },
  { id: "feijao_carioca", name: "Feijão carioca cozido", aliases: ["feijao carioca", "feijao"], kcal: 76, p: 4.8, c: 13.6, f: 0.5, unit: { label: "concha", g: 86 }, category: "carbo" },
  { id: "feijao_preto", name: "Feijão preto cozido", aliases: ["feijao preto"], kcal: 77, p: 4.5, c: 14.0, f: 0.5, unit: { label: "concha", g: 86 }, category: "carbo" },
  { id: "macarrao", name: "Macarrão cozido", aliases: ["macarrao", "espaguete", "massa"], kcal: 102, p: 3.4, c: 19.9, f: 1.2, unit: { label: "pegador", g: 110 }, category: "carbo" },
  { id: "batata_doce", name: "Batata-doce cozida", aliases: ["batata doce", "batata-doce"], kcal: 77, p: 0.6, c: 18.4, f: 0.1, unit: { label: "unidade média", g: 150 }, category: "carbo" },
  { id: "batata_inglesa", name: "Batata inglesa cozida", aliases: ["batata inglesa", "batata cozida", "pure de batata", "batata"], kcal: 52, p: 1.2, c: 11.9, f: 0, unit: { label: "unidade média", g: 140 }, category: "carbo" },
  { id: "mandioca", name: "Mandioca cozida", aliases: ["mandioca", "aipim", "macaxeira"], kcal: 125, p: 0.6, c: 30.1, f: 0.3, unit: { label: "pedaço", g: 100 }, category: "carbo" },
  { id: "cuscuz", name: "Cuscuz de milho cozido", aliases: ["cuscuz"], kcal: 113, p: 2.2, c: 25.3, f: 0.7, unit: { label: "fatia", g: 100 }, category: "carbo" },
  { id: "tapioca", name: "Tapioca (goma hidratada)", aliases: ["tapioca", "goma de tapioca"], kcal: 240, p: 0, c: 60, f: 0, unit: { label: "unidade", g: 70 }, category: "carbo" },
  { id: "pao_frances", name: "Pão francês", aliases: ["pao frances", "pao de sal", "pao carioca", "pao"], kcal: 300, p: 8.0, c: 58.6, f: 3.1, unit: { label: "unidade", g: 50 }, category: "carbo" },
  { id: "pao_integral", name: "Pão de forma integral", aliases: ["pao integral", "pao de forma"], kcal: 253, p: 9.4, c: 49.9, f: 3.7, unit: { label: "fatia", g: 25 }, category: "carbo" },
  { id: "aveia", name: "Aveia em flocos", aliases: ["aveia"], kcal: 394, p: 13.9, c: 66.6, f: 8.5, unit: { label: "colher de sopa", g: 15 }, category: "carbo" },
  { id: "granola", name: "Granola", aliases: ["granola"], kcal: 400, p: 10, c: 65, f: 12, unit: { label: "colher de sopa", g: 12 }, category: "carbo" },
  { id: "pao_de_queijo", name: "Pão de queijo", aliases: ["pao de queijo"], kcal: 363, p: 5.1, c: 34.2, f: 24.6, unit: { label: "unidade média", g: 40 }, category: "carbo" },
  { id: "grao_de_bico", name: "Grão-de-bico cozido", aliases: ["grao de bico", "grao-de-bico"], kcal: 164, p: 8.9, c: 27.4, f: 2.6, unit: { label: "concha", g: 90 }, category: "carbo" },
  { id: "lentilha", name: "Lentilha cozida", aliases: ["lentilha"], kcal: 93, p: 6.3, c: 16.3, f: 0.5, unit: { label: "concha", g: 90 }, category: "carbo" },

  { id: "frango_peito", name: "Peito de frango grelhado", aliases: ["peito de frango", "frango grelhado", "file de frango", "frango"], kcal: 159, p: 32.0, c: 0, f: 2.5, unit: { label: "filé", g: 120 }, category: "proteina" },
  { id: "frango_coxa", name: "Coxa de frango assada", aliases: ["coxa de frango", "sobrecoxa"], kcal: 215, p: 28.5, c: 0, f: 11.0, unit: { label: "unidade", g: 90 }, category: "proteina" },
  { id: "patinho", name: "Patinho grelhado", aliases: ["patinho", "carne magra", "bife"], kcal: 219, p: 35.9, c: 0, f: 7.3, unit: { label: "bife", g: 100 }, category: "proteina" },
  { id: "carne_moida", name: "Carne moída refogada", aliases: ["carne moida", "moida"], kcal: 212, p: 26.7, c: 0, f: 11.0, unit: { label: "colher de servir", g: 40 }, category: "proteina" },
  { id: "alcatra", name: "Alcatra grelhada", aliases: ["alcatra", "carne vermelha", "carne", "picanha"], kcal: 241, p: 31.9, c: 0, f: 11.6, unit: { label: "bife", g: 100 }, category: "proteina" },
  { id: "tilapia", name: "Tilápia grelhada", aliases: ["tilapia", "peixe"], kcal: 128, p: 26.2, c: 0, f: 2.7, unit: { label: "filé", g: 120 }, category: "proteina" },
  { id: "salmao", name: "Salmão grelhado", aliases: ["salmao"], kcal: 243, p: 26.1, c: 0, f: 14.5, unit: { label: "posta", g: 120 }, category: "proteina" },
  { id: "atum", name: "Atum em conserva (água)", aliases: ["atum"], kcal: 116, p: 25.5, c: 0, f: 0.8, unit: { label: "lata drenada", g: 120 }, category: "proteina" },
  { id: "ovo", name: "Ovo inteiro cozido", aliases: ["ovos", "ovo", "omelete", "ovo mexido"], kcal: 146, p: 13.3, c: 0.6, f: 9.5, unit: { label: "unidade", g: 50 }, category: "proteina" },
  { id: "clara", name: "Clara de ovo", aliases: ["claras", "clara"], kcal: 48, p: 10.9, c: 0.7, f: 0.2, unit: { label: "unidade", g: 33 }, category: "proteina" },
  { id: "peito_peru", name: "Peito de peru fatiado", aliases: ["peito de peru", "peru"], kcal: 110, p: 20, c: 2, f: 2, unit: { label: "fatia", g: 15 }, category: "proteina" },
  { id: "whey", name: "Whey protein concentrado", aliases: ["whey", "proteina em po"], kcal: 400, p: 80, c: 8, f: 6, unit: { label: "scoop", g: 30 }, category: "proteina" },
  { id: "tofu", name: "Tofu", aliases: ["tofu"], kcal: 76, p: 8.1, c: 1.9, f: 4.8, unit: { label: "fatia", g: 80 }, category: "proteina" },
  { id: "linguica", name: "Linguiça toscana grelhada", aliases: ["linguica"], kcal: 296, p: 18.0, c: 0, f: 24.0, unit: { label: "gomo", g: 70 }, category: "proteina" },
  { id: "hamburguer", name: "Hambúrguer bovino grelhado", aliases: ["hamburguer", "burger"], kcal: 250, p: 26, c: 0, f: 16, unit: { label: "unidade", g: 90 }, category: "proteina" },

  { id: "leite_integral", name: "Leite integral", aliases: ["leite integral", "leite"], kcal: 61, p: 3.2, c: 4.7, f: 3.3, unit: { label: "copo", g: 200 }, category: "laticinio" },
  { id: "leite_desnatado", name: "Leite desnatado", aliases: ["leite desnatado"], kcal: 35, p: 3.4, c: 4.9, f: 0.1, unit: { label: "copo", g: 200 }, category: "laticinio" },
  { id: "iogurte_natural", name: "Iogurte natural integral", aliases: ["iogurte natural", "iogurte"], kcal: 51, p: 4.1, c: 1.9, f: 3.0, unit: { label: "pote", g: 170 }, category: "laticinio" },
  { id: "iogurte_grego", name: "Iogurte grego tradicional", aliases: ["iogurte grego", "grego"], kcal: 97, p: 9, c: 4, f: 5, unit: { label: "pote", g: 100 }, category: "laticinio" },
  { id: "queijo_minas", name: "Queijo minas frescal", aliases: ["queijo minas", "queijo branco", "minas frescal"], kcal: 264, p: 17.4, c: 3.2, f: 20.2, unit: { label: "fatia", g: 30 }, category: "laticinio" },
  { id: "mucarela", name: "Queijo muçarela", aliases: ["mucarela", "mussarela", "queijo"], kcal: 330, p: 22.6, c: 3.0, f: 25.2, unit: { label: "fatia", g: 20 }, category: "laticinio" },
  { id: "requeijao", name: "Requeijão cremoso", aliases: ["requeijao"], kcal: 257, p: 9.6, c: 2.4, f: 23.4, unit: { label: "colher de sopa", g: 30 }, category: "laticinio" },

  { id: "banana", name: "Banana prata", aliases: ["bananas", "banana"], kcal: 98, p: 1.3, c: 26.0, f: 0.1, unit: { label: "unidade", g: 70 }, category: "fruta" },
  { id: "maca", name: "Maçã", aliases: ["macas", "maca"], kcal: 56, p: 0.3, c: 15.2, f: 0, unit: { label: "unidade", g: 130 }, category: "fruta" },
  { id: "mamao", name: "Mamão papaia", aliases: ["mamao", "papaia"], kcal: 40, p: 0.5, c: 10.4, f: 0.1, unit: { label: "meia unidade", g: 150 }, category: "fruta" },
  { id: "morango", name: "Morango", aliases: ["morangos", "morango"], kcal: 30, p: 0.9, c: 6.8, f: 0.3, unit: { label: "xícara", g: 150 }, category: "fruta" },
  { id: "laranja", name: "Laranja pera", aliases: ["laranjas", "laranja"], kcal: 37, p: 1.0, c: 8.9, f: 0.1, unit: { label: "unidade", g: 140 }, category: "fruta" },
  { id: "abacate", name: "Abacate", aliases: ["abacate"], kcal: 96, p: 1.2, c: 6.0, f: 8.4, unit: { label: "colher de sopa", g: 30 }, category: "fruta" },
  { id: "manga", name: "Manga", aliases: ["manga"], kcal: 51, p: 0.9, c: 12.8, f: 0.2, unit: { label: "unidade", g: 200 }, category: "fruta" },
  { id: "uva", name: "Uva", aliases: ["uvas", "uva"], kcal: 53, p: 0.7, c: 13.6, f: 0.2, unit: { label: "cacho pequeno", g: 100 }, category: "fruta" },
  { id: "acai", name: "Açaí na tigela (com xarope)", aliases: ["acai"], kcal: 110, p: 0.7, c: 21.5, f: 3.7, unit: { label: "tigela 300 ml", g: 300 }, category: "fruta" },
  { id: "suco_laranja", name: "Suco de laranja natural", aliases: ["suco de laranja", "suco"], kcal: 45, p: 0.7, c: 10.4, f: 0.2, unit: { label: "copo", g: 250 }, category: "fruta" },

  { id: "azeite", name: "Azeite de oliva", aliases: ["azeite", "oleo"], kcal: 884, p: 0, c: 0, f: 100, unit: { label: "colher de sopa", g: 8 }, category: "gordura" },
  { id: "manteiga", name: "Manteiga", aliases: ["manteiga", "margarina"], kcal: 726, p: 0.4, c: 0, f: 82.4, unit: { label: "ponta de faca", g: 5 }, category: "gordura" },
  { id: "pasta_amendoim", name: "Pasta de amendoim", aliases: ["pasta de amendoim", "manteiga de amendoim"], kcal: 588, p: 25, c: 20, f: 50, unit: { label: "colher de sopa", g: 15 }, category: "gordura" },
  { id: "amendoim", name: "Amendoim torrado", aliases: ["amendoim"], kcal: 606, p: 22.5, c: 18.7, f: 54, unit: { label: "punhado", g: 25 }, category: "gordura" },
  { id: "castanha_para", name: "Castanha-do-pará", aliases: ["castanha do para", "castanha", "castanhas"], kcal: 643, p: 14.5, c: 15.1, f: 63.5, unit: { label: "unidade", g: 4 }, category: "gordura" },

  { id: "brocolis", name: "Brócolis cozido", aliases: ["brocolis"], kcal: 25, p: 2.1, c: 4.4, f: 0.5, unit: { label: "xícara", g: 90 }, category: "vegetal" },
  { id: "salada", name: "Salada de folhas", aliases: ["salada", "alface", "folhas", "rucula"], kcal: 14, p: 1.3, c: 1.7, f: 0.2, unit: { label: "prato", g: 60 }, category: "vegetal" },
  { id: "tomate", name: "Tomate", aliases: ["tomates", "tomate"], kcal: 15, p: 1.1, c: 3.1, f: 0.2, unit: { label: "unidade", g: 100 }, category: "vegetal" },
  { id: "cenoura", name: "Cenoura crua", aliases: ["cenoura"], kcal: 34, p: 1.3, c: 7.7, f: 0.2, unit: { label: "unidade", g: 80 }, category: "vegetal" },
  { id: "legumes", name: "Legumes cozidos (mix)", aliases: ["legumes", "abobrinha", "chuchu", "vagem"], kcal: 25, p: 1.3, c: 4.5, f: 0.2, unit: { label: "xícara", g: 100 }, category: "vegetal" },

  { id: "acucar", name: "Açúcar", aliases: ["acucar"], kcal: 387, p: 0, c: 99.5, f: 0, unit: { label: "colher de chá", g: 5 }, category: "outros" },
  { id: "mel", name: "Mel", aliases: ["mel"], kcal: 309, p: 0, c: 84, f: 0, unit: { label: "colher de sopa", g: 15 }, category: "outros" },
  { id: "chocolate", name: "Chocolate ao leite", aliases: ["chocolate", "bombom"], kcal: 540, p: 7.2, c: 59.6, f: 30.3, unit: { label: "quadradinho", g: 10 }, category: "outros" },
  { id: "refrigerante", name: "Refrigerante comum", aliases: ["refrigerante", "refri", "coca"], kcal: 37, p: 0, c: 9.6, f: 0, unit: { label: "lata", g: 350 }, category: "outros" },
  { id: "cerveja", name: "Cerveja pilsen", aliases: ["cerveja", "chopp"], kcal: 41, p: 0.6, c: 3.3, f: 0, unit: { label: "lata", g: 350 }, category: "outros" },
  { id: "batata_frita", name: "Batata frita", aliases: ["batata frita", "fritas"], kcal: 267, p: 5.0, c: 35.6, f: 13.1, unit: { label: "porção pequena", g: 100 }, category: "outros" },
  { id: "pizza", name: "Pizza de muçarela", aliases: ["pizza"], kcal: 270, p: 11, c: 30, f: 11, unit: { label: "fatia", g: 110 }, category: "outros" },
  { id: "cafe", name: "Café sem açúcar", aliases: ["cafe"], kcal: 2, p: 0.1, c: 0.3, f: 0, unit: { label: "xícara", g: 100 }, category: "outros" },
];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));
export function getFood(id: string): Food | undefined {
  return BY_ID.get(id);
}
