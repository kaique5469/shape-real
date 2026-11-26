/**
 * Propriedades dos eventos do questionário (spec §12), puras: as telas passam o retorno direto para `track`.
 * O tipo de retorno é o contrato fechado de `StrictEventProps` (analytics.ts): chave ou valor fora da lista não compila.
 * Regra: dois alunos que só diferem na saúde (inclusive na autorização de saúde) geram exatamente as mesmas
 * propriedades; todo passo que só aparece para um deles devolve null em `evNextStep`.
 * Nenhum builder recebe nome, telefone ou resposta. Só tipos de analytics (nada do runtime do PostHog).
 */
import type { FaixaMinutos, FichaLinkExtra, PassoEvento, ProgramGeneratedExtra, ReavaliacaoProp, StrictEventProps, StudentCreatedExtra } from "./analytics";
import type { Diferenca, Modulo, SecaoId, StepId, WorkStyle } from "./domain/anamnese-types";
import { QUESTIONARIO_DESDE } from "./domain/anamnese-types";

type Props<E extends keyof StrictEventProps> = StrictEventProps[E];

export const FAIXAS_MINUTOS = ["<3", "3-5", "5-8", "8-12", ">12"] as const satisfies readonly FaixaMinutos[];

const limitar = (n: number, max: number) => Math.max(0, Math.min(max, Math.trunc(Number.isFinite(n) ? n : 0)));
const reav = (r: "saude" | "tudo" | undefined): ReavaliacaoProp => r ?? "nao";

/** Faixa pela diferença em minutos: < 3, 3 a < 5, 5 a < 8, 8 a 12, > 12. Data ilegível ou negativa: "<3". */
export function faixaMinutos(inicio: string, fim: string): (typeof FAIXAS_MINUTOS)[number] {
  const min = (Date.parse(fim) - Date.parse(inicio)) / 60_000;
  if (!Number.isFinite(min) || min < 3) return "<3";
  if (min < 5) return "3-5";
  if (min < 8) return "5-8";
  if (min <= 12) return "8-12";
  return ">12";
}

export function evWorkStyleSet(ws: WorkStyle | undefined, origem: "onboarding" | "conta" | "cartao", pulou: boolean): Props<"work_style_set"> {
  return {
    origem,
    pulou,
    atendimento: ws?.atendimento ?? "nao_respondeu",
    alimentacao: ws?.alimentacao ?? "nao_respondeu",
    publico_n: limitar(ws?.publico?.length ?? 0, 2),
    semanas: ws?.semanas ?? null,
    perguntas_n: limitar(ws?.perguntas?.length ?? 0, 3),
  };
}

/** [E2] Padrão aprendido. Não implementar na Entrega 1. */
export function evWorkStyleSuggestion(campo: "divisao" | "semanas", aceitou: boolean): Props<"work_style_suggestion"> {
  return { campo, aceitou };
}

/** Uma vez por pedido. `reavaliacao` ausente → "nao". */
export function evAnamneseRequested(i: { via: "whatsapp" | "copiar"; reavaliacao?: "saude" | "tudo"; modulos: Modulo[]; extras: number; de: "cadastro" | "aluno" | "passos" | "lembrete"; reenvio: boolean }): Props<"anamnese_requested"> {
  return { via: i.via, reavaliacao: reav(i.reavaliacao), modulos_n: limitar(new Set(i.modulos).size, 5), extras_n: limitar(i.extras, 3), de: i.de, reenvio: i.reenvio };
}

export function evAnamneseOpened(i: { modo: "link" | "junto" | "previa"; iosBrowser: boolean; retomou: boolean; aparelho: "aluno" | "personal_dono" | "outro" }): Props<"anamnese_opened"> {
  return { modo: i.modo, ios_browser: i.iosBrowser, retomou: i.retomou, aparelho: i.aparelho };
}

const SAUDE_JUNTO: readonly SecaoId[] = ["parq", "saude", "dor"];

/**
 * null para dorMais. `indice` = pedido.indexOf(parte), com `pedido` = `secoesDoPedido(ctx)`, que não depende de
 * resposta nem de `semSaude`. Junto sem a autorização da boas-vindas: parq, saude e dor não existem, e a ausência
 * desses eventos revelaria "enviado sem saúde" (spec §11.3) — por isso também null para parq, saude e dor no modo junto.
 * Parte fora do pedido: null.
 */
export function evPartDone(parte: SecaoId, pedido: SecaoId[], modo: "link" | "junto"): Props<"anamnese_part_done"> | null {
  if (parte === "dorMais") return null;
  if (modo === "junto" && SAUDE_JUNTO.includes(parte)) return null;
  const indice = pedido.filter((s) => s !== "dorMais").indexOf(parte);
  if (indice < 0) return null;
  return { parte, indice, modo };
}

