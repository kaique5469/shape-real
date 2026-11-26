/**
 * Pacotes de ida e volta do questionário (spec §10): pedido (`/questionario#d=`) e respostas (`/receber#d=`),
 * comprimidos como o da ficha, sem cifra nesta entrega (aviso no texto de autorização). `TRANSFER_VERSION` continua 1;
 * `parsePacket` (transfer.ts) não muda. `readAnamnese` é a única porta de leitura das respostas de um perfil.
 * Todo JSON.parse/safeParse em try/catch: nada do texto lido nem dos caminhos do zod sai daqui (`reportError` só
 * recebe o código `anamnese_invalida`).
 *
 * Leve de propósito: este arquivo vai para `/questionario`, que abre no celular do aluno. Não importa transfer.ts nem
 * delivery.ts (eles puxam o catálogo de exercícios e o motor); a versão do protocolo e a conferência de data ISO são
 * cópias locais, com teste que as compara às originais.
 */
import { z } from "zod";
import { HEALTH_KEYS, primeiroNome } from "./anamnese";
import {
  ACOMPANHAMENTOS,
  ALCOOIS,
  ANAMNESE_V,
  ATENDIMENTOS,
  BARREIRAS,
  COMPLICACOES,
  CONDICOES,
  DOR_ALERTAS,
  DOR_QUANDO,
  DOSES,
  EQUIPAMENTOS,
  EXPERIENCIAS,
  FOCOS,
  FUMOS,
  GOSTOS,
  HORAS_ESPORTE,
  LADOS,
  MODULOS,
  MOTIVOS,
  NAO_QUER,
  OBJETIVOS,
  ONDES,
  PARADOS,
  PIORAS,
  REGIOES,
  REMEDIOS,
  RESTRICOES,
  SECOES,
  SINTOMAS,
  SONOS,
  TRABALHOS,
  type AlertId,
  type Anamnese,
  type AnamneseAnswers,
  type AnamnesePedido,
  type AnamneseLink,
  type Atendimento,
  type Modulo,
} from "./anamnese-types";
import { coachSignature } from "./cref";
import { uid } from "./ids";
import type { Profile } from "./types";

/** = `TRANSFER_VERSION` de transfer.ts (teste confere): os tipos novos só acrescentam, a versão do protocolo não muda. */
export const VERSAO_PROTOCOLO = 1 as const;
const TRANSFER_VERSION = VERSAO_PROTOCOLO;
/** Data ISO 8601 curta, como `isIsoDate` de delivery.ts (teste confere): "versão 2" não passa por data. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
export function ehDataIso(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 40 && ISO_RE.test(v) && Number.isFinite(Date.parse(v));
}

export interface PedidoPacket {
  v: 1;
  kind: "pedido_anamnese";
  id: string;
  sentAt: string;
  catalogV: number;
  coach: { id: string; name: string; phone?: string; cref?: string };
  student: { ref: string; name: string }; // só identidade: nada de saúde nem disponibilidade
  modulos: Modulo[];
  atendimento?: Atendimento;
  reavaliacao?: "saude" | "tudo"; // [E2]
  extras?: string[]; // [E2]
  letraMaior?: boolean; // [E2]
}
export interface RespostasPacket {
  v: 1;
  kind: "anamnese";
  sentAt: string;
  coachId: string;
  studentRef: string;
  studentName: string;
  anamnese: AnamneseLink;
}
export type ProblemaLink = "tipo_desconhecido" | "versao_nova" | "invalido";

/**
 * Textos de spec §5.4. `{personal}` segue a convenção de `comNomes` (anamnese.ts): quem mostra troca pelo primeiro nome
 * de quem mandou o link (com o link cortado, o nome é desconhecido e `comNomes` usa "seu personal").
 */
export const PROBLEMA_TEXTO: Record<ProblemaLink, string> = {
  tipo_desconhecido: "Este link é de uma versão mais nova do Shape Real. Atualize a página (puxe para baixo) e abra o link de novo.",
  versao_nova: "Este link é de uma versão mais nova do Shape Real. Atualize a página (puxe para baixo) e abra o link de novo.",
  invalido: "Este link veio cortado ou incompleto. Peça para {personal} mandar de novo.",
};

