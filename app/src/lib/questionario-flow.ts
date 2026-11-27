/**
 * Regras do questionário no celular (/questionario, track D). Puro: sem armazenamento, sem React, datas injetadas.
 * Usa o catálogo (`domain/anamnese.ts`), então só entra no pacote de /questionario e das telas do personal que já o
 * usam; o que precisa ir para todas as telas mora em `questionario-base.ts` e é reexportado aqui.
 *
 * Entrega 1: só o núcleo (Partes 0 a 5 e "Conferir e enviar"). Módulos, perguntas próprias, reavaliação, letra maior
 * e prévia têm lugar nos dados (o formato do link já os leva), mas não são pedidos nesta entrega.
 */
import type { Anamnese, AnamneseAnswers, Atendimento, CtxQuestionario, Modulo, SecaoId } from "@/lib/domain/anamnese-types";
import type { Pergunta } from "@/lib/domain/anamnese";
import { ANAMNESE_V, CONSENT_TEXT_ID, MODULOS, PARQ_TEXT_ID, ehExemplo } from "@/lib/domain/anamnese-types";
import {
  HEALTH_KEYS,
  PERGUNTAS,
  SECAO_TITULO,
  algumSimParq,
  comNomes,
  erroAno,
  primeiroNome,
  faltando,
  gravarResposta,
  lerResposta,
  limparOcultas,
  precisaResponsavel,
  secoesDoQuestionario,
  stripHealth,
} from "@/lib/domain/anamnese";
import { readAnamnese, type PedidoPacket, type ProblemaLink } from "@/lib/domain/questionario-link";
import type { Profile } from "@/lib/domain/types";
import type { Padroes } from "@/lib/domain/work-style";
import type { Rascunho } from "./questionario-client";

export {
  RASCUNHO_DIAS_DEPOIS_DO_ENVIO,
  RASCUNHO_DIAS_SEM_EDICAO,
  deveAquecer,
  ehPaginaQuestionario,
  limparEventoPosthog,
  perfisDoAparelho,
  persistenciaPosthog,
  rascunhoVencido,
} from "./questionario-base";
export type { LocalPagina } from "./questionario-base";

type Modo = "link" | "junto";
const DIA = 86_400_000;

// ---- Contexto -------------------------------------------------------------------------------------------------------

/** Contexto do link a partir do pedido. Entrega 1: sem módulos e sem perguntas próprias. [E2] `modulos`, `extras` e `reavaliacao` do pedido. */
export function ctxDoPedido(p: Pick<PedidoPacket, "coach" | "student" | "atendimento">, hoje: Date): CtxQuestionario {
  const ctx: CtxQuestionario = { hoje, modo: "link", modulos: [], personal: p.coach.name, aluno: p.student.name, extras: [] };
  if (p.atendimento) ctx.atendimento = p.atendimento;
  return ctx;
}

/** Contexto do junto (aparelho do personal). A falta de autorização entra por `ctxEfetivo`, a partir do rascunho. */
export function ctxDoJunto(i: { hoje: Date; personal: string; aluno: string; atendimento?: Atendimento }): CtxQuestionario {
  const ctx: CtxQuestionario = { hoje: i.hoje, modo: "junto", modulos: [], personal: i.personal, aluno: i.aluno, extras: [] };
  if (i.atendimento) ctx.atendimento = i.atendimento;
  return ctx;
}

function soModulos(v: readonly Modulo[] | undefined): Modulo[] {
  return MODULOS.filter((m) => (v ?? []).includes(m));
}

/**
 * O contexto que vale para este rascunho: o modo; módulos e perguntas próprias do rascunho, se houver; e, no junto sem a
 * autorização da boas-vindas, `semSaude` (as Partes 2 a 4, peso e altura não existem). Pelo link, `semSaude` nunca vale:
 * o aluno responde a saúde e decide no fim se autoriza (sem autorização, `stripHealth` no envio).
 */
export function ctxEfetivo(ctx: CtxQuestionario, r: Pick<Rascunho, "autorizouJunto" | "modulos" | "extras">, modo: Modo): CtxQuestionario {
  const out: CtxQuestionario = { ...ctx, modo, modulos: soModulos(r.modulos ?? ctx.modulos), extras: (r.extras ?? ctx.extras ?? []).slice(0, 3) };
  if (modo === "junto" && r.autorizouJunto !== true) out.semSaude = true;
  else delete out.semSaude;
  return out;
}

