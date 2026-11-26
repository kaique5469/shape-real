/**
 * Catálogo do questionário inicial: perguntas, visibilidade, obrigatoriedade e leitura das respostas (spec §4).
 * Puro. Respostas de um perfil só por `readAnamnese` (questionario-link.ts).
 *
 * Não importa format.ts nem o motor: o catálogo entra no bundle de /questionario (spec, track D, item 13).
 * Textos com `{personal}`, `{Personal}` e `{aluno}` ficam crus em PERGUNTAS; `perguntasVisiveis` e
 * `respostasPorParte` devolvem com os nomes (primeiro nome) já trocados (`comNomes`).
 */
import type {
  Anamnese,
  AnamneseAnswers,
  Atendimento,
  CtxQuestionario,
  DorRegiao,
  Modulo,
  Parq,
  SecaoId,
  SN,
} from "./anamnese-types";
import { LADOS, MODULOS, MODULO_MINUTOS, REGIOES, REGIOES_COM_LADO } from "./anamnese-types";

export interface Opcao {
  v: string | number;
  rotulo: string;
  exclusiva?: boolean;
}
export type TipoPergunta = "sn" | "sn3" | "eu" | "em" | "esc" | "num" | "txt" | "mes" | "regioes";
export interface Pergunta {
  id: string; // chave de AnamneseAnswers, "parq.0".."parq.6" ou "extra.0".."extra.2"
  secao: SecaoId;
  texto: string;
  curto: string;
  tipo: TipoPergunta;
  opcoes?: Opcao[];
  min?: number;
  max?: number;
  maxSel?: number;
  obrig: "E" | "C" | "O";
  dica?: string;
  porQue?: string;
  ajuda?: { rotulo: string; texto: string };
  visivel?: (a: AnamneseAnswers, ctx: CtxQuestionario) => boolean;
}

// ---- Textos literais (spec §4.5, Lei SP 16.724/2018, Anexos I e II) --------------------------------------------

/** 3 parágrafos literais (spec.md §4.5). */
export const PARQ_INTRO: readonly string[] = [
  "Este questionário tem o objetivo de identificar a necessidade de avaliação por um médico antes do início da atividade física.",
  "Caso você responda “SIM” a uma ou mais perguntas, converse com seu médico ANTES de aumentar seu nível atual de atividade física.",
  "Mencione este questionário e as perguntas às quais você respondeu “SIM”. Por favor, assinale “SIM” ou “NÃO” às seguintes perguntas:",
];
/** 7 literais, com "1) " … "7) ". */
export const PARQ_PERGUNTAS: readonly string[] = [
  "1) Algum médico já disse que você possui algum problema de coração e que só deveria realizar atividade física supervisionado por profissionais de saúde?",
  "2) Você sente dores no peito quando pratica atividade física?",
  "3) No último mês, você sentiu dores no peito quando praticou atividade física?",
  "4) Você apresenta desequilíbrio devido à tontura e/ou perda de consciência?",
  "5) Você possui algum problema ósseo ou articular que poderia ser piorado pela atividade física?",
  "6) Você toma atualmente algum medicamento para pressão arterial e/ou problema de coração?",
  "7) Sabe de alguma outra razão pela qual você não deve praticar atividade física?",
];
/** 2 parágrafos literais do Anexo II. */
export const TERMO_TEXTO: readonly string[] = [
  "Estou ciente de que é recomendável conversar com um médico antes de aumentar meu nível atual de atividade física, por ter respondido “SIM” a uma ou mais perguntas do “Questionário de Prontidão para Atividade Física” (PAR-Q).",
  "Assumo plena responsabilidade por qualquer atividade física praticada sem o atendimento a essa recomendação.",
];
/** "Por que perguntamos?" da parte do PAR-Q (uma vez, na parte; não dentro das perguntas). */
export const PARQ_POR_QUE = "São as perguntas que academias de São Paulo usam por lei. Servem para ver se vale falar com um médico antes de começar.";
/** Mostrado ao aluno, sem alarme, com qualquer "Sim" no PAR-Q. Passar por `comNomes`. */
export const PARQ_SIM_TEXTO =
  "Tudo bem. Como você respondeu sim, o recomendado é conversar com um médico antes de aumentar sua atividade física. {Personal} vai combinar isso com você.";
/** Caixa do termo (opcional; D-03): pelo link e no modo junto. Passar por `comNomes`. */
export const TERMO_CAIXA: Record<"link" | "junto", string> = {
  link: "Li e concordo com o termo acima.",
  junto: "{aluno} leu e concordou com o termo acima.",
};
/** Faixa no topo para quem tem menos de 12 anos (spec §4.4; decisão do dono, entrada 19, pergunta 3). */
export const FAIXA_MENOR_12 = "Este questionário deve ser preenchido pelo responsável.";
/** Erro do ano fora da faixa (validação no "Continuar"; `erroAno`). */
export const ERRO_ANO = "Confira o ano: use 4 números, como 1990.";
/**
 * Faixa de ano que `gravarResposta` guarda: a mesma do esquema do link e do perfil (questionario-link.ts, `int(1900,
 * 2100)`). Fora dela o pacote seria recusado inteiro e o perfil ficaria "invalida"; a faixa da tela (ano atual − 100 a
 * ano atual − 10) é conferida no "Continuar" por `erroAno`.
 */
export const ANO_GUARDADO = { min: 1900, max: 2100 } as const;

export const SECAO_TITULO: Record<SecaoId, string> = {
  voce: "Você",
  parq: "Saúde: 7 perguntas",
  saude: "Saúde: como você está hoje",
  dor: "Dores e lesões",
  treino: "Seu treino",
  rotina: "Rotina e sono",
  habitos: "Hábitos",
  objetivo: "Objetivo em detalhe",
  esporte: "Esporte",
  dorMais: "Dor em detalhe",
  extras: "Perguntas de {personal}", // substituir no componente (comNomes)
  enviar: "Conferir e enviar",
};

/** Avisos imediatos ao aluno, na própria tela (spec §4.6 e §4.7), literais. */
export const AVISO_TEXTO: Record<"samu" | "coluna", string> = {
  samu: "Converse com um médico antes de começar a treinar. Se sentir dor forte no peito, falta de ar ou desmaio agora, ligue para o SAMU: 192.",
  coluna: "Dormência entre as pernas ou mudança no xixi ou no cocô junto com dor nas costas pede avaliação médica hoje. Não espere o treino.",
};

/** Chaves que só existem com autorização de saúde (spec §11.2): `stripHealth` tira todas. */
export const HEALTH_KEYS: readonly (keyof AnamneseAnswers)[] = [
  "altura", "peso", "parq", "parqDetalhe", "regular", "condicoes", "condicaoOutra", "sintomas", "remedios", "remediosPara", "remediosNomes",
  "cirurgia", "cirurgiaQual", "orientacao", "orientacaoQual", "gestacao", "obstetra", "semanas", "assoalho", "pressaoControle", "hipo",
  "complicacoes", "quedas", "instavel", "medoCair", "dor", "dorOnde", "dorNota", "dorQuando", "dorDesde", "dorTrauma", "dorAlerta", "lesao",
  "lesaoQual", "tratamento", "sono", "estresse", "fuma", "alcool", "doses", "restricoes", "alergia", "lesao12", "lesao12Qual", "piora", "evita",
  "orientacaoFisio",
];

/** Valor da opção "Nenhum(a)" exclusiva nas listas: grava `[]`. */
export const NENHUM = "nenhum";
/** "Prefiro falar pessoalmente" (condições e remédios): grava `"pessoal"`. */
export const PESSOAL = "pessoal";
/** Lado na leitura da resposta ("Joelho (direito)"). Na tela, os botões são `LADO_OPCOES`. */
export const LADO_ROTULO: Record<(typeof LADOS)[number], string> = { d: "direito", e: "esquerdo", ambos: "os dois lados" };
/** Lado opcional em ombro, cotovelo, punho, quadril, joelho e tornozelo (`REGIOES_COM_LADO`; spec §4.7), texto final. */
export const LADO_OPCOES: readonly { v: (typeof LADOS)[number]; rotulo: string }[] = [
  { v: "d", rotulo: "Direito" },
  { v: "e", rotulo: "Esquerdo" },
  { v: "ambos", rotulo: "Os dois" },
];
/** Campo de texto que abre com "Outro lugar" em `dorOnde` (spec §4.7). */
export const REGIAO_OUTRO_ROTULO = "Onde?";
/** Teto do texto de "Outro lugar" em `dorOnde`. */
export const REGIAO_OUTRO_MAX = 60;
/** Respostas completas e "Ver minhas respostas": obrigatória em branco (junto) e parte extra pulada. */
export const RESPOSTA_PULOU = "Pulou";
export const RESPOSTA_PULOU_PARTE = "Pulou esta parte";

// ---- Ajudantes puros (sem format.ts, para não puxar o motor para /questionario) ---------------------------------