/** Os quatro tipos de pacote que este app conhece; outro `kind` é de uma versão mais nova (ou não é do Shape Real). */
export const KINDS_CONHECIDOS = ["ficha", "treinos", "pedido_anamnese", "anamnese"] as const;

// ---- validação (helpers no padrão de transfer.ts, sem importar os internos dele) -----------------------------------
const id = z.string().min(1).max(80);
const text = (max: number) => z.string().max(max);
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional().nullable();
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const iso = z.string().max(40).refine(ehDataIso);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const sn = z.union([z.literal(0), z.literal(1)]);
const lista = <T extends readonly [string, ...string[]]>(valores: T, max: number) => z.array(z.enum(valores)).max(max);

/** Teto da soma dos textos livres de uma rodada (spec §10.1). */
export const TEXTO_LIVRE_MAX = 3000;
/** No perfil (modo tolerante), um texto maior que o teto do link não derruba a leitura: só um teto de sanidade. */
const TEXTO_TOLERANTE = 5000;

/** Todos os AlertId (com conferência de tipo nos dois sentidos): só para filtrar overrides e "Conversei" lidos do perfil. */
const ALERT_IDS = [
  "A-PEITO", "A-TONTURA", "A-SINTOMA", "A-SUPERVISAO", "A-PAUSA", "A-OBSTETRA", "A-COLUNA-URG",
  "A-COLUNA", "A-DOENCA", "A-PARQ7", "A-GESTANTE", "A-HIPO", "A-DIAB-COMP", "A-DOR-FORTE", "A-DOR-TRAUMA", "A-PARQ-INCOMPLETO", "A-SEM-TRIAGEM",
  "A-DOENCA-ATIVO", "A-PRESSAO", "A-PESSOAL", "A-POSPARTO", "A-QUEDA",
  "A-PARQ-SIM", "A-GESTANTE-OK", "A-CANCER", "A-ALIMENTAR", "A-CIRURGIA",
  "A-70", "A-MENOR",
] as const satisfies readonly AlertId[];
type FaltaAlerta = Exclude<AlertId, (typeof ALERT_IDS)[number]>;
const todosOsAlertas: [FaltaAlerta] extends [never] ? true : never = true;
void todosOsAlertas;
const ehAlertId = (x: unknown): x is AlertId => typeof x === "string" && (ALERT_IDS as readonly string[]).includes(x);

/** Chaves de AnamneseAnswers (para `herdado.chaves`). */
const CHAVES_RESPOSTA = new Set<string>();

type Modo = "link" | "perfil";