/**
 * A saúde pode ir? Link: a caixa de autorização (§11.1). Junto: a autorização da boas-vindas. Menor de 18 (leitura
 * cautelosa da idade): também a caixa do responsável, com o nome dele respondido (decisão do dono, entrada 19, item 3).
 * Sem isso, o botão vira "Enviar sem dados de saúde" e `montarAnamnese` tira a saúde.
 */
export function saudeAutorizada(r: Pick<Rascunho, "a" | "consent" | "autorizouJunto" | "responsavelOk">, modo: Modo, hoje: Date): boolean {
  const autorizou = modo === "link" ? r.consent === true : r.autorizouJunto === true;
  if (!autorizou) return false;
  if (precisaResponsavel(r.a, hoje)) return r.responsavelOk === true && typeof r.a.responsavel === "string" && r.a.responsavel.trim().length > 0;
  return true;
}

// ---- Respostas e rascunho -------------------------------------------------------------------------------------------

/**
 * Passa cada resposta de novo pelas regras do catálogo (`gravarResposta`): código fora da lista, número fora da faixa,
 * texto acima do teto e chave desconhecida somem. Serve para o rascunho lido do aparelho e antes de montar o pacote
 * (o esquema do link recusaria o pacote inteiro). Idempotente; não lança.
 */
export function sanearRespostas(raw: unknown): AnamneseAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  let out: AnamneseAnswers = {};
  for (const p of PERGUNTAS) {
    const v = lerResposta(raw as AnamneseAnswers, p.id);
    if (v !== undefined && v !== null) out = gravarResposta(out, p.id, v);
  }
  return out;
}

/** Texto de cima a baixo sem espaços sobrando; texto vazio sai. */
function aparar(a: AnamneseAnswers): AnamneseAnswers {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out[k] = t;
    else delete out[k];
  }
  return out as AnamneseAnswers;
}

/** Rascunho novo (no "Começar"). Pelo link, o nome vem do pedido ("{Personal} cadastrou assim. Corrija se precisar."). */
export function novoRascunho(i: { agora: string; nome?: string }): Rascunho {
  const nome = i.nome?.trim();
  return { a: nome ? gravarResposta({}, "nome", nome) : {}, parte: 0, at: i.agora, iniciadoEm: i.agora };
}

/**
 * Pré-marcação do junto pelo jeito de trabalhar (`resolveDefaults`): objetivo, dias, minutos, onde e equipamentos, só
 * onde ainda não há resposta. Nunca no link. Sem a autorização de saúde, "Treinar sem dor" (dado referente à saúde)
 * vira "Saúde e qualidade de vida", como em `stripHealth`.
 */
export function preMarcacaoJunto(a: AnamneseAnswers, p: Pick<Padroes, "objetivo" | "dias" | "minutos" | "onde" | "equipamentos">, semSaude: boolean): AnamneseAnswers {
  let out = a;
  const marcar = (id: keyof AnamneseAnswers, v: unknown) => {
    if (v !== undefined && out[id] === undefined) out = gravarResposta(out, id, v);
  };
  marcar("objetivo", semSaude && p.objetivo === "semDor" ? "saude" : p.objetivo);
  marcar("dias", p.dias);
  marcar("minutos", p.minutos);
  marcar("onde", p.onde);
  if (p.onde !== "academia" && p.equipamentos?.length) marcar("equipamentos", p.equipamentos);
  return out;
}

/**
 * O que vai para `salvarRascunho` (a cada resposta, com debounce de 400 ms): respostas conferidas, perguntas ocultas
 * limpas e `at` = agora. No junto sem a autorização da boas-vindas, nenhuma resposta de saúde nem o termo são gravados
 * (spec §4.3: o rascunho do aparelho do personal nunca guarda saúde sem autorização).
 */
export function rascunhoParaGravar(i: { rascunho: Rascunho; ctx: CtxQuestionario; modo: Modo; agora: string }): Rascunho {
  const ctx = ctxEfetivo(i.ctx, i.rascunho, i.modo);
  const out: Rascunho = { ...i.rascunho, a: limparOcultas(sanearRespostas(i.rascunho.a), ctx), at: i.agora };
  if (ctx.semSaude) delete out.termo;
  if (out.pulouPorAgora) {
    const ids = out.pulouPorAgora.filter((id) => !(ctx.semSaude && ehPerguntaDeSaude(id)));
    if (ids.length) out.pulouPorAgora = ids;
    else delete out.pulouPorAgora;
  }
  return out;
}

