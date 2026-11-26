/**
 * Tipos do questionário inicial ("anamnese" no código; "Questionário inicial" na interface, DECISIONS 2026-11-23 §1).
 * Fundação (F0): nenhum track edita este arquivo; mudança de tipo passa pelo dono da fundação.
 * Puro (sem React): serve o catálogo, a triagem, o resumo, os pacotes de link e o gerador.
 * Itens marcados [E2] existem no formato dos dados (link e aparelho) mas só ganham comportamento na Entrega 2.
 */
import type { GenerateInput } from "./generator";
import type { SystemId } from "./types";

export const ANAMNESE_V = 1; // catálogo de perguntas e códigos (vai como catalogV e anamnese.v)
export const PARQ_TEXT_ID = "sp-16724-2018";
export const CONSENT_TEXT_ID = "c1";
export const RULES_VERSION = 1;
/**
 * Data de publicação da Entrega 1 (`aluno_novo` em `ficha_link_sent` e filtro das métricas, spec §13).
 * Provisória: a data da fundação. A costura troca pela data real de publicação.
 */
export const QUESTIONARIO_DESDE = "2026-11-26";
/** Exemplo do /testar (`sample`) ou da demonstração (ids `demo-*`, sem `sample`): nenhum pedido real e nenhum evento. */
export function ehExemplo(p: { id: string; sample?: boolean }): boolean {
  return p.sample === true || p.id.startsWith("demo-");
}

export const MODULOS = ["rotina", "habitos", "objetivo", "esporte", "dorMais"] as const; // [E2] partes extras
export type Modulo = (typeof MODULOS)[number];
export const MODULO_MINUTOS: Record<Modulo, number> = { rotina: 0.5, habitos: 0.5, objetivo: 1.5, esporte: 0.5, dorMais: 0.5 };
export const SECOES = ["voce", "parq", "saude", "dor", "treino", "rotina", "habitos", "objetivo", "esporte", "dorMais", "extras", "enviar"] as const;
export type SecaoId = (typeof SECOES)[number];