function respostasSchema(modo: Modo) {
  const T = (max: number) => text(modo === "link" ? max : TEXTO_TOLERANTE);
  // No perfil, o PAR-Q do modo junto pode estar pela metade ("Salvar o que já tem"): posições vazias viram null no JSON.
  const parq = modo === "link" ? z.tuple([sn, sn, sn, sn, sn, sn, sn]) : z.tuple([sn.nullish(), sn.nullish(), sn.nullish(), sn.nullish(), sn.nullish(), sn.nullish(), sn.nullish()]);
  const shape = {
    nome: opt(T(120)),
    ano: opt(int(1900, 2100)),
    sexo: opt(z.enum(["F", "M", "nd"])),
    altura: opt(num(120, 230)),
    peso: opt(num(30, 300)),
    responsavel: opt(T(120)),
    parq: opt(parq),
    parqDetalhe: opt(T(200)),
    regular: opt(z.enum(["sim3m", "simRecente", "pouco", "nao"])),
    condicoes: opt(z.union([lista(CONDICOES, 14), z.literal("pessoal")])),
    condicaoOutra: opt(T(100)),
    sintomas: opt(lista(SINTOMAS, 9)),
    remedios: opt(z.union([sn, z.literal("pessoal")])),
    remediosPara: opt(lista(REMEDIOS, 12)),
    remediosNomes: opt(T(150)),
    cirurgia: opt(sn),
    cirurgiaQual: opt(T(100)),
    orientacao: opt(z.enum(["nao", "livre", "restricao", "pausa"])),
    orientacaoQual: opt(T(150)),
    gestacao: opt(z.enum(["nao", "gravida", "pp3", "pp12", "nd"])),
    obstetra: opt(z.enum(["sim", "naoPerguntei", "pediuNao"])),
    semanas: opt(int(1, 42)),
    assoalho: opt(sn),
    pressaoControle: opt(z.enum(["controlada", "asVezes", "alta", "naoSei"])),
    hipo: opt(z.enum(["nunca", "asVezes", "frequente"])),
    complicacoes: opt(lista(COMPLICACOES, 12)),
    quedas: opt(sn),
    instavel: opt(sn),
    medoCair: opt(sn),
    dor: opt(sn),
    dorOnde: opt(z.array(z.object({ r: z.enum(REGIOES), l: opt(z.enum(LADOS)), t: opt(T(60)) })).max(10)),
    dorNota: opt(int(0, 10)),
    dorQuando: opt(lista(DOR_QUANDO, 12)),
    dorDesde: opt(z.enum(["ate6s", "ate3m", "mais3m"])),
    dorTrauma: opt(sn),
    dorAlerta: opt(lista(DOR_ALERTAS, 12)),
    lesao: opt(sn),
    lesaoQual: opt(T(150)),
    tratamento: opt(z.enum(["nao", "fisio", "medico", "terminei"])),
    objetivo: opt(z.enum(OBJETIVOS)),
    experiencia: opt(z.enum(EXPERIENCIAS)),
    parado: opt(z.enum(PARADOS)),
    dias: opt(int(1, 7)),
    minutos: opt(z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(75), z.literal(90)])),
    onde: opt(z.enum(ONDES)),
    equipamentos: opt(lista(EQUIPAMENTOS, 12)),
    diasComPersonal: opt(int(0, 7)),
    nutri: opt(z.enum(["sim", "nao", "gostaria"])),
    foco: opt(lista(FOCOS, 12)),
    naoQuer: opt(lista(NAO_QUER, 12)),
    naoQuerOutro: opt(T(100)),
    barreira: opt(lista(BARREIRAS, 12)),
    // [E2] partes extras: o formato já viaja (links de um app mais novo da mesma versão de catálogo).
    sono: opt(z.enum(SONOS)),
    estresse: opt(int(0, 10)),
    trabalho: opt(z.enum(TRABALHOS)),
    fuma: opt(z.enum(FUMOS)),
    alcool: opt(z.enum(ALCOOIS)),
    doses: opt(z.enum(DOSES)),
    restricoes: opt(lista(RESTRICOES, 12)),
    alergia: opt(T(60)),
    data: opt(z.object({ quando: mes, texto: opt(T(60)) })),
    motivo: opt(lista(MOTIVOS, 12)),
    sucesso: opt(T(150)),
    importancia: opt(int(0, 10)),
    confianca: opt(int(0, 10)),
    gosta: opt(lista(GOSTOS, 12)),
    acompanhamento: opt(lista(ACOMPANHAMENTOS, 12)),
    esporte: opt(T(60)),
    prova: opt(mes),
    horasSemana: opt(z.enum(HORAS_ESPORTE)),
    lesao12: opt(sn),
    lesao12Qual: opt(T(100)),
    piora: opt(lista(PIORAS, 12)),
    evita: opt(T(150)),
    orientacaoFisio: opt(T(150)),
    recado: opt(T(300)),
  } satisfies Record<keyof AnamneseAnswers, z.ZodTypeAny>;
  for (const k of Object.keys(shape)) CHAVES_RESPOSTA.add(k);
  return z.object(shape);
}

/** Textos livres das respostas (spec §10.1). Nome e responsável são identidade, com teto próprio, e não somam. */
const CAMPOS_TEXTO_LIVRE = [
  "parqDetalhe", "condicaoOutra", "remediosNomes", "cirurgiaQual", "orientacaoQual", "lesaoQual", "naoQuerOutro",
  "alergia", "sucesso", "esporte", "lesao12Qual", "evita", "orientacaoFisio", "recado",
] as const satisfies readonly (keyof AnamneseAnswers)[];

const len = (v: unknown) => (typeof v === "string" ? v.length : 0);