/** Pergunta do PAR-Q ou chave de saúde (HEALTH_KEYS). */
export function ehPerguntaDeSaude(id: string): boolean {
  return id.startsWith("parq.") || (HEALTH_KEYS as readonly string[]).includes(id);
}

// ---- Completar a rodada salva pela metade (junto) -------------------------------------------------------------------

/** A rodada atual é do junto e foi salva com "Salvar o que já tem" (`incompleto`)? Devolve-a; senão null. */
function rodadaIncompletaDoJunto(p: Profile): Anamnese | null {
  const an = readAnamnese(p);
  return an && typeof an === "object" && an.via === "junto" && an.incompleto?.length ? an : null;
}

/**
 * Id da rodada que o junto grava (spec §7, passo 3, "Completar o questionário"): a rodada incompleta do junto é
 * completada com o mesmo id, e `applyAnamnese` a substitui em vez de empurrá-la para `anamnesePrev` (não é uma
 * reavaliação anterior). null = rodada nova (quem chama gera o id).
 */
export function idDaRodadaIncompleta(p: Profile): string | null {
  return rodadaIncompletaDoJunto(p)?.id ?? null;
}

/**
 * Rascunho para continuar a rodada do junto salva pela metade, quando não há rascunho no aparelho (o rascunho é apagado
 * ao salvar): as respostas dela, a autorização da boas-vindas (sem saúde, desmarcada), o termo e a caixa do
 * responsável que já valiam, e a parte = a primeira incompleta ("Continuar de onde parei" entra direto nela).
 * null sem rodada incompleta do junto.
 */
export function rascunhoDaIncompleta(p: Profile, ctx: CtxQuestionario, agora: string): Rascunho | null {
  const an = rodadaIncompletaDoJunto(p);
  if (!an) return null;
  const r: Rascunho = { a: sanearRespostas(an.a), parte: 0, at: agora, iniciadoEm: an.answeredAt, autorizouJunto: !an.healthOmitted };
  if (an.termo) r.termo = true;
  if (an.consent?.responsavel) r.responsavelOk = true;
  const secoes = secoesDoQuestionario(ctxEfetivo(ctx, r, "junto"), r.a);
  const primeira = an.incompleto!.find((s) => secoes.includes(s));
  r.parte = primeira ? secoes.indexOf(primeira) : 0;
  return r;
}

// ---- Partes ---------------------------------------------------------------------------------------------------------

/** Próxima parte (índice em `secoes`), sem sair dos limites: a boas-vindas e a saída ficam com o voltar do navegador. */
export function proximaParte(secoes: SecaoId[], atual: number, dir: 1 | -1): number {
  if (secoes.length === 0) return 0;
  const ultima = secoes.length - 1;
  const base = Number.isFinite(atual) ? Math.min(Math.max(Math.trunc(atual), 0), ultima) : 0;
  return Math.min(Math.max(base + dir, 0), ultima);
}

/** Parte em que o rascunho parou ("Você parou na parte {nome}"; card "Questionário pela metade"). */
export function secaoDoRascunho(r: Rascunho, ctx: CtxQuestionario, modo: Modo): SecaoId {
  const secoes = secoesDoQuestionario(ctxEfetivo(ctx, r, modo), r.a);
  const i = Number.isFinite(r.parte) ? Math.min(Math.max(Math.trunc(r.parte), 0), secoes.length - 1) : 0;
  return secoes[i] ?? "voce";
}

// ---- Montagem da Anamnese -------------------------------------------------------------------------------------------

/**
 * A `Anamnese` que vai no pacote (link) ou para `applyAnamnese` (junto). Spec, track D, item 7:
 * - `id`: link = `pedido.id` (idempotência na recepção); junto = `uid()` novo (quem chama passa);
 * - `by`/`via` pelo modo; `parqText` = PARQ_TEXT_ID; módulos, pulados e perguntas próprias do rascunho;
 * - autorização (`consent`, origem "aluno_questionario" no link e "personal" no junto, `textId` = CONSENT_TEXT_ID, e o
 *   responsável para menor de 18); sem ela, `stripHealth` (healthOmitted, nenhuma chave de saúde, "semDor" → "saude",
 *   sem "dor" em barreira e sem "medica"/"dor" em motivo);
 * - `declaredAt` com "Minhas respostas são verdadeiras…"; `termo` com o nome respondido, só com algum "Sim" no PAR-Q;
 * - `incompleto` só no junto com "Salvar o que já tem" (`salvarIncompleto`): as partes com obrigatória sem resposta.
 * As respostas passam por `sanearRespostas` e `limparOcultas`; os textos chegam aparados.
 */