export const CONDICOES = ["coracao", "avc", "circulacao", "pressao", "diabetes1", "diabetes2", "prediabetes", "rins", "respiratoria", "cancer", "osteoporose", "artrose", "alimentar", "outra"] as const;
export type Condicao = (typeof CONDICOES)[number];
export const SINTOMAS = ["peito", "faltaAr", "tontura", "deitar", "inchaco", "palpitacao", "panturrilha", "sopro", "cansaco"] as const;
export type Sintoma = (typeof SINTOMAS)[number];
export const REMEDIOS = ["pressao", "coracao", "betabloqueador", "diuretico", "insulina", "diabetes", "colesterol", "anticoagulante", "emagrecer", "corticoide", "bombinha", "outro"] as const;
export type Remedio = (typeof REMEDIOS)[number];
export const REGIOES = ["pescoco", "ombro", "cotovelo", "punho", "costasAlta", "lombar", "quadril", "joelho", "tornozelo", "outro"] as const;
export type Regiao = (typeof REGIOES)[number];
export const REGIOES_COM_LADO = ["ombro", "cotovelo", "punho", "quadril", "joelho", "tornozelo"] as const;
export const LADOS = ["d", "e", "ambos"] as const;
export type Lado = (typeof LADOS)[number];
export const DOR_QUANDO = ["movimento", "posTreino", "parado", "noite", "sempre"] as const;
export type DorQuando = (typeof DOR_QUANDO)[number];
export const DOR_ALERTAS = ["neuro", "sela", "esfincter", "sistemico", "cancer", "trauma"] as const;
export type DorAlerta = (typeof DOR_ALERTAS)[number];
export const COMPLICACOES = ["olhos", "rins", "pes", "coracao"] as const;
export type Complicacao = (typeof COMPLICACOES)[number];
export const OBJETIVOS = ["massa", "forca", "gordura", "folego", "saude", "semDor", "esporte"] as const;
export type Objetivo = (typeof OBJETIVOS)[number];
export const EXPERIENCIAS = ["nunca", "m3", "m12", "a3", "mais3"] as const;
export type Experiencia = (typeof EXPERIENCIAS)[number];
export const PARADOS = ["m1", "m3", "m12", "mais12"] as const;
export type Parado = (typeof PARADOS)[number];
export const ONDES = ["academia", "condominio", "casa", "livre"] as const;
export type Onde = (typeof ONDES)[number];
export const EQUIPAMENTOS = ["nada", "halteres", "elasticos", "kettlebell", "banco", "barraFixa", "barraAnilhas"] as const;
export type Equipamento = (typeof EQUIPAMENTOS)[number];
export const FOCOS = ["gluteos", "pernas", "abdomen", "bracos", "costas", "peito", "ombros"] as const;
export type Foco = (typeof FOCOS)[number];
export const NAO_QUER = ["agachamento", "afundo", "saltos", "correr", "barra", "terra", "abdominal", "flexao", "escada"] as const;
export type NaoQuer = (typeof NAO_QUER)[number];
export const BARREIRAS = ["tempo", "cansaco", "trabalho", "familia", "dor", "desanimo", "resultado", "naoSabe", "vergonha", "viagens", "primeira"] as const;
export type Barreira = (typeof BARREIRAS)[number];
export const SONOS = ["m5", "h5", "h6", "h7", "mais8"] as const;
export type Sono = (typeof SONOS)[number];
export const TRABALHOS = ["sentado", "pe", "andando", "turnos", "nenhum"] as const;
export type Trabalho = (typeof TRABALHOS)[number];
export const FUMOS = ["nunca", "parouMais6", "parouMenos6", "sim"] as const;
export type Fumo = (typeof FUMOS)[number];
export const ALCOOIS = ["nunca", "mensal", "2a4mes", "2a3semana", "4mais"] as const;
export type Alcool = (typeof ALCOOIS)[number];
export const DOSES = ["1a2", "3a4", "5a6", "7a9", "10mais"] as const;
export type Doses = (typeof DOSES)[number];
export const RESTRICOES = ["vegetariano", "vegano", "lactose", "celiaca", "alergia"] as const;
export type Restricao = (typeof RESTRICOES)[number];
export const MOTIVOS = ["medica", "saude", "estetica", "autoestima", "dor", "esporte", "humor", "evento"] as const;
export type Motivo = (typeof MOTIVOS)[number];
export const GOSTOS = ["livres", "maquinas", "corpo", "corrida", "bike", "intervalado", "grupo", "mobilidade", "danca"] as const;
export type Gosto = (typeof GOSTOS)[number];
export const ACOMPANHAMENTOS = ["lembrete", "faltar", "semana", "pedir"] as const;
export type Acompanhamento = (typeof ACOMPANHAMENTOS)[number];
export const HORAS_ESPORTE = ["m2", "h2a4", "h4a6", "mais6"] as const;
export type HorasEsporte = (typeof HORAS_ESPORTE)[number];
export const PIORAS = ["agachar", "escada", "emPe", "sentado", "bracoCima", "carregar", "impacto"] as const;
export type Piora = (typeof PIORAS)[number];
export const ATENDIMENTOS = ["academia", "casa", "online", "misto", "turmas"] as const;
export type Atendimento = (typeof ATENDIMENTOS)[number];
export const PUBLICOS = ["emagrecimento", "hipertrofia", "saude60", "mulheres", "dor", "esporte"] as const;
export type Publico = (typeof PUBLICOS)[number];
export const ALIMENTACOES = ["encaminho", "parceiro", "orientacoes"] as const;
export type Alimentacao = (typeof ALIMENTACOES)[number];

export type SN = 0 | 1;
export type Parq = [SN, SN, SN, SN, SN, SN, SN];
/** t só quando r === "outro" (até 60 caracteres). */
export interface DorRegiao {
  r: Regiao;
  l?: Lado;
  t?: string;
}