/** Soma dos textos livres de uma rodada: os campos de texto, "Outro lugar" da dor, o texto da data e as perguntas próprias. */
export function textoLivreTotal(an: AnamneseLink): number {
  const a = (an?.a ?? {}) as Record<string, unknown>;
  let total = 0;
  for (const k of CAMPOS_TEXTO_LIVRE) total += len(a[k]);
  if (Array.isArray(a.dorOnde)) for (const d of a.dorOnde) total += len((d as { t?: unknown } | null)?.t);
  total += len((a.data as { texto?: unknown } | null | undefined)?.texto);
  if (Array.isArray(an?.extras)) for (const e of an.extras) total += len(e?.q) + len(e?.r);
  return total;
}

function anamneseSchema(modo: Modo) {
  const T = (max: number) => text(modo === "link" ? max : TEXTO_TOLERANTE);
  const base = {
    v: int(1, ANAMNESE_V),
    id,
    answeredAt: iso,
    by: z.enum(["aluno", "personal"]),
    via: z.enum(["link", "junto"]),
    reavaliacao: opt(z.enum(["saude", "tudo"])),
    modulos: lista(MODULOS, MODULOS.length),
    pulados: opt(lista(MODULOS, MODULOS.length)),
    incompleto: opt(lista(SECOES, SECOES.length)),
    healthOmitted: opt(z.boolean()),
    parqText: text(40),
    a: respostasSchema(modo),
    extras: opt(z.array(z.object({ q: T(100), r: opt(T(300)) })).max(3)),
    consent: opt(
      z.object({
        at: iso,
        source: modo === "link" ? z.literal("aluno_questionario") : z.enum(["aluno_questionario", "personal"]),
        textId: text(10),
        responsavel: opt(z.object({ nome: T(120), at: iso })),
      }),
    ),
    declaredAt: opt(iso),
    termo: opt(z.object({ at: iso, nome: T(120) })),
  };
  if (modo === "link") {
    return z.object(base).superRefine((an, ctx) => {
      if (textoLivreTotal(an as unknown as AnamneseLink) > TEXTO_LIVRE_MAX) ctx.addIssue({ code: "custom", message: "texto_livre" });
      const a = an.a as Record<string, unknown>;
      const temSaude = HEALTH_KEYS.some((k) => a[k] !== undefined && a[k] !== null);
      // "Enviar sem dados de saúde" não leva saúde nem autorização; com saúde, a autorização vem junto (LGPD art. 11, I).
      if (an.healthOmitted && (temSaude || an.consent || an.termo)) ctx.addIssue({ code: "custom", message: "saude_omitida" });
      if (!an.healthOmitted && temSaude && !an.consent) ctx.addIssue({ code: "custom", message: "saude_sem_autorizacao" });
    });
  }
  // Perfil (modo tolerante): o que o personal registrou no aparelho. Um id de alerta desconhecido numa decisão dele é
  // descartado (a porta volta a aparecer: o lado seguro), nunca recusa a leitura.
  const alertasDoPerfil = z.array(z.string()).max(60).transform((xs) => xs.filter(ehAlertId));
  return z.object({
    ...base,
    receivedAt: opt(iso),
    overrides: opt(z.array(z.object({ at: iso, alertas: alertasDoPerfil })).max(60)),
    conversei: opt(z.object({ at: iso, alertas: alertasDoPerfil })),
    vistoEm: opt(iso),
    herdado: opt(z.object({ de: id, answeredAt: iso, chaves: z.array(z.string()).max(120).transform((xs) => xs.filter((k) => CHAVES_RESPOSTA.has(k))) })),
  });
}

const anamneseLinkSchema = anamneseSchema("link");
const anamnesePerfilSchema = anamneseSchema("perfil");

const pedidoSchema = z.object({
  v: z.literal(TRANSFER_VERSION),
  kind: z.literal("pedido_anamnese"),
  id,
  sentAt: iso,
  catalogV: int(1, ANAMNESE_V),
  coach: z.object({ id, name: z.string().min(1).max(120), phone: opt(text(20)), cref: opt(text(30)) }),
  student: z.object({ ref: id, name: z.string().min(1).max(120) }),
  modulos: lista(MODULOS, MODULOS.length),
  atendimento: opt(z.enum(ATENDIMENTOS)),
  reavaliacao: opt(z.enum(["saude", "tudo"])),
  extras: opt(z.array(text(100)).max(3)),
  letraMaior: opt(z.boolean()),
});

