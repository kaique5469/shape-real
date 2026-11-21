import type { Exercise, MuscleGroup, Unit } from "./types";

/**
 * Biblioteca de exercícios com os nomes usados nas academias brasileiras.
 * IDs são estáveis: o histórico de cargas e a IA dependem deles.
 *
 * Marcações lidas pelo motor (generator.ts): `minLevel` (nível mínimo para o motor escolher
 * sozinho), `pri` (2 = básico de quase toda ficha, 1 = muito comum) e `unilateral`
 * (repetições por lado; conta o dobro do tempo de execução).
 */
export const EXERCISES: Exercise[] = [
  // Peito
  { id: "supino_reto_barra", name: "Supino reto com barra", group: "peito", secondary: ["triceps", "ombros"], implement: "barra", pattern: "empurrar_h", compound: true, main: true, pri: 2, cue: "Escápulas presas no banco, barra desce até o meio do peito." },
  { id: "supino_reto_halter", name: "Supino reto com halteres", group: "peito", secondary: ["triceps", "ombros"], implement: "halter", pattern: "empurrar_h", compound: true, home: true, pri: 1, cue: "Cotovelos a ~45° do tronco, desça até alongar o peitoral." },
  { id: "supino_inclinado_barra", name: "Supino inclinado com barra", group: "peito", secondary: ["ombros", "triceps"], implement: "barra", pattern: "empurrar_h", compound: true, pri: 1, cue: "Banco a 30°, barra toca a parte alta do peito." },
  { id: "supino_inclinado_halter", name: "Supino inclinado com halteres", group: "peito", secondary: ["ombros", "triceps"], implement: "halter", pattern: "empurrar_h", compound: true, pri: 2 },
  { id: "supino_declinado_barra", name: "Supino declinado com barra", group: "peito", secondary: ["triceps"], implement: "barra", pattern: "empurrar_h", compound: true, minLevel: "intermediario" },
  { id: "supino_maquina", name: "Supino reto na máquina (supino vertical)", group: "peito", secondary: ["triceps"], implement: "maquina", pattern: "empurrar_h", compound: true, pri: 1 },
  { id: "crucifixo_halter", name: "Crucifixo com halteres", group: "peito", implement: "halter", pattern: "isolado", compound: false, home: true, pri: 1, cue: "Cotovelos levemente flexionados e fixos durante todo o arco." },
  { id: "crucifixo_maquina", name: "Voador (peck deck)", group: "peito", implement: "maquina", pattern: "isolado", compound: false, pri: 2 },
  { id: "crossover", name: "Crossover polia alta", group: "peito", implement: "cabo", pattern: "isolado", compound: false, pri: 1 },
  { id: "flexao", name: "Flexão de braço", group: "peito", secondary: ["triceps", "ombros", "abdomen"], implement: "peso_corporal", pattern: "empurrar_h", compound: true, home: true, minLevel: "intermediario", pri: 1, cue: "Corpo em prancha, peito desce até quase tocar o chão." },
  { id: "paralelas_peito", name: "Paralelas (foco peito)", group: "peito", secondary: ["triceps"], implement: "peso_corporal", pattern: "empurrar_v", compound: true, minLevel: "intermediario" },
  { id: "supino_inclinado_maquina", name: "Supino inclinado na máquina", group: "peito", secondary: ["ombros", "triceps"], implement: "maquina", pattern: "empurrar_h", compound: true, cue: "Regule o banco para os pegadores ficarem na linha da parte alta do peito." },
  { id: "supino_declinado_maquina", name: "Supino declinado na máquina", group: "peito", secondary: ["triceps"], implement: "maquina", pattern: "empurrar_h", compound: true, cue: "Empurre para baixo e à frente sem descolar as costas do encosto." },
  { id: "supino_reto_smith", name: "Supino reto no Smith", group: "peito", secondary: ["triceps", "ombros"], implement: "smith", pattern: "empurrar_h", compound: true, cue: "Posicione o banco para a barra descer na linha do meio do peito." },
  { id: "supino_inclinado_smith", name: "Supino inclinado no Smith", group: "peito", secondary: ["ombros", "triceps"], implement: "smith", pattern: "empurrar_h", compound: true, cue: "Banco a 30–45°, barra desce na parte alta do peito, cotovelos sob a barra." },
  { id: "crucifixo_inclinado_halter", name: "Crucifixo inclinado com halteres", group: "peito", secondary: ["ombros"], implement: "halter", pattern: "isolado", compound: false, cue: "Banco a 30°, abra até alongar o peitoral mantendo os cotovelos semiflexionados." },
  { id: "crossover_polia_baixa", name: "Crossover polia baixa (de baixo para cima)", group: "peito", secondary: ["ombros"], implement: "cabo", pattern: "isolado", compound: false, cue: "Suba as mãos até a linha do queixo, apertando a parte alta do peito." },
  { id: "pullover_halter", name: "Pullover com halter", group: "peito", secondary: ["costas", "triceps"], implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Cotovelos semiflexionados, desça o halter atrás da cabeça sem arquear a lombar." },
  { id: "flexao_joelhos", name: "Flexão de braço com joelhos apoiados", group: "peito", secondary: ["triceps", "ombros"], implement: "peso_corporal", pattern: "empurrar_h", compound: true, home: true, pri: 1, cue: "Quadril alinhado ao tronco, peito desce entre as mãos; não empine o bumbum." },
  { id: "flexao_inclinada", name: "Flexão inclinada (mãos no banco)", group: "peito", secondary: ["triceps", "ombros"], implement: "peso_corporal", pattern: "empurrar_h", compound: true, home: true, cue: "Mãos no banco, corpo reto dos ombros aos calcanhares, peito toca o banco." },

  // Costas
  { id: "puxada_frente", name: "Puxada frontal aberta (pulley frente)", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_v", compound: true, pri: 2, cue: "Puxe com os cotovelos em direção ao quadril, peito aberto." },
  { id: "puxada_triangulo", name: "Puxada com triângulo", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_v", compound: true, pri: 1 },
  { id: "barra_fixa", name: "Barra fixa", group: "costas", secondary: ["biceps"], implement: "peso_corporal", pattern: "puxar_v", compound: true, minLevel: "intermediario", pri: 1, cue: "Saia do ponto morto, queixo passa a barra sem balanço." },
  { id: "barra_fixa_assistida", name: "Barra fixa assistida (graviton/gravitron)", group: "costas", secondary: ["biceps"], implement: "maquina", pattern: "puxar_v", compound: true },
  { id: "remada_curvada_barra", name: "Remada curvada com barra", group: "costas", secondary: ["biceps", "posteriores"], implement: "barra", pattern: "puxar_h", compound: true, main: true, minLevel: "intermediario", pri: 1, cue: "Tronco a ~45°, lombar neutra, barra vai ao umbigo." },
  { id: "remada_unilateral_halter", name: "Remada unilateral com halter (serrote)", group: "costas", secondary: ["biceps"], implement: "halter", pattern: "puxar_h", compound: true, home: true, pri: 1, unilateral: true },
  { id: "remada_baixa", name: "Remada baixa com triângulo", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_h", compound: true, pri: 2 },
  { id: "remada_cavalinho", name: "Remada cavalinho (T-bar)", group: "costas", secondary: ["biceps"], implement: "barra", pattern: "puxar_h", compound: true, minLevel: "intermediario" },
  { id: "remada_maquina", name: "Remada na máquina articulada", group: "costas", secondary: ["biceps"], implement: "maquina", pattern: "puxar_h", compound: true, pri: 1 },
  { id: "pulldown_braco_reto", name: "Pulldown na polia (pullover na polia alta)", group: "costas", implement: "cabo", pattern: "isolado", compound: false, pri: 1 },
  { id: "remada_elastico", name: "Remada com elástico", group: "costas", secondary: ["biceps"], implement: "elastico", pattern: "puxar_h", compound: true, home: true },
  { id: "encolhimento", name: "Encolhimento de ombros com halteres (trapézio)", group: "costas", implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "puxada_supinada", name: "Puxada frontal com pegada supinada", group: "costas", secondary: ["biceps"], implement: "cabo", pattern: "puxar_v", compound: true, cue: "Pegada na largura dos ombros, puxe a barra até a parte alta do peito." },
  { id: "barra_fixa_supinada", name: "Barra fixa supinada (chin-up)", group: "costas", secondary: ["biceps"], implement: "peso_corporal", pattern: "puxar_v", compound: true, minLevel: "intermediario", cue: "Palmas viradas para você, queixo passa a barra, desça até estender os braços." },
  { id: "remada_invertida", name: "Remada invertida (australiana)", group: "costas", secondary: ["biceps", "abdomen"], implement: "peso_corporal", pattern: "puxar_h", compound: true, minLevel: "intermediario", cue: "Corpo em prancha sob a barra baixa, puxe o peito até encostar na barra." },
  { id: "remada_trx", name: "Remada no TRX", group: "costas", secondary: ["biceps", "abdomen"], implement: "acessorio", pattern: "puxar_h", compound: true, cue: "Corpo reto; quanto mais inclinado, mais pesado. Cotovelos rentes ao tronco." },
  { id: "puxada_elastico", name: "Puxada alta com elástico", group: "costas", secondary: ["biceps"], implement: "elastico", pattern: "puxar_v", compound: true, home: true, cue: "Elástico preso no alto, puxe os cotovelos para baixo em direção ao quadril." },
  { id: "remada_curvada_supinada", name: "Remada curvada supinada com barra", group: "costas", secondary: ["biceps", "lombar"], implement: "barra", pattern: "puxar_h", compound: true, minLevel: "intermediario", cue: "Pegada supinada, tronco a ~45°, lombar neutra, barra vai ao umbigo." },
  { id: "remada_articulada_unilateral", name: "Remada articulada unilateral", group: "costas", secondary: ["biceps"], implement: "maquina", pattern: "puxar_h", compound: true, unilateral: true, cue: "Peito apoiado, puxe o cotovelo para trás e para baixo sem girar o tronco." },
  { id: "remada_sentada_maquina", name: "Remada sentada na máquina (pegada neutra)", group: "costas", secondary: ["biceps"], implement: "maquina", pattern: "puxar_h", compound: true, cue: "Peito no apoio, junte as escápulas no final e volte controlando." },
  { id: "encolhimento_barra", name: "Encolhimento de ombros com barra (trapézio)", group: "costas", secondary: ["antebraco"], implement: "barra", pattern: "isolado", compound: false, cue: "Suba os ombros em direção às orelhas, sem girar e sem dobrar os cotovelos." },
  { id: "remada_curvada_halter", name: "Remada curvada com halteres", group: "costas", secondary: ["biceps"], implement: "halter", pattern: "puxar_h", compound: true, home: true, cue: "Tronco a ~45°, lombar neutra, puxe os halteres em direção ao quadril." },

  // Lombar
  { id: "hiperextensao_lombar", name: "Hiperextensão lombar no banco romano", group: "lombar", secondary: ["gluteos", "posteriores"], implement: "acessorio", pattern: "quadril", compound: false, cue: "Desça com a coluna neutra e suba só até alinhar o tronco, sem hiperestender." },
  { id: "superman", name: "Superman (extensão lombar no solo)", group: "lombar", secondary: ["gluteos"], implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Eleve braços e pernas ao mesmo tempo, segure 2 s e desça controlando." },
  { id: "perdigueiro", name: "Perdigueiro (bird dog)", group: "lombar", secondary: ["abdomen", "gluteos"], implement: "peso_corporal", pattern: "core", compound: false, home: true, unilateral: true, cue: "Estenda braço e perna opostos sem girar o quadril nem arquear a lombar." },

  // Ombros
  { id: "desenvolvimento_barra", name: "Desenvolvimento militar com barra", group: "ombros", secondary: ["triceps"], implement: "barra", pattern: "empurrar_v", compound: true, main: true, minLevel: "intermediario", pri: 1, cue: "Glúteos e abdômen contraídos, barra sobe em linha reta." },
  { id: "desenvolvimento_halter", name: "Desenvolvimento com halteres", group: "ombros", secondary: ["triceps"], implement: "halter", pattern: "empurrar_v", compound: true, home: true, pri: 2 },
  { id: "desenvolvimento_maquina", name: "Desenvolvimento na máquina", group: "ombros", secondary: ["triceps"], implement: "maquina", pattern: "empurrar_v", compound: true, pri: 1 },
  { id: "elevacao_lateral", name: "Elevação lateral com halteres", group: "ombros", implement: "halter", pattern: "isolado", compound: false, home: true, pri: 2, cue: "Suba até a linha do ombro, cotovelo guia o movimento." },
  { id: "elevacao_lateral_cabo", name: "Elevação lateral na polia", group: "ombros", implement: "cabo", pattern: "isolado", compound: false, pri: 1 },
  { id: "elevacao_frontal", name: "Elevação frontal com halteres", group: "ombros", implement: "halter", pattern: "isolado", compound: false, home: true },
  { id: "crucifixo_inverso", name: "Crucifixo inverso com halteres", group: "ombros", secondary: ["costas"], implement: "halter", pattern: "isolado", compound: false, home: true, pri: 1 },
  { id: "face_pull", name: "Face pull na polia (posterior de ombro)", group: "ombros", secondary: ["costas"], implement: "cabo", pattern: "puxar_h", compound: false, pri: 1 },
  { id: "remada_alta", name: "Remada alta com barra", group: "ombros", implement: "barra", pattern: "puxar_v", compound: true, minLevel: "intermediario" },
  { id: "desenvolvimento_arnold", name: "Desenvolvimento Arnold", group: "ombros", secondary: ["triceps"], implement: "halter", pattern: "empurrar_v", compound: true, home: true, minLevel: "intermediario", cue: "Comece com as palmas para você e gire os punhos enquanto empurra para cima." },
  { id: "desenvolvimento_smith", name: "Desenvolvimento no Smith", group: "ombros", secondary: ["triceps"], implement: "smith", pattern: "empurrar_v", compound: true, cue: "Banco quase vertical, barra desce à frente do rosto até a linha do queixo." },
  { id: "elevacao_lateral_maquina", name: "Elevação lateral na máquina", group: "ombros", implement: "maquina", pattern: "isolado", compound: false, cue: "Empurre com os cotovelos até a linha dos ombros, sem encolher o trapézio." },
  { id: "elevacao_frontal_anilha", name: "Elevação frontal com anilha", group: "ombros", implement: "halter", pattern: "isolado", compound: false, cue: "Segure a anilha pelas laterais e suba até a linha dos olhos, sem balançar." },
  { id: "crucifixo_inverso_maquina", name: "Crucifixo inverso na máquina (voador inverso)", group: "ombros", secondary: ["costas"], implement: "maquina", pattern: "isolado", compound: false, pri: 1, cue: "Peito no apoio, abra os braços até a linha dos ombros sem encolher o trapézio." },
  { id: "crucifixo_inverso_cabo", name: "Crucifixo inverso na polia (posterior de ombro)", group: "ombros", secondary: ["costas"], implement: "cabo", pattern: "isolado", compound: false, cue: "Cabos cruzados na altura dos ombros, abra os braços sem dobrar os cotovelos." },
  { id: "remada_alta_cabo", name: "Remada alta na polia", group: "ombros", secondary: ["costas", "biceps"], implement: "cabo", pattern: "puxar_v", compound: true, minLevel: "intermediario", cue: "Cotovelos sobem acima dos punhos, só até a linha dos ombros." },
  { id: "rotacao_externa_cabo", name: "Rotação externa de ombro na polia", group: "ombros", implement: "cabo", pattern: "isolado", compound: false, unilateral: true, cue: "Cotovelo colado ao tronco a 90°, gire o antebraço para fora com carga leve." },
  { id: "flexao_pike", name: "Flexão pike (ombros)", group: "ombros", secondary: ["triceps"], implement: "peso_corporal", pattern: "empurrar_v", compound: true, home: true, minLevel: "intermediario", cue: "Quadril alto em V invertido, a cabeça desce à frente da linha das mãos." },

  // Bíceps
  { id: "rosca_direta_barra", name: "Rosca direta com barra", group: "biceps", implement: "barra", pattern: "isolado", compound: false, pri: 2, cue: "Cotovelos colados ao tronco, sem balanço." },
  { id: "rosca_alternada", name: "Rosca alternada com halteres", group: "biceps", implement: "halter", pattern: "isolado", compound: false, home: true, pri: 1 },
  { id: "rosca_martelo", name: "Rosca martelo", group: "biceps", secondary: ["antebraco"], implement: "halter", pattern: "isolado", compound: false, home: true, pri: 1 },
  { id: "rosca_scott", name: "Rosca Scott com barra W", group: "biceps", implement: "barra", pattern: "isolado", compound: false, pri: 1 },
  { id: "rosca_cabo", name: "Rosca direta na polia baixa", group: "biceps", implement: "cabo", pattern: "isolado", compound: false, pri: 1 },
  { id: "rosca_concentrada", name: "Rosca concentrada", group: "biceps", implement: "halter", pattern: "isolado", compound: false, home: true, unilateral: true },
  { id: "rosca_elastico", name: "Rosca com elástico", group: "biceps", implement: "elastico", pattern: "isolado", compound: false, home: true },
  { id: "rosca_direta_barra_w", name: "Rosca direta com barra W", group: "biceps", secondary: ["antebraco"], implement: "barra", pattern: "isolado", compound: false, cue: "Pegada na parte inclinada da barra, cotovelos parados ao lado do tronco." },
  { id: "rosca_direta_halter", name: "Rosca direta com halteres (simultânea)", group: "biceps", implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Suba os dois halteres juntos, palmas para cima, sem jogar o tronco para trás." },
  { id: "rosca_inclinada", name: "Rosca inclinada com halteres (banco 45°)", group: "biceps", implement: "halter", pattern: "isolado", compound: false, cue: "Braços pendentes atrás do tronco, suba sem trazer os cotovelos para a frente." },
  { id: "rosca_scott_maquina", name: "Rosca Scott na máquina", group: "biceps", implement: "maquina", pattern: "isolado", compound: false, cue: "Axilas encaixadas no apoio, desça quase até estender e suba sem tirar o braço." },
  { id: "rosca_martelo_corda", name: "Rosca martelo na polia com corda", group: "biceps", secondary: ["antebraco"], implement: "cabo", pattern: "isolado", compound: false, cue: "Pegada neutra na corda, cotovelos fixos, suba até perto dos ombros." },

  // Tríceps
  { id: "triceps_corda", name: "Tríceps pulley com corda", group: "triceps", implement: "cabo", pattern: "isolado", compound: false, pri: 2, cue: "Abra a corda no final e trave os cotovelos ao lado do corpo." },
  { id: "triceps_barra_polia", name: "Tríceps pulley com barra", group: "triceps", implement: "cabo", pattern: "isolado", compound: false, pri: 1 },
  { id: "triceps_testa", name: "Tríceps testa com barra W", group: "triceps", implement: "barra", pattern: "isolado", compound: false, minLevel: "intermediario", pri: 1 },
  { id: "triceps_frances", name: "Tríceps francês com halter", group: "triceps", implement: "halter", pattern: "isolado", compound: false, home: true, pri: 1 },
  { id: "mergulho_banco", name: "Tríceps banco (mergulho no banco)", group: "triceps", secondary: ["peito"], implement: "peso_corporal", pattern: "empurrar_v", compound: true, home: true },
  { id: "supino_fechado", name: "Supino fechado", group: "triceps", secondary: ["peito"], implement: "barra", pattern: "empurrar_h", compound: true, minLevel: "intermediario" },
  { id: "flexao_diamante", name: "Flexão diamante", group: "triceps", secondary: ["peito"], implement: "peso_corporal", pattern: "empurrar_h", compound: true, home: true, minLevel: "intermediario" },
  { id: "triceps_coice", name: "Tríceps coice com halter", group: "triceps", implement: "halter", pattern: "isolado", compound: false, home: true, unilateral: true },
  { id: "triceps_frances_cabo", name: "Tríceps francês na polia com corda", group: "triceps", implement: "cabo", pattern: "isolado", compound: false, cue: "De costas para a polia, cotovelos apontados para cima, estenda sem abri-los." },
  { id: "triceps_testa_halter", name: "Tríceps testa com halteres", group: "triceps", implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Pegada neutra, halteres descem ao lado da cabeça, cotovelos apontam para o teto." },
  { id: "triceps_inverso", name: "Tríceps pulley com pegada inversa (supinada)", group: "triceps", implement: "cabo", pattern: "isolado", compound: false, cue: "Palmas para cima, cotovelos colados, estenda até travar e volte devagar." },
  { id: "triceps_maquina", name: "Tríceps na máquina", group: "triceps", implement: "maquina", pattern: "isolado", compound: false, cue: "Cotovelos alinhados ao eixo da máquina, estenda tudo sem levantar os ombros." },
  { id: "paralelas_triceps", name: "Paralelas (foco tríceps)", group: "triceps", secondary: ["peito", "ombros"], implement: "peso_corporal", pattern: "empurrar_v", compound: true, minLevel: "intermediario", cue: "Tronco na vertical, cotovelos fechados, desça até ~90° e estenda até travar." },

  // Quadríceps
  { id: "agachamento_livre", name: "Agachamento livre", group: "quadriceps", secondary: ["gluteos", "posteriores"], implement: "barra", pattern: "agachar", compound: true, main: true, minLevel: "intermediario", pri: 2, cue: "Pés na largura dos ombros, joelhos acompanham a ponta dos pés." },
  { id: "agachamento_smith", name: "Agachamento no Smith", group: "quadriceps", secondary: ["gluteos"], implement: "smith", pattern: "agachar", compound: true, pri: 1 },
  { id: "agachamento_frontal", name: "Agachamento frontal", group: "quadriceps", secondary: ["gluteos", "abdomen"], implement: "barra", pattern: "agachar", compound: true, minLevel: "avancado" },
  { id: "agachamento_goblet", name: "Agachamento goblet", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, pri: 1 },
  { id: "agachamento_bulgaro", name: "Agachamento búlgaro", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, minLevel: "intermediario", pri: 1, unilateral: true, cue: "Pé de trás apoiado no banco, tronco levemente inclinado." },
  { id: "agachamento_livre_corporal", name: "Agachamento livre sem carga", group: "quadriceps", secondary: ["gluteos"], implement: "peso_corporal", pattern: "agachar", compound: true, home: true, pri: 1 },
  { id: "leg_press", name: "Leg press 45°", group: "quadriceps", secondary: ["gluteos"], implement: "maquina", pattern: "agachar", compound: true, pri: 2, cue: "Não descole a lombar do encosto na descida." },
  { id: "hack", name: "Agachamento hack", group: "quadriceps", secondary: ["gluteos"], implement: "maquina", pattern: "agachar", compound: true, minLevel: "intermediario", pri: 1 },
  { id: "cadeira_extensora", name: "Cadeira extensora", group: "quadriceps", implement: "maquina", pattern: "isolado", compound: false, pri: 2 },
  { id: "afundo", name: "Afundo com halteres", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, pri: 1, unilateral: true },
  { id: "passada", name: "Passada (avanço caminhando)", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, minLevel: "intermediario", unilateral: true },
  { id: "leg_press_horizontal", name: "Leg press horizontal", group: "quadriceps", secondary: ["gluteos"], implement: "maquina", pattern: "agachar", compound: true, pri: 1, cue: "Pés na largura do quadril, desça até ~90° e empurre sem travar os joelhos." },
  { id: "leg_press_unilateral", name: "Leg press 45° unilateral", group: "quadriceps", secondary: ["gluteos"], implement: "maquina", pattern: "agachar", compound: true, unilateral: true, cue: "Um pé no centro da plataforma, quadril encaixado, joelho na linha do pé." },
  { id: "cadeira_extensora_unilateral", name: "Cadeira extensora unilateral", group: "quadriceps", implement: "maquina", pattern: "isolado", compound: false, unilateral: true, cue: "Estenda uma perna por vez, segure 1 s no topo e desça em 2–3 s." },
  { id: "afundo_smith", name: "Afundo no Smith", group: "quadriceps", secondary: ["gluteos"], implement: "smith", pattern: "agachar", compound: true, unilateral: true, cue: "Passo longo, tronco reto, joelho de trás desce em direção ao chão." },
  { id: "recuo_halter", name: "Recuo com halteres (afundo para trás)", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, unilateral: true, cue: "Passo para trás, joelho de trás desce; volte empurrando o pé da frente." },
  { id: "step_up", name: "Subida no banco (step-up) com halteres", group: "quadriceps", secondary: ["gluteos"], implement: "halter", pattern: "agachar", compound: true, home: true, unilateral: true, cue: "Suba empurrando só a perna de cima, sem dar impulso com o pé de baixo." },
  { id: "agachamento_isometrico_parede", name: "Agachamento isométrico na parede (cadeirinha)", group: "quadriceps", secondary: ["gluteos"], implement: "peso_corporal", pattern: "agachar", compound: false, home: true, unit: "seg", cue: "Costas na parede, joelhos a 90°, peso nos calcanhares, mãos fora das coxas." },
  { id: "agachamento_pistol_assistido", name: "Agachamento pistol assistido (unilateral)", group: "quadriceps", secondary: ["gluteos"], implement: "peso_corporal", pattern: "agachar", compound: true, home: true, minLevel: "intermediario", unilateral: true, cue: "Segure num apoio, desça numa perna só com o calcanhar no chão e suba sem impulso." },
  { id: "agachamento_salto", name: "Agachamento com salto", group: "quadriceps", secondary: ["gluteos", "panturrilhas", "cardio"], implement: "peso_corporal", pattern: "agachar", compound: true, home: true, minLevel: "intermediario", cue: "Agache até ~90°, salte e amorteça a queda já descendo para a próxima." },
  { id: "agachamento_banco", name: "Agachamento no banco (sentar e levantar)", group: "quadriceps", secondary: ["gluteos"], implement: "peso_corporal", pattern: "agachar", compound: true, home: true, cue: "Encoste de leve no banco e suba sem usar as mãos, joelhos na linha dos pés." },

  // Posteriores
  { id: "levantamento_terra", name: "Levantamento terra", group: "posteriores", secondary: ["costas", "gluteos", "quadriceps"], implement: "barra", pattern: "quadril", compound: true, main: true, minLevel: "intermediario", pri: 1, cue: "Barra colada na canela, empurre o chão e trave o quadril no topo." },
  { id: "stiff", name: "Stiff com barra", group: "posteriores", secondary: ["gluteos"], implement: "barra", pattern: "quadril", compound: true, pri: 2, cue: "Quadril vai para trás, barra desliza rente às coxas." },
  { id: "terra_romeno_halter", name: "Stiff com halteres", group: "posteriores", secondary: ["gluteos"], implement: "halter", pattern: "quadril", compound: true, home: true, pri: 1 },
  { id: "mesa_flexora", name: "Mesa flexora", group: "posteriores", implement: "maquina", pattern: "isolado", compound: false, pri: 2 },
  { id: "cadeira_flexora", name: "Cadeira flexora", group: "posteriores", implement: "maquina", pattern: "isolado", compound: false, pri: 1 },
  { id: "flexora_em_pe", name: "Flexora em pé unilateral", group: "posteriores", implement: "maquina", pattern: "isolado", compound: false, unilateral: true },
  { id: "good_morning", name: "Bom dia (good morning)", group: "posteriores", secondary: ["gluteos"], implement: "barra", pattern: "quadril", compound: true, minLevel: "avancado" },
  { id: "stiff_unilateral", name: "Stiff unilateral com halter", group: "posteriores", secondary: ["gluteos"], implement: "halter", pattern: "quadril", compound: true, home: true, minLevel: "intermediario", unilateral: true, cue: "Quadril paralelo ao chão, perna de trás sobe alinhada ao tronco, coluna reta." },
  { id: "stiff_smith", name: "Stiff no Smith", group: "posteriores", secondary: ["gluteos"], implement: "smith", pattern: "quadril", compound: true, cue: "Joelhos semiflexionados e fixos, quadril vai para trás até alongar o posterior." },
  { id: "levantamento_terra_sumo", name: "Levantamento terra sumô", group: "posteriores", secondary: ["gluteos", "adutores", "quadriceps", "lombar"], implement: "barra", pattern: "quadril", compound: true, minLevel: "intermediario", cue: "Pés bem afastados, joelhos para fora, tronco mais vertical, barra rente à canela." },
  { id: "flexao_nordica", name: "Flexão nórdica", group: "posteriores", implement: "peso_corporal", pattern: "isolado", compound: false, minLevel: "avancado", cue: "Tornozelos presos, desça o tronco reto o mais devagar que conseguir." },
  { id: "flexora_caneleira", name: "Flexora em pé com caneleira", group: "posteriores", implement: "caneleira", pattern: "isolado", compound: false, home: true, unilateral: true, cue: "Mãos apoiadas, coxa parada, leve o calcanhar ao glúteo e desça devagar." },

  // Glúteos
  { id: "elevacao_pelvica", name: "Elevação pélvica com barra (hip thrust)", group: "gluteos", secondary: ["posteriores"], implement: "barra", pattern: "quadril", compound: true, pri: 2, cue: "Pés na largura do quadril, queixo no peito, trave o glúteo 1 s no topo." },
  { id: "ponte_gluteo", name: "Ponte de glúteo", group: "gluteos", secondary: ["posteriores"], implement: "peso_corporal", pattern: "quadril", compound: true, home: true, pri: 1 },
  { id: "cadeira_abdutora", name: "Cadeira abdutora", group: "gluteos", implement: "maquina", pattern: "isolado", compound: false, pri: 2 },
  { id: "gluteo_cabo", name: "Glúteo na polia (coice)", group: "gluteos", implement: "cabo", pattern: "isolado", compound: false, pri: 1, unilateral: true },
  { id: "abducao_elastico", name: "Abdução de quadril com elástico (mini band)", group: "gluteos", implement: "elastico", pattern: "isolado", compound: false, home: true },
  { id: "kettlebell_swing", name: "Kettlebell swing", group: "gluteos", secondary: ["posteriores"], implement: "kettlebell", pattern: "quadril", compound: true, minLevel: "intermediario" },
  { id: "elevacao_pelvica_maquina", name: "Elevação pélvica na máquina", group: "gluteos", secondary: ["posteriores"], implement: "maquina", pattern: "quadril", compound: true, pri: 1, cue: "Cinto no vinco do quadril, suba até alinhar tronco e coxas, segure 1 s." },
  { id: "elevacao_pelvica_smith", name: "Elevação pélvica no Smith", group: "gluteos", secondary: ["posteriores"], implement: "smith", pattern: "quadril", compound: true, cue: "Escápulas no banco, barra no vinco do quadril, canelas verticais no topo." },
  { id: "elevacao_pelvica_unilateral", name: "Elevação pélvica unilateral (ponte unilateral)", group: "gluteos", secondary: ["posteriores"], implement: "peso_corporal", pattern: "quadril", compound: true, home: true, unilateral: true, cue: "Uma perna no ar, suba empurrando o calcanhar sem deixar o quadril girar." },
  { id: "gluteo_maquina", name: "Glúteo na máquina (coice)", group: "gluteos", secondary: ["posteriores"], implement: "maquina", pattern: "isolado", compound: false, pri: 1, unilateral: true, cue: "Empurre a plataforma com o calcanhar, sem arquear a lombar no final." },
  { id: "gluteo_4_apoios_caneleira", name: "Glúteo 4 apoios com caneleira (coice)", group: "gluteos", secondary: ["posteriores"], implement: "caneleira", pattern: "isolado", compound: false, home: true, pri: 1, unilateral: true, cue: "Joelho a 90°, empurre a sola do pé para o teto sem deixar a lombar arquear." },
  { id: "gluteo_smith", name: "Coice no Smith (glúteo 4 apoios)", group: "gluteos", secondary: ["posteriores"], implement: "smith", pattern: "isolado", compound: false, unilateral: true, cue: "Em 4 apoios sob a barra, empurre com a sola do pé e desça controlando." },
  { id: "extensao_quadril_caneleira", name: "Extensão de quadril em pé com caneleira", group: "gluteos", secondary: ["posteriores"], implement: "caneleira", pattern: "isolado", compound: false, home: true, unilateral: true, cue: "Tronco levemente inclinado, perna estendida vai para trás, aperte o glúteo 1 s." },
  { id: "abducao_polia", name: "Abdução de quadril na polia baixa", group: "gluteos", implement: "cabo", pattern: "isolado", compound: false, unilateral: true, cue: "De lado para a polia, afaste a perna de fora sem inclinar o tronco." },
  { id: "abducao_caneleira", name: "Abdução de quadril deitado com caneleira", group: "gluteos", implement: "caneleira", pattern: "isolado", compound: false, home: true, unilateral: true, cue: "Deitado de lado, suba a perna de cima com o pé paralelo ao chão." },
  { id: "passada_lateral_elastico", name: "Passada lateral com mini band", group: "gluteos", secondary: ["quadriceps"], implement: "elastico", pattern: "isolado", compound: false, home: true, cue: "Semiagachado, passos curtos para o lado mantendo o elástico sempre esticado." },
  { id: "agachamento_sumo", name: "Agachamento sumô com halter", group: "gluteos", secondary: ["quadriceps", "adutores"], implement: "halter", pattern: "agachar", compound: true, home: true, pri: 1, cue: "Pés afastados e apontados para fora, joelhos seguem os pés, tronco ereto." },
  { id: "elevacao_pelvica_halter", name: "Elevação pélvica com halter", group: "gluteos", secondary: ["posteriores"], implement: "halter", pattern: "quadril", compound: true, home: true, pri: 1, cue: "Halter apoiado no vinco do quadril, suba até alinhar tronco e coxas e segure 1 s." },

  // Adutores
  { id: "cadeira_adutora", name: "Cadeira adutora", group: "adutores", implement: "maquina", pattern: "isolado", compound: false, pri: 2, cue: "Feche as pernas até as almofadas se tocarem e volte devagar, sem soltar o peso." },
  { id: "aducao_polia", name: "Adução de quadril na polia baixa", group: "adutores", implement: "cabo", pattern: "isolado", compound: false, unilateral: true, cue: "De lado para a polia, cruze a perna de dentro à frente da de apoio." },
  { id: "aducao_caneleira", name: "Adução de quadril deitado com caneleira", group: "adutores", implement: "caneleira", pattern: "isolado", compound: false, home: true, unilateral: true, cue: "Deitado de lado, eleve a perna de baixo estendida; a de cima fica à frente." },

  // Panturrilhas
  { id: "panturrilha_em_pe", name: "Panturrilha em pé na máquina", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false, pri: 2, cue: "Amplitude total: alongue embaixo, segure 1 s no topo." },
  { id: "panturrilha_sentado", name: "Panturrilha sentado", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false, pri: 1 },
  { id: "panturrilha_leg_press", name: "Panturrilha no leg press", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false },
  { id: "panturrilha_unilateral", name: "Panturrilha unilateral no degrau", group: "panturrilhas", implement: "peso_corporal", pattern: "isolado", compound: false, home: true, unilateral: true },
  { id: "panturrilha_burrinho", name: "Panturrilha burrinho (máquina)", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false, cue: "Tronco inclinado e apoiado, joelhos estendidos, alongue bem antes de subir." },
  { id: "panturrilha_smith", name: "Panturrilha em pé no Smith", group: "panturrilhas", implement: "smith", pattern: "isolado", compound: false, cue: "Ponta dos pés num step, desça o calcanhar ao máximo e suba até o topo." },
  { id: "panturrilha_em_pe_halter", name: "Panturrilha em pé com halteres", group: "panturrilhas", implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Suba na ponta dos pés o mais alto possível, segure 1 s e desça em 2 s." },
  { id: "panturrilha_leg_horizontal", name: "Panturrilha no leg press horizontal", group: "panturrilhas", implement: "maquina", pattern: "isolado", compound: false, cue: "Só a ponta dos pés na plataforma, joelhos estendidos, amplitude completa." },

  // Abdômen e core
  { id: "prancha", name: "Prancha", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, unit: "seg", pri: 2, cue: "Contraia glúteo e abdômen, quadril alinhado ao tronco." },
  { id: "abdominal_supra", name: "Abdominal supra", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, pri: 2 },
  { id: "abdominal_infra", name: "Abdominal infra (elevação de pernas)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, pri: 1 },
  { id: "abdominal_polia", name: "Abdominal na polia (crunch)", group: "abdomen", implement: "cabo", pattern: "core", compound: false, pri: 1 },
  { id: "elevacao_pernas_barra", name: "Elevação de pernas na barra", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, minLevel: "intermediario" },
  { id: "abdominal_roda", name: "Abdominal com roda", group: "abdomen", implement: "acessorio", pattern: "core", compound: false, minLevel: "intermediario" },
  { id: "pallof", name: "Pallof press", group: "abdomen", implement: "cabo", pattern: "core", compound: false, unilateral: true },
  { id: "prancha_lateral", name: "Prancha lateral", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, unit: "seg", pri: 1, unilateral: true },
  { id: "abdominal_obliquo", name: "Abdominal oblíquo (cruzado)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Leve o ombro em direção ao joelho oposto, sem puxar o pescoço com as mãos." },
  { id: "abdominal_bicicleta", name: "Abdominal bicicleta", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Cotovelo busca o joelho oposto enquanto a outra perna estende, sem pressa." },
  { id: "abdominal_canivete", name: "Abdominal canivete", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, minLevel: "intermediario", cue: "Suba tronco e pernas estendidas ao mesmo tempo, levando as mãos aos pés." },
  { id: "abdominal_remador", name: "Abdominal remador", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Estenda o corpo sem encostar pés e ombros no chão e suba abraçando os joelhos." },
  { id: "dead_bug", name: "Dead bug (inseto morto)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Lombar colada no chão, estenda braço e perna opostos e volte devagar." },
  { id: "vacuum_abdominal", name: "Vacuum abdominal (hipopressivo)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, unit: "seg", cue: "Solte todo o ar e puxe o umbigo em direção à coluna; sustente a contração." },
  { id: "abdominal_maquina", name: "Abdominal na máquina", group: "abdomen", implement: "maquina", pattern: "core", compound: false, cue: "Enrole o tronco aproximando as costelas do quadril; não puxe com os braços." },
  { id: "abdominal_infra_paralela", name: "Abdominal infra na paralela (elevação de pernas)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, minLevel: "intermediario", cue: "Lombar no encosto, suba os joelhos acima do quadril e desça sem balançar." },
  { id: "abdominal_declinado", name: "Abdominal no banco declinado", group: "abdomen", implement: "acessorio", pattern: "core", compound: false, cue: "Desça só até a lombar encostar e suba enrolando o tronco, sem tranco." },
  { id: "prancha_toque_ombro", name: "Prancha alta com toque no ombro", group: "abdomen", secondary: ["ombros"], implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Pés afastados, toque o ombro oposto sem deixar o quadril girar." },
  { id: "mountain_climber", name: "Mountain climber (escalador)", group: "abdomen", secondary: ["cardio", "ombros"], implement: "peso_corporal", pattern: "core", compound: false, home: true, unit: "seg", cue: "Mãos sob os ombros, alterne os joelhos ao peito sem subir o quadril." },
  { id: "rotacao_tronco_polia", name: "Rotação de tronco na polia (lenhador)", group: "abdomen", implement: "cabo", pattern: "core", compound: false, unilateral: true, cue: "Braços estendidos, gire o tronco pelo abdômen e deixe o pé de trás pivotar." },
  { id: "russian_twist", name: "Rotação russa (russian twist)", group: "abdomen", implement: "peso_corporal", pattern: "core", compound: false, home: true, cue: "Tronco inclinado para trás, gire os ombros de um lado ao outro, não só os braços." },

  // Antebraço
  { id: "rosca_punho", name: "Rosca de punho", group: "antebraco", implement: "barra", pattern: "isolado", compound: false },
  { id: "farmer_walk", name: "Farmer walk (caminhada do fazendeiro)", group: "antebraco", secondary: ["abdomen", "costas"], implement: "halter", pattern: "core", compound: true, home: true, unit: "seg" },
  { id: "rosca_inversa", name: "Rosca inversa com barra", group: "antebraco", secondary: ["biceps"], implement: "barra", pattern: "isolado", compound: false, cue: "Pegada pronada na largura dos ombros, punhos firmes, cotovelos colados." },
  { id: "rosca_punho_inversa", name: "Rosca de punho inversa (extensão de punho)", group: "antebraco", implement: "barra", pattern: "isolado", compound: false, cue: "Antebraços apoiados no banco, palmas para baixo, suba só os punhos." },
  { id: "rosca_punho_halter", name: "Rosca de punho com halteres", group: "antebraco", implement: "halter", pattern: "isolado", compound: false, home: true, cue: "Antebraços apoiados nas coxas, palmas para cima, suba só os punhos." },
  { id: "suspensao_barra", name: "Suspensão na barra fixa (dead hang)", group: "antebraco", secondary: ["costas"], implement: "peso_corporal", pattern: "isolado", compound: false, unit: "seg", cue: "Pendure-se com os braços estendidos e os ombros ativos, sem balançar." },

  // Cardio
  { id: "esteira_caminhada", name: "Caminhada na esteira", group: "cardio", implement: "maquina", pattern: "cardio", compound: false, unit: "min", pri: 1, cue: "Passo firme, sem segurar no apoio; ritmo em que ainda dá para conversar." },
  { id: "esteira_caminhada_inclinada", name: "Caminhada inclinada na esteira", group: "cardio", secondary: ["gluteos", "panturrilhas"], implement: "maquina", pattern: "cardio", compound: false, unit: "min", cue: "Inclinação de 6–12%, passo largo, sem se pendurar no apoio da esteira." },
  { id: "esteira_corrida", name: "Corrida na esteira", group: "cardio", implement: "maquina", pattern: "cardio", compound: false, unit: "min", minLevel: "intermediario", cue: "Ritmo constante, passadas curtas, pisada sob o quadril, olhar à frente." },
  { id: "bicicleta_ergometrica", name: "Bicicleta ergométrica", group: "cardio", secondary: ["quadriceps"], implement: "maquina", pattern: "cardio", compound: false, unit: "min", pri: 1, cue: "Regule o banco: joelho quase estendido no ponto mais baixo do pedal." },
  { id: "eliptico", name: "Elíptico (transport)", group: "cardio", implement: "maquina", pattern: "cardio", compound: false, unit: "min", pri: 1, cue: "Tronco ereto, pés inteiros nos pedais, braços e pernas no mesmo ritmo." },
  { id: "escada_simulador", name: "Simulador de escada", group: "cardio", secondary: ["gluteos", "quadriceps"], implement: "maquina", pattern: "cardio", compound: false, unit: "min", cue: "Pise com o pé inteiro, tronco ereto, sem apoiar o peso do corpo nos braços." },
  { id: "remo_ergometro", name: "Remo ergômetro", group: "cardio", secondary: ["costas", "quadriceps"], implement: "maquina", pattern: "cardio", compound: false, unit: "min", cue: "Na puxada: pernas, tronco, braços. Na volta: braços, tronco, pernas." },
  { id: "pular_corda", name: "Pular corda", group: "cardio", secondary: ["panturrilhas"], implement: "acessorio", pattern: "cardio", compound: false, home: true, unit: "min", minLevel: "intermediario", cue: "Saltos baixos, cotovelos junto ao corpo; quem gira a corda são os punhos." },
  { id: "hiit_esteira", name: "HIIT na esteira (tiros)", group: "cardio", implement: "maquina", pattern: "cardio", compound: false, unit: "min", minLevel: "intermediario", cue: "Tiros fortes de 20–40 s com 40–80 s de caminhada entre eles." },
  { id: "hiit_bike", name: "HIIT na bicicleta (tiros)", group: "cardio", secondary: ["quadriceps"], implement: "maquina", pattern: "cardio", compound: false, unit: "min", minLevel: "intermediario", cue: "Sprints de 20–30 s com carga alta e 60–90 s pedalando leve entre eles." },
  { id: "caminhada_rua", name: "Caminhada ao ar livre", group: "cardio", implement: "peso_corporal", pattern: "cardio", compound: false, home: true, unit: "min", cue: "Ritmo acelerado, braços soltos; respiração ofegante, mas ainda dá para falar." },
  { id: "corrida_rua", name: "Corrida ao ar livre", group: "cardio", implement: "peso_corporal", pattern: "cardio", compound: false, home: true, unit: "min", minLevel: "intermediario", cue: "Comece leve e mantenha um ritmo em que ainda consegue falar frases curtas." },
  { id: "polichinelo", name: "Polichinelo", group: "cardio", secondary: ["panturrilhas", "ombros"], implement: "peso_corporal", pattern: "cardio", compound: false, home: true, unit: "seg", cue: "Aterrisse na ponta dos pés com os joelhos soltos, ritmo constante." },
  { id: "burpee", name: "Burpee", group: "cardio", secondary: ["peito", "quadriceps", "abdomen"], implement: "peso_corporal", pattern: "cardio", compound: true, home: true, minLevel: "intermediario", cue: "Peito toca o chão, traga os pés perto das mãos e salte estendendo o quadril." },

  // Mobilidade e alongamento (o motor só usa quando o encaixe pede; o personal pode prescrever sempre)
  { id: "alongamento_posteriores", name: "Alongamento de posteriores de coxa", group: "posteriores", implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", unilateral: true, cue: "Perna estendida, incline o tronco com a coluna reta até alongar, sem forçar." },
  { id: "alongamento_quadriceps", name: "Alongamento de quadríceps em pé", group: "quadriceps", implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", unilateral: true, cue: "Calcanhar no glúteo, joelhos juntos, quadril encaixado, sem arquear a lombar." },
  { id: "alongamento_gluteos", name: "Alongamento de glúteo deitado (figura 4)", group: "gluteos", implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", unilateral: true, cue: "Tornozelo sobre o joelho oposto, puxe a coxa de baixo em direção ao peito." },
  { id: "alongamento_peitoral", name: "Alongamento de peitoral na parede", group: "peito", secondary: ["ombros"], implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", unilateral: true, cue: "Antebraço na parede, cotovelo a 90°, gire o tronco para o lado oposto." },
  { id: "alongamento_panturrilha", name: "Alongamento de panturrilha na parede", group: "panturrilhas", implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", unilateral: true, cue: "Perna de trás estendida, calcanhar no chão, incline o corpo para a frente." },
  { id: "alongamento_flexores_quadril", name: "Alongamento de flexores do quadril (iliopsoas)", group: "quadriceps", secondary: ["lombar"], implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", unilateral: true, cue: "Um joelho no chão, contraia o glúteo e leve o quadril à frente sem arquear." },
  { id: "alongamento_lombar", name: "Alongamento de lombar (postura da criança)", group: "lombar", secondary: ["costas"], implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unit: "seg", cue: "Sente sobre os calcanhares, braços estendidos à frente, solte o ar e relaxe." },
  { id: "gato_vaca", name: "Mobilidade de coluna (gato e vaca)", group: "lombar", secondary: ["abdomen"], implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, cue: "Em 4 apoios, alterne arredondar e arquear a coluna devagar, com a respiração." },
  { id: "mobilidade_toracica", name: "Mobilidade torácica em 4 apoios", group: "costas", secondary: ["ombros"], implement: "peso_corporal", pattern: "mobilidade", compound: false, home: true, unilateral: true, cue: "Mão na nuca, gire o cotovelo para o teto olhando para ele; quadril parado." },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

/**
 * Exercícios criados pelo usuário (personal ou aluno). Ficam num registro em memória,
 * carregado do repositório ao entrar, para que getExercise/searchExercises os enxerguem.
 */
let CUSTOM: Exercise[] = [];
let CUSTOM_BY_ID = new Map<string, Exercise>();

export function registerCustomExercises(list: Exercise[]): void {
  CUSTOM = list.map((e) => ({ ...e, custom: true }));
  CUSTOM_BY_ID = new Map(CUSTOM.map((e) => [e.id, e]));
}

export function customExercises(): Exercise[] {
  return CUSTOM;
}

export function isCustomExerciseId(id: string): boolean {
  return id.startsWith("custom_");
}

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id) ?? CUSTOM_BY_ID.get(id);
}

/** Unidade em que as séries de um exercício são contadas. */
export function unitOf(exerciseId: string, fallback?: Unit): Unit {
  return fallback ?? getExercise(exerciseId)?.unit ?? "reps";
}

export const UNIT_LABEL: Record<Unit, { short: string; column: string; noun: string }> = {
  reps: { short: "reps", column: "Reps", noun: "repetições" },
  seg: { short: "s", column: "Segundos", noun: "segundos" },
  min: { short: "min", column: "Minutos", noun: "minutos" },
};

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  quadriceps: "Quadríceps",
  posteriores: "Posteriores",
  gluteos: "Glúteos",
  panturrilhas: "Panturrilhas",
  abdomen: "Abdômen",
  antebraco: "Antebraço",
  adutores: "Adutores",
  lombar: "Lombar",
  cardio: "Cardio",
};

/** Busca tolerante a acentos e caixa. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Outros nomes que o personal digita na busca (apelidos de academia e termos em inglês),
 * por id de exercício. Ficam aqui, fora do tipo Exercise, e entram só na busca.
 */
const AKA: Record<string, string> = {
  supino_reto_barra: "bench press supino barra",
  supino_reto_halter: "bench press halter",
  supino_maquina: "chest press supino maquina",
  supino_inclinado_maquina: "supino inclinado articulado",
  crucifixo_maquina: "fly peitoral maquina",
  crucifixo_halter: "fly crucifixo reto",
  crossover: "cross over cabo",
  crossover_polia_baixa: "cross over cabo",
  flexao: "push up apoio",
  flexao_joelhos: "push up apoio",
  flexao_inclinada: "push up apoio",
  paralelas_peito: "dips mergulho",
  paralelas_triceps: "dips mergulho",
  puxada_frente: "puxada alta pulldown lat",
  puxada_triangulo: "pulley triangulo puxada fechada",
  puxada_supinada: "pulley supinado puxada invertida",
  puxada_elastico: "pulley elastico",
  barra_fixa: "pull up pull-up",
  barra_fixa_supinada: "pull up",
  remada_curvada_barra: "barbell row remada pronada",
  remada_unilateral_halter: "remada serrador",
  remada_baixa: "remada sentada pulley baixo seated row",
  remada_cavalinho: "tbar t bar",
  remada_maquina: "remada articulada hammer",
  remada_invertida: "inverted row",
  pulldown_braco_reto: "pull down braco estendido",
  encolhimento: "shrug",
  encolhimento_barra: "shrug",
  hiperextensao_lombar: "extensao lombar banco 45",
  levantamento_terra: "deadlift terra convencional",
  levantamento_terra_sumo: "deadlift sumo",
  stiff: "rdl terra romeno romanian deadlift",
  terra_romeno_halter: "rdl terra romeno",
  stiff_smith: "rdl terra romeno",
  stiff_unilateral: "rdl unilateral aviaozinho",
  good_morning: "bom dia",
  desenvolvimento_barra: "ohp overhead press desenvolvimento frente",
  desenvolvimento_halter: "shoulder press",
  desenvolvimento_maquina: "shoulder press articulado",
  elevacao_lateral: "lateral raise",
  crucifixo_inverso: "posterior de ombro reverse fly",
  crucifixo_inverso_maquina: "peck deck inverso reverse fly",
  face_pull: "facepull",
  rosca_direta_barra: "curl barra reta",
  rosca_direta_barra_w: "rosca barra ez",
  rosca_scott: "rosca banco scott ez",
  rosca_martelo: "hammer curl",
  triceps_corda: "pushdown triceps polia",
  triceps_barra_polia: "pushdown triceps polia",
  triceps_inverso: "pushdown",
  triceps_testa: "skull crusher triceps ez",
  triceps_frances: "triceps overhead",
  triceps_coice: "kickback",
  supino_fechado: "close grip",
  mergulho_banco: "dips",
  agachamento_livre: "squat agachamento com barra",
  agachamento_smith: "squat agachamento guiado",
  agachamento_frontal: "front squat",
  agachamento_goblet: "agachamento calice",
  agachamento_bulgaro: "bulgarian split squat afundo bulgaro",
  agachamento_livre_corporal: "agachamento com peso corporal air squat",
  agachamento_sumo: "sumo plie",
  hack: "hack machine",
  leg_press: "leg 45",
  cadeira_extensora: "extensao de joelhos leg extension",
  afundo: "lunge avanco",
  passada: "lunge caminhando",
  recuo_halter: "lunge reverso",
  mesa_flexora: "flexora deitada leg curl",
  cadeira_flexora: "flexora sentada leg curl",
  flexao_nordica: "nordic",
  elevacao_pelvica_maquina: "hip thrust",
  elevacao_pelvica_smith: "hip thrust",
  elevacao_pelvica_halter: "hip thrust",
  elevacao_pelvica_unilateral: "hip thrust",
  ponte_gluteo: "glute bridge elevacao pelvica solo",
  cadeira_abdutora: "abducao maquina abdutor",
  cadeira_adutora: "aducao maquina adutor",
  gluteo_cabo: "kickback extensao de quadril",
  gluteo_maquina: "kickback",
  gluteo_4_apoios_caneleira: "quatro apoios",
  gluteo_smith: "quatro apoios",
  passada_lateral_elastico: "monster walk",
  kettlebell_swing: "kb swing",
  panturrilha_em_pe: "gemeos calf",
  panturrilha_sentado: "gemeos soleo calf",
  panturrilha_leg_press: "gemeos calf",
  prancha: "plank prancha frontal isometrica",
  prancha_lateral: "plank",
  abdominal_supra: "crunch abdominal reto",
  abdominal_infra: "elevacao de pernas deitado",
  abdominal_polia: "crunch corda",
  abdominal_roda: "rodinha ab wheel",
  abdominal_canivete: "v-up",
  pallof: "anti rotacao",
  rotacao_tronco_polia: "woodchopper",
  farmer_walk: "carregada",
  esteira_caminhada: "aerobio",
  esteira_caminhada_inclinada: "aerobio",
  esteira_corrida: "aerobio",
  bicicleta_ergometrica: "bike aerobio spinning",
  eliptico: "aerobio",
  escada_simulador: "escada aerobio",
  hiit_esteira: "intervalado",
  hiit_bike: "intervalado spinning",
};

/** Termos por grupo: "posterior de coxa", "aeróbio", "dorsal" também encontram o grupo. */
const GROUP_AKA: Record<MuscleGroup, string> = {
  peito: "peitoral",
  costas: "dorsal dorsais",
  ombros: "deltoide deltoides",
  biceps: "braco",
  triceps: "braco",
  quadriceps: "coxa perna pernas",
  posteriores: "posterior de coxa isquiotibiais perna pernas",
  gluteos: "bumbum quadril",
  panturrilhas: "batata da perna",
  abdomen: "abdominal abdominais core",
  antebraco: "pegada",
  adutores: "parte interna da coxa",
  lombar: "eretores coluna",
  cardio: "aerobico",
};

const HAYSTACK = new WeakMap<Exercise, string>();

function haystack(e: Exercise): string {
  let h = HAYSTACK.get(e);
  if (h === undefined) {
    h = normalize(`${e.name} ${AKA[e.id] ?? ""} ${GROUP_LABEL[e.group]} ${GROUP_AKA[e.group]}`);
    HAYSTACK.set(e, h);
  }
  return h;
}

/**
 * Busca por nome, apelido ou grupo: sem acento, sem caixa, todas as palavras precisam aparecer.
 * Ordem: exercícios do usuário, depois os básicos de ficha (`pri` 2, 1) e então os demais.
 */
export function searchExercises(query: string, group?: MuscleGroup | null): Exercise[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const rank = (e: Exercise) => (e.custom ? 3 : (e.pri ?? 0));
  return [...CUSTOM, ...EXERCISES]
    .filter((e) => {
      if (group && e.group !== group) return false;
      const hay = haystack(e);
      return words.every((w) => hay.includes(w));
    })
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(b.e) - rank(a.e) || a.i - b.i)
    .map((x) => x.e);
}
