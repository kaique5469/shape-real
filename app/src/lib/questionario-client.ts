/**
 * Armazenamento do questionário no aparelho (spec §9.2): rascunhos, "enviado" e "apagado", sob `sr:v1:` ("Apagar
 * dados" leva junto). Os registros de enviado e apagado guardam só a data, nunca conteúdo.
 *
 * Sem o catálogo de perguntas: `local.ts` (todas as telas) importa este arquivo. Conferir respostas, limpar perguntas
 * ocultas e tirar a saúde do rascunho do junto é de `questionario-flow.ts` (`sanearRespostas`, `rascunhoParaGravar`).
 * Toda leitura e gravação fica em try/catch: armazenamento bloqueado (aba anônima, cota cheia) nunca derruba a tela.
 */
import { MODULOS, type AnamneseAnswers, type Modulo } from "@/lib/domain/anamnese-types";
import type { Profile } from "@/lib/domain/types";
import { rascunhoVencido } from "./questionario-base";

export interface Rascunho {
  a: AnamneseAnswers;
  /** Índice da parte em `secoesDoQuestionario(ctx, a)` (0 = Você); a boas-vindas não é parte. */
  parte: number;
  /** Última edição (ISO): conta os 30 dias. */
  at: string;
  iniciadoEm: string;
  /** Toque em Enviar sem "Sim, enviei" (ISO): conta os 7 dias. */
  enviarTocadoEm?: string;
  letraMaior?: boolean; // [E2]
  modulos?: Modulo[]; // [E2]
  pulados?: Modulo[]; // [E2]
  extras?: string[]; // [E2] perguntas próprias do pedido
  respostasExtras?: (string | undefined)[]; // [E2]
  declaro?: boolean;
  termo?: boolean;
  /** Autorização de saúde pelo link (caixa de §11.1). */
  consent?: boolean;
  /** Caixa do responsável (menor de 18). */
  responsavelOk?: boolean;
  /** Junto: "{aluno} autorizou guardar as respostas de saúde…" marcada na boas-vindas. */
  autorizouJunto?: boolean;
  /** Junto: obrigatórias deixadas com "Pular por agora" (ids do catálogo). Só ids, nunca respostas. */
  pulouPorAgora?: string[];
}

export const RASCUNHO_PREFIXO = "sr:v1:qrascunho:";
export const ENVIADO_PREFIXO = "sr:v1:qenviado:";
export const APAGADO_PREFIXO = "sr:v1:qapagado:";

/** Teto das perguntas próprias e das respostas (spec §10.1), para um rascunho mexido não virar um link enorme. */
const EXTRAS_MAX = 3;
const EXTRA_PERGUNTA_MAX = 100;
const EXTRA_RESPOSTA_MAX = 300;
/** "Pular por agora": ids do catálogo ("ano", "parq.3"), no máximo um por pergunta. */
const ID_PERGUNTA = /^[a-zA-Z][a-zA-Z0-9]{0,30}(?:\.[0-9])?$/;
const PULOU_MAX = 80;