export function montarAnamnese(i: { rascunho: Rascunho; modo: Modo; id: string; ctx: CtxQuestionario; agora: string; salvarIncompleto?: boolean }): Anamnese {
  const { rascunho: r, modo, agora } = i;
  const ctx = ctxEfetivo(i.ctx, r, modo);
  const a = aparar(limparOcultas(sanearRespostas(r.a), ctx));
  const an: Anamnese = { v: ANAMNESE_V, id: i.id, answeredAt: agora, by: modo === "link" ? "aluno" : "personal", via: modo, modulos: ctx.modulos, parqText: PARQ_TEXT_ID, a };
  if (ctx.reavaliacao) an.reavaliacao = ctx.reavaliacao;
  const pulados = soModulos(r.pulados).filter((m) => ctx.modulos.includes(m));
  if (pulados.length) an.pulados = pulados;
  if (ctx.extras.length) {
    an.extras = ctx.extras.map((q, k) => {
      const resp = r.respostasExtras?.[k]?.trim();
      return resp ? { q, r: resp } : { q };
    });
  }
  if (r.declaro === true) an.declaredAt = agora;
  if (r.termo === true && algumSimParq(a)) an.termo = { at: agora, nome: a.nome ?? ctx.aluno.trim() };
  if (modo === "junto" && i.salvarIncompleto) {
    const incompleto = secoesDoQuestionario(ctx, a).filter((s) => faltando(s, a, ctx).length > 0);
    if (incompleto.length) an.incompleto = incompleto;
  }
  if (!saudeAutorizada({ ...r, a }, modo, ctx.hoje)) return stripHealth(an);
  an.consent = { at: agora, source: modo === "link" ? "aluno_questionario" : "personal", textId: CONSENT_TEXT_ID };
  if (precisaResponsavel(a, ctx.hoje)) an.consent.responsavel = { nome: a.responsavel!, at: agora };
  return an;
}

// ---- Guardas da página (spec §5.2 e §5.4, passo 2) ------------------------------------------------------------------

export type GuardaLink =
  | { tipo: "beco"; tela: "versao_nova" | "invalido" | "dono" | "ver_como_aluno"; motivo: "versao_nova" | "invalido" | "questionario_personal" }
  | { tipo: "segue"; pedido: PedidoPacket; aparelho: "aluno" | "outro" };

/**
 * Guardas do link, nesta ordem: problema do pacote (tipo desconhecido conta como versão nova: "Atualize a página");
 * [E2] prévia; aparelho do personal que pediu ("Este link é para {aluno} responder…", [Preencher aqui com {aluno}]);
 * aparelho de outro personal (aviso e segue); "Ver como aluno" ativo ("Volte ao painel…"). Cada beco dispara
 * `link_dead_end_shown{tela:"questionario", motivo}`. `usuario` = a sessão do aparelho (no "Ver como aluno", o aluno).
 */
export function guardaDoLink(i: { problema: ProblemaLink | null; pedido: PedidoPacket | null; usuario: Pick<Profile, "id" | "role"> | null; vendoComoAluno: boolean }): GuardaLink {
  if (i.problema === "versao_nova" || i.problema === "tipo_desconhecido") return { tipo: "beco", tela: "versao_nova", motivo: "versao_nova" };
  if (i.problema === "invalido" || !i.pedido) return { tipo: "beco", tela: "invalido", motivo: "invalido" };
  // [E2] prévia (?previa=1): pula as guardas de aparelho.
  if (i.usuario?.role === "coach") {
    if (i.usuario.id === i.pedido.coach.id) return { tipo: "beco", tela: "dono", motivo: "questionario_personal" };
    return { tipo: "segue", pedido: i.pedido, aparelho: "outro" };
  }
  if (i.vendoComoAluno) return { tipo: "beco", tela: "ver_como_aluno", motivo: "questionario_personal" };
  return { tipo: "segue", pedido: i.pedido, aparelho: "aluno" };
}