const respostasPacketSchema = z.object({
  v: z.literal(TRANSFER_VERSION),
  kind: z.literal("anamnese"),
  sentAt: iso,
  coachId: id,
  studentRef: id,
  studentName: z.string().min(1).max(120),
  anamnese: anamneseLinkSchema,
});

/** Tira os null (opcionais vazios), como `parsePacket`. */
const semNulos = <T>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (x === null ? undefined : x)));

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function parseCom<T>(schema: z.ZodTypeAny, v: unknown): T | null {
  try {
    const res = schema.safeParse(v);
    return res.success ? semNulos(res.data as T) : null;
  } catch {
    return null;
  }
}

/** Pedido do personal (`kind: "pedido_anamnese"`); null quando não é um pedido válido desta versão. */
export function parsePedido(v: unknown): PedidoPacket | null {
  return parseCom<PedidoPacket>(pedidoSchema, v);
}

/** Respostas do aluno (`kind: "anamnese"`); null quando não são respostas válidas desta versão. */
export function parseRespostas(v: unknown): RespostasPacket | null {
  return parseCom<RespostasPacket>(respostasPacketSchema, v);
}

/**
 * Por que um pacote não abre (spec §10.1), ao lado de `parsePacket`, sem mudar a assinatura dele:
 *  - sem objeto ou sem `kind` → "invalido";
 *  - `kind` fora dos quatro conhecidos → "tipo_desconhecido";
 *  - `v` do protocolo, `catalogV` ou `anamnese.v` maiores que os deste app → "versao_nova" (antes do parse estrito:
 *    recusa a importação inteira, sem descartar pergunta de saúde em silêncio);
 *  - falha no esquema do pedido ou das respostas → "invalido".
 * null = o pedido ou as respostas abrem. Para ficha e treinos, null só diz que o tipo e a versão são conhecidos: quem
 * confere o conteúdo é `parsePacket` (fica fora daqui para o questionário do aluno não carregar o motor da ficha).
 */
export function packetProblem(v: unknown): ProblemaLink | null {
  try {
    if (!isObj(v) || typeof v.kind !== "string") return "invalido";
    if (!(KINDS_CONHECIDOS as readonly string[]).includes(v.kind)) return "tipo_desconhecido";
    if (typeof v.v === "number" && v.v > TRANSFER_VERSION) return "versao_nova";
    if (v.kind === "pedido_anamnese") {
      if (typeof v.catalogV === "number" && v.catalogV > ANAMNESE_V) return "versao_nova";
      return parsePedido(v) ? null : "invalido";
    }
    if (v.kind === "anamnese") {
      if (isObj(v.anamnese) && typeof v.anamnese.v === "number" && v.anamnese.v > ANAMNESE_V) return "versao_nova";
      return parseRespostas(v) ? null : "invalido";
    }
    // ficha e treinos: o esquema é o de parsePacket (transfer.ts), que quem abre esses links já chama.
    return null;
  } catch {
    return "invalido";
  }
}

// ---- montagem ------------------------------------------------------------------------------------------------------
const cortar = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max);

/**
 * Pedido que vai no link do WhatsApp. Só identidade (personal e aluno), partes, atendimento e, na Entrega 2,
 * reavaliação, perguntas próprias e letra maior: nada de saúde nem de disponibilidade. `id` novo quando não informado
 * (reenvio e lembrete passam o mesmo `id`: o aluno continua o rascunho).
 */