/** Tudo opcional: o modo junto aceita resposta incompleta. Obrigatoriedade = faltando() do catálogo. [] em listas com opção "Nenhum(a)" exclusiva. */
export interface AnamneseAnswers {
  nome?: string; ano?: number; sexo?: "F" | "M" | "nd"; altura?: number; peso?: number; responsavel?: string;
  parq?: Parq; parqDetalhe?: string;
  regular?: "sim3m" | "simRecente" | "pouco" | "nao";
  condicoes?: Condicao[] | "pessoal"; condicaoOutra?: string;
  sintomas?: Sintoma[];
  remedios?: SN | "pessoal"; remediosPara?: Remedio[]; remediosNomes?: string;
  cirurgia?: SN; cirurgiaQual?: string;
  orientacao?: "nao" | "livre" | "restricao" | "pausa"; orientacaoQual?: string;
  gestacao?: "nao" | "gravida" | "pp3" | "pp12" | "nd"; obstetra?: "sim" | "naoPerguntei" | "pediuNao"; semanas?: number; assoalho?: SN;
  pressaoControle?: "controlada" | "asVezes" | "alta" | "naoSei";
  hipo?: "nunca" | "asVezes" | "frequente";
  complicacoes?: Complicacao[];
  quedas?: SN; instavel?: SN; medoCair?: SN;
  dor?: SN; dorOnde?: DorRegiao[]; dorNota?: number; dorQuando?: DorQuando[]; dorDesde?: "ate6s" | "ate3m" | "mais3m"; dorTrauma?: SN; dorAlerta?: DorAlerta[];
  lesao?: SN; lesaoQual?: string; tratamento?: "nao" | "fisio" | "medico" | "terminei";
  objetivo?: Objetivo; experiencia?: Experiencia; parado?: Parado;
  dias?: number; minutos?: 30 | 45 | 60 | 75 | 90; onde?: Onde; equipamentos?: Equipamento[];
  diasComPersonal?: number; nutri?: "sim" | "nao" | "gostaria";
  foco?: Foco[]; naoQuer?: NaoQuer[]; naoQuerOutro?: string; barreira?: Barreira[];
  // [E2] partes extras (rotina, hábitos, objetivo em detalhe, esporte, dor em detalhe)
  sono?: Sono; estresse?: number; trabalho?: Trabalho;
  fuma?: Fumo; alcool?: Alcool; doses?: Doses; restricoes?: Restricao[]; alergia?: string;
  data?: { quando: string; texto?: string }; motivo?: Motivo[]; sucesso?: string; importancia?: number; confianca?: number; gosta?: Gosto[]; acompanhamento?: Acompanhamento[];
  esporte?: string; prova?: string; horasSemana?: HorasEsporte; lesao12?: SN; lesao12Qual?: string;
  piora?: Piora[]; evita?: string; orientacaoFisio?: string;
  recado?: string;
}

export type AlertId =
  | "A-PEITO" | "A-TONTURA" | "A-SINTOMA" | "A-SUPERVISAO" | "A-PAUSA" | "A-OBSTETRA" | "A-COLUNA-URG"
  | "A-COLUNA" | "A-DOENCA" | "A-PARQ7" | "A-GESTANTE" | "A-HIPO" | "A-DIAB-COMP" | "A-DOR-FORTE" | "A-DOR-TRAUMA" | "A-PARQ-INCOMPLETO" | "A-SEM-TRIAGEM"
  | "A-DOENCA-ATIVO" | "A-PRESSAO" | "A-PESSOAL" | "A-POSPARTO" | "A-QUEDA"
  | "A-PARQ-SIM" | "A-GESTANTE-OK" | "A-CANCER" | "A-ALIMENTAR" | "A-CIRURGIA"
  | "A-70" | "A-MENOR"; // 29 ids: A-INATIVO virou a observação O-INATIVO e A-CIRURGIA é azul (D-30)