/**
 * Junto (`?aluno={id}`): "Ver como aluno" ativo → "Você está vendo como {aluno}…"; sem perfil de personal ou aluno de
 * outro personal → "Este aluno não está neste aparelho."; senão, segue.
 */
export function guardaDoJunto(i: { usuario: Pick<Profile, "id" | "role"> | null; vendoComoAluno: boolean; aluno: Pick<Profile, "managedBy"> | null }): "ok" | "ver_como_aluno" | "nao_esta" {
  if (i.vendoComoAluno) return "ver_como_aluno";
  if (i.usuario?.role !== "coach" || !i.aluno || i.aluno.managedBy !== i.usuario.id) return "nao_esta";
  return "ok";
}

/** Aluno de exemplo ou da demonstração: nenhum evento (regra para todos da spec). */
export function eventosLigados(aluno: { id: string; sample?: boolean }): boolean {
  return !ehExemplo(aluno);
}

/** Pedido com mais de 60 dias: "Este pedido é de {DD/MM}. Se {personal} mandou um link mais novo, use o novo." */
export const PEDIDO_VELHO_DIAS = 60;
export function pedidoVelho(sentAt: string, agora: Date): boolean {
  const t = Date.parse(sentAt);
  return Number.isFinite(t) && agora.getTime() - t > PEDIDO_VELHO_DIAS * DIA;
}

// ---- Tela: regras pequenas e textos (puros, para teste) ---------------------------------------------------------------

const dois = (n: number) => String(n).padStart(2, "0");
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Primeiro nome; vazio vira o substituto. */
const pn = (nome: string | undefined, seVazio: string) => primeiroNome(nome) || seVazio;
/** Primeiro nome com maiúscula (começo de frase). */
const Pn = (nome: string | undefined, seVazio: string) => maiuscula(pn(nome, seVazio));

/** "Falta responder: 1 pergunta" / "Falta responder: 3 perguntas". */
export function textoFalta(n: number): string {
  const k = Math.max(1, Math.trunc(n));
  return `Falta responder: ${k} ${k === 1 ? "pergunta" : "perguntas"}`;
}

