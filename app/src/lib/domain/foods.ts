/**
 * Base de alimentos comuns no Brasil. Valores por 100 g do alimento pronto para consumo.
 * Fonte principal: TACO 4ª ed. (NEPA/UNICAMP). O que a TACO não traz (tilápia, whey, pizza,
 * lanches, industrializados) vem da USDA ou da média de rótulos; preparações caseiras são
 * estimadas pela receita padrão. Carboidrato é o total (inclui fibra), como na TACO.
 * `unit` é a medida caseira principal (IBGE/Pinheiro), usada para contar ("2 ovos",
 * "1 concha de feijão") e exibida ao lado dos gramas. Apelidos: minúsculos e sem acento.
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
  // Cereais, massas, tubérculos e leguminosas
  { id: "arroz_branco", name: "Arroz branco cozido", aliases: ["arroz branco", "arroz cozido", "arroz"], kcal: 128, p: 2.5, c: 28.1, f: 0.2, unit: { label: "colher de servir", g: 45 }, category: "carbo" },
  { id: "arroz_integral", name: "Arroz integral cozido", aliases: ["arroz integral"], kcal: 124, p: 2.6, c: 25.8, f: 1.0, unit: { label: "colher de servir", g: 45 }, category: "carbo" },
  { id: "feijao_carioca", name: "Feijão carioca cozido", aliases: ["feijao carioca", "feijao cozido", "feijao", "caldo de feijao", "feijao fradinho", "feijao de corda", "feijao vermelho", "feijao branco"], kcal: 76, p: 4.8, c: 13.6, f: 0.5, unit: { label: "concha", g: 86 }, category: "carbo" },
  { id: "feijao_preto", name: "Feijão preto cozido", aliases: ["feijao preto"], kcal: 77, p: 4.5, c: 14.0, f: 0.5, unit: { label: "concha", g: 86 }, category: "carbo" },
  { id: "lentilha", name: "Lentilha cozida", aliases: ["lentilha"], kcal: 93, p: 6.3, c: 16.3, f: 0.5, unit: { label: "concha", g: 90 }, category: "carbo" },
  { id: "grao_de_bico", name: "Grão-de-bico cozido", aliases: ["grao de bico"], kcal: 164, p: 8.9, c: 27.4, f: 2.6, unit: { label: "colher de servir", g: 50 }, category: "carbo" },
  { id: "macarrao", name: "Macarrão cozido", aliases: ["macarrao cozido", "macarrao", "espaguete", "penne", "talharim", "macarrao integral", "massa"], kcal: 128, p: 3.4, c: 26.9, f: 0.5, unit: { label: "pegador", g: 110 }, category: "carbo" },
  { id: "macarrao_instantaneo", name: "Macarrão instantâneo (peso seco)", aliases: ["macarrao instantaneo", "miojo", "lamen", "cup noodles"], kcal: 436, p: 8.8, c: 62.4, f: 17.2, unit: { label: "pacote", g: 80 }, category: "carbo" },
  { id: "nhoque", name: "Nhoque de batata cozido", aliases: ["nhoque", "nhoque de batata"], kcal: 181, p: 5.9, c: 36.8, f: 1.9, unit: { label: "colher de servir", g: 50 }, category: "carbo" },
  { id: "batata_doce", name: "Batata-doce cozida", aliases: ["batata doce cozida", "batata doce assada", "batata doce"], kcal: 77, p: 0.6, c: 18.4, f: 0.1, unit: { label: "unidade média", g: 150 }, category: "carbo" },
  { id: "batata_inglesa", name: "Batata inglesa cozida", aliases: ["batata inglesa", "batata cozida", "batata assada", "batata"], kcal: 52, p: 1.2, c: 11.9, f: 0, unit: { label: "unidade média", g: 140 }, category: "carbo" },
  { id: "pure_batata", name: "Purê de batata", aliases: ["pure de batata", "pure"], kcal: 105, p: 2.0, c: 15.5, f: 4.0, unit: { label: "colher de servir", g: 60 }, category: "carbo" },
  { id: "mandioca", name: "Mandioca cozida", aliases: ["mandioca cozida", "mandioca", "aipim", "macaxeira"], kcal: 125, p: 0.6, c: 30.1, f: 0.3, unit: { label: "pedaço", g: 100 }, category: "carbo" },
  { id: "inhame", name: "Inhame ou cará cozido", aliases: ["inhame cozido", "inhame", "cara cozido"], kcal: 78, p: 1.5, c: 18.9, f: 0.1, unit: { label: "pedaço", g: 100 }, category: "carbo" },
  { id: "mandioquinha", name: "Mandioquinha (batata-baroa) cozida", aliases: ["mandioquinha", "batata baroa", "batata salsa"], kcal: 80, p: 0.9, c: 18.9, f: 0.2, unit: { label: "unidade média", g: 100 }, category: "carbo" },
  { id: "cuscuz", name: "Cuscuz de milho cozido", aliases: ["cuscuz de milho", "cuscuz nordestino", "cuscuz", "flocao"], kcal: 113, p: 2.2, c: 25.3, f: 0.7, unit: { label: "fatia", g: 100 }, category: "carbo" },
  { id: "tapioca", name: "Tapioca (goma hidratada)", aliases: ["tapioca", "goma de tapioca", "massa de tapioca", "beiju"], kcal: 240, p: 0, c: 59.5, f: 0, unit: { label: "unidade", g: 60 }, category: "carbo" },
  { id: "crepioca", name: "Crepioca (1 ovo e goma)", aliases: ["crepioca"], kcal: 206, p: 9.3, c: 26.6, f: 6.4, unit: { label: "unidade", g: 70 }, category: "carbo" },
  { id: "polenta", name: "Polenta cozida", aliases: ["polenta", "angu"], kcal: 103, p: 2.3, c: 23.3, f: 0.3, unit: { label: "colher de servir", g: 60 }, category: "carbo" },
  { id: "milho", name: "Milho verde cozido", aliases: ["milho verde", "milho cozido", "milho"], kcal: 98, p: 3.2, c: 17.1, f: 2.4, unit: { label: "colher de sopa", g: 24 }, category: "carbo" },
  { id: "quinoa", name: "Quinoa cozida", aliases: ["quinoa", "quinua"], kcal: 120, p: 4.4, c: 21.3, f: 1.9, unit: { label: "colher de servir", g: 45 }, category: "carbo" },
  { id: "aveia", name: "Aveia em flocos", aliases: ["aveia em flocos", "farelo de aveia", "farinha de aveia", "aveia"], kcal: 394, p: 13.9, c: 66.6, f: 8.5, unit: { label: "colher de sopa", g: 15 }, category: "carbo" },
  { id: "granola", name: "Granola", aliases: ["granola"], kcal: 400, p: 10, c: 65, f: 12, unit: { label: "colher de sopa", g: 12 }, category: "carbo" },
  { id: "cereal_matinal", name: "Cereal matinal de milho com açúcar", aliases: ["cereal matinal", "sucrilhos", "corn flakes", "cornflakes", "cereal"], kcal: 377, p: 4.7, c: 88.8, f: 0.7, unit: { label: "xícara", g: 40 }, category: "carbo" },
  { id: "mingau_aveia", name: "Mingau de aveia com leite", aliases: ["mingau de aveia", "mingau", "overnight oats"], kcal: 104, p: 4.6, c: 12.8, f: 4.0, unit: { label: "tigela", g: 230 }, category: "carbo" },
  { id: "farinha_mandioca", name: "Farinha de mandioca torrada", aliases: ["farinha de mandioca", "farinha"], kcal: 365, p: 1.2, c: 89.2, f: 0.3, unit: { label: "colher de sopa", g: 16 }, category: "carbo" },
  { id: "farofa", name: "Farofa de mandioca temperada", aliases: ["farofa"], kcal: 406, p: 2.1, c: 80.3, f: 9.1, unit: { label: "colher de sopa", g: 15 }, category: "carbo" },
  { id: "pipoca", name: "Pipoca estourada no óleo", aliases: ["pipoca", "pipoca de micro ondas", "pipoca de microondas"], kcal: 448, p: 9.9, c: 70.3, f: 15.9, unit: { label: "xícara", g: 10 }, category: "carbo" },

  // Pães e biscoitos
  { id: "pao_frances", name: "Pão francês", aliases: ["pao frances", "pao de sal", "pao carioca", "paozinho", "cacetinho", "pao"], kcal: 300, p: 8.0, c: 58.6, f: 3.1, unit: { label: "unidade", g: 50 }, category: "carbo" },
  { id: "pao_na_chapa", name: "Pão francês na chapa com manteiga", aliases: ["pao na chapa", "pao frances na chapa", "pao com manteiga na chapa"], kcal: 371, p: 6.7, c: 48.8, f: 16.3, unit: { label: "unidade", g: 60 }, category: "carbo" },
  { id: "pao_forma", name: "Pão de forma tradicional", aliases: ["pao de forma tradicional", "pao de forma branco", "pao de forma"], kcal: 250, p: 8.8, c: 47.5, f: 2.8, unit: { label: "fatia", g: 25 }, category: "carbo" },
  { id: "pao_integral", name: "Pão de forma integral", aliases: ["pao de forma integral", "pao integral", "pao de graos"], kcal: 253, p: 9.4, c: 49.9, f: 3.7, unit: { label: "fatia", g: 25 }, category: "carbo" },
  { id: "pao_leite", name: "Pão de leite ou de hambúrguer", aliases: ["pao de leite", "pao de hamburguer", "pao de hot dog", "pao sovado", "pao doce", "pao careca"], kcal: 311, p: 8.4, c: 61.5, f: 2.8, unit: { label: "unidade", g: 50 }, category: "carbo" },
  { id: "wrap", name: "Pão sírio ou wrap (tortilha)", aliases: ["wrap", "rap10", "tortilha", "pao sirio", "pao arabe", "pao folha", "pao pita"], kcal: 289, p: 7.9, c: 51.8, f: 5.5, unit: { label: "unidade", g: 40 }, category: "carbo" },
  { id: "torrada", name: "Torrada de pão", aliases: ["torrada", "torradinha", "torrada integral"], kcal: 377, p: 10.5, c: 74.6, f: 3.3, unit: { label: "unidade", g: 8 }, category: "carbo" },
  { id: "pao_de_queijo", name: "Pão de queijo", aliases: ["pao de queijo"], kcal: 363, p: 5.1, c: 34.2, f: 24.6, unit: { label: "unidade média", g: 40 }, category: "carbo" },
  { id: "biscoito_recheado", name: "Biscoito recheado", aliases: ["biscoito recheado", "bolacha recheada", "trakinas", "passatempo", "oreo", "negresco", "wafer", "biscoito wafer"], kcal: 472, p: 6.4, c: 70.5, f: 19.6, unit: { label: "unidade", g: 13 }, category: "outros" },
  { id: "cream_cracker", name: "Biscoito cream cracker (água e sal)", aliases: ["cream cracker", "biscoito cream cracker", "bolacha cream cracker", "bolacha agua e sal", "biscoito agua e sal", "bolacha de agua e sal", "biscoito de agua e sal", "bolacha salgada", "biscoito salgado", "club social"], kcal: 432, p: 10.1, c: 68.7, f: 14.4, unit: { label: "unidade", g: 6 }, category: "carbo" },
  { id: "biscoito_maizena", name: "Biscoito doce tipo maisena", aliases: ["biscoito maizena", "bolacha maizena", "biscoito maisena", "bolacha maisena", "bolacha maria", "biscoito maria", "biscoito doce", "bolacha doce", "bolacha", "biscoito"], kcal: 443, p: 8.1, c: 75.2, f: 12.0, unit: { label: "unidade", g: 5 }, category: "outros" },
  { id: "biscoito_polvilho", name: "Biscoito de polvilho", aliases: ["biscoito de polvilho", "polvilho", "peta"], kcal: 438, p: 1.3, c: 80.5, f: 12.2, unit: { label: "unidade", g: 3 }, category: "carbo" },
  { id: "biscoito_arroz", name: "Biscoito de arroz", aliases: ["biscoito de arroz", "bolacha de arroz"], kcal: 385, p: 8.0, c: 81.0, f: 3.0, unit: { label: "unidade", g: 9 }, category: "carbo" },

  // Carnes, aves, peixes e ovos
  { id: "frango_peito", name: "Peito de frango grelhado", aliases: ["peito de frango grelhado", "peito de frango", "file de frango", "frango grelhado", "frango desfiado", "frango cozido", "frango"], kcal: 159, p: 32.0, c: 0, f: 2.5, unit: { label: "filé", g: 120 }, category: "proteina" },
  { id: "frango_coxa", name: "Coxa de frango assada (com pele)", aliases: ["coxa de frango", "coxinha da asa", "coxa"], kcal: 215, p: 28.5, c: 0.1, f: 10.4, unit: { label: "unidade", g: 55 }, category: "proteina" },
  { id: "frango_sobrecoxa", name: "Sobrecoxa de frango assada (sem pele)", aliases: ["sobrecoxa de frango", "sobrecoxa", "frango assado"], kcal: 233, p: 29.2, c: 0, f: 12.0, unit: { label: "unidade", g: 85 }, category: "proteina" },
  { id: "frango_milanesa", name: "Filé de frango à milanesa", aliases: ["frango a milanesa", "file de frango a milanesa", "frango empanado", "file de frango empanado", "frango frito", "steak de frango"], kcal: 221, p: 28.5, c: 7.5, f: 7.8, unit: { label: "filé", g: 120 }, category: "proteina" },
  { id: "nuggets", name: "Nuggets de frango", aliases: ["nuggets", "nuggets de frango", "empanado de frango"], kcal: 270, p: 14, c: 16, f: 16.5, unit: { label: "unidade", g: 20 }, category: "outros" },
  { id: "coracao_frango", name: "Coração de frango grelhado", aliases: ["coracao de frango", "coracaozinho", "coracao"], kcal: 207, p: 22.4, c: 0.6, f: 12.1, unit: { label: "unidade", g: 8 }, category: "proteina" },
  { id: "patinho", name: "Patinho grelhado", aliases: ["patinho grelhado", "patinho", "bife de patinho", "bife grelhado", "bife", "carne magra", "carne grelhada", "coxao mole", "coxao duro", "lagarto", "musculo", "file mignon", "maminha"], kcal: 219, p: 35.9, c: 0, f: 7.3, unit: { label: "bife", g: 100 }, category: "proteina" },
  { id: "alcatra", name: "Alcatra grelhada", aliases: ["alcatra grelhada", "alcatra", "contra file", "contrafile", "carne vermelha", "carne bovina", "carne assada", "carne de churrasco", "churrasco", "carne"], kcal: 241, p: 31.9, c: 0, f: 11.6, unit: { label: "bife", g: 100 }, category: "proteina" },
  { id: "picanha", name: "Picanha grelhada (com gordura)", aliases: ["picanha", "fraldinha", "bife ancho"], kcal: 289, p: 26.4, c: 0, f: 19.5, unit: { label: "bife", g: 100 }, category: "proteina" },
  { id: "costela", name: "Costela bovina assada", aliases: ["costela bovina", "costela assada", "costela", "costelinha", "cupim"], kcal: 373, p: 28.8, c: 0, f: 27.7, unit: { label: "pedaço", g: 100 }, category: "proteina" },
  { id: "acem", name: "Carne de panela (acém cozido)", aliases: ["carne de panela", "acem", "carne cozida", "carne ensopada", "carne desfiada", "paleta"], kcal: 215, p: 27.3, c: 0, f: 10.9, unit: { label: "colher de servir", g: 60 }, category: "proteina" },
  { id: "carne_moida", name: "Carne moída refogada", aliases: ["carne moida refogada", "carne moida", "boi moido", "patinho moido"], kcal: 212, p: 26.7, c: 0, f: 10.9, unit: { label: "colher de servir", g: 50 }, category: "proteina" },
  { id: "carne_seca", name: "Carne-seca (charque) cozida", aliases: ["carne seca", "charque", "carne de sol", "jaba"], kcal: 263, p: 36.4, c: 0, f: 11.9, unit: { label: "colher de servir", g: 40 }, category: "proteina" },
  { id: "figado", name: "Fígado bovino grelhado", aliases: ["figado bovino", "figado acebolado", "bife de figado", "figado"], kcal: 225, p: 29.9, c: 4.2, f: 9.0, unit: { label: "bife", g: 100 }, category: "proteina" },
  { id: "bife_milanesa", name: "Bife à milanesa", aliases: ["bife a milanesa", "bife empanado", "carne a milanesa", "milanesa"], kcal: 352, p: 20.6, c: 12.2, f: 24.0, unit: { label: "bife", g: 120 }, category: "proteina" },
  { id: "parmegiana", name: "Filé à parmegiana (frango ou carne)", aliases: ["parmegiana", "file a parmegiana", "frango a parmegiana", "bife a parmegiana", "parmegiana de frango", "parmegiana de carne"], kcal: 220, p: 17, c: 8, f: 13, unit: { label: "porção", g: 180 }, category: "outros" },
  { id: "almondega", name: "Almôndega bovina frita", aliases: ["almondega"], kcal: 272, p: 18.2, c: 14.3, f: 15.8, unit: { label: "unidade", g: 30 }, category: "proteina" },
  { id: "hamburguer_carne", name: "Hambúrguer bovino (só a carne)", aliases: ["hamburguer de carne", "carne de hamburguer", "hamburguer bovino", "hamburguer caseiro", "blend"], kcal: 258, p: 20.0, c: 6.3, f: 17.0, unit: { label: "unidade", g: 80 }, category: "proteina" },
  { id: "lombo", name: "Lombo de porco assado", aliases: ["lombo de porco", "lombo suino", "lombo", "carne de porco", "carne suina", "porco"], kcal: 210, p: 35.7, c: 0, f: 6.4, unit: { label: "fatia", g: 60 }, category: "proteina" },
  { id: "pernil", name: "Pernil de porco assado", aliases: ["pernil assado", "pernil suino", "pernil", "bisteca de porco", "bisteca suina", "bisteca"], kcal: 262, p: 32.1, c: 0, f: 13.9, unit: { label: "fatia", g: 60 }, category: "proteina" },
  { id: "linguica", name: "Linguiça de porco grelhada", aliases: ["linguica toscana", "linguica de porco", "linguica calabresa", "linguica de frango", "linguica", "calabresa"], kcal: 296, p: 23.2, c: 0, f: 21.9, unit: { label: "gomo", g: 70 }, category: "proteina" },
  { id: "salsicha", name: "Salsicha", aliases: ["salsicha"], kcal: 257, p: 12.5, c: 3.5, f: 21.5, unit: { label: "unidade", g: 50 }, category: "proteina" },
  { id: "bacon", name: "Bacon frito", aliases: ["bacon frito", "bacon", "toucinho"], kcal: 541, p: 37.0, c: 1.4, f: 41.8, unit: { label: "fatia", g: 8 }, category: "gordura" },
  { id: "presunto", name: "Presunto cozido magro", aliases: ["presunto cozido", "presunto magro", "presunto", "apresuntado"], kcal: 94, p: 14.3, c: 2.1, f: 2.7, unit: { label: "fatia", g: 20 }, category: "proteina" },
  { id: "peito_peru", name: "Peito de peru fatiado", aliases: ["peito de peru", "blanquet de peru", "blanquet"], kcal: 105, p: 20.0, c: 2.5, f: 1.7, unit: { label: "fatia", g: 15 }, category: "proteina" },
  { id: "mortadela", name: "Mortadela", aliases: ["mortadela"], kcal: 269, p: 12.0, c: 5.8, f: 21.6, unit: { label: "fatia", g: 15 }, category: "proteina" },
  { id: "tilapia", name: "Tilápia grelhada", aliases: ["tilapia grelhada", "file de tilapia", "tilapia", "peixe grelhado", "peixe assado", "peixe cozido", "file de peixe", "peixe", "merluza", "pescada", "saint peter"], kcal: 128, p: 26.2, c: 0, f: 2.7, unit: { label: "filé", g: 120 }, category: "proteina" },
  { id: "peixe_frito", name: "Peixe frito", aliases: ["peixe frito", "file de peixe frito", "pescada frita", "tilapia frita", "peixe empanado", "isca de peixe"], kcal: 223, p: 27.4, c: 0, f: 11.8, unit: { label: "filé", g: 120 }, category: "proteina" },
  { id: "salmao", name: "Salmão grelhado", aliases: ["salmao grelhado", "salmao assado", "salmao"], kcal: 243, p: 26.1, c: 0, f: 14.5, unit: { label: "filé", g: 130 }, category: "proteina" },
  { id: "atum", name: "Atum em lata ao natural", aliases: ["atum ao natural", "atum em lata", "atum natural", "atum"], kcal: 116, p: 25.5, c: 0, f: 0.8, unit: { label: "lata drenada", g: 120 }, category: "proteina" },
  { id: "atum_oleo", name: "Atum em lata em óleo (drenado)", aliases: ["atum em oleo", "atum com oleo"], kcal: 166, p: 26.2, c: 0, f: 6.0, unit: { label: "lata drenada", g: 120 }, category: "proteina" },
  { id: "sardinha", name: "Sardinha em lata (drenada)", aliases: ["sardinha em lata", "sardinha em oleo", "sardinha"], kcal: 208, p: 24.6, c: 0, f: 11.5, unit: { label: "lata drenada", g: 84 }, category: "proteina" },
  { id: "camarao", name: "Camarão cozido", aliases: ["camarao cozido", "camarao grelhado", "camarao"], kcal: 90, p: 19.0, c: 0, f: 1.0, unit: { label: "colher de servir", g: 50 }, category: "proteina" },
  { id: "ovo", name: "Ovo cozido", aliases: ["ovo cozido", "ovo inteiro", "ovo poche", "ovo"], kcal: 146, p: 13.3, c: 0.6, f: 9.5, unit: { label: "unidade", g: 50 }, category: "proteina" },
  { id: "ovo_frito", name: "Ovo frito", aliases: ["ovo frito", "ovo estrelado", "ovo na chapa", "ovo na manteiga"], kcal: 240, p: 15.6, c: 1.2, f: 18.6, unit: { label: "unidade", g: 50 }, category: "proteina" },
  { id: "ovo_mexido", name: "Ovo mexido", aliases: ["ovo mexido", "mexido de ovo"], kcal: 190, p: 13.4, c: 1.2, f: 14.5, unit: { label: "unidade", g: 50 }, category: "proteina" },
  { id: "omelete", name: "Omelete simples (2 ovos)", aliases: ["omelete simples", "omelete"], kcal: 200, p: 13.5, c: 1.0, f: 15.5, unit: { label: "unidade", g: 110 }, category: "proteina" },
  { id: "omelete_queijo", name: "Omelete de queijo (2 ovos)", aliases: ["omelete de queijo", "omelete de queijo e presunto", "omelete recheado", "omelete recheada"], kcal: 268, p: 15.6, c: 0.4, f: 22.0, unit: { label: "unidade", g: 130 }, category: "proteina" },
  { id: "clara", name: "Clara de ovo cozida", aliases: ["clara de ovo", "clara cozida", "clara"], kcal: 59, p: 13.4, c: 0, f: 0.1, unit: { label: "unidade", g: 33 }, category: "proteina" },
  { id: "ovo_codorna", name: "Ovo de codorna", aliases: ["ovo de codorna"], kcal: 177, p: 13.7, c: 0.8, f: 12.7, unit: { label: "unidade", g: 10 }, category: "proteina" },
  { id: "tofu", name: "Tofu", aliases: ["tofu", "queijo de soja"], kcal: 64, p: 6.6, c: 2.1, f: 4.0, unit: { label: "fatia", g: 80 }, category: "proteina" },
  { id: "soja_pts", name: "Proteína de soja texturizada (hidratada)", aliases: ["proteina de soja", "proteina texturizada de soja", "soja texturizada", "carne de soja", "pts"], kcal: 110, p: 16.7, c: 10.7, f: 0.3, unit: { label: "colher de servir", g: 50 }, category: "proteina" },

  // Leite e derivados
  { id: "leite_integral", name: "Leite integral", aliases: ["leite integral", "leite de vaca", "leite"], kcal: 61, p: 3.2, c: 4.7, f: 3.3, unit: { label: "copo", g: 200 }, category: "laticinio" },
  { id: "leite_semi", name: "Leite semidesnatado", aliases: ["leite semidesnatado", "leite semi desnatado", "leite semi"], kcal: 46, p: 3.3, c: 4.8, f: 1.5, unit: { label: "copo", g: 200 }, category: "laticinio" },
  { id: "leite_desnatado", name: "Leite desnatado", aliases: ["leite desnatado", "leite magro"], kcal: 35, p: 3.4, c: 4.9, f: 0.1, unit: { label: "copo", g: 200 }, category: "laticinio" },
  { id: "leite_po", name: "Leite em pó integral", aliases: ["leite em po integral", "leite em po", "leite ninho", "ninho"], kcal: 497, p: 25.4, c: 39.2, f: 26.9, unit: { label: "colher de sopa", g: 13 }, category: "laticinio" },
  { id: "leite_achocolatado", name: "Leite com achocolatado", aliases: ["leite com achocolatado", "leite achocolatado", "leite com nescau", "leite com toddy", "leite com chocolate", "achocolatado pronto", "toddynho"], kcal: 83, p: 2.1, c: 14.2, f: 2.2, unit: { label: "copo", g: 200 }, category: "laticinio" },
  { id: "cafe_com_leite", name: "Café com leite (sem açúcar)", aliases: ["cafe com leite", "leite com cafe", "cafe c leite", "pingado", "cafe pingado", "cafe latte", "latte"], kcal: 35, p: 1.9, c: 3.1, f: 1.7, unit: { label: "xícara grande", g: 200 }, category: "laticinio" },
  { id: "cappuccino", name: "Cappuccino adoçado", aliases: ["cappuccino", "capuccino", "capuchino"], kcal: 55, p: 2.4, c: 8.0, f: 1.5, unit: { label: "xícara", g: 150 }, category: "laticinio" },
  { id: "vitamina", name: "Vitamina de banana com leite", aliases: ["vitamina de banana", "vitamina de fruta", "vitamina de mamao", "vitamina de morango", "vitamina de abacate", "batida de banana", "vitamina"], kcal: 71, p: 2.7, c: 10.2, f: 2.5, unit: { label: "copo", g: 300 }, category: "laticinio" },
  { id: "iogurte_natural", name: "Iogurte natural integral", aliases: ["iogurte natural integral", "iogurte natural", "iogurte integral", "iogurte", "coalhada"], kcal: 51, p: 4.1, c: 1.9, f: 3.0, unit: { label: "pote", g: 170 }, category: "laticinio" },
  { id: "iogurte_desnatado", name: "Iogurte natural desnatado", aliases: ["iogurte natural desnatado", "iogurte desnatado"], kcal: 41, p: 3.8, c: 5.8, f: 0.3, unit: { label: "pote", g: 170 }, category: "laticinio" },
  { id: "iogurte_grego", name: "Iogurte grego tradicional (adoçado)", aliases: ["iogurte grego tradicional", "iogurte grego"], kcal: 118, p: 5.5, c: 14.0, f: 4.5, unit: { label: "pote", g: 100 }, category: "laticinio" },
  { id: "iogurte_proteico", name: "Iogurte proteico ou grego zero", aliases: ["iogurte proteico", "iogurte de proteina", "iogurte grego zero", "iogurte grego natural", "iogurte grego sem acucar", "iogurte grego light", "iogurte zero", "yopro", "skyr"], kcal: 63, p: 9.5, c: 5.0, f: 0.5, unit: { label: "pote", g: 160 }, category: "laticinio" },
  { id: "iogurte_fruta", name: "Iogurte de fruta (adoçado)", aliases: ["iogurte de morango", "iogurte de fruta", "iogurte sabor morango", "iogurte de coco", "iogurte adocado", "iogurte liquido", "bebida lactea", "danone"], kcal: 70, p: 2.7, c: 9.7, f: 2.3, unit: { label: "pote", g: 170 }, category: "laticinio" },
  { id: "leite_fermentado", name: "Leite fermentado", aliases: ["leite fermentado", "yakult", "chamyto"], kcal: 70, p: 1.9, c: 15.7, f: 0.1, unit: { label: "frasco", g: 80 }, category: "laticinio" },
  { id: "queijo_minas", name: "Queijo minas frescal", aliases: ["queijo minas frescal", "queijo minas", "minas frescal", "queijo branco", "queijo fresco", "queijo frescal"], kcal: 264, p: 17.4, c: 3.2, f: 20.2, unit: { label: "fatia", g: 30 }, category: "laticinio" },
  { id: "queijo_meia_cura", name: "Queijo minas meia cura", aliases: ["queijo meia cura", "queijo minas padrao", "queijo canastra", "queijo coalho", "queijo curado", "queijo colonial"], kcal: 321, p: 21.2, c: 3.6, f: 24.6, unit: { label: "fatia", g: 30 }, category: "laticinio" },
  { id: "mucarela", name: "Queijo muçarela", aliases: ["queijo mucarela", "queijo mussarela", "mucarela", "mussarela", "mozarela", "muzzarela", "mozzarella", "queijo"], kcal: 330, p: 22.6, c: 3.0, f: 25.2, unit: { label: "fatia", g: 20 }, category: "laticinio" },
  { id: "queijo_prato", name: "Queijo prato", aliases: ["queijo prato", "queijo lanche", "queijo cheddar", "cheddar", "queijo amarelo"], kcal: 360, p: 22.7, c: 1.9, f: 29.1, unit: { label: "fatia", g: 20 }, category: "laticinio" },
  { id: "parmesao", name: "Queijo parmesão ralado", aliases: ["queijo parmesao", "parmesao", "queijo ralado"], kcal: 453, p: 35.6, c: 1.7, f: 33.5, unit: { label: "colher de sopa", g: 10 }, category: "laticinio" },
  { id: "cottage", name: "Queijo cottage", aliases: ["queijo cottage", "cottage"], kcal: 98, p: 11.5, c: 3.0, f: 4.3, unit: { label: "colher de sopa", g: 25 }, category: "laticinio" },
  { id: "ricota", name: "Ricota", aliases: ["ricota fresca", "queijo ricota", "ricota"], kcal: 140, p: 12.6, c: 3.8, f: 8.1, unit: { label: "fatia", g: 30 }, category: "laticinio" },
  { id: "requeijao", name: "Requeijão cremoso", aliases: ["requeijao cremoso", "requeijao", "catupiry", "cream cheese"], kcal: 257, p: 9.6, c: 2.4, f: 23.4, unit: { label: "colher de sopa", g: 30 }, category: "laticinio" },
  { id: "creme_de_leite", name: "Creme de leite", aliases: ["creme de leite"], kcal: 221, p: 1.5, c: 4.5, f: 22.5, unit: { label: "colher de sopa", g: 15 }, category: "gordura" },
  { id: "leite_condensado", name: "Leite condensado", aliases: ["leite condensado"], kcal: 313, p: 7.7, c: 57.0, f: 6.7, unit: { label: "colher de sopa", g: 20 }, category: "outros" },
  { id: "bebida_vegetal", name: "Bebida vegetal (soja, aveia ou amêndoas)", aliases: ["bebida vegetal", "bebida de soja", "leite de soja", "leite de amendoa", "leite de aveia", "leite de castanha", "leite de arroz", "leite vegetal", "ades"], kcal: 39, p: 2.4, c: 4.3, f: 1.6, unit: { label: "copo", g: 200 }, category: "laticinio" },

  // Óleos, gorduras e oleaginosas
  { id: "azeite", name: "Azeite de oliva", aliases: ["azeite de oliva", "azeite extra virgem", "azeite"], kcal: 884, p: 0, c: 0, f: 100, unit: { label: "colher de sopa", g: 12 }, category: "gordura" },
  { id: "oleo", name: "Óleo vegetal (soja, girassol, coco)", aliases: ["oleo de soja", "oleo vegetal", "oleo de girassol", "oleo de canola", "oleo de milho", "oleo de coco", "oleo"], kcal: 884, p: 0, c: 0, f: 100, unit: { label: "colher de sopa", g: 12 }, category: "gordura" },
  { id: "manteiga", name: "Manteiga", aliases: ["manteiga com sal", "manteiga", "ghee"], kcal: 726, p: 0.4, c: 0.1, f: 82.4, unit: { label: "colher de chá", g: 5 }, category: "gordura" },
  { id: "margarina", name: "Margarina", aliases: ["margarina"], kcal: 596, p: 0, c: 0, f: 67.4, unit: { label: "colher de chá", g: 5 }, category: "gordura" },
  { id: "maionese", name: "Maionese", aliases: ["maionese"], kcal: 302, p: 0.6, c: 7.9, f: 30.5, unit: { label: "colher de sopa", g: 12 }, category: "gordura" },
  { id: "leite_coco", name: "Leite de coco", aliases: ["leite de coco"], kcal: 166, p: 1.0, c: 2.2, f: 18.4, unit: { label: "colher de sopa", g: 15 }, category: "gordura" },
  { id: "pasta_amendoim", name: "Pasta de amendoim integral", aliases: ["pasta de amendoim integral", "pasta de amendoim", "manteiga de amendoim", "creme de amendoim"], kcal: 600, p: 26, c: 18, f: 48, unit: { label: "colher de sopa", g: 15 }, category: "gordura" },
  { id: "creme_avela", name: "Creme de avelã com cacau", aliases: ["creme de avela", "nutella"], kcal: 539, p: 6.3, c: 57.5, f: 30.9, unit: { label: "colher de sopa", g: 20 }, category: "outros" },
  { id: "amendoim", name: "Amendoim torrado", aliases: ["amendoim torrado", "amendoim salgado", "amendoim"], kcal: 606, p: 22.5, c: 18.7, f: 54.0, unit: { label: "punhado", g: 30 }, category: "gordura" },
  { id: "castanha_para", name: "Castanha-do-pará", aliases: ["castanha do para", "castanha do brasil"], kcal: 643, p: 14.5, c: 15.1, f: 63.5, unit: { label: "unidade", g: 4 }, category: "gordura" },
  { id: "castanha_caju", name: "Castanha-de-caju torrada", aliases: ["castanha de caju"], kcal: 570, p: 18.5, c: 29.1, f: 46.3, unit: { label: "unidade", g: 2.5 }, category: "gordura" },
  { id: "mix_castanhas", name: "Mix de castanhas e nozes", aliases: ["mix de castanha", "mix de nuts", "mix de oleaginosas", "oleaginosas", "castanha", "nozes", "amendoa", "pistache", "macadamia", "avela", "nuts"], kcal: 600, p: 16.5, c: 23.0, f: 54.0, unit: { label: "unidade", g: 4 }, category: "gordura" },
  { id: "chia_linhaca", name: "Chia ou linhaça", aliases: ["chia", "linhaca", "semente de chia", "semente de linhaca", "farinha de linhaca", "gergelim"], kcal: 490, p: 15.3, c: 42.7, f: 31.5, unit: { label: "colher de sopa", g: 12 }, category: "gordura" },
  { id: "azeitona", name: "Azeitona verde", aliases: ["azeitona verde", "azeitona preta", "azeitona"], kcal: 137, p: 0.9, c: 4.1, f: 14.2, unit: { label: "unidade", g: 4 }, category: "gordura" },

  // Frutas
  { id: "banana", name: "Banana prata", aliases: ["banana prata", "banana nanica", "banana maca", "banana"], kcal: 98, p: 1.3, c: 26.0, f: 0.1, unit: { label: "unidade", g: 70 }, category: "fruta" },
  { id: "maca", name: "Maçã", aliases: ["maca fuji", "maca gala", "maca verde", "maca"], kcal: 56, p: 0.3, c: 15.2, f: 0, unit: { label: "unidade", g: 130 }, category: "fruta" },
  { id: "mamao", name: "Mamão papaia", aliases: ["mamao papaia", "mamao formosa", "mamao", "papaia"], kcal: 40, p: 0.5, c: 10.4, f: 0.1, unit: { label: "unidade", g: 300 }, category: "fruta" },
  { id: "laranja", name: "Laranja pera", aliases: ["laranja pera", "laranja lima", "laranja bahia", "laranja"], kcal: 37, p: 1.0, c: 8.9, f: 0.1, unit: { label: "unidade", g: 140 }, category: "fruta" },
  { id: "mexerica", name: "Mexerica (tangerina)", aliases: ["mexerica", "tangerina", "bergamota", "poncan", "ponkan", "mimosa"], kcal: 38, p: 0.8, c: 9.6, f: 0.1, unit: { label: "unidade", g: 120 }, category: "fruta" },
  { id: "abacaxi", name: "Abacaxi", aliases: ["abacaxi"], kcal: 48, p: 0.9, c: 12.3, f: 0.1, unit: { label: "fatia", g: 75 }, category: "fruta" },
  { id: "melancia", name: "Melancia", aliases: ["melancia"], kcal: 33, p: 0.9, c: 8.1, f: 0, unit: { label: "fatia", g: 200 }, category: "fruta" },
  { id: "melao", name: "Melão", aliases: ["melao"], kcal: 29, p: 0.7, c: 7.5, f: 0, unit: { label: "fatia", g: 100 }, category: "fruta" },
  { id: "manga", name: "Manga", aliases: ["manga palmer", "manga tommy", "manga"], kcal: 64, p: 0.4, c: 16.7, f: 0.3, unit: { label: "unidade", g: 200 }, category: "fruta" },
  { id: "uva", name: "Uva", aliases: ["uva italia", "uva verde", "uva roxa", "uva sem semente", "uva"], kcal: 53, p: 0.7, c: 13.6, f: 0.2, unit: { label: "unidade", g: 8 }, category: "fruta" },
  { id: "morango", name: "Morango", aliases: ["morango"], kcal: 30, p: 0.9, c: 6.8, f: 0.3, unit: { label: "unidade", g: 12 }, category: "fruta" },
  { id: "pera", name: "Pera", aliases: ["pera"], kcal: 53, p: 0.6, c: 14.0, f: 0.1, unit: { label: "unidade", g: 130 }, category: "fruta" },
  { id: "kiwi", name: "Kiwi", aliases: ["kiwi"], kcal: 51, p: 1.3, c: 11.5, f: 0.6, unit: { label: "unidade", g: 75 }, category: "fruta" },
  { id: "goiaba", name: "Goiaba vermelha", aliases: ["goiaba vermelha", "goiaba"], kcal: 54, p: 1.1, c: 13.0, f: 0.4, unit: { label: "unidade", g: 170 }, category: "fruta" },
  { id: "pessego", name: "Pêssego", aliases: ["pessego", "nectarina"], kcal: 36, p: 0.8, c: 9.3, f: 0, unit: { label: "unidade", g: 85 }, category: "fruta" },
  { id: "ameixa", name: "Ameixa fresca", aliases: ["ameixa fresca", "ameixa"], kcal: 53, p: 0.8, c: 13.9, f: 0, unit: { label: "unidade", g: 50 }, category: "fruta" },
  { id: "caqui", name: "Caqui", aliases: ["caqui"], kcal: 71, p: 0.4, c: 19.3, f: 0.1, unit: { label: "unidade", g: 110 }, category: "fruta" },
  { id: "abacate", name: "Abacate", aliases: ["abacate", "avocado"], kcal: 96, p: 1.2, c: 6.0, f: 8.4, unit: { label: "unidade", g: 400 }, category: "fruta" },
  { id: "tamara", name: "Tâmara seca", aliases: ["tamara seca", "tamara"], kcal: 282, p: 2.5, c: 75.0, f: 0.4, unit: { label: "unidade", g: 8 }, category: "fruta" },
  { id: "uva_passa", name: "Uva-passa", aliases: ["uva passa", "passas"], kcal: 299, p: 3.1, c: 79.2, f: 0.5, unit: { label: "colher de sopa", g: 15 }, category: "fruta" },
  { id: "salada_frutas", name: "Salada de frutas", aliases: ["salada de fruta"], kcal: 58, p: 0.8, c: 14.5, f: 0.3, unit: { label: "pote", g: 200 }, category: "fruta" },
  { id: "fruta", name: "Fruta (porção média)", aliases: ["porcao de fruta", "fruta da epoca", "fruta"], kcal: 55, p: 0.8, c: 14.0, f: 0.2, unit: { label: "unidade", g: 120 }, category: "fruta" },
  { id: "acai_polpa", name: "Polpa de açaí sem açúcar", aliases: ["polpa de acai", "acai puro", "acai sem acucar", "acai natural", "acai zero"], kcal: 58, p: 0.8, c: 6.2, f: 3.9, unit: { label: "pacote", g: 100 }, category: "fruta" },

  // Verduras e legumes
  { id: "salada", name: "Salada de folhas (alface, rúcula)", aliases: ["salada de folhas", "salada de alface", "salada verde", "salada crua", "salada mista", "salada", "alface", "rucula", "agriao", "folhas verdes", "folhas"], kcal: 11, p: 1.3, c: 1.7, f: 0.2, unit: { label: "prato", g: 60 }, category: "vegetal" },
  { id: "tomate", name: "Tomate", aliases: ["tomate cereja", "tomate"], kcal: 15, p: 1.1, c: 3.1, f: 0.2, unit: { label: "unidade", g: 100 }, category: "vegetal" },
  { id: "cenoura", name: "Cenoura crua", aliases: ["cenoura ralada", "cenoura crua", "cenoura cozida", "cenoura"], kcal: 34, p: 1.3, c: 7.7, f: 0.2, unit: { label: "unidade", g: 100 }, category: "vegetal" },
  { id: "brocolis", name: "Brócolis cozido", aliases: ["brocolis cozido", "brocolis"], kcal: 25, p: 2.1, c: 4.4, f: 0.5, unit: { label: "xícara", g: 90 }, category: "vegetal" },
  { id: "couve_flor", name: "Couve-flor cozida", aliases: ["couve flor"], kcal: 19, p: 1.2, c: 3.9, f: 0.3, unit: { label: "xícara", g: 100 }, category: "vegetal" },
  { id: "couve", name: "Couve refogada", aliases: ["couve refogada", "couve manteiga", "couve", "espinafre refogado", "espinafre"], kcal: 90, p: 1.7, c: 8.7, f: 6.6, unit: { label: "colher de servir", g: 40 }, category: "vegetal" },
  { id: "abobrinha", name: "Abobrinha refogada", aliases: ["abobrinha refogada", "abobrinha cozida", "abobrinha"], kcal: 24, p: 1.1, c: 4.2, f: 0.8, unit: { label: "colher de servir", g: 50 }, category: "vegetal" },
  { id: "abobora", name: "Abóbora cozida", aliases: ["abobora cozida", "abobora cabotia", "abobora", "jerimum", "moranga", "cabotia"], kcal: 48, p: 1.4, c: 10.8, f: 0.7, unit: { label: "colher de servir", g: 60 }, category: "vegetal" },
  { id: "chuchu", name: "Chuchu cozido", aliases: ["chuchu"], kcal: 19, p: 0.4, c: 4.8, f: 0, unit: { label: "colher de servir", g: 50 }, category: "vegetal" },
  { id: "vagem", name: "Vagem cozida", aliases: ["vagem"], kcal: 25, p: 1.8, c: 5.3, f: 0.2, unit: { label: "colher de servir", g: 50 }, category: "vegetal" },
  { id: "beterraba", name: "Beterraba cozida", aliases: ["beterraba cozida", "beterraba ralada", "beterraba"], kcal: 32, p: 1.3, c: 7.2, f: 0.1, unit: { label: "colher de servir", g: 45 }, category: "vegetal" },
  { id: "pepino", name: "Pepino", aliases: ["pepino"], kcal: 10, p: 0.9, c: 2.0, f: 0, unit: { label: "porção", g: 50 }, category: "vegetal" },
  { id: "repolho", name: "Repolho cru", aliases: ["salada de repolho", "repolho"], kcal: 17, p: 0.9, c: 3.9, f: 0.1, unit: { label: "porção", g: 50 }, category: "vegetal" },
  { id: "cebola", name: "Cebola", aliases: ["cebola"], kcal: 39, p: 1.7, c: 8.9, f: 0.1, unit: { label: "colher de sopa", g: 10 }, category: "vegetal" },
  { id: "pimentao", name: "Pimentão", aliases: ["pimentao"], kcal: 21, p: 1.1, c: 4.9, f: 0.1, unit: { label: "porção", g: 30 }, category: "vegetal" },
  { id: "berinjela", name: "Berinjela cozida", aliases: ["berinjela"], kcal: 19, p: 0.7, c: 4.5, f: 0.1, unit: { label: "colher de servir", g: 50 }, category: "vegetal" },
  { id: "quiabo", name: "Quiabo cozido", aliases: ["quiabo"], kcal: 30, p: 1.9, c: 6.4, f: 0.3, unit: { label: "colher de servir", g: 50 }, category: "vegetal" },
  { id: "palmito", name: "Palmito em conserva", aliases: ["palmito"], kcal: 23, p: 1.8, c: 4.3, f: 0.4, unit: { label: "unidade", g: 30 }, category: "vegetal" },
  { id: "ervilha", name: "Ervilha em conserva", aliases: ["ervilha"], kcal: 74, p: 4.6, c: 13.4, f: 0.4, unit: { label: "colher de sopa", g: 20 }, category: "vegetal" },
  { id: "legumes", name: "Legumes cozidos (mix)", aliases: ["legumes cozidos", "legumes no vapor", "legumes refogados", "legumes salteados", "mix de legumes", "seleta de legumes", "legumes", "vegetais", "verduras"], kcal: 35, p: 2.0, c: 7.1, f: 0.3, unit: { label: "colher de servir", g: 50 }, category: "vegetal" },
  { id: "vinagrete", name: "Vinagrete", aliases: ["molho vinagrete", "vinagrete"], kcal: 45, p: 0.8, c: 4.5, f: 2.7, unit: { label: "colher de sopa", g: 25 }, category: "vegetal" },
  { id: "sopa_legumes", name: "Sopa de legumes", aliases: ["sopa de legumes", "sopa de frango", "caldo de legumes", "caldo verde", "canja", "sopa", "caldo"], kcal: 45, p: 1.5, c: 6.5, f: 1.4, unit: { label: "prato fundo", g: 300 }, category: "vegetal" },

  // Pratos prontos e lanches
  { id: "prato_feito", name: "Prato feito (arroz, feijão, carne e salada)", aliases: ["prato feito", "pf", "marmita", "marmitex", "quentinha"], kcal: 135, p: 8.5, c: 15.5, f: 4.2, unit: { label: "prato", g: 500 }, category: "outros" },
  { id: "baiao_de_dois", name: "Baião de dois", aliases: ["baiao de dois"], kcal: 136, p: 6.2, c: 20.4, f: 3.2, unit: { label: "colher de servir", g: 60 }, category: "outros" },
  { id: "feijao_tropeiro", name: "Feijão tropeiro", aliases: ["feijao tropeiro", "tropeiro"], kcal: 165, p: 10.2, c: 19.6, f: 6.8, unit: { label: "colher de servir", g: 60 }, category: "outros" },
  { id: "feijoada", name: "Feijoada", aliases: ["feijoada"], kcal: 130, p: 8.7, c: 11.6, f: 6.5, unit: { label: "concha", g: 150 }, category: "outros" },
  { id: "macarrao_bolonhesa", name: "Macarrão à bolonhesa", aliases: ["macarrao a bolonhesa", "macarrao bolonhesa", "macarrao ao molho bolonhesa", "macarrao com molho bolonhesa", "espaguete a bolonhesa", "macarronada"], kcal: 120, p: 4.9, c: 22.5, f: 0.9, unit: { label: "pegador", g: 110 }, category: "outros" },
  { id: "lasanha", name: "Lasanha à bolonhesa", aliases: ["lasanha a bolonhesa", "lasanha"], kcal: 160, p: 8.5, c: 14, f: 7.5, unit: { label: "pedaço", g: 250 }, category: "outros" },
  { id: "strogonoff_frango", name: "Estrogonofe de frango", aliases: ["estrogonofe de frango", "strogonoff de frango", "strogonofe de frango", "stroganoff de frango", "estrogonofe", "strogonoff", "strogonofe", "stroganoff"], kcal: 157, p: 17.6, c: 2.6, f: 8.0, unit: { label: "colher de servir", g: 60 }, category: "outros" },
  { id: "strogonoff_carne", name: "Estrogonofe de carne", aliases: ["estrogonofe de carne", "strogonoff de carne", "strogonofe de carne", "stroganoff de carne"], kcal: 173, p: 15.0, c: 3.0, f: 10.8, unit: { label: "colher de servir", g: 60 }, category: "outros" },
  { id: "escondidinho", name: "Escondidinho de carne", aliases: ["escondidinho de carne seca", "escondidinho de carne", "escondidinho de frango", "escondidinho"], kcal: 160, p: 8, c: 12, f: 9, unit: { label: "colher de servir", g: 80 }, category: "outros" },
  { id: "yakisoba", name: "Yakisoba", aliases: ["yakisoba", "yakissoba"], kcal: 113, p: 7.5, c: 18.3, f: 2.6, unit: { label: "prato", g: 300 }, category: "outros" },
  { id: "sushi", name: "Sushi (peça)", aliases: ["sushi", "hossomaki", "uramaki", "nigiri", "niguiri"], kcal: 150, p: 5.5, c: 28, f: 1.5, unit: { label: "peça", g: 22 }, category: "outros" },
  { id: "salada_maionese", name: "Salada de maionese (legumes com maionese)", aliases: ["salada de maionese", "salada de batata", "maionese de batata", "salpicao"], kcal: 96, p: 1.1, c: 8.9, f: 7.0, unit: { label: "colher de servir", g: 60 }, category: "outros" },
  { id: "pizza", name: "Pizza de muçarela ou calabresa", aliases: ["pizza de mucarela", "pizza de mussarela", "pizza de calabresa", "pizza"], kcal: 280, p: 12, c: 31, f: 12, unit: { label: "fatia", g: 120 }, category: "outros" },
  { id: "x_burger", name: "Hambúrguer no pão com queijo (x-burger)", aliases: ["x burger", "xburger", "cheeseburger", "x salada", "x bacon", "x tudo", "x egg", "hamburguer artesanal", "hamburguer", "burger"], kcal: 265, p: 13.5, c: 26, f: 12, unit: { label: "unidade", g: 150 }, category: "outros" },
  { id: "cachorro_quente", name: "Cachorro-quente", aliases: ["cachorro quente", "hot dog", "hotdog", "dogao"], kcal: 245, p: 9, c: 24, f: 12.5, unit: { label: "unidade", g: 130 }, category: "outros" },
  { id: "misto_quente", name: "Misto-quente", aliases: ["misto quente", "queijo quente", "sanduiche de presunto e queijo", "sanduiche de queijo e presunto", "misto"], kcal: 265, p: 13, c: 26, f: 12, unit: { label: "unidade", g: 110 }, category: "outros" },
  { id: "sanduiche_natural", name: "Sanduíche natural de frango", aliases: ["sanduiche natural de frango", "sanduiche natural", "lanche natural", "sanduiche de frango", "sanduiche de atum", "sanduiche"], kcal: 170, p: 11, c: 18, f: 6, unit: { label: "unidade", g: 150 }, category: "outros" },
  { id: "coxinha", name: "Coxinha ou salgado frito", aliases: ["coxinha de frango", "coxinha", "salgado frito", "salgado", "risole", "bolinha de queijo", "kibe", "quibe", "croquete"], kcal: 283, p: 9.6, c: 34.5, f: 11.8, unit: { label: "unidade", g: 110 }, category: "outros" },
  { id: "salgadinho_festa", name: "Salgadinho de festa frito", aliases: ["salgadinho de festa", "salgado de festa", "coxinha de festa", "mini coxinha", "mini salgado", "salgadinho"], kcal: 283, p: 9.6, c: 34.5, f: 11.8, unit: { label: "unidade", g: 25 }, category: "outros" },
  { id: "salgado_assado", name: "Salgado assado (esfiha, empada)", aliases: ["salgado assado", "esfiha de carne", "esfiha", "esfirra", "empada de frango", "empada", "empadinha", "enroladinho de salsicha", "enroladinho", "joelho", "folhado"], kcal: 300, p: 9, c: 38, f: 12, unit: { label: "unidade", g: 80 }, category: "outros" },
  { id: "pastel", name: "Pastel frito (carne ou queijo)", aliases: ["pastel de carne", "pastel de queijo", "pastel de frango", "pastel de feira", "pastel frito", "pastel"], kcal: 400, p: 9.5, c: 45, f: 21, unit: { label: "unidade", g: 100 }, category: "outros" },
  { id: "torta_salgada", name: "Torta salgada ou empadão", aliases: ["torta de frango", "torta salgada", "torta de palmito", "torta de legumes", "empadao de frango", "empadao", "quiche", "torta"], kcal: 250, p: 9, c: 24, f: 13, unit: { label: "fatia", g: 120 }, category: "outros" },
  { id: "batata_frita", name: "Batata frita", aliases: ["batata frita", "porcao de fritas", "fritas"], kcal: 267, p: 5.0, c: 35.6, f: 13.1, unit: { label: "porção pequena", g: 100 }, category: "outros" },
  { id: "mandioca_frita", name: "Mandioca frita", aliases: ["mandioca frita", "aipim frito", "macaxeira frita"], kcal: 300, p: 1.4, c: 50.3, f: 11.2, unit: { label: "porção pequena", g: 100 }, category: "outros" },
  { id: "batata_palha", name: "Batata palha", aliases: ["batata palha"], kcal: 543, p: 5.6, c: 51.2, f: 36.6, unit: { label: "colher de sopa", g: 10 }, category: "outros" },
  { id: "salgadinho_pacote", name: "Salgadinho de pacote (chips)", aliases: ["salgadinho de pacote", "batata chips", "chips", "ruffles", "doritos", "fandangos", "cheetos"], kcal: 543, p: 5.6, c: 51.2, f: 36.6, unit: { label: "pacote pequeno", g: 45 }, category: "outros" },
  { id: "molho_tomate", name: "Molho de tomate", aliases: ["molho de tomate", "molho ao sugo", "molho sugo", "molho vermelho", "extrato de tomate", "molho"], kcal: 38, p: 1.4, c: 7.7, f: 0.9, unit: { label: "colher de sopa", g: 20 }, category: "outros" },
  { id: "ketchup", name: "Ketchup", aliases: ["ketchup", "catchup"], kcal: 105, p: 1.2, c: 25, f: 0.1, unit: { label: "colher de sopa", g: 12 }, category: "outros" },

  // Doces
  { id: "acucar", name: "Açúcar", aliases: ["acucar refinado", "acucar cristal", "acucar mascavo", "acucar demerara", "acucar"], kcal: 387, p: 0.3, c: 99.5, f: 0, unit: { label: "colher de chá", g: 5 }, category: "outros" },
  { id: "mel", name: "Mel", aliases: ["mel de abelha", "mel"], kcal: 309, p: 0, c: 84.0, f: 0, unit: { label: "colher de sopa", g: 20 }, category: "outros" },
  { id: "geleia", name: "Geleia de fruta", aliases: ["geleia de morango", "geleia de fruta", "geleia"], kcal: 255, p: 0.3, c: 64, f: 0, unit: { label: "colher de sopa", g: 20 }, category: "outros" },
  { id: "achocolatado", name: "Achocolatado em pó", aliases: ["achocolatado em po", "achocolatado", "chocolate em po", "nescau", "toddy"], kcal: 401, p: 4.2, c: 91.2, f: 2.2, unit: { label: "colher de sopa", g: 10 }, category: "outros" },
  { id: "chocolate", name: "Chocolate ao leite", aliases: ["chocolate ao leite", "chocolate branco", "chocolate", "bombom", "ovo de pascoa"], kcal: 540, p: 7.2, c: 59.6, f: 30.3, unit: { label: "unidade pequena", g: 22 }, category: "outros" },
  { id: "chocolate_amargo", name: "Chocolate amargo 70%", aliases: ["chocolate amargo", "chocolate meio amargo", "chocolate 70 cacau", "chocolate 70"], kcal: 560, p: 8.5, c: 36, f: 41, unit: { label: "unidade pequena", g: 22 }, category: "outros" },
  { id: "brigadeiro", name: "Brigadeiro", aliases: ["brigadeiro", "docinho de festa", "docinho", "beijinho"], kcal: 390, p: 5.5, c: 60, f: 14, unit: { label: "unidade", g: 20 }, category: "outros" },
  { id: "bolo", name: "Bolo simples (sem cobertura)", aliases: ["bolo simples", "bolo caseiro", "bolo de fuba", "bolo de milho", "bolo de laranja", "bolo de cenoura", "bolo de banana", "bolo de coco", "bolo"], kcal: 311, p: 4.8, c: 45.1, f: 12.4, unit: { label: "fatia", g: 60 }, category: "outros" },
  { id: "bolo_chocolate", name: "Bolo de chocolate ou recheado", aliases: ["bolo de chocolate", "bolo recheado", "bolo com cobertura", "bolo de aniversario", "bolo de festa", "torta doce", "torta de limao", "torta holandesa", "torta de morango", "torta de chocolate", "cheesecake"], kcal: 410, p: 6.2, c: 54.7, f: 18.5, unit: { label: "fatia", g: 80 }, category: "outros" },
  { id: "pudim", name: "Pudim de leite", aliases: ["pudim de leite", "pudim", "mousse de maracuja", "mousse de chocolate", "mousse", "pave"], kcal: 222, p: 6.0, c: 35.0, f: 6.5, unit: { label: "fatia", g: 100 }, category: "outros" },
  { id: "doce_leite", name: "Doce de leite", aliases: ["doce de leite"], kcal: 306, p: 5.5, c: 59.5, f: 6.0, unit: { label: "colher de sopa", g: 20 }, category: "outros" },
  { id: "goiabada", name: "Goiabada", aliases: ["goiabada", "doce de goiaba", "marmelada"], kcal: 286, p: 0.4, c: 78.7, f: 0.1, unit: { label: "fatia", g: 40 }, category: "outros" },
  { id: "pacoca", name: "Paçoca de amendoim", aliases: ["pacoca", "pacoquinha", "pe de moleque", "doce de amendoim"], kcal: 487, p: 16.0, c: 52.4, f: 26.1, unit: { label: "unidade", g: 20 }, category: "outros" },
  { id: "sorvete", name: "Sorvete de massa", aliases: ["sorvete de massa", "sorvete de creme", "sorvete de chocolate", "sorvete de morango", "sorvete", "sundae"], kcal: 195, p: 3.3, c: 25, f: 9, unit: { label: "bola", g: 60 }, category: "outros" },
  { id: "milkshake", name: "Milk-shake", aliases: ["milk shake", "milkshake"], kcal: 116, p: 3.2, c: 18, f: 3.5, unit: { label: "copo", g: 300 }, category: "outros" },
  { id: "gelatina", name: "Gelatina pronta", aliases: ["gelatina"], kcal: 19, p: 0.5, c: 4.3, f: 0, unit: { label: "potinho", g: 110 }, category: "outros" },
  { id: "acai", name: "Açaí batido com xarope de guaraná", aliases: ["acai na tigela", "acai batido", "acai com guarana", "tigela de acai", "acai"], kcal: 110, p: 0.7, c: 21.5, f: 3.7, unit: { label: "tigela", g: 300 }, category: "outros" },
  { id: "barra_cereal", name: "Barra de cereal", aliases: ["barra de cereal", "barrinha de cereal", "barrinha"], kcal: 394, p: 5, c: 73, f: 9, unit: { label: "unidade", g: 22 }, category: "outros" },

  // Bebidas
  { id: "agua", name: "Água", aliases: ["agua mineral", "agua com gas", "agua com limao", "agua gelada", "agua", "gelo"], kcal: 0, p: 0, c: 0, f: 0, unit: { label: "copo", g: 200 }, category: "outros" },
  { id: "cafe", name: "Café sem açúcar", aliases: ["cafe sem acucar", "cafe preto", "cafe puro", "cafe coado", "cafe expresso", "cafe espresso", "cafezinho", "cafe", "expresso"], kcal: 9, p: 0.7, c: 1.5, f: 0.1, unit: { label: "xícara pequena", g: 50 }, category: "outros" },
  { id: "cha", name: "Chá sem açúcar", aliases: ["cha verde", "cha preto", "cha mate", "cha de camomila", "cha de hortela", "cha de erva doce", "cha", "mate", "chimarrao", "terere"], kcal: 2, p: 0, c: 0.5, f: 0, unit: { label: "xícara", g: 200 }, category: "outros" },
  { id: "suco_laranja", name: "Suco de laranja natural", aliases: ["suco de laranja natural", "suco de laranja", "suco natural", "suco de fruta", "suco verde", "suco"], kcal: 37, p: 0.7, c: 8.7, f: 0, unit: { label: "copo", g: 200 }, category: "outros" },
  { id: "suco_uva", name: "Suco de uva integral", aliases: ["suco de uva integral", "suco de uva"], kcal: 58, p: 0, c: 14.7, f: 0, unit: { label: "copo", g: 200 }, category: "outros" },
  { id: "suco_caixinha", name: "Suco de caixinha ou néctar (adoçado)", aliases: ["suco de caixinha", "suco de caixa", "suco industrializado", "suco adocado", "suco de maracuja", "suco de abacaxi", "suco de manga", "suco de goiaba", "suco de pessego", "suco de caju", "suco de acerola", "suco de limao", "suco em po", "limonada", "nectar", "refresco", "tang", "del valle"], kcal: 45, p: 0.4, c: 10.7, f: 0.2, unit: { label: "caixinha", g: 200 }, category: "outros" },
  { id: "agua_coco", name: "Água de coco", aliases: ["agua de coco"], kcal: 22, p: 0, c: 5.3, f: 0, unit: { label: "copo", g: 200 }, category: "outros" },
  { id: "caldo_cana", name: "Caldo de cana", aliases: ["caldo de cana", "garapa"], kcal: 65, p: 0, c: 18.2, f: 0, unit: { label: "copo", g: 300 }, category: "outros" },
  { id: "refrigerante", name: "Refrigerante comum", aliases: ["refrigerante normal", "refrigerante", "refri", "coca cola", "coca", "guarana", "fanta", "sprite", "pepsi", "soda", "agua tonica", "tubaina"], kcal: 37, p: 0, c: 9.5, f: 0, unit: { label: "lata", g: 350 }, category: "outros" },
  { id: "refrigerante_zero", name: "Refrigerante ou suco zero", aliases: ["refrigerante zero", "refrigerante diet", "refrigerante sem acucar", "refri zero", "coca zero", "coca cola zero", "coca diet", "guarana zero", "pepsi zero", "pepsi black", "sprite zero", "fanta zero", "suco zero", "suco clight", "clight", "energetico zero", "monster zero"], kcal: 0, p: 0, c: 0, f: 0, unit: { label: "lata", g: 350 }, category: "outros" },
  { id: "energetico", name: "Energético", aliases: ["energetico", "red bull", "monster", "energy drink"], kcal: 45, p: 0, c: 11.3, f: 0, unit: { label: "lata", g: 250 }, category: "outros" },
  { id: "isotonico", name: "Isotônico", aliases: ["isotonico", "gatorade", "powerade"], kcal: 26, p: 0, c: 6.4, f: 0, unit: { label: "garrafa", g: 500 }, category: "outros" },
  { id: "cerveja", name: "Cerveja pilsen", aliases: ["cerveja pilsen", "cerveja", "cervejinha", "chopp", "chope", "breja"], kcal: 41, p: 0.6, c: 3.3, f: 0, unit: { label: "lata", g: 350 }, category: "outros" },
  { id: "vinho", name: "Vinho tinto seco", aliases: ["vinho tinto", "vinho branco", "vinho seco", "vinho", "espumante"], kcal: 85, p: 0.1, c: 2.6, f: 0, unit: { label: "taça", g: 150 }, category: "outros" },
  { id: "destilado", name: "Destilado (cachaça, vodca, uísque)", aliases: ["cachaca", "pinga", "vodka", "vodca", "whisky", "uisque", "gin", "tequila", "rum", "destilado"], kcal: 220, p: 0, c: 0, f: 0, unit: { label: "dose", g: 50 }, category: "outros" },
  { id: "caipirinha", name: "Caipirinha", aliases: ["caipirinha", "caipiroska", "caipivodka", "gin tonica", "drink"], kcal: 115, p: 0, c: 10.5, f: 0, unit: { label: "copo", g: 200 }, category: "outros" },

  // Suplementos e temperos
  { id: "whey", name: "Whey protein concentrado", aliases: ["whey protein", "whey isolado", "whey concentrado", "whey", "proteina em po", "proteina vegetal", "shake de whey", "shake de proteina", "shake proteico"], kcal: 400, p: 80, c: 8, f: 6, unit: { label: "scoop", g: 30 }, category: "proteina" },
  { id: "albumina", name: "Albumina em pó", aliases: ["albumina"], kcal: 360, p: 82, c: 6, f: 0.5, unit: { label: "colher de sopa", g: 10 }, category: "proteina" },
  { id: "barra_proteina", name: "Barra de proteína", aliases: ["barra de proteina", "barrinha de proteina", "barra proteica", "barrinha proteica", "protein bar"], kcal: 380, p: 32, c: 36, f: 13, unit: { label: "unidade", g: 45 }, category: "outros" },
  { id: "hipercalorico", name: "Hipercalórico em pó", aliases: ["hipercalorico", "mass gainer"], kcal: 385, p: 20, c: 70, f: 3, unit: { label: "scoop", g: 50 }, category: "outros" },
  { id: "maltodextrina", name: "Maltodextrina ou dextrose", aliases: ["maltodextrina", "malto", "dextrose", "palatinose", "waxy maize"], kcal: 380, p: 0, c: 95, f: 0, unit: { label: "scoop", g: 30 }, category: "outros" },
  { id: "creatina", name: "Creatina", aliases: ["creatina monohidratada", "creatina"], kcal: 0, p: 0, c: 0, f: 0, unit: { label: "dose", g: 3 }, category: "outros" },
  { id: "suplemento_zero", name: "Suplemento sem calorias (BCAA, cápsulas)", aliases: ["bcaa", "glutamina", "beta alanina", "cafeina", "termogenico", "multivitaminico", "polivitaminico", "omega 3", "vitamina c", "vitamina d", "capsula"], kcal: 0, p: 0, c: 0, f: 0, unit: { label: "dose", g: 5 }, category: "outros" },
  { id: "adocante", name: "Adoçante", aliases: ["adocante", "stevia", "sucralose"], kcal: 0, p: 0, c: 0, f: 0, unit: { label: "porção", g: 1 }, category: "outros" },
  { id: "temperos", name: "Temperos, limão e ervas", aliases: ["tempero", "sal", "pimenta", "oregano", "cheiro verde", "salsinha", "cebolinha", "coentro", "alho", "canela", "vinagre", "limao", "mostarda", "molho shoyu", "shoyu", "molho de pimenta", "molho ingles", "curcuma", "acafrao", "gengibre", "paprica"], kcal: 0, p: 0, c: 0, f: 0, unit: { label: "porção", g: 5 }, category: "outros" },
];

/** Bebidas alcoólicas: as calorias vêm do álcool, que não entra nos macros. */
export const ALCOHOL_IDS: ReadonlySet<string> = new Set(["cerveja", "vinho", "destilado", "caipirinha"]);

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

/** Alimentos criados pelo usuário; registrados em memória ao entrar (ver app-context). */
let CUSTOM_FOODS: Food[] = [];
let CUSTOM_BY_ID = new Map<string, Food>();
let version = 0;

export function registerCustomFoods(list: Food[]): void {
  CUSTOM_FOODS = list;
  CUSTOM_BY_ID = new Map(list.map((f) => [f.id, f]));
  version++;
}

export function customFoods(): Food[] {
  return CUSTOM_FOODS;
}

/** Todos os alimentos (personalizados primeiro). */
export function allFoods(): Food[] {
  return [...CUSTOM_FOODS, ...FOODS];
}

/** Muda sempre que o registro de personalizados muda (para invalidar índices derivados). */
export function foodsVersion(): number {
  return version;
}

export function getFood(id: string): Food | undefined {
  return BY_ID.get(id) ?? CUSTOM_BY_ID.get(id);
}