export function primeiroNome(nome: string | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dois = (n: number) => String(n).padStart(2, "0");
/** "23/11" no fuso do aparelho; "" se a data for inválida. */
export function fmtDiaMes(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? "" : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}
/** "23/11/2026" no fuso do aparelho; "" se a data for inválida. */
export function fmtData(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? "" : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}
/** Troca `{personal}`, `{Personal}`, `{aluno}` e `{Aluno}` pelo primeiro nome. */
export function comNomes(texto: string, ctx: Pick<CtxQuestionario, "personal" | "aluno">): string {
  const p = primeiroNome(ctx.personal) || "seu personal";
  const al = primeiroNome(ctx.aluno) || "o aluno";
  return texto.replaceAll("{Personal}", maiuscula(p)).replaceAll("{personal}", p).replaceAll("{Aluno}", maiuscula(al)).replaceAll("{aluno}", al);
}

export function idadeDe(a: AnamneseAnswers, hoje: Date): number | null {
  return typeof a.ano === "number" && Number.isFinite(a.ano) ? hoje.getFullYear() - a.ano : null;
}
/** Leitura cautelosa: com a idade calculada N, a pessoa pode ter N ou N − 1 (aniversário ainda não passou). */
function podeTerMenosDe(a: AnamneseAnswers, hoje: Date, limite: number): boolean {
  const i = idadeDe(a, hoje);
  return i !== null && i - 1 < limite;
}
/** Menor de 18 pela leitura cautelosa (calculada ≤ 18): pergunta o responsável e exige a autorização dele para enviar saúde. */
export function precisaResponsavel(a: AnamneseAnswers, hoje: Date): boolean {
  return podeTerMenosDe(a, hoje, 18);
}
/** Faixa FAIXA_MENOR_12 no topo (quem pode ter menos de 12). */
export function mostraFaixaMenor12(a: AnamneseAnswers, hoje: Date): boolean {
  return podeTerMenosDe(a, hoje, 12);
}
const condicoesDe = (a: AnamneseAnswers) => (Array.isArray(a.condicoes) ? a.condicoes : []);
const remediosDe = (a: AnamneseAnswers) => (a.remedios === 1 && Array.isArray(a.remediosPara) ? a.remediosPara : []);
const temDiabetes = (a: AnamneseAnswers) =>
  condicoesDe(a).some((c) => c === "diabetes1" || c === "diabetes2") || remediosDe(a).some((r) => r === "insulina" || r === "diabetes");
/** Posições do PAR-Q respondidas (o rascunho guarda um array esparso até as 7 existirem). */
export function parqRespostas(a: AnamneseAnswers): (SN | undefined)[] {
  const p = Array.isArray(a.parq) ? (a.parq as unknown[]) : [];
  return Array.from({ length: 7 }, (_, i) => {
    const x = p[i];
    return x === 0 || x === 1 ? x : undefined;
  });
}
export function parqCompleto(a: AnamneseAnswers): boolean {
  return parqRespostas(a).every((v) => v !== undefined);
}
export const algumSimParq = (a: AnamneseAnswers): boolean => parqRespostas(a).some((v) => v === 1);
/** `dorAlerta` só aparece com dor e lombar ou costas altas (a mesma regra vale para o aviso da coluna). */
const dorNasCostas = (a: AnamneseAnswers): boolean =>
  a.dor === 1 && Array.isArray(a.dorOnde) && a.dorOnde.some((d) => d?.r === "lombar" || d?.r === "costasAlta");

// ---- Catálogo ----------------------------------------------------------------------------------------------------

const op = (v: string | number, rotulo: string, exclusiva?: true): Opcao => (exclusiva ? { v, rotulo, exclusiva } : { v, rotulo });
const SIM_NAO: Opcao[] = [op(1, "Sim"), op(0, "Não")];
const numeros = (de: number, ate: number): Opcao[] => Array.from({ length: ate - de + 1 }, (_, i) => op(de + i, String(de + i)));

const CURTO_PARQ = [
  "PAR-Q 1: coração, só com supervisão",
  "PAR-Q 2: dor no peito na atividade",
  "PAR-Q 3: dor no peito no último mês",
  "PAR-Q 4: tontura ou perda de consciência",
  "PAR-Q 5: problema ósseo ou articular",
  "PAR-Q 6: remédio de pressão ou coração",
  "PAR-Q 7: outra razão",
];

const PERGUNTAS_PARQ: Pergunta[] = PARQ_PERGUNTAS.map((texto, i) => ({
  id: `parq.${i}`,
  secao: "parq",
  texto,
  curto: CURTO_PARQ[i] ?? `PAR-Q ${i + 1}`,
  tipo: "sn",
  opcoes: SIM_NAO,
  obrig: "E",
  ...(i === 4 ? { ajuda: { rotulo: "O que conta?", texto: "Por exemplo: artrose, hérnia, lesão no joelho ou no ombro." } } : {}),
}));

export const PERGUNTAS: readonly Pergunta[] = [
  // Parte 1: Você (§4.4)
  { id: "nome", secao: "voce", texto: "Seu nome", curto: "Nome", tipo: "txt", max: 120, obrig: "E", dica: "{Personal} cadastrou assim. Corrija se precisar." },
  // min/max do ano dependem de hoje: `perguntasVisiveis` preenche (ano atual − 100 a ano atual − 10).
  { id: "ano", secao: "voce", texto: "Em que ano você nasceu?", curto: "Ano de nascimento", tipo: "num", obrig: "E" },
  {
    id: "sexo",
    secao: "voce",
    texto: "Sexo",
    curto: "Sexo",
    tipo: "eu",
    opcoes: [op("F", "Feminino"), op("M", "Masculino"), op("nd", "Prefiro não dizer")],
    obrig: "E",
    dica: "Usamos para as referências de avaliação e para as perguntas sobre gravidez.",
  },
  {
    id: "altura",
    secao: "voce",
    texto: "Sua altura (cm)",
    curto: "Altura",
    tipo: "num",
    min: 120,
    max: 230,
    obrig: "O",
    porQue: "Para {personal} ter um ponto de partida. A medida é conferida na avaliação.",
  },
  { id: "peso", secao: "voce", texto: "Seu peso (kg)", curto: "Peso", tipo: "num", min: 30, max: 300, obrig: "O", dica: "Se não souber agora, deixe em branco." },
  {
    id: "responsavel",
    secao: "voce",
    texto: "Nome do seu pai, mãe ou responsável",
    curto: "Responsável",
    tipo: "txt",
    max: 120,
    obrig: "C",
    dica: "Ele ou ela vai precisar autorizar no final.",
    // Só com idade conhecida; nos limiares, quem pode ter 17 vê (spec §4.2 e §4.4).
    visivel: (a, c) => precisaResponsavel(a, c.hoje),
  },

  // Parte 2: PAR-Q (§4.5)
  ...PERGUNTAS_PARQ,
  {
    id: "parqDetalhe",
    secao: "parq",
    texto: "Quer contar mais sobre o que você respondeu “SIM”?",
    curto: "Detalhe do PAR-Q",
    tipo: "txt",
    max: 200,
    obrig: "O",
    visivel: (a) => algumSimParq(a),
  },

  // Parte 3: Saúde, como você está hoje (§4.6)
  {
    id: "regular",
    secao: "saude",
    texto: "Hoje você faz exercício planejado pelo menos 3 vezes por semana, 30 minutos ou mais, com esforço pelo menos moderado?",
    curto: "Exercício regular",
    tipo: "eu",
    opcoes: [op("sim3m", "Sim, há mais de 3 meses"), op("simRecente", "Sim, há menos de 3 meses"), op("pouco", "Faço, mas menos que isso"), op("nao", "Não faço agora")],
    obrig: "E",
    dica: "Moderado: dá para conversar, mas não para cantar. Caminhada rápida conta.",
  },
  {
    id: "condicoes",
    secao: "saude",
    texto: "Algum médico já disse que você tem alguma destas condições?",
    curto: "Condições",
    tipo: "em",
    opcoes: [
      op(NENHUM, "Nenhuma destas", true),
      op("coracao", "Doença do coração (infarto, angina, arritmia, insuficiência)"),
      op("avc", "AVC (derrame)"),
      op("circulacao", "Problema de circulação nas pernas"),
      op("pressao", "Pressão alta"),
      op("diabetes1", "Diabetes tipo 1"),
      op("diabetes2", "Diabetes tipo 2"),
      op("prediabetes", "Pré-diabetes"),
      op("rins", "Doença nos rins"),
      op("respiratoria", "Asma, bronquite ou DPOC"),
      op("cancer", "Câncer (em tratamento ou já tratado)"),
      op("osteoporose", "Osteoporose"),
      op("artrose", "Artrose ou artrite"),
      op("alimentar", "Transtorno alimentar (compulsão, anorexia, bulimia)"),
      op("outra", "Outra"),
      op(PESSOAL, "Prefiro falar pessoalmente", true),
    ],
    obrig: "E",
    porQue: "Algumas condições mudam o jeito de começar. {Personal} usa isso só para o seu treino.",
  },
  { id: "condicaoOutra", secao: "saude", texto: "Qual?", curto: "Outra condição", tipo: "txt", max: 100, obrig: "O", visivel: (a) => condicoesDe(a).includes("outra") },
  {
    id: "sintomas",
    secao: "saude",
    texto: "Nos últimos meses, você sentiu algum destes?",
    curto: "Sintomas",
    tipo: "em",
    opcoes: [
      op(NENHUM, "Nenhum destes", true),
      op("peito", "Dor, aperto ou desconforto no peito, pescoço, mandíbula ou braços"),
      op("faltaAr", "Falta de ar parado(a) ou com pouco esforço"),
      op("tontura", "Tontura forte ou desmaio"),
      op("deitar", "Falta de ar ao deitar, ou que acorda você à noite"),
      op("inchaco", "Inchaço nos tornozelos"),
      op("palpitacao", "Coração disparado ou falhando sem motivo"),
      op("panturrilha", "Dor na batata da perna ao caminhar, que passa quando você para"),
      op("sopro", "Um médico disse que tenho sopro no coração"),
      op("cansaco", "Cansaço ou falta de ar fora do normal no dia a dia"),
    ],
    obrig: "E",
  },
  {
    id: "remedios",
    secao: "saude",
    texto: "Você toma algum remédio todo dia ou quase todo dia?",
    curto: "Remédio todo dia",
    tipo: "sn3",
    opcoes: [op(1, "Sim"), op(0, "Não"), op(PESSOAL, "Prefiro falar pessoalmente")],
    obrig: "E",
  },
  {
    id: "remediosPara",
    secao: "saude",
    texto: "Para quê? Marque todos.",
    curto: "Remédios para",
    tipo: "em",
    opcoes: [
      op("pressao", "Pressão"),
      op("coracao", "Coração ou ritmo do coração"),
      op("betabloqueador", "Atenolol, propranolol, metoprolol, carvedilol ou bisoprolol"),
      op("diuretico", "Diurético"),
      op("insulina", "Diabetes: insulina"),
      op("diabetes", "Diabetes: outro remédio"),
      op("colesterol", "Colesterol"),
      op("anticoagulante", "Para afinar o sangue (anticoagulante)"),
      op("emagrecer", "Injeção para emagrecer ou para diabetes (semaglutida, tirzepatida)"),
      op("corticoide", "Corticoide (prednisona, por exemplo) há mais de 3 meses"),
      op("bombinha", "Bombinha para asma"),
      op("outro", "Outro"),
    ],
    obrig: "C",
    visivel: (a) => a.remedios === 1,
  },
  { id: "remediosNomes", secao: "saude", texto: "Se souber, escreva o nome dos remédios", curto: "Nomes dos remédios", tipo: "txt", max: 150, obrig: "O", visivel: (a) => a.remedios === 1 },
  { id: "cirurgia", secao: "saude", texto: "Fez alguma cirurgia nos últimos 12 meses?", curto: "Cirurgia nos últimos 12 meses", tipo: "sn", opcoes: SIM_NAO, obrig: "E" },
  { id: "cirurgiaQual", secao: "saude", texto: "Qual e quando?", curto: "Qual cirurgia", tipo: "txt", max: 100, obrig: "O", visivel: (a) => a.cirurgia === 1 },
  {
    id: "orientacao",
    secao: "saude",
    texto: "Algum médico já falou com você sobre fazer exercício?",
    curto: "O médico falou sobre exercício",
    tipo: "eu",
    opcoes: [op("nao", "Não"), op("livre", "Liberou, sem restrição"), op("restricao", "Liberou, com restrições"), op("pausa", "Pediu para não treinar por enquanto")],
    obrig: "C",
    // "Prefiro falar pessoalmente" também mostra (leitura cautelosa: dado que falta não é "tudo bem", D-20).
    visivel: (a) =>
      algumSimParq(a) ||
      a.condicoes === PESSOAL ||
      condicoesDe(a).length > 0 ||
      (Array.isArray(a.sintomas) && a.sintomas.length > 0) ||
      a.remedios === 1 ||
      a.remedios === PESSOAL,
  },
  {
    id: "orientacaoQual",
    secao: "saude",
    texto: "O que ele ou ela falou? Quando foi?",
    curto: "O que o médico falou",
    tipo: "txt",
    max: 150,
    obrig: "O",
    visivel: (a) => a.orientacao === "restricao" || a.orientacao === "pausa",
  },
  {
    id: "gestacao",
    secao: "saude",
    texto: "Você está grávida ou teve bebê no último ano?",
    curto: "Gravidez ou bebê no último ano",
    tipo: "eu",
    // "Não se aplica" só para "Prefiro não dizer" e sexo sem resposta (perguntasVisiveis filtra).
    opcoes: [op("nao", "Não"), op("gravida", "Estou grávida"), op("pp3", "Tive bebê há menos de 3 meses"), op("pp12", "Tive bebê entre 3 e 12 meses"), op("nd", "Não se aplica")],
    obrig: "C",
    porQue: "Gravidez e pós-parto mudam o que é seguro no treino.",
    // Sexo ≠ M (inclusive sem resposta) e idade de 14 a 55 (inclusive desconhecida).
    visivel: (a, c) => {
      if (a.sexo === "M") return false;
      const i = idadeDe(a, c.hoje);
      return i === null || (i >= 14 && i <= 55);
    },
  },
  {
    id: "obstetra",
    secao: "saude",
    texto: "Seu obstetra liberou atividade física nesta gestação?",
    curto: "Liberação do obstetra",
    tipo: "eu",
    opcoes: [op("sim", "Sim"), op("naoPerguntei", "Ainda não perguntei"), op("pediuNao", "Pediu para não fazer")],
    obrig: "C",
    visivel: (a) => a.gestacao === "gravida",
  },
  { id: "semanas", secao: "saude", texto: "Com quantas semanas você está?", curto: "Semanas de gestação", tipo: "num", min: 1, max: 42, obrig: "O", visivel: (a) => a.gestacao === "gravida" },
  {
    id: "assoalho",
    secao: "saude",
    texto: "Ao tossir, pular ou correr, você perde xixi ou sente peso na vagina?",
    curto: "Perde xixi ou sente peso na vagina",
    tipo: "sn",
    opcoes: SIM_NAO,
    obrig: "C",
    visivel: (a) => a.gestacao === "gravida" || a.gestacao === "pp3" || a.gestacao === "pp12",
  },
  {
    id: "pressaoControle",
    secao: "saude",
    texto: "Como costuma estar sua pressão?",
    curto: "Pressão",
    tipo: "eu",
    opcoes: [op("controlada", "Controlada, abaixo de 14 por 9"), op("asVezes", "Às vezes alta"), op("alta", "Costuma passar de 16 por 9"), op("naoSei", "Não sei")],
    obrig: "C",
    visivel: (a) => condicoesDe(a).includes("pressao") || remediosDe(a).some((r) => r === "pressao" || r === "diuretico" || r === "betabloqueador"),
  },
  {
    id: "hipo",
    secao: "saude",
    texto: "Você tem hipoglicemia (tremedeira, suor frio, confusão) durante ou depois do exercício?",
    curto: "Hipoglicemia no exercício",
    tipo: "eu",
    opcoes: [op("nunca", "Nunca"), op("asVezes", "Às vezes"), op("frequente", "Com frequência")],
    obrig: "C",
    visivel: (a) => temDiabetes(a),
  },
  {
    id: "complicacoes",
    secao: "saude",
    texto: "Tem alguma complicação do diabetes?",
    curto: "Complicações do diabetes",
    tipo: "em",
    opcoes: [op(NENHUM, "Nenhuma", true), op("olhos", "Nos olhos (retinopatia)"), op("rins", "Nos rins"), op("pes", "Pouca sensibilidade ou feridas nos pés"), op("coracao", "No coração")],
    obrig: "C",
    visivel: (a) => temDiabetes(a),
  },
  // Quedas: idade ≥ 65 ou desconhecida (quem pode ter 65 vê).
  { id: "quedas", secao: "saude", texto: "Você caiu alguma vez nos últimos 12 meses?", curto: "Queda nos últimos 12 meses", tipo: "sn", opcoes: SIM_NAO, obrig: "C", visivel: (a, c) => idadeOuDesconhecida65(a, c.hoje) },
  { id: "instavel", secao: "saude", texto: "Você se sente inseguro(a) ao ficar em pé ou andar?", curto: "Inseguro(a) ao ficar em pé ou andar", tipo: "sn", opcoes: SIM_NAO, obrig: "C", visivel: (a, c) => idadeOuDesconhecida65(a, c.hoje) },
  { id: "medoCair", secao: "saude", texto: "Você tem medo de cair?", curto: "Medo de cair", tipo: "sn", opcoes: SIM_NAO, obrig: "C", visivel: (a, c) => idadeOuDesconhecida65(a, c.hoje) },

  // Parte 4: Dores e lesões (§4.7)
  { id: "dor", secao: "dor", texto: "Você sente alguma dor hoje que atrapalha o treino ou o dia a dia?", curto: "Dor hoje", tipo: "sn", opcoes: SIM_NAO, obrig: "E" },
  {
    id: "dorOnde",
    secao: "dor",
    texto: "Onde dói?",
    curto: "Onde dói",
    tipo: "regioes",
    opcoes: [
      op("pescoco", "Pescoço"),
      op("ombro", "Ombro"),
      op("cotovelo", "Cotovelo"),
      op("punho", "Punho ou mão"),
      op("costasAlta", "Parte de cima ou meio das costas"),
      op("lombar", "Lombar (parte de baixo das costas)"),
      op("quadril", "Quadril ou virilha"),
      op("joelho", "Joelho"),
      op("tornozelo", "Tornozelo ou pé"),
      op("outro", "Outro lugar"),
    ],
    obrig: "C",
    visivel: (a) => a.dor === 1,
  },
  {
    id: "dorNota",
    secao: "dor",
    texto: "De 0 a 10, quanto dói num dia normal? Pense na dor mais forte.",
    curto: "Nota da dor",
    tipo: "esc",
    min: 0,
    max: 10,
    obrig: "C",
    dica: "0 = nada, 10 = a pior dor",
    visivel: (a) => a.dor === 1,
  },
  {
    id: "dorQuando",
    secao: "dor",
    texto: "Quando dói?",
    curto: "Quando dói",
    tipo: "em",
    opcoes: [op("movimento", "Só em alguns movimentos"), op("posTreino", "Depois do treino"), op("parado", "Parado(a), em repouso"), op("noite", "À noite, me acorda"), op("sempre", "O tempo todo")],
    obrig: "C",
    visivel: (a) => a.dor === 1,
  },
  {
    id: "dorDesde",
    secao: "dor",
    texto: "Há quanto tempo?",
    curto: "Há quanto tempo dói",
    tipo: "eu",
    opcoes: [op("ate6s", "Menos de 6 semanas"), op("ate3m", "De 6 semanas a 3 meses"), op("mais3m", "Mais de 3 meses")],
    obrig: "C",
    visivel: (a) => a.dor === 1,
  },
  {
    id: "dorTrauma",
    secao: "dor",
    texto: "Começou depois de uma queda, batida ou acidente?",
    curto: "Começou depois de queda ou batida",
    tipo: "sn",
    opcoes: SIM_NAO,
    obrig: "C",
    visivel: (a) => a.dor === 1 && a.dorDesde === "ate6s",
  },
  {
    id: "dorAlerta",
    secao: "dor",
    texto: "Junto com a dor nas costas, você tem algum destes?",
    curto: "Junto com a dor nas costas",
    tipo: "em",
    opcoes: [
      op(NENHUM, "Nenhum destes", true),
      op("neuro", "Formigamento, dormência ou fraqueza nas pernas"),
      op("sela", "Dormência entre as pernas, na região onde se senta na bicicleta"),
      op("esfincter", "Mudança no controle do xixi ou do cocô"),
      op("sistemico", "Febre ou perda de peso sem explicação"),
      op("cancer", "Já teve câncer"),
      op("trauma", "A dor começou depois de uma queda ou batida forte"),
    ],
    obrig: "C",
    visivel: (a) => dorNasCostas(a),
  },
  {
    id: "lesao",
    secao: "dor",
    texto: "Já teve lesão, fratura ou cirurgia em osso, músculo ou articulação que ainda limita algum movimento?",
    curto: "Lesão que ainda limita",
    tipo: "sn",
    opcoes: SIM_NAO,
    obrig: "E",
  },
  { id: "lesaoQual", secao: "dor", texto: "Qual e onde?", curto: "Qual lesão", tipo: "txt", max: 150, obrig: "O", visivel: (a) => a.lesao === 1 },
  {
    id: "tratamento",
    secao: "dor",
    texto: "Está tratando isso com fisioterapeuta ou médico?",
    curto: "Tratamento",
    tipo: "eu",
    opcoes: [op("nao", "Não"), op("fisio", "Sim, com fisioterapeuta"), op("medico", "Sim, com médico"), op("terminei", "Já terminei o tratamento")],
    obrig: "C",
    visivel: (a) => a.dor === 1 || a.lesao === 1,
  },

  // Parte 5: Seu treino (§4.8)
  {
    id: "objetivo",
    secao: "treino",
    texto: "Qual é o seu objetivo principal?",
    curto: "Objetivo",
    tipo: "eu",
    opcoes: [
      op("massa", "Ganhar massa muscular"),
      op("forca", "Ficar mais forte"),
      op("gordura", "Perder gordura"),
      op("folego", "Ter mais fôlego e disposição"),
      op("saude", "Saúde e qualidade de vida"),
      op("semDor", "Treinar sem dor"),
      op("esporte", "Melhorar num esporte"),
    ],
    obrig: "E",
  },
  {
    id: "experiencia",
    secao: "treino",
    texto: "Somando os períodos em que treinou de verdade, há quanto tempo você faz musculação?",
    curto: "Tempo de musculação",
    tipo: "eu",
    opcoes: [op("nunca", "Nunca treinei"), op("m3", "Menos de 3 meses"), op("m12", "De 3 a 12 meses"), op("a3", "De 1 a 3 anos"), op("mais3", "Mais de 3 anos")],
    obrig: "E",
  },
  {
    id: "parado",
    secao: "treino",
    texto: "Está parado(a) há quanto tempo?",
    curto: "Parado(a) há",
    tipo: "eu",
    opcoes: [op("m1", "Menos de 1 mês"), op("m3", "De 1 a 3 meses"), op("m12", "De 3 a 12 meses"), op("mais12", "Mais de 1 ano")],
    obrig: "C",
    visivel: (a) => (a.regular === "pouco" || a.regular === "nao") && a.experiencia !== undefined && a.experiencia !== "nunca",
  },
  {
    id: "dias",
    secao: "treino",
    texto: "Quantos dias por semana você consegue treinar de verdade?",
    curto: "Dias por semana",
    tipo: "eu",
    opcoes: numeros(1, 7),
    obrig: "E",
    dica: "Melhor um número que você cumpre do que um que você gostaria.",
  },
  {
    id: "minutos",
    secao: "treino",
    texto: "Quanto tempo por treino?",
    curto: "Tempo por treino",
    tipo: "eu",
    opcoes: [op(30, "30 min"), op(45, "45 min"), op(60, "60 min"), op(75, "75 min"), op(90, "90 min")],
    obrig: "E",
  },
  {
    id: "onde",
    secao: "treino",
    texto: "Onde você vai treinar?",
    curto: "Onde vai treinar",
    tipo: "eu",
    opcoes: [op("academia", "Academia completa"), op("condominio", "Academia pequena ou de prédio"), op("casa", "Em casa"), op("livre", "Ao ar livre")],
    obrig: "E",
  },
  {
    id: "equipamentos",
    secao: "treino",
    texto: "O que você tem para treinar?",
    curto: "Equipamentos",
    tipo: "em",
    opcoes: [
      op("nada", "Nada, só o corpo", true),
      op("halteres", "Halteres"),
      op("elasticos", "Elásticos"),
      op("kettlebell", "Kettlebell"),
      op("banco", "Banco"),
      op("barraFixa", "Barra fixa"),
      op("barraAnilhas", "Barra e anilhas"),
    ],
    obrig: "C",
    visivel: (a) => a.onde !== undefined && a.onde !== "academia",
  },
  {
    id: "diasComPersonal",
    secao: "treino",
    texto: "Quantos desses dias você treina com {personal}?",
    curto: "Dias com {personal}",
    tipo: "eu",
    opcoes: numeros(0, 7),
    obrig: "O",
    visivel: (_a, c) => c.atendimento === "misto",
  },
  {
    id: "nutri",
    secao: "treino",
    texto: "Você tem acompanhamento com nutricionista?",
    curto: "Nutricionista",
    tipo: "eu",
    opcoes: [op("sim", "Sim"), op("nao", "Não"), op("gostaria", "Não, mas gostaria")],
    obrig: "E",
  },
  {
    id: "foco",
    secao: "treino",
    texto: "Quer dar mais atenção a alguma parte do corpo? (até 3)",
    curto: "Foco",
    tipo: "em",
    maxSel: 3,
    opcoes: [
      op("gluteos", "Glúteos"),
      op("pernas", "Pernas"),
      op("abdomen", "Abdômen"),
      op("bracos", "Braços"),
      op("costas", "Costas"),
      op("peito", "Peito"),
      op("ombros", "Ombros"),
      op(NENHUM, "Nenhuma em especial", true),
    ],
    obrig: "O",
  },
  {
    id: "naoQuer",
    secao: "treino",
    texto: "Tem algum exercício que você não quer fazer?",
    curto: "Não quer fazer",
    tipo: "em",
    opcoes: [
      op(NENHUM, "Nenhum", true),
      op("agachamento", "Agachamento livre com barra"),
      op("afundo", "Afundo e passada"),
      op("saltos", "Saltos e burpee"),
      op("correr", "Correr (esteira ou rua)"),
      op("barra", "Barra fixa"),
      op("terra", "Levantamento terra"),
      op("abdominal", "Abdominal no chão"),
      op("flexao", "Flexão de braço"),
      op("escada", "Escada"),
    ],
    obrig: "O",
  },
  // "Outro (+ texto)": a lista de códigos não tem "outro"; o texto fica em `naoQuerOutro` (some com "Nenhum").
  {
    id: "naoQuerOutro",
    secao: "treino",
    texto: "Outro exercício que você não quer fazer",
    curto: "Outro que não quer fazer",
    tipo: "txt",
    max: 100,
    obrig: "O",
    visivel: (a) => !(Array.isArray(a.naoQuer) && a.naoQuer.length === 0),
  },
  {
    id: "barreira",
    secao: "treino",
    texto: "O que mais atrapalhou você a treinar antes? (até 2)",
    curto: "O que atrapalhou antes",
    tipo: "em",
    maxSel: 2,
    opcoes: [
      op("tempo", "Falta de tempo"),
      op("cansaco", "Cansaço"),
      op("trabalho", "Trabalho ou estudo"),
      op("familia", "Família e filhos"),
      op("dor", "Dor"),
      op("desanimo", "Desânimo"),
      op("resultado", "Não ver resultado"),
      op("naoSabe", "Não saber o que fazer"),
      op("vergonha", "Vergonha da academia"),
      op("viagens", "Viagens"),
      op("primeira", "Nada, é a primeira vez", true),
    ],
    obrig: "O",
  },

  // Partes extras (§4.9; comportamento na Entrega 2, catálogo completo desde já: são o formato do link)
  {
    id: "sono",
    secao: "rotina",
    texto: "Quantas horas você dorme por noite, em média?",
    curto: "Sono",
    tipo: "eu",
    opcoes: [op("m5", "Menos de 5"), op("h5", "5 a 6"), op("h6", "6 a 7"), op("h7", "7 a 8"), op("mais8", "Mais de 8")],
    obrig: "O",
  },
  { id: "estresse", secao: "rotina", texto: "De 0 a 10, quanto estresse você sente no dia a dia?", curto: "Estresse", tipo: "esc", min: 0, max: 10, obrig: "O" },
  {
    id: "trabalho",
    secao: "rotina",
    texto: "No trabalho ou estudo, você passa a maior parte do tempo…",
    curto: "Trabalho ou estudo",
    tipo: "eu",
    opcoes: [op("sentado", "Sentado(a)"), op("pe", "Em pé"), op("andando", "Andando ou carregando peso"), op("turnos", "Em turnos ou à noite"), op("nenhum", "Não trabalho nem estudo agora")],
    obrig: "O",
  },
  {
    id: "fuma",
    secao: "habitos",
    texto: "Você fuma ou usa cigarro eletrônico?",
    curto: "Cigarro",
    tipo: "eu",
    opcoes: [op("nunca", "Nunca"), op("parouMais6", "Parei há mais de 6 meses"), op("parouMenos6", "Parei há menos de 6 meses"), op("sim", "Sim")],
    obrig: "O",
  },
  {
    id: "alcool",
    secao: "habitos",
    texto: "Com que frequência você bebe álcool?",
    curto: "Álcool",
    tipo: "eu",
    opcoes: [op("nunca", "Nunca"), op("mensal", "1 vez por mês ou menos"), op("2a4mes", "2 a 4 vezes por mês"), op("2a3semana", "2 a 3 vezes por semana"), op("4mais", "4 ou mais vezes por semana")],
    obrig: "O",
  },
  {
    id: "doses",
    secao: "habitos",
    texto: "Num dia em que bebe, quantas doses costuma tomar?",
    curto: "Doses",
    tipo: "eu",
    opcoes: [op("1a2", "1 ou 2"), op("3a4", "3 ou 4"), op("5a6", "5 ou 6"), op("7a9", "7 a 9"), op("10mais", "10 ou mais")],
    obrig: "O",
    visivel: (a) => a.alcool !== undefined && a.alcool !== "nunca",
  },
  {
    id: "restricoes",
    secao: "habitos",
    texto: "Tem alguma restrição para comer?",
    curto: "Restrições para comer",
    tipo: "em",
    opcoes: [
      op(NENHUM, "Nenhuma", true),
      op("vegetariano", "Vegetariano(a)"),
      op("vegano", "Vegano(a)"),
      op("lactose", "Intolerância à lactose"),
      op("celiaca", "Doença celíaca"),
      op("alergia", "Alergia alimentar"),
    ],
    obrig: "O",
  },
  { id: "alergia", secao: "habitos", texto: "Qual?", curto: "Alergia alimentar", tipo: "txt", max: 60, obrig: "O", visivel: (a) => Array.isArray(a.restricoes) && a.restricoes.includes("alergia") },
  { id: "data", secao: "objetivo", texto: "Tem alguma data importante? (casamento, viagem, prova)", curto: "Data importante", tipo: "mes", max: 60, obrig: "O" },
  {
    id: "motivo",
    secao: "objetivo",
    texto: "Por que começar agora?",
    curto: "Por que agora",
    tipo: "em",
    opcoes: [
      op("medica", "Indicação médica"),
      op("saude", "Saúde"),
      op("estetica", "Estética"),
      op("autoestima", "Autoestima"),
      op("dor", "Dor"),
      op("esporte", "Esporte"),
      op("humor", "Humor e disposição"),
      op("evento", "Evento"),
    ],
    obrig: "O",
  },
  { id: "sucesso", secao: "objetivo", texto: "Como você vai saber que deu certo?", curto: "Vai saber que deu certo quando", tipo: "txt", max: 150, obrig: "O" },
  { id: "importancia", secao: "objetivo", texto: "De 0 a 10, quanto isso é importante para você agora?", curto: "Importância", tipo: "esc", min: 0, max: 10, obrig: "O" },
  { id: "confianca", secao: "objetivo", texto: "De 0 a 10, quanto você confia que vai manter os treinos?", curto: "Confiança", tipo: "esc", min: 0, max: 10, obrig: "O" },
  {
    id: "gosta",
    secao: "objetivo",
    texto: "Do que você gosta de fazer?",
    curto: "Gosta de",
    tipo: "em",
    opcoes: [
      op("livres", "Pesos livres"),
      op("maquinas", "Máquinas"),
      op("corpo", "Peso do corpo"),
      op("corrida", "Corrida"),
      op("bike", "Bicicleta"),
      op("intervalado", "Treino intervalado"),
      op("grupo", "Aulas em grupo"),
      op("mobilidade", "Alongamento e mobilidade"),
      op("danca", "Dança"),
    ],
    obrig: "O",
  },
  {
    id: "acompanhamento",
    secao: "objetivo",
    texto: "Como prefere que {personal} acompanhe você?",
    curto: "Acompanhamento",
    tipo: "em",
    opcoes: [op("lembrete", "Lembrete antes do treino"), op("faltar", "Mensagem se eu faltar"), op("semana", "Resumo da semana"), op("pedir", "Só quando eu pedir")],
    obrig: "O",
  },
  { id: "esporte", secao: "esporte", texto: "Qual esporte ou prova?", curto: "Esporte", tipo: "txt", max: 60, obrig: "O" },
  { id: "prova", secao: "esporte", texto: "Tem prova ou competição marcada? Quando?", curto: "Prova", tipo: "mes", obrig: "O" },
  {
    id: "horasSemana",
    secao: "esporte",
    texto: "Quantas horas por semana você pratica?",
    curto: "Horas por semana",
    tipo: "eu",
    opcoes: [op("m2", "Menos de 2"), op("h2a4", "2 a 4"), op("h4a6", "4 a 6"), op("mais6", "Mais de 6")],
    obrig: "O",
  },
  { id: "lesao12", secao: "esporte", texto: "Teve lesão por causa do esporte nos últimos 12 meses?", curto: "Lesão no esporte nos últimos 12 meses", tipo: "sn", opcoes: SIM_NAO, obrig: "O" },
  { id: "lesao12Qual", secao: "esporte", texto: "Qual?", curto: "Qual lesão no esporte", tipo: "txt", max: 100, obrig: "O", visivel: (a) => a.lesao12 === 1 },
  {
    id: "piora",
    secao: "dorMais",
    texto: "O que piora a dor?",
    curto: "O que piora a dor",
    tipo: "em",
    opcoes: [
      op("agachar", "Agachar"),
      op("escada", "Subir ou descer escada"),
      op("emPe", "Ficar muito tempo em pé"),
      op("sentado", "Ficar muito tempo sentado(a)"),
      op("bracoCima", "Levantar o braço acima da cabeça"),
      op("carregar", "Carregar peso"),
      op("impacto", "Correr ou pular"),
    ],
    obrig: "O",
  },
  { id: "evita", secao: "dorMais", texto: "Tem algum movimento que você evita ou não consegue fazer?", curto: "Movimento que evita", tipo: "txt", max: 150, obrig: "O" },
  {
    id: "orientacaoFisio",
    secao: "dorMais",
    texto: "O que o fisioterapeuta ou médico orientou?",
    curto: "O que o fisioterapeuta ou médico orientou",
    tipo: "txt",
    max: 150,
    obrig: "O",
    visivel: (a) => a.tratamento === "fisio" || a.tratamento === "medico",
  },

  // Parte 12: Conferir e enviar (§4.10). declaro, autorização e responsável não são respostas (consent/declaredAt).
  { id: "recado", secao: "enviar", texto: "Quer contar mais alguma coisa para {personal}?", curto: "Recado", tipo: "txt", max: 300, obrig: "O" },
];

function idadeOuDesconhecida65(a: AnamneseAnswers, hoje: Date): boolean {
  const i = idadeDe(a, hoje);
  return i === null || i >= 65;
}

const POR_ID = new Map(PERGUNTAS.map((p) => [p.id, p]));
const SAUDE = new Set<string>(HEALTH_KEYS);
/** Pergunta de saúde (PAR-Q ou chave de HEALTH_KEYS): sem autorização no junto, não é feita nem guardada. */
function ehSaude(id: string): boolean {
  return id.startsWith("parq.") || SAUDE.has(id);
}
/** Opções que são dado referente à saúde fora das partes de saúde (LGPD art. 5º, II; spec §11.2). */
const OPCOES_SAUDE: Partial<Record<keyof AnamneseAnswers, readonly string[]>> = { objetivo: ["semDor"], barreira: ["dor"], motivo: ["medica", "dor"] };
const SECOES_SAUDE: readonly SecaoId[] = ["parq", "saude", "dor"];

// ---- Partes ------------------------------------------------------------------------------------------------------

function modulosEmOrdem(ctx: Pick<CtxQuestionario, "modulos">): Modulo[] {
  const pedidos = new Set(ctx.modulos ?? []);
  return MODULOS.filter((m) => pedidos.has(m));
}

/** Com `a`: dorMais só se dor ou lesao = 1 (sem `a`, fica de fora: não há dor sabida). */
export function secoesDoQuestionario(ctx: CtxQuestionario, a?: AnamneseAnswers): SecaoId[] {
  const comDor = !!a && (a.dor === 1 || a.lesao === 1);
  const out: SecaoId[] = ["voce"];
  if (!ctx.semSaude) out.push("parq", "saude", "dor");
  out.push("treino");
  for (const m of modulosEmOrdem(ctx)) if (m !== "dorMais" || comDor) out.push(m);
  if (ctx.extras.length > 0) out.push("extras");
  out.push("enviar");
  return out;
}

/**
 * Só o que o pedido define (sem dorMais): base de `indice` e `modulos_n` nos eventos. Não pode depender de resposta
 * nem de `ctx.semSaude` (a ausência das partes de saúde revelaria "enviado sem saúde").
 */
export function secoesDoPedido(ctx: CtxQuestionario): SecaoId[] {
  const out: SecaoId[] = ["voce", "parq", "saude", "dor", "treino"];
  for (const m of modulosEmOrdem(ctx)) if (m !== "dorMais") out.push(m);
  if (ctx.extras.length > 0) out.push("extras");
  out.push("enviar");
  return out;
}

function visivelNoCtx(p: Pergunta, a: AnamneseAnswers, ctx: CtxQuestionario): boolean {
  if (ctx.semSaude && ehSaude(p.id)) return false;
  return p.visivel ? p.visivel(a, ctx) : true;
}

/** Opções que aparecem para estas respostas (gestação: "Não se aplica" só com sexo nd ou sem resposta). */
function opcoesVisiveis(p: Pergunta, a: AnamneseAnswers, ctx: CtxQuestionario): Opcao[] | undefined {
  if (!p.opcoes) return undefined;
  let ops = p.opcoes;
  if (p.id === "gestacao" && a.sexo !== "nd" && a.sexo !== undefined) ops = ops.filter((o) => o.v !== "nd");
  const fora = ctx.semSaude ? OPCOES_SAUDE[p.id as keyof AnamneseAnswers] : undefined;
  if (fora) ops = ops.filter((o) => !fora.includes(String(o.v)));
  return ops;
}

/** Perguntas da parte, na ordem, com os nomes trocados e o ano com min/max de hoje. [] se a parte não existe agora. */
export function perguntasVisiveis(secao: SecaoId, a: AnamneseAnswers, ctx: CtxQuestionario): Pergunta[] {
  if (!secoesDoQuestionario(ctx, a).includes(secao)) return [];
  const ano = ctx.hoje.getFullYear();
  return PERGUNTAS.filter((p) => p.secao === secao && visivelNoCtx(p, a, ctx)).map((p) => {
    const q: Pergunta = { ...p, texto: comNomes(p.texto, ctx), curto: comNomes(p.curto, ctx) };
    if (p.dica) q.dica = comNomes(p.dica, ctx);
    if (p.porQue) q.porQue = comNomes(p.porQue, ctx);
    const ops = opcoesVisiveis(p, a, ctx);
    if (ops) q.opcoes = ops;
    if (p.id === "ano") {
      q.min = ano - 100;
      q.max = ano - 10;
    }
    return q;
  });
}

/** Resposta presente? Em listas com "Nenhum(a)", [] conta; "pessoal" conta. */
function respondida(p: Pergunta, v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0 || !!p.opcoes?.some((o) => o.v === NENHUM);
  if (typeof v === "object") return typeof (v as { quando?: unknown }).quando === "string";
  return false;
}

/** Obrigatórias (E e C visíveis) sem resposta, na ordem da tela. */
export function faltando(secao: SecaoId | "todas", a: AnamneseAnswers, ctx: CtxQuestionario): Pergunta[] {
  const secoes = secao === "todas" ? secoesDoQuestionario(ctx, a) : [secao];
  return secoes.flatMap((s) => perguntasVisiveis(s, a, ctx).filter((p) => p.obrig !== "O" && !respondida(p, lerResposta(a, p.id))));
}

// ---- Leitura e gravação ------------------------------------------------------------------------------------------

function indiceParq(id: string): number | null {
  const m = /^parq\.([0-6])$/.exec(id);
  return m ? Number(m[1]) : null;
}

export function lerResposta(a: AnamneseAnswers, id: string): unknown {
  const i = indiceParq(id);
  if (i !== null) return parqRespostas(a)[i];
  if (id.startsWith("extra.")) return undefined; // [E2] perguntas próprias ficam em Anamnese.extras
  return (a as Record<string, unknown>)[id];
}

function sem(a: AnamneseAnswers, chave: string): AnamneseAnswers {
  const out = { ...a } as Record<string, unknown>;
  delete out[chave];
  return out as AnamneseAnswers;
}
function com(a: AnamneseAnswers, chave: string, v: unknown): AnamneseAnswers {
  return { ...a, [chave]: v } as AnamneseAnswers;
}
const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
function paraNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** EM: `v` pode ser a lista inteira (o último item é o tocado agora) ou um código só (alterna). */
function proximaLista(p: Pergunta, atual: unknown, v: unknown): unknown[] | typeof PESSOAL | undefined {
  const ops = p.opcoes ?? [];
  const valido = (x: unknown) => ops.some((o) => o.v === x);
  const exclusiva = (x: unknown) => ops.some((o) => o.v === x && o.exclusiva);
  const deExclusiva = (x: unknown): unknown[] | typeof PESSOAL => (x === PESSOAL ? PESSOAL : x === NENHUM ? [] : [x]);
  let lista: unknown[];
  if (Array.isArray(v)) {
    const ok = v.filter(valido);
    const ultima = ok[ok.length - 1];
    if (ultima !== undefined && exclusiva(ultima)) return deExclusiva(ultima);
    lista = ok.filter((x) => !exclusiva(x));
  } else {
    if (!valido(v)) return undefined; // código fora do catálogo: nada muda
    if (exclusiva(v)) return deExclusiva(v);
    const base = Array.isArray(atual) ? atual.filter((x) => valido(x) && !exclusiva(x)) : [];
    lista = base.includes(v) ? base.filter((x) => x !== v) : [...base, v];
  }
  lista = [...new Set(lista)];
  if (p.maxSel && lista.length > p.maxSel) return undefined; // passou do limite: nada muda
  return lista;
}

function normalizarRegioes(v: unknown, atual: unknown): DorRegiao[] | undefined {
  const regiaoValida = (r: unknown): r is DorRegiao["r"] => typeof r === "string" && (REGIOES as readonly string[]).includes(r);
  if (typeof v === "string") {
    if (!regiaoValida(v)) return undefined;
    const base = Array.isArray(atual) ? (atual as DorRegiao[]) : [];
    return base.some((d) => d.r === v) ? base.filter((d) => d.r !== v) : [...base, { r: v }];
  }
  if (!Array.isArray(v)) return undefined;
  const out: DorRegiao[] = [];
  for (const d of v) {
    if (typeof d !== "object" || d === null || !regiaoValida((d as DorRegiao).r) || out.some((x) => x.r === (d as DorRegiao).r)) continue;
    const { r, l, t } = d as DorRegiao;
    const item: DorRegiao = { r };
    if (l && (REGIOES_COM_LADO as readonly string[]).includes(r) && (LADOS as readonly string[]).includes(l)) item.l = l;
    if (r === "outro" && typeof t === "string" && t.trim()) item.t = t.slice(0, REGIAO_OUTRO_MAX);
    out.push(item);
  }
  return out;
}

/** Imutável; opção exclusiva limpa as outras. Valor vazio (undefined, null, "") apaga a resposta. */
export function gravarResposta(a: AnamneseAnswers, id: string, v: unknown): AnamneseAnswers {
  const iParq = indiceParq(id);
  if (iParq !== null) {
    // Nunca completa o PAR-Q com "Não": guarda só as posições respondidas (array esparso) até as 7 existirem.
    const val = v === true ? 1 : v === false ? 0 : v;
    if (!vazio(val) && val !== 0 && val !== 1) return a;
    const atual = parqRespostas(a);
    atual[iParq] = vazio(val) ? undefined : (val as SN);
    if (atual.every((x) => x === undefined)) return sem(a, "parq");
    const esparso = new Array(7) as SN[];
    atual.forEach((x, i) => {
      if (x !== undefined) esparso[i] = x;
    });
    return com(a, "parq", esparso as unknown as Parq);
  }
  const p = POR_ID.get(id);
  if (!p) return a;
  if (vazio(v)) return sem(a, id);
  switch (p.tipo) {
    case "sn": {
      const n = v === true ? 1 : v === false ? 0 : paraNumero(v);
      return n === 0 || n === 1 ? com(a, id, n) : a;
    }
    case "sn3":
    case "eu": {
      const o = p.opcoes?.find((x) => String(x.v) === String(v));
      return o ? com(a, id, o.v) : a;
    }
    case "em": {
      const lista = proximaLista(p, lerResposta(a, id), v);
      return lista === undefined ? a : com(a, id, lista);
    }
    case "esc": {
      const n = paraNumero(v);
      return n !== null && Number.isInteger(n) && n >= (p.min ?? 0) && n <= (p.max ?? 10) ? com(a, id, n) : a;
    }
    case "num": {
      const n = paraNumero(v);
      if (n === null) return sem(a, id);
      // O ano guarda a faixa do esquema do link (ANO_GUARDADO); a faixa da tela é conferida por `erroAno`.
      if (id === "ano") return Number.isInteger(n) && n >= ANO_GUARDADO.min && n <= ANO_GUARDADO.max ? com(a, id, n) : sem(a, id);
      if ((p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) return sem(a, id);
      return com(a, id, id === "peso" ? Math.round(n * 10) / 10 : Math.round(n));
    }
    case "txt":
      return typeof v === "string" ? com(a, id, p.max ? v.slice(0, p.max) : v) : a;
    case "mes": {
      const mesOk = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
      if (id === "data") {
        const o = v as { quando?: unknown; texto?: unknown };
        if (typeof o !== "object" || !mesOk(o.quando)) return a;
        const texto = typeof o.texto === "string" && o.texto.trim() ? o.texto.slice(0, p.max ?? 60) : undefined;
        return com(a, id, texto ? { quando: o.quando, texto } : { quando: o.quando });
      }
      return mesOk(v) ? com(a, id, v) : a;
    }
    case "regioes": {
      const lista = normalizarRegioes(v, lerResposta(a, id));
      return lista === undefined ? a : com(a, id, lista);
    }
  }
}

/**
 * Erro do ano para o "Continuar" da parte Você: ERRO_ANO quando o texto digitado (ou o ano guardado) não é um ano de
 * 4 algarismos entre (ano atual − 100) e (ano atual − 10); null se estiver vazio (aí quem avisa é `faltando`) ou válido.
 */
export function erroAno(valor: unknown, hoje: Date): string | null {
  if (vazio(valor)) return null;
  const n = typeof valor === "string" && !/^\s*\d{4}\s*$/.test(valor) ? null : paraNumero(valor);
  const atual = hoje.getFullYear();
  return n !== null && Number.isInteger(n) && n >= atual - 100 && n <= atual - 10 ? null : ERRO_ANO;
}

/** Tira respostas de perguntas (e opções) que ficaram invisíveis, até estabilizar (ex.: sexo M tira a gestação). */
export function limparOcultas(a: AnamneseAnswers, ctx: CtxQuestionario): AnamneseAnswers {
  let atual = a;
  for (let volta = 0; volta < 6; volta++) {
    const secoes = new Set(secoesDoQuestionario(ctx, atual));
    let prox = atual;
    if (!secoes.has("parq") && prox.parq !== undefined) prox = sem(prox, "parq");
    for (const p of PERGUNTAS) {
      const v = lerResposta(prox, p.id);
      if (v === undefined) continue;
      if (!secoes.has(p.secao) || !visivelNoCtx(p, prox, ctx)) {
        prox = sem(prox, p.id);
        continue;
      }
      const ops = opcoesVisiveis(p, prox, ctx);
      if (!ops || ops.length === p.opcoes?.length || (p.tipo !== "eu" && p.tipo !== "em")) continue;
      const ok = (x: unknown) => ops.some((o) => o.v === x);
      if (p.tipo === "eu" && !ok(v)) prox = sem(prox, p.id);
      else if (p.tipo === "em" && Array.isArray(v) && v.some((x) => !ok(x))) {
        const resto = v.filter(ok);
        prox = resto.length || ops.some((o) => o.v === NENHUM) ? com(prox, p.id, resto) : sem(prox, p.id);
      }
    }
    if (prox === atual) return atual;
    atual = prox;
  }
  return atual;
}

/** A opção aparece marcada? Em listas, "Nenhum(a)" = `[]` e "Prefiro falar pessoalmente" = `"pessoal"`. */
export function opcaoMarcada(p: Pergunta, a: AnamneseAnswers, v: string | number): boolean {
  const atual = lerResposta(a, p.id);
  if (p.tipo === "em") {
    if (v === NENHUM) return Array.isArray(atual) && atual.length === 0;
    if (v === PESSOAL) return atual === PESSOAL;
    return Array.isArray(atual) && atual.includes(v);
  }
  if (p.tipo === "regioes") return Array.isArray(atual) && (atual as DorRegiao[]).some((d) => d.r === v);
  return atual === v;
}

/** "Uns N minutos": núcleo 4; + MODULO_MINUTOS; + 0,3 por pergunta própria; para cima. */
export function estimarMinutos(ctx: Pick<CtxQuestionario, "modulos" | "extras" | "reavaliacao">): number {
  const mods = modulosEmOrdem({ modulos: ctx.modulos ?? [] }).reduce((s, m) => s + MODULO_MINUTOS[m], 0);
  const total = 4 + mods + 0.3 * (ctx.extras?.length ?? 0);
  return Math.ceil(Math.round(total * 100) / 100);
}

/** PAR-Q 2, 3 e 4 (posições 1 a 3): "Sim" em qualquer uma dispara o aviso do SAMU. */
const PARQ_SAMU = [1, 2, 3] as const;
const sintomaSamu = (a: AnamneseAnswers) => Array.isArray(a.sintomas) && (a.sintomas.includes("peito") || a.sintomas.includes("tontura"));
/** Sela ou esfíncter numa pergunta à vista (resposta antiga de `dorAlerta`, ainda não limpa, não dispara). */
const colunaUrgente = (a: AnamneseAnswers) => dorNasCostas(a) && Array.isArray(a.dorAlerta) && (a.dorAlerta.includes("sela") || a.dorAlerta.includes("esfincter"));

/** Avisos na própria tela do aluno (spec §4.6 e §4.7), sem esperar o personal. */
export function avisosImediatos(a: AnamneseAnswers): ("samu" | "coluna")[] {
  const out: ("samu" | "coluna")[] = [];
  const pq = parqRespostas(a);
  if (sintomaSamu(a) || PARQ_SAMU.some((i) => pq[i] === 1)) out.push("samu");
  if (colunaUrgente(a)) out.push("coluna");
  return out;
}

/**
 * Aviso imediato que entra logo abaixo da pergunta `id` (track D: `role="alert"`, texto de AVISO_TEXTO), ou null.
 * Uma vez por parte, embaixo da pergunta que disparou: no PAR-Q, a primeira entre 2, 3 e 4 com "Sim"; na parte Saúde,
 * `sintomas` (peito ou tontura); em Dores e lesões, `dorAlerta` (sela ou esfíncter). Mesmas regras de `avisosImediatos`.
 */
export function avisoAbaixoDe(id: string, a: AnamneseAnswers): "samu" | "coluna" | null {
  if (id === "sintomas") return sintomaSamu(a) ? "samu" : null;
  if (id === "dorAlerta") return colunaUrgente(a) ? "coluna" : null;
  const i = indiceParq(id);
  if (i === null) return null;
  const pq = parqRespostas(a);
  return PARQ_SAMU.find((k) => pq[k] === 1) === i ? "samu" : null;
}

// ---- Leitura humana ------------------------------------------------------------------------------------------------

const UNIDADE: Record<string, string> = { altura: " cm", peso: " kg", semanas: " semanas" };
function fmtNumero(n: number): string {
  return String(n).replace(".", ",");
}
function fmtMes(s: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  return m ? `${m[2]}/${m[1]}` : s;
}
/** Rótulo literal da opção (para "Veio de: pergunta → resposta"). */
export function rotuloOpcao(id: string, v: unknown): string | null {
  return POR_ID.get(id)?.opcoes?.find((o) => o.v === v)?.rotulo ?? null;
}
/** Pergunta curta da chave (sem trocar nomes). */
export function curtoDe(id: string): string {
  const i = indiceParq(id);
  if (i !== null) return CURTO_PARQ[i] ?? id;
  return POR_ID.get(id)?.curto ?? id;
}

/** A resposta como o aluno viu (rótulos literais). null = sem resposta. */
export function respostaLegivel(p: Pergunta, a: AnamneseAnswers): string | null {
  const v = lerResposta(a, p.id);
  if (vazio(v)) return null;
  const rotulo = (x: unknown) => p.opcoes?.find((o) => o.v === x)?.rotulo ?? null;
  switch (p.tipo) {
    case "sn":
      return v === 1 ? "Sim" : v === 0 ? "Não" : null;
    case "sn3":
    case "eu":
      return rotulo(v);
    case "em": {
      if (v === PESSOAL) return rotulo(PESSOAL);
      if (!Array.isArray(v)) return null;
      if (v.length === 0) return rotulo(NENHUM);
      const nomes = v.map(rotulo).filter((x): x is string => !!x);
      return nomes.length ? nomes.join(", ") : null;
    }
    case "esc":
      return typeof v === "number" ? String(v) : null;
    case "num":
      return typeof v === "number" ? fmtNumero(v) + (UNIDADE[p.id] ?? "") : null;
    case "txt":
      return typeof v === "string" ? v.trim() || null : null;
    case "mes": {
      if (typeof v === "string") return fmtMes(v);
      const o = v as { quando?: string; texto?: string };
      if (typeof o?.quando !== "string") return null;
      return o.texto ? `${o.texto.trim()} em ${fmtMes(o.quando)}` : fmtMes(o.quando);
    }
    case "regioes": {
      if (!Array.isArray(v) || v.length === 0) return null;
      return (v as DorRegiao[])
        .map((d) => {
          const nome = rotulo(d.r) ?? d.r;
          if (d.r === "outro") return d.t ? `${nome}: ${d.t}` : nome;
          return d.l ? `${nome} (${LADO_ROTULO[d.l]})` : nome;
        })
        .join(", ");
    }
  }
}

/** A resposta legível pela chave (inclusive "parq.N"). null = sem resposta. */
export function respostaDe(a: AnamneseAnswers, id: string): string | null {
  const i = indiceParq(id);
  if (i !== null) {
    const v = parqRespostas(a)[i];
    return v === 1 ? "Sim" : v === 0 ? "Não" : null;
  }
  const p = POR_ID.get(id);
  return p ? respostaLegivel(p, a) : null;
}

/**
 * Bloco "Respostas completas" e "Ver minhas respostas": texto literal da pergunta e a resposta. Aceita uma rodada
 * (`Anamnese`) ou o rascunho (`{ a, pulados }`): a tela "Conferir e enviar" mostra o que o aluno respondeu, antes de
 * qualquer `stripHealth`.
 */
export function respostasPorParte(an: Pick<Anamnese, "a" | "pulados">, ctx: CtxQuestionario): { secao: SecaoId; titulo: string; itens: { pergunta: string; resposta: string }[] }[] {
  const a = an.a;
  const pulados = new Set(an.pulados ?? []);
  const out: { secao: SecaoId; titulo: string; itens: { pergunta: string; resposta: string }[] }[] = [];
  for (const secao of secoesDoQuestionario(ctx, a)) {
    const titulo = comNomes(SECAO_TITULO[secao], ctx);
    if ((MODULOS as readonly string[]).includes(secao) && pulados.has(secao as Modulo)) {
      out.push({ secao, titulo, itens: [{ pergunta: titulo, resposta: RESPOSTA_PULOU_PARTE }] });
      continue;
    }
    const itens = perguntasVisiveis(secao, a, ctx).flatMap((p) => {
      const r = respostaLegivel(p, a);
      if (r !== null) return [{ pergunta: p.texto, resposta: r }];
      return p.obrig === "O" ? [] : [{ pergunta: p.texto, resposta: RESPOSTA_PULOU }];
    });
    if (itens.length) out.push({ secao, titulo, itens });
  }
  return out;
}

/**
 * Sem autorização de saúde (ou revogada): tira HEALTH_KEYS, o termo, a autorização, overrides e "Conversei";
 * marca `healthOmitted`. Também o que é dado referente à saúde fora das partes de saúde (LGPD art. 5º, II):
 * objetivo "semDor" → "saude"; sai "dor" de barreira; saem "medica" e "dor" de motivo.
 */
export function stripHealth(an: Anamnese): Anamnese {
  const a = { ...an.a } as Record<string, unknown>;
  for (const k of HEALTH_KEYS) delete a[k];
  if (a.objetivo === "semDor") a.objetivo = "saude";
  const tirar = (chave: "barreira" | "motivo", fora: readonly string[]) => {
    const v = a[chave];
    if (!Array.isArray(v)) return;
    const resto = v.filter((x) => !fora.includes(x));
    if (resto.length) a[chave] = resto;
    else delete a[chave];
  };
  tirar("barreira", ["dor"]);
  tirar("motivo", ["medica", "dor"]);
  const out: Anamnese = { ...an, a: a as AnamneseAnswers, healthOmitted: true };
  delete out.termo;
  delete out.consent;
  delete out.overrides;
  delete out.conversei;
  const incompleto = (an.incompleto ?? []).filter((s) => !SECOES_SAUDE.includes(s) && s !== "dorMais");
  if (incompleto.length) out.incompleto = incompleto;
  else delete out.incompleto;
  return out;
}

/** [E2] Só seções perguntadas nas duas rodadas; chaves herdadas ficam fora. Não implementar na Entrega 1. */
export function diffAnswers(prev: Anamnese, cur: Anamnese, hoje: Date): string[] {
  return [];
}

/** [E2] Reavaliação "saude": copia chaves fora de HEALTH_KEYS não perguntadas e grava `herdado`. Não implementar na Entrega 1. */
export function herdarDaAnterior(prev: Anamnese, cur: Anamnese): Anamnese {
  return cur;
}

/** Gatilho clínico de nutricionista (spec §6.5): diabetes 1 ou 2, rins, transtorno alimentar, gestante, remédio para emagrecer, doença celíaca. */
export function gatilhoNutricionista(an: Anamnese | undefined): boolean {
  if (!an || an.healthOmitted) return false;
  const a = an.a;
  return (
    condicoesDe(a).some((c) => c === "diabetes1" || c === "diabetes2" || c === "rins" || c === "alimentar") ||
    a.gestacao === "gravida" ||
    remediosDe(a).includes("emagrecer") ||
    (Array.isArray(a.restricoes) && a.restricoes.includes("celiaca"))
  );
}

/** Contexto de leitura de uma rodada já respondida (sem autorização de saúde, as partes de saúde ficam de fora). */
export function ctxDe(an: Anamnese, i: { hoje: Date; personal: string; aluno: string; atendimento?: Atendimento }): CtxQuestionario {
  const ctx: CtxQuestionario = { hoje: i.hoje, modo: an.via, modulos: an.modulos, atendimento: i.atendimento, reavaliacao: an.reavaliacao, personal: i.personal, aluno: i.aluno, extras: [] };
  if (an.healthOmitted) ctx.semSaude = true;
  return ctx;
}