export interface Anamnese {
  v: number; // ANAMNESE_V de quando foi respondida
  id: string; // rodada de respostas; no link = PedidoPacket.id (idempotência)
  answeredAt: string;
  receivedAt?: string;
  by: "aluno" | "personal";
  via: "link" | "junto";
  reavaliacao?: "saude" | "tudo"; // [E2]
  modulos: Modulo[];
  pulados?: Modulo[];
  incompleto?: SecaoId[];
  healthOmitted?: boolean;
  parqText: string; // PARQ_TEXT_ID mostrado
  a: AnamneseAnswers;
  extras?: { q: string; r?: string }[]; // [E2] perguntas próprias do personal
  consent?: { at: string; source: "aluno_questionario" | "personal"; textId: string; responsavel?: { nome: string; at: string } };
  declaredAt?: string;
  termo?: { at: string; nome: string };
  overrides?: { at: string; alertas: AlertId[] }[]; // "Seguir mesmo assim" (laranja)
  conversei?: { at: string; alertas: AlertId[] }; // A-PESSOAL
  vistoEm?: string; // tira o selo "Respostas novas"
  herdado?: { de: string; answeredAt: string; chaves: (keyof AnamneseAnswers)[] }; // [E2] reavaliação "saude": respostas copiadas da rodada anterior
}
export type AnamneseLink = Omit<Anamnese, "receivedAt" | "overrides" | "conversei" | "vistoEm">;

export interface Liberacao {
  id: string;
  por: "medico" | "obstetra" | "fisio" | "outro";
  data: string; // AAAA-MM-DD informada, nunca futura
  restricoes?: string; // ≤ 200
  alertas: AlertId[]; // cobertos
  registradoEm: string; // ISO
  validaAte?: string; // [E2] AAAA-MM-DD; A-DOENCA-ATIVO: data + 12 meses
}

export interface AnamnesePedido {
  id: string;
  at: string;
  modulos: Modulo[];
  reavaliacao?: "saude" | "tudo";
  packed: string;
}

export interface WorkStyle {
  atendimento?: Atendimento;
  publico?: Publico[]; // ≤ 2
  dias?: 2 | 3 | 4 | 5;
  minutos?: 30 | 45 | 60 | 75;
  semanas?: 4 | 6 | 8 | 12;
  alimentacao?: Alimentacao;
  divisao?: SystemId; // só por Conta ou sugestão aceita
  modulos?: Modulo[]; // ausente = deriva de atendimento + público
  letraMaior?: boolean; // [E2] ausente = deriva (saude60)
  perguntas?: string[]; // [E2] ≤ 3 × ≤ 100
  sugestoesDispensadas?: string[]; // [E2] "divisao:abc", "semanas:8"
  definidoEm?: string;
  puladoEm?: string;
}

export type NivelAlerta = "vermelho" | "laranja" | "amarelo" | "azul" | "lembrete";
/** "Veio de: pergunta → resposta". */
export interface Origem {
  pergunta: string;
  resposta: string;
}
export interface Alerta {
  id: AlertId;
  nivel: NivelAlerta;
  titulo: string;
  recomendado: string;
  porque: Origem[];
  base: string;
  efeito: "trava" | "porta" | "teto" | "token" | "info";
  coberto?: { por: Liberacao["por"] | "override" | "conversei"; data: string; restricoes?: string };
  liberacaoAnterior?: { id: string; data: string }; // liberação que cobria, mas é anterior a estas respostas
}
export interface ItemResumo {
  id: string;
  texto: string;
  porque: Origem[];
  base: string;
  naFicha?: string;
}
export interface Resumo {
  origem: string;
  velho: boolean;
  alertas: Alerta[];
  semAlertasTexto: string | null; // "Nenhum sinal de alerta nas respostas de DD/MM. Isso não substitui a avaliação presencial."
  perfil: string;
  atencao: ItemResumo[]; // [E2] bloco 4
  conferir: { titulo: "Na primeira aula, conferir" | "Na primeira conversa, perguntar"; itens: ItemResumo[] }; // [E2] bloco 5
  disse: ItemResumo[]; // [E2] bloco 6
  extras: { q: string; r?: string }[]; // [E2] bloco 7
  falta: string[];
  mudou: { desde: string; alertasNovos: AlertId[]; alertasSairam: AlertId[]; respostas: string[] } | null; // [E2]
  sinaisParar: string | null;
  escondePeso: boolean;
  problema?: "versao_nova" | "invalida"; // readAnamnese não leu: só a frase de spec.md §6.1; o gerador trata como trava
}