export function buildPedido(i: { coach: Profile; student: Profile; modulos: Modulo[]; atendimento?: Atendimento; reavaliacao?: "saude" | "tudo"; extras?: string[]; letraMaior?: boolean; id?: string; agora: string }): PedidoPacket {
  const cref = cortar(i.coach.cref, 30);
  const phone = cortar(i.coach.phone, 20);
  return {
    v: TRANSFER_VERSION,
    kind: "pedido_anamnese",
    id: i.id ?? uid(),
    sentAt: i.agora,
    catalogV: ANAMNESE_V,
    coach: { id: i.coach.id, name: cortar(i.coach.name, 120), ...(phone ? { phone } : {}), ...(cref ? { cref } : {}) },
    student: { ref: i.student.id, name: cortar(i.student.name, 120) },
    modulos: [...new Set(i.modulos)],
    ...(i.atendimento ? { atendimento: i.atendimento } : {}),
    ...(i.reavaliacao ? { reavaliacao: i.reavaliacao } : {}),
    ...(i.extras?.length ? { extras: i.extras.slice(0, 3).map((q) => cortar(q, 100)) } : {}),
    ...(i.letraMaior !== undefined ? { letraMaior: i.letraMaior } : {}),
  };
}

/** Respostas que voltam ao personal. O nome é o que o aluno confirmou na Parte 1 (ou o do pedido). */
export function buildRespostas(i: { pedido: PedidoPacket; anamnese: AnamneseLink; agora: string }): RespostasPacket {
  // Campos do aparelho do personal nunca viajam, mesmo que venham num objeto Anamnese completo.
  const { receivedAt: _r, overrides: _o, conversei: _c, vistoEm: _v, ...anamnese } = i.anamnese as Anamnese;
  void [_r, _o, _c, _v];
  return {
    v: TRANSFER_VERSION,
    kind: "anamnese",
    sentAt: i.agora,
    coachId: i.pedido.coach.id,
    studentRef: i.pedido.student.ref,
    studentName: cortar(anamnese.a?.nome, 120) || i.pedido.student.name,
    anamnese,
  };
}

// ---- pedido no aparelho do personal (spec §5.3) ----------------------------------------------------------------------
/**
 * O WhatsApp do personal dá para usar? Sem ele, o diálogo pede o número antes: as respostas do aluno cairiam no seletor
 * de contatos e "você recebe um link no WhatsApp" seria falso (D-15). Mesma regra de `waPhone` (format.ts): 10 dígitos.
 */
export function whatsappDoPersonalOk(coach: Pick<Profile, "phone"> | null | undefined): boolean {
  return (coach?.phone ?? "").replace(/\D/g, "").length >= 10;
}

/**
 * Pedido que um reenvio ou lembrete reaproveita (mesmo `id` e mesmo `packed`: o aluno continua o rascunho): o pendente
 * do aluno, da mesma reavaliação. `pendente` vem de `pedidoPendente` (anamnese-perfil.ts). null = pedido novo.
 */
export function pedidoReaproveitavel(student: Pick<Profile, "anamnesePedido">, pendente: boolean, reavaliacao?: "saude" | "tudo"): AnamnesePedido | null {
  const p = student.anamnesePedido;
  if (!p || !pendente || !p.id || !p.packed) return null;
  return (p.reavaliacao ?? null) === (reavaliacao ?? null) ? p : null;
}

/**
 * O aluno com o pedido gravado depois do toque em WhatsApp ou Copiar ("Questionário pedido em DD/MM"). Cada toque
 * atualiza a data: o "Lembrar" volta a contar dali.
 */
export function comPedido(student: Profile, pedido: PedidoPacket, packed: string, agora: string): Profile {
  const anamnesePedido: AnamnesePedido = { id: pedido.id, at: agora, modulos: pedido.modulos, packed, ...(pedido.reavaliacao ? { reavaliacao: pedido.reavaliacao } : {}) };
  return { ...student, anamnesePedido };
}