/** `pulados_n` ignora dorMais; `incompleto` não conta as partes de saúde deixadas de fora por falta de autorização (quem chama). */
export function evAnamneseSent(i: { modo: "link" | "junto"; inicio: string; fim: string; modulosPedidos: Modulo[]; pulados: Modulo[]; extras: number; reenvio: boolean; incompleto: boolean; reavaliacao?: "saude" | "tudo" }): Props<"anamnese_sent"> {
  return {
    modo: i.modo,
    minutos: faixaMinutos(i.inicio, i.fim),
    modulos_n: limitar(new Set(i.modulosPedidos).size, 5),
    pulados_n: limitar(new Set(i.pulados.filter((m) => m !== "dorMais")).size, 5),
    extras_n: limitar(i.extras, 3),
    reenvio: i.reenvio,
    incompleto: i.incompleto,
    reavaliacao: reav(i.reavaliacao),
  };
}

export function evSendConfirmed(resposta: "sim" | "tentar" | "copiar"): Props<"anamnese_send_confirmed"> {
  return { resposta };
}

/** `diferencas_n` sem weightKg e heightCm (dados de saúde). `dias_desde_pedido`: dias inteiros desde o pedido. */
export function evAnamneseReceived(i: { achou: "ref" | "nome" | "escolhido" | "novo"; diferencas: Diferenca[]; reenvio: boolean; pedidoAt?: string; agora: string; reavaliacao?: "saude" | "tudo" }): Props<"anamnese_received"> {
  const dias = i.pedidoAt ? (Date.parse(i.agora) - Date.parse(i.pedidoAt)) / 86_400_000 : Number.NaN;
  return {
    achou: i.achou,
    diferencas_n: new Set(i.diferencas.filter((d) => d.campo !== "weightKg" && d.campo !== "heightCm").map((d) => d.campo)).size,
    reenvio: i.reenvio,
    dias_desde_pedido: Number.isFinite(dias) ? Math.max(0, Math.floor(dias)) : null,
    reavaliacao: reav(i.reavaliacao),
  };
}

/** { tela: "receber", via_paste }. */
export function evAnamneseLinkOpened(viaPaste: boolean): Props<"anamnese_link_opened"> {
  return { tela: "receber", via_paste: viaPaste };
}

export function evAnamneseDeleted(comCadastro: boolean): Props<"anamnese_deleted"> {
  return { com_cadastro: comCadastro };
}

export function evSummaryViewed(temQuestionario: boolean, origem: "aba" | "receber" | "junto"): Props<"summary_viewed"> {
  return { tem_questionario: temQuestionario, origem };
}

/** Passos que existem para todo aluno, sem depender de saúde (os únicos que viram evento). */
const PASSOS_COM_EVENTO: readonly PassoEvento[] = ["gerar_ficha", "enviar_ficha", "avaliacao", "checkin", "reavaliar", "questionario", "lembrar"];

/**
 * null para passos clínicos e para `dieta`/`nutricionista` (inferência negativa). "lembrar" é a ação "Lembrar
 * {aluno}" do passo `questionario`. `gerar_ficha` dispara no toque, antes de trava ou porta (o evento não varia com alerta).
 */
export function evNextStep(passo: StepId | "lembrar"): Props<"next_step_clicked"> | null {
  return (PASSOS_COM_EVENTO as readonly string[]).includes(passo) ? { passo: passo as PassoEvento } : null;
}

export function evProgramGeneratedExtra(fromAnamnese: boolean, ajustes: number): ProgramGeneratedExtra {
  return { from_anamnese: fromAnamnese, ajustes_n: limitar(ajustes, 7) };
}

/** aluno_novo = criadoEm ≥ QUESTIONARIO_DESDE (meia-noite no fuso do aparelho). Horas arredondadas; null sem criadoEm. */
export function evFichaLinkExtra(i: { primeira: boolean; criadoEm?: string; agora: string; questionario: "link" | "junto" | "nenhum" }): FichaLinkExtra {
  const criado = i.criadoEm ? Date.parse(i.criadoEm) : Number.NaN;
  const horas = (Date.parse(i.agora) - criado) / 3_600_000;
  const desde = Date.parse(`${QUESTIONARIO_DESDE}T00:00:00`);
  return {
    primeira: i.primeira,
    horas_desde_cadastro: Number.isFinite(horas) ? Math.max(0, Math.round(horas)) : null,
    questionario: i.questionario,
    aluno_novo: Number.isFinite(criado) && criado >= desde,
  };
}

export function evStudentCreatedExtra(modo: "agora" | "whatsapp" | "depois" | "completo" | "receber"): StudentCreatedExtra {
  return { modo };
}