export type StepId =
  | "liberacao"
  | "triagem_presencial"
  | "questionario"
  | "termo"
  | "nutricionista_clinico"
  | "gerar_ficha"
  | "enviar_ficha"
  | "avaliacao"
  | "checkin" // [E2]
  | "nutricionista" // [E2]
  | "dieta"
  | "reavaliar" // [E2]
  | "atualizar_saude"; // [E2]
export type AcaoPasso =
  | { tipo: "href"; rotulo: string; href: string }
  | { tipo: "pedir"; rotulo: string; reavaliacao?: "saude" | "tudo"; lembrete?: boolean }
  | { tipo: "liberacao"; rotulo: string }
  | { tipo: "avisar"; rotulo: string; texto: string }
  | { tipo: "termo"; rotulo: string }
  | { tipo: "whatsapp"; rotulo: string; texto: string }
  | { tipo: "enviar_ficha"; rotulo: string }
  | { tipo: "aba"; rotulo: string; aba: "ficha" | "dieta" | "evolucao" }
  | { tipo: "feito"; rotulo: string };
export interface Passo {
  id: StepId;
  titulo: string;
  sub?: string;
  acoes: AcaoPasso[];
  clinico: boolean;
}

export type CampoMescla = "name" | "birthYear" | "sex" | "heightCm" | "weightKg" | "goal" | "level" | "daysPerWeek" | "sessionMinutes" | "equipment" | "activity" | "emphasis";
export type EscolhaMescla = "cadastro" | "resposta";
export type Escolhas = Partial<Record<CampoMescla, EscolhaMescla>> & { limitacoes?: "aplicar" | "manter" };
/** excede: texto > 1.000 → limitações não mudam. */
export interface DiffLimitacoes {
  sai: string[];
  entra: string[];
  texto: string;
  doApp: string[];
  excede: boolean;
}
export interface Diferenca {
  campo: CampoMescla;
  rotulo: string;
  cadastro: string;
  resposta: string;
  padrao: EscolhaMescla;
}

export interface MotivoFicha {
  texto: string;
  porque: Origem[];
}
export interface FichaSugerida {
  input: Partial<GenerateInput>; // goal, level, daysPerWeek (2–6), sessionMinutes, equipment, system, limitations, emphasis, avoidIds, intensityCap
  durationWeeks?: number;
  motivos: MotivoFicha[];
  naoAdaptado: string[];
  tetoMotivo: string | null;
  cuidados: string[];
  avisos: string[];
  nivelNota?: string;
  resumoCurto: string; // "ABC · 4×60 min · sem extensora" (sub do passo gerar_ficha)
}

export interface CtxQuestionario {
  hoje: Date;
  modo: "link" | "junto";
  modulos: Modulo[];
  atendimento?: Atendimento;
  reavaliacao?: "saude" | "tudo"; // [E2]
  personal: string;
  aluno: string;
  extras: string[]; // [E2] perguntas próprias; na Entrega 1, sempre []
  semSaude?: boolean; // junto sem a autorização da boas-vindas: parq, saude e dor ficam de fora
}
export interface CtxTriagem {
  hoje: Date;
  liberacoes: Liberacao[];
}