function armazenamento(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * "sr:v1:qrascunho:{pedidoId}" (pelo link) ou "sr:v1:qrascunho:aluno-{studentId}" (junto). Com os dois, vale o pedido.
 * Sem nenhum, lança: é erro de quem chama (nunca grava um rascunho sem dono).
 */
export function chaveRascunho(i: { pedidoId?: string; studentId?: string }): string {
  if (i.pedidoId) return RASCUNHO_PREFIXO + i.pedidoId;
  if (i.studentId) return `${RASCUNHO_PREFIXO}aluno-${i.studentId}`;
  throw new Error("rascunho_sem_chave");
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const dataValida = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

function modulosDe(v: unknown): Modulo[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return MODULOS.filter((m) => v.includes(m));
}

/**
 * Confere a forma do rascunho guardado (não as respostas: isso é `sanearRespostas`, com o catálogo). Campos opcionais
 * com tipo errado somem; sem `a`, `parte`, `at` ou `iniciadoEm` válidos, o rascunho inteiro é inválido.
 */
function interpretar(raw: string | null): Rascunho | null | "invalido" {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return "invalido";
  }
  if (!ehObjeto(v) || !ehObjeto(v.a) || typeof v.parte !== "number" || !Number.isInteger(v.parte) || v.parte < 0) return "invalido";
  if (!dataValida(v.at) || !dataValida(v.iniciadoEm)) return "invalido";
  const r: Rascunho = { a: v.a as AnamneseAnswers, parte: v.parte, at: v.at, iniciadoEm: v.iniciadoEm };
  if (dataValida(v.enviarTocadoEm)) r.enviarTocadoEm = v.enviarTocadoEm;
  for (const k of ["letraMaior", "declaro", "termo", "consent", "responsavelOk", "autorizouJunto"] as const) if (typeof v[k] === "boolean") r[k] = v[k] as boolean;
  const modulos = modulosDe(v.modulos);
  if (modulos) r.modulos = modulos;
  const pulados = modulosDe(v.pulados);
  if (pulados) r.pulados = pulados;
  if (Array.isArray(v.extras)) r.extras = v.extras.filter((x): x is string => typeof x === "string").slice(0, EXTRAS_MAX).map((x) => x.slice(0, EXTRA_PERGUNTA_MAX));
  if (Array.isArray(v.respostasExtras))
    r.respostasExtras = v.respostasExtras.slice(0, EXTRAS_MAX).map((x) => (typeof x === "string" ? x.slice(0, EXTRA_RESPOSTA_MAX) : undefined));
  if (Array.isArray(v.pulouPorAgora)) {
    const ids = [...new Set(v.pulouPorAgora.filter((x): x is string => typeof x === "string" && ID_PERGUNTA.test(x)))].slice(0, PULOU_MAX);
    if (ids.length) r.pulouPorAgora = ids;
  }
  return r;
}

/**
 * Rascunho ilegível vai para o acompanhamento de erros só com o código, sem nada do conteúdo. Import tardio: este
 * arquivo entra em `local.ts` (todas as telas, e testes sem navegador), e a medição só precisa carregar neste caso.
 */
function avisarRascunhoInvalido(): void {
  void import("@/lib/analytics")
    .then((m) => m.reportError(new Error("rascunho_invalido"), "questionario:rascunho"))
    .catch(() => {});
}

/**
 * Rascunho guardado, ou null (não existe, ilegível ou armazenamento bloqueado). Nunca lança. Ilegível vai para o
 * acompanhamento de erros só com o código (`rascunho_invalido`), sem nada do conteúdo.
 */
export function lerRascunho(chave: string): Rascunho | null {
  const ls = armazenamento();
  if (!ls) return null;
  let raw: string | null;
  try {
    raw = ls.getItem(chave);
  } catch {
    return null;
  }
  const r = interpretar(raw);
  if (r === "invalido") {
    avisarRascunhoInvalido();
    return null;
  }
  return r;
}

/**
 * Grava o rascunho. Devolve se gravou (a linha "Salvo neste celular às HH:MM" só aparece com `true`: estado nunca é
 * afirmado sem evidência). No junto, passe antes por `rascunhoParaGravar`, que tira a saúde sem autorização.
 */
export function salvarRascunho(chave: string, r: Rascunho): boolean {
  const ls = armazenamento();
  if (!ls) return false;
  try {
    ls.setItem(chave, JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

export function apagarRascunho(chave: string): void {
  try {
    armazenamento()?.removeItem(chave);
  } catch {
    /* armazenamento bloqueado: nada a apagar */
  }
}

/** Grava `{ at }` (só a data). */
function marcarData(chave: string, at: string): void {
  try {
    armazenamento()?.setItem(chave, JSON.stringify({ at }));
  } catch {
    /* sem espaço ou bloqueado: segue sem o registro */
  }
}

function lerData(chave: string): string | null {
  try {
    const raw = armazenamento()?.getItem(chave);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return ehObjeto(v) && dataValida(v.at) ? v.at : null;
  } catch {
    return null;
  }
}

/** sr:v1:qenviado:{pedidoId} = { at }: "Sim, enviei" neste celular. */
export function marcarEnviado(pedidoId: string, at: string): void {
  marcarData(ENVIADO_PREFIXO + pedidoId, at);
}

export function enviadoEm(pedidoId: string): string | null {
  return lerData(ENVIADO_PREFIXO + pedidoId);
}

/** sr:v1:qapagado:{anamneseId} = { at }, sem conteúdo ("Apagar respostas", revogação e "Remover aluno"). */
export function marcarApagado(anamneseId: string, at: string): void {
  marcarData(APAGADO_PREFIXO + anamneseId, at);
}

export function apagadoEm(anamneseId: string): string | null {
  return lerData(APAGADO_PREFIXO + anamneseId);
}

/**
 * Apaga os rascunhos vencidos (30 dias sem edição; 7 dias depois do toque em Enviar) e os ilegíveis (podem ter saúde e
 * não servem para continuar). Chamar ao abrir /questionario e o painel. Devolve quantos rascunhos apagou.
 */
export function limparRascunhosVencidos(agora: Date): number {
  const ls = armazenamento();
  if (!ls) return 0;
  const chaves: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k !== null && k.startsWith(RASCUNHO_PREFIXO)) chaves.push(k);
    }
  } catch {
    return 0;
  }
  let n = 0;
  for (const k of chaves) {
    try {
      const r = interpretar(ls.getItem(k));
      if (r === null) continue;
      if (r === "invalido" || rascunhoVencido(r, agora)) {
        ls.removeItem(k);
        n++;
      }
    } catch {
      /* chave que não deu para ler ou apagar: fica para a próxima limpeza */
    }
  }
  return n;
}

/**
 * Ids das rodadas de respostas de um perfil (`anamnese` e `anamnesePrev`), para gravar `qapagado` ao apagar. Lê só o
 * `id`, nunca as respostas: por isso não passa por `readAnamnese`, que devolve "invalida" para uma rodada danificada e
 * perderia justamente o id que precisa ser lembrado.
 */
export function idsDasRodadas(p: Pick<Profile, "anamnese" | "anamnesePrev"> | null | undefined): string[] {
  const ids: string[] = [];
  for (const an of [p?.anamnese, p?.anamnesePrev] as unknown[]) {
    const id = ehObjeto(an) ? an.id : undefined;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Aluno removido do aparelho (`deleteAccount`): apaga o rascunho do junto e grava `qapagado` das rodadas dele, para a
 * mensagem antiga do WhatsApp não trazer a saúde de volta sem aviso (spec §5.5 e §5.7).
 */
export function esquecerQuestionarioDoAluno(studentId: string, rodadas: string[], at: string): void {
  apagarRascunho(chaveRascunho({ studentId }));
  for (const id of rodadas) marcarApagado(id, at);
}

/**
 * Pedido da aba atual (sessionStorage, some ao fechar a aba): a página limpa o `#d=` da barra assim que lê, e quem
 * recarrega no meio do questionário (puxar para baixo) voltaria sem o pedido. O pedido só tem identidade (nomes, o
 * WhatsApp do personal e ids), nada de resposta. Nunca lança.
 */
export const PEDIDO_DA_ABA_KEY = "sr:v1:qpedido-aba";

function sessao(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function guardarPedidoDaAba(packed: string): void {
  try {
    sessao()?.setItem(PEDIDO_DA_ABA_KEY, packed);
  } catch {
    /* sem armazenamento: recarregar volta a pedir o link */
  }
}

export function pedidoDaAba(): string | null {
  try {
    const v = sessao()?.getItem(PEDIDO_DA_ABA_KEY) ?? null;
    return v && /^[01]\.[A-Za-z0-9_-]+$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function esquecerPedidoDaAba(): void {
  try {
    sessao()?.removeItem(PEDIDO_DA_ABA_KEY);
  } catch {
    /* nada a apagar */
  }
}