/** "14:05" no fuso do aparelho; "" com data ilegível. */
export function horaMinuto(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "Salvo neste celular às 14:05" (link) / "Salvo neste aparelho às 14:05" (junto). Fica fora de região viva. */
export function linhaSalvo(iso: string, modo: Modo): string {
  const h = horaMinuto(iso);
  if (!h) return "";
  return `Salvo neste ${modo === "link" ? "celular" : "aparelho"} às ${h}`;
}

/** "Parte N de M" e o título da parte (com os nomes trocados). Parte fora da lista: a primeira. */
export function rotuloParte(secoes: SecaoId[], secao: SecaoId, ctx: Pick<CtxQuestionario, "personal" | "aluno">): { n: number; m: number; titulo: string; texto: string } {
  const i = Math.max(0, secoes.indexOf(secao));
  const titulo = comNomes(SECAO_TITULO[secoes[i] ?? secao], ctx);
  return { n: i + 1, m: Math.max(1, secoes.length), titulo, texto: `Parte ${i + 1} de ${Math.max(1, secoes.length)}` };
}

/** Parte guardada no histórico (`history.state.qSecao`) que ainda existe agora; senão null. */
export function secaoDoHistorico(estado: unknown, secoes: readonly SecaoId[]): SecaoId | null {
  const s = estado && typeof estado === "object" ? (estado as { qSecao?: unknown }).qSecao : undefined;
  return typeof s === "string" && (secoes as readonly string[]).includes(s) ? (s as SecaoId) : null;
}

/** Texto inicial de um campo numérico a partir da resposta guardada ("72,5" no peso). */
export function textoDoNumero(id: string, v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return id === "peso" ? String(v).replace(".", ",") : String(v);
}

/**
 * Erro de um campo numérico digitado, conferido no "Continuar": o ano com o texto da spec (ERRO_ANO, faixa de hoje); os
 * outros quando o texto digitado não vira resposta (fora da faixa ou não é número). Vazio: null (quem avisa é `faltando`).
 */
export function erroDoNumero(p: Pick<Pergunta, "id" | "tipo" | "min" | "max">, texto: string | undefined, hoje: Date): string | null {
  if (p.tipo !== "num" || texto === undefined || texto.trim() === "") return null;
  if (p.id === "ano") return erroAno(texto, hoje);
  const ok = lerResposta(gravarResposta({}, p.id, texto), p.id) !== undefined;
  if (ok) return null;
  return p.min !== undefined && p.max !== undefined ? `Confira: use um número de ${p.min} a ${p.max}.` : "Confira: use só números.";
}

/** O que ainda impede o envio (ou o "Salvar e ver o resumo"): obrigatórias de todas as partes e a caixa "declaro". */
export function pendenciasDoEnvio(i: { rascunho: Rascunho; ctx: CtxQuestionario; modo: Modo }): { faltam: Pergunta[]; declaro: boolean } {
  const ctx = ctxEfetivo(i.ctx, i.rascunho, i.modo);
  const pulou = new Set(i.modo === "junto" ? (i.rascunho.pulouPorAgora ?? []) : []);
  const faltam = faltando("todas", i.rascunho.a, ctx).filter((p) => !pulou.has(p.id));
  return { faltam, declaro: i.rascunho.declaro === true };
}

/** Obrigatórias sem resposta no junto, inclusive as deixadas com "Pular por agora" ("Salvar o que já tem"). */
export function faltandoNoJunto(r: Rascunho, ctx: CtxQuestionario): Pergunta[] {
  return faltando("todas", r.a, ctxEfetivo(ctx, r, "junto"));
}

/**
 * O que entra no pacote de respostas: muda o link. O botão Enviar só fica pronto com um pacote montado para a chave
 * atual (desmarcar a autorização e tocar rápido nunca manda o pacote antigo, com saúde).
 */
export function chaveDoEnvio(r: Rascunho): string {
  return JSON.stringify([r.consent === true, r.responsavelOk === true, r.declaro === true, r.termo === true, r.a]);
}

/** Rótulo do botão de envio pelo link e a linha ligada a ele por aria-describedby (spec §4.10, itens 6 e 7). */
export function rotuloDoEnvio(i: { autorizada: boolean; telefone: boolean; personal: string }): { botao: string; linha: string } {
  if (!i.autorizada) return { botao: QTEXTO.enviarSemSaude, linha: QTEXTO.enviarSemSaudeLinha(i.personal) };
  if (!i.telefone) return { botao: QTEXTO.enviarSemTel, linha: QTEXTO.enviarSemTelDica(i.personal) };
  return { botao: QTEXTO.enviarPara(i.personal), linha: QTEXTO.enviarLinha };
}

/**
 * Botão principal do fim do junto e a linha ligada a ele por aria-describedby. Com a autorização da boas-vindas marcada
 * mas sem a do responsável de um menor, a saúde não é salva (`saudeAutorizada`): o botão diz isso, como o "Enviar sem
 * dados de saúde" do link, em vez de salvar sem avisar.
 */
export function rotuloDoSalvarJunto(i: { autorizouJunto: boolean; saudeVai: boolean; responsavel: string }): { botao: string; linha: string | null } {
  if (i.autorizouJunto && !i.saudeVai) return { botao: QTEXTO.salvarSemSaude, linha: QTEXTO.salvarSemSaudeLinha(i.responsavel) };
  return { botao: QTEXTO.salvarResumo, linha: null };
}

/**
 * Textos finais da tela (spec §4.3, §4.10, §5.2, §5.4 e §11.1). Nomes: primeiro nome, exceto onde a spec pede o nome
 * do personal inteiro (autorização). Nenhum texto recebe resposta.
 */
export const QTEXTO = {
  // Boas-vindas pelo link (§4.3)
  oi: (aluno: string) => (primeiroNome(aluno) ? `Oi, ${primeiroNome(aluno)}!` : "Oi!"),
  quer: (personal: string) => `${Pn(personal, "Seu personal")} quer conhecer você para montar seu treino com segurança.`,
  partes: (n: number, m: number) => `São ${n} partes curtas, uns ${m} minutos.`,
  parar: "Dá para parar e continuar depois, neste celular e neste navegador, por alguns dias.",
  semBaixar: "Não precisa baixar nada nem criar conta.",
  temSaude: "Tem perguntas sobre saúde. Suas respostas não saem deste celular até você tocar em Enviar, no final.",
  medicao: "Contamos o uso desta página, sem nenhuma resposta.",
  saibaMais: "Saiba mais",
  comecar: "Começar",
  naoE: (aluno: string, personal: string) => `Não é ${pn(aluno, "você")}? Peça um link seu para ${pn(personal, "seu personal")}.`,
  parou: (titulo: string) => `Você parou na parte ${titulo}.`,
  continuarDeOndeParei: "Continuar de onde parei",
  comecarDeNovo: "Começar de novo",
  confirmaApagar: "Apagar as respostas e começar de novo?",
  jaEnviou: (dia: string, hora: string, personal: string) => `Você já enviou em ${dia} às ${hora}. Se ${pn(personal, "seu personal")} não recebeu, toque em Responder de novo.`,
  responderDeNovo: "Responder de novo",
  velho: (dia: string, personal: string) => `Este pedido é de ${dia}. Se ${pn(personal, "seu personal")} mandou um link mais novo, use o novo.`,
  continuarMesmoAssim: "Continuar mesmo assim",
  outroPersonal: (personal: string, aluno: string) => `Este questionário foi enviado por ${pn(personal, "outro personal")} para ${pn(aluno, "um aluno")}.`,
  // Boas-vindas junto (§4.3)
  juntoTitulo: (aluno: string) => `Questionário com ${pn(aluno, "o aluno")}`,
  juntoTexto: (aluno: string, m: number) =>
    `Leia as perguntas para ${pn(aluno, "o aluno")} ou passe o celular. As perguntas falam com o aluno (“você”). Uns ${m} minutos. As respostas ficam neste aparelho.`,
  juntoAutorizou: (aluno: string) => `${Pn(aluno, "O aluno")} autorizou guardar as respostas de saúde para montar e acompanhar o treino.`,
  juntoSemAutorizacao: "Sem a autorização, as perguntas de saúde ficam de fora.",
  juntoCabecalho: (aluno: string) => `Questionário de ${pn(aluno, "aluno")}`,
  salvarDepois: "Salvar e terminar depois",
  pularPorAgora: "Pular por agora",
  pulada: "Pulada por agora.",
  // Partes
  continuar: "Continuar",
  voltarConferir: "Voltar para Conferir e enviar",
  porQue: "Por que perguntamos?",
  opcional: "opcional",
  faltaAqui: "Falta responder.",
  confira: (n: number) => (n === 1 ? "Confira 1 resposta." : `Confira ${n} respostas.`),
  semSalvar: "Este navegador não está guardando as respostas. Se fechar a página, elas se perdem.",
  // Conferir e enviar (§4.10 e §11.1)
  recado: (personal: string) => `Quer contar mais alguma coisa para ${pn(personal, "seu personal")}?`,
  recadoSemSaude: "Sem a autorização, não escreva nada sobre saúde aqui.",
  verRespostas: "Ver minhas respostas",
  editar: "Editar",
  imprimir: "Imprimir",
  declaro: (personal: string) => `Minhas respostas são verdadeiras. Se minha saúde mudar, aviso ${pn(personal, "meu personal")} e respondo de novo.`,
  faltaDeclaro: "Falta marcar: Minhas respostas são verdadeiras.",
  autorizacaoTitulo: "Autorização para usar seus dados de saúde",
  autorizacaoIntro: "Este questionário tem dados de saúde (doenças, remédios, dores, gestação). Pela LGPD, eles só podem ser usados com a sua autorização.",
  quemRecebe: (assinatura: string) => `${assinatura}. As respostas não passam pelo servidor do Shape Real.`,
  paraQue: "só para montar e acompanhar o seu treino e ver se é preciso falar com um médico antes de começar.",
  como: (personal: string) => {
    const p = pn(personal, "seu personal");
    return `as respostas vão dentro do link que você manda pelo WhatsApp e ficam guardadas no celular de ${p} e nas cópias de segurança que ${p} fizer. Quem tiver o link consegue ler as respostas: não encaminhe essa mensagem para outras pessoas.`;
  },
  direitos: (personal: string) => `pedir para ver, corrigir ou apagar suas respostas e retirar esta autorização quando quiser, falando com ${pn(personal, "seu personal")}.`,
  autorizo: (nomePersonal: string) => `Autorizo ${nomePersonal.trim() || "meu personal"} a guardar e usar minhas respostas de saúde para montar e acompanhar meu treino.`,
  semAutorizacao: (personal: string) => `Sem autorização, você pode enviar só o resto (objetivo, rotina e treino). As perguntas de saúde ficam para ${pn(personal, "seu personal")} fazer pessoalmente.`,
  menorIntro: "Como você tem menos de 18 anos, seu responsável precisa autorizar também.",
  menorCaixa: (aluno: string, responsavel: string, nomePersonal: string) =>
    `Sou responsável por ${aluno.trim() || "este aluno"} (${responsavel.trim()}) e autorizo ${nomePersonal.trim() || "o personal"} a guardar e usar estas respostas de saúde para montar e acompanhar o treino.`,
  menorSemNome: "Para enviar as respostas de saúde, escreva o nome do responsável na parte Você.",
  enviarPara: (personal: string) => `Enviar para ${pn(personal, "seu personal")} no WhatsApp`,
  enviarLinha: "Abre o WhatsApp com a mensagem pronta. É só tocar em enviar.",
  enviarSemTel: "Enviar pelo WhatsApp",
  enviarSemTelDica: (personal: string) => `Escolha a conversa com ${pn(personal, "seu personal")}.`,
  enviarSemSaude: "Enviar sem dados de saúde",
  enviarSemSaudeLinha: (personal: string) => `As respostas de saúde (Partes 2 a 4, peso, altura e hábitos) não vão. ${Pn(personal, "Seu personal")} faz essas perguntas pessoalmente.`,
  semInternet: "Sem internet agora. Suas respostas estão salvas: toque em Enviar quando o sinal voltar.",
  preparando: "Preparando a mensagem…",
  jaEnviei: "Já enviei",
  // Deu certo? (§5.4, passos 5 e 6)
  deuCertoTitulo: "Deu certo?",
  deuCertoTexto: (personal: string) => `Se você tocou em enviar no WhatsApp, pronto: ${pn(personal, "seu personal")} recebe suas respostas.`,
  simEnviei: "Sim, enviei",
  tentarDeNovo: "Não enviou: tentar de novo",
  copiar: "Copiar mensagem",
  fimLink: (aluno: string, personal: string) =>
    `Pronto${primeiroNome(aluno) ? `, ${primeiroNome(aluno)}` : ""}! ${Pn(personal, "Seu personal")} vai ler suas respostas e falar com você. Quando chegar sua ficha, é só abrir o link que ${pn(personal, "seu personal")} mandar.`,
  // Junto: conferir e salvar (§4.10 e §5.2)
  juntoAutorizouConferir: (aluno: string) => `${Pn(aluno, "O aluno")} leu e autorizou guardar estas respostas de saúde para montar e acompanhar o treino.`,
  juntoMenorIntro: (aluno: string) => `Como ${pn(aluno, "o aluno")} tem menos de 18 anos, o responsável precisa autorizar também.`,
  juntoResponsavel: (responsavel: string) => `${responsavel.trim()} autorizou guardar e usar estas respostas de saúde para montar e acompanhar o treino.`,
  salvarResumo: "Salvar e ver o resumo",
  salvarSemSaude: "Salvar sem dados de saúde",
  salvarSemSaudeLinha: (responsavel: string) =>
    `Sem a autorização ${responsavel.trim() ? `de ${responsavel.trim()}` : "do responsável"}, as respostas de saúde (Partes 2 a 4, peso e altura) não são salvas.`,
  salvarOQueTem: "Salvar o que já tem",
  salvarOQueTemLinha: (n: number) => (n === 1 ? "1 pergunta fica sem resposta e aparece como “Pulou” no resumo." : `${n} perguntas ficam sem resposta e aparecem como “Pulou” no resumo.`),
  erroSalvar: "Não deu para salvar neste aparelho. Tente de novo.",
  juntoSalvo: (aluno: string) => `Respostas de ${pn(aluno, "do aluno")} salvas neste aparelho.`,
  abrirPagina: (aluno: string) => `Abrir a página de ${pn(aluno, "do aluno")}`,
  // Becos sem saída (§5.2 e §5.4, passo 2)
  linkNaoAbriu: "Este link não abriu",
  dono: (aluno: string) => `Este link é para ${pn(aluno, "o aluno")} responder no celular dele ou dela.`,
  preencherAqui: (aluno: string) => `Preencher aqui com ${pn(aluno, "o aluno")}`,
  verComoAlunoLink: "Você está vendo como aluno. Volte ao painel para pedir ou preencher o questionário.",
  verComoAlunoJunto: (aluno: string) => `Você está vendo como ${pn(aluno, "aluno")}. Volte ao painel para preencher o questionário.`,
  voltarPainel: "Voltar ao painel",
  naoEsta: "Este aluno não está neste aparelho.",
  voltar: "Voltar",
} as const;