/** Textos do diálogo "Mandar questionário" (spec §5.3, literais). Nenhum nomeia saúde. */
export const PEDIR_TEXTO = {
  titulo: (aluno: string) => `Mandar questionário para ${primeiroNome(aluno) || "o aluno"}`,
  seuWhatsapp: "Seu WhatsApp (com DDD)",
  seuWhatsappDica: (aluno: string) => `Para as respostas de ${primeiroNome(aluno) || "seu aluno"} voltarem direto para você.`,
  salvarEContinuar: "Salvar e continuar",
  editarEmConta: "Editar em Conta",
  comoResponde: (aluno: string, minutos: number) => `${primeiroNome(aluno) || "O aluno"} responde no celular, sem cadastro, em uns ${minutos} minutos.`,
  sempreVao: "Sempre vão: Você, Saúde, Dores e lesões e Seu treino.",
  abrirWhatsapp: (aluno: string) => `Abrir WhatsApp de ${primeiroNome(aluno) || "o aluno"}`,
  escolherContato: "Escolher contato no WhatsApp",
  copiar: "Copiar mensagem",
  pronto: (aluno: string) => `Pronto. Quando ${primeiroNome(aluno) || "o aluno"} responder, você recebe um link no WhatsApp. Toque nele para registrar.`,
  exemplo: "Exemplo: o questionário não é enviado.",
} as const;

// ---- mensagens (puras; nenhum valor de resposta no texto) ----------------------------------------------------------
const oi = (nome: string) => `Oi${primeiroNome(nome) ? `, ${primeiroNome(nome)}` : ""}!`;

/** Mensagem do pedido (spec §5.3, inicial), com a assinatura "— Nome · CREF …". */
export function pedidoMessage(p: PedidoPacket, link: string, minutos: number): string {
  const personal = primeiroNome(p.coach.name);
  const assinatura = coachSignature(p.coach);
  return `${oi(p.student.name)} Aqui é ${personal || "seu personal"}. Para montar seu treino, responde este questionário? Leva uns ${minutos} minutos, é pelo celular e não precisa baixar nada nem criar conta: ${link}${assinatura ? `\n— ${assinatura}` : ""}`;
}

/** Lembrete (spec §5.3): mesmo link; não promete que o rascunho continua (o navegador pode ter apagado). */
export function lembreteMessage(nomeAluno: string, link: string): string {
  return `${oi(nomeAluno)} Conseguiu ver o questionário? Se parou no meio, é só abrir o link de novo: ${link}`;
}

/** Mensagem do aluno com as respostas (spec §5.4). */
export function respostasMessage(nomePersonal: string, link: string): string {
  const p = primeiroNome(nomePersonal);
  const quem = p ? `${p.charAt(0).toUpperCase()}${p.slice(1)}, respondi` : "Respondi";
  return `${quem} o questionário. Toque para registrar no Shape Real: ${link}`;
}

/** `${origin}/questionario#d=${packed}`. */
export function linkPedido(origin: string, packed: string): string {
  return `${origin}/questionario#d=${packed}`;
}

/** `${origin}/receber#d=${packed}`. */
export function linkRespostas(origin: string, packed: string): string {
  return `${origin}/receber#d=${packed}`;
}

// ---- leitura do perfil ---------------------------------------------------------------------------------------------
export type LeituraAnamnese = Anamnese | "versao_nova" | "invalida";
const LIDAS = new WeakMap<object, LeituraAnamnese>();

/** Só o código, nunca o conteúdo; import tardio para o domínio continuar puro (e os testes, sem medição). */
function avisarInvalida() {
  if (typeof window === "undefined") return;
  void import("../analytics").then((m) => m.reportError(new Error("anamnese_invalida"), "anamnese:ler")).catch(() => {});
}

function lerTolerante(raw: object): LeituraAnamnese {
  const v = (raw as Obj).v;
  if (typeof v === "number" && v > ANAMNESE_V) return "versao_nova";
  return parseCom<Anamnese>(anamnesePerfilSchema, raw) ?? "invalida";
}

/**
 * Única porta de leitura das respostas (A, B, C e D). Esquema tolerante (chave desconhecida é descartada; código fora
 * do catálogo ou `v > ANAMNESE_V` não); resultado guardado por referência (WeakMap). null = sem questionário.
 */
export function readAnamnese(p: Profile, campo: "anamnese" | "anamnesePrev" = "anamnese"): Anamnese | "versao_nova" | "invalida" | null {
  const raw = (p as Partial<Profile> | null | undefined)?.[campo] as unknown;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") {
    avisarInvalida();
    return "invalida";
  }
  const lida = LIDAS.get(raw);
  if (lida !== undefined) return lida;
  const r = lerTolerante(raw);
  LIDAS.set(raw, r);
  if (r === "invalida") avisarInvalida();
  return r;
}
