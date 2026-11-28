/**
 * O questionário no perfil do aluno, do lado do personal (spec §6.1, §7, §11.2 e track C): selo da lista, revogação,
 * "Apagar respostas", visto, termo, passos feitos e o aviso da aba Dieta. Puro (sem React, sem armazenamento).
 *
 * Respostas só por `readAnamnese`. Nenhum texto daqui nomeia condição, sintoma ou remédio: a lista e a aba Dieta
 * aparecem na academia, na frente de outras pessoas.
 */
import type { FichaLinkExtra, StrictEventProps } from "@/lib/analytics";
import { evFichaLinkExtra, evNextStep } from "@/lib/anamnese-events";
import type { AcaoPasso, AlertId, Alerta, Anamnese, Origem, Passo, StepId } from "./anamnese-types";
import { ehExemplo } from "./anamnese-types";
import { algumSimParq, fmtData, fmtDiaMes, gatilhoNutricionista, precisaResponsavel, primeiroNome, stripHealth } from "./anamnese";
import { mergeLimitations } from "./anamnese-ficha";
import { calendarDaysSince } from "./attention";
import { SEM_LIBERACAO_MEDICA, pedidoPendente } from "./next-steps";
import { readAnamnese } from "./questionario-link";
import { mensagemAvisar, TITULO_SAUDE_INCOMPLETA, travaEPorta } from "./triagem";
import type { Profile } from "./types";

export type Selo = "nao_comecar" | "liberacao_pendente" | "respostas_novas" | "questionario_pendente";

/** Textos fixos do selo (spec §6.1). "Questionário pendente" ganha os dias em `textoPendente`. */
export const SELO_TEXTO: Record<Exclude<Selo, "questionario_pendente">, string> = {
  nao_comecar: "Não começar: ver resumo",
  liberacao_pendente: "Liberação pendente",
  respostas_novas: "Respostas novas",
};

/** "Questionário pendente · 3 dias" (· 1 dia; no dia do pedido, · pedido hoje). */
export function textoPendente(dias: number): string {
  const n = Math.max(0, Math.trunc(dias));
  if (n === 0) return "Questionário pendente · pedido hoje";
  return `Questionário pendente · ${n === 1 ? "1 dia" : `${n} dias`}`;
}

/** Passos que só existem por causa da saúde (spec §11.3): a marca de "feito" deles é derivado de saúde. */
const PASSOS_CLINICOS: readonly StepId[] = ["liberacao", "triagem_presencial", "termo", "nutricionista_clinico", "atualizar_saude"];

type Leitura = { an: Anamnese | null; problema: boolean };
function ler(p: Profile, campo: "anamnese" | "anamnesePrev" = "anamnese"): Leitura {
  const r = readAnamnese(p, campo);
  if (r === "versao_nova" || r === "invalida") return { an: null, problema: true };
  return { an: r, problema: false };
}

/**
 * Pedido pelo WhatsApp sem resposta mais nova que ele: a regra do passo `questionario` (next-steps.ts, fonte única),
 * reexportada para a lista e a fila. Os laranjas que não pedem liberação médica (`SEM_LIBERACAO_MEDICA`: triagem
 * pessoalmente e PAR-Q para completar) também vêm de lá: o selo não diz "Liberação pendente" quando a página não pede.
 */
export { pedidoPendente };

/**
 * Dias de calendário desde o pedido ainda sem resposta (fila de contato e selo); null sem pedido pendente ou com
 * respostas que não dá para ler (nada a afirmar sobre elas).
 */
export function diasDePedidoPendente(p: Profile, hoje: Date): number | null {
  if (!p.anamnesePedido) return null;
  const { an, problema } = ler(p);
  if (problema || !pedidoPendente(p, an)) return null;
  if (!Number.isFinite(Date.parse(p.anamnesePedido.at))) return null;
  return calendarDaysSince(p.anamnesePedido.at, hoje);
}

/**
 * Um selo por linha em /alunos, nesta ordem (spec §6.1): "Não começar: ver resumo" (alerta vermelho aberto, ou
 * respostas que não dá para ler) > "Liberação pendente" (laranja aberto que pede liberação) > "Respostas novas"
 * (chegaram pelo link e o personal ainda não viu o resumo) > "Questionário pendente · N dias". Nunca nomeia condição.
 */
export function seloDoAluno(p: Profile, hoje: Date): { selo: Selo; texto: string } | null {
  const { an, problema } = ler(p);
  if (problema) return { selo: "nao_comecar", texto: SELO_TEXTO.nao_comecar };
  if (an) {
    const { trava, porta } = travaEPorta(an, { hoje, liberacoes: p.liberacoes ?? [] });
    if (trava.length) return { selo: "nao_comecar", texto: SELO_TEXTO.nao_comecar };
    if (porta.some((x) => !SEM_LIBERACAO_MEDICA.includes(x.id))) return { selo: "liberacao_pendente", texto: SELO_TEXTO.liberacao_pendente };
    if (an.receivedAt && !an.vistoEm) return { selo: "respostas_novas", texto: SELO_TEXTO.respostas_novas };
  }
  const dias = diasDePedidoPendente(p, hoje);
  if (dias !== null) return { selo: "questionario_pendente", texto: textoPendente(dias) };
  return null;
}

/** Tira as marcas de "feito" dos passos clínicos; undefined quando não sobra nenhuma. */
function semPassosClinicos(feitos: Profile["passosFeitos"]): Profile["passosFeitos"] {
  if (!feitos) return undefined;
  const resto = Object.fromEntries(Object.entries(feitos).filter(([k]) => !PASSOS_CLINICOS.includes(k as StepId)));
  return Object.keys(resto).length ? resto : undefined;
}

function semCampos(p: Profile, campos: readonly (keyof Profile)[]): Profile {
  const next = { ...p } as Record<string, unknown>;
  for (const c of campos) delete next[c];
  return next as unknown as Profile;
}

/**
 * Há dado de saúde do questionário neste perfil? Respostas (atuais ou anteriores) com saúde, respostas que não dá
 * para ler (podem ter) ou liberações registradas. É o que a revogação apaga (pede a confirmação de spec §11.2).
 */
export function temSaudeNoQuestionario(p: Profile): boolean {
  if (p.liberacoes?.length) return true;
  return (["anamnese", "anamnesePrev"] as const).some((campo) => {
    if (!p[campo]) return false;
    const { an, problema } = ler(p, campo);
    return problema || (!!an && !an.healthOmitted);
  });
}

/**
 * Rodada 3 (R3-9 item 4): frase curta das cópias de segurança, a mesma nas três confirmações que apagam saúde neste
 * aparelho (revogar, "Apagar respostas" e "Remover {nome}?"). Apagar aqui não alcança um arquivo de cópia baixado antes.
 * Nunca no diálogo de restaurar: depois do R3-13, restaurar no mesmo aparelho não traz a saúde de volta.
 */
export const TEXTO_COPIAS_ANTIGAS = "Cópias de segurança feitas antes continuam com esses dados. Apague os arquivos se não precisar deles.";

/** Confirmação ao desmarcar a autorização em "Editar dados" (spec §11.2, literal), com a frase das cópias (R3-9). */
export const TEXTO_REVOGAR = `As respostas de saúde do questionário e as liberações registradas serão apagadas. ${TEXTO_COPIAS_ANTIGAS}`;

/**
 * Autorização de saúde retirada (spec §11.2): `stripHealth` nas respostas atuais e anteriores (as ilegíveis saem
 * inteiras: não dá para separar a saúde do resto), liberações, limitações, peso, altura, os tokens do app e a
 * autorização removidos, e as marcas de passos clínicos apagadas. Mantém nome, objetivo, dias, foco e o pedido.
 * Quem chama grava `marcarApagado` para cada `idsDeRespostas` (antes de revogar) e salva o perfil devolvido inteiro.
 * Com `agora`, grava `saudeRevogadaEm` (só a data): uma cópia de segurança de antes não desfaz a revogação.
 */
export function revogarSaude(p: Profile, agora?: string): Profile {
  const next = semCampos(p, ["liberacoes", "limitations", "weightKg", "heightCm", "limitacoesDoQuestionario", "consentHealthAt", "consentSource", "passosFeitos"]);
  if (agora) next.saudeRevogadaEm = agora;
  for (const campo of ["anamnese", "anamnesePrev"] as const) {
    if (!p[campo]) continue;
    const { an } = ler(p, campo);
    if (an) next[campo] = stripHealth(an);
    else delete next[campo];
  }
  const feitos = semPassosClinicos(p.passosFeitos);
  if (feitos) next.passosFeitos = feitos;
  return next;
}

/** Valores numéricos de uma resposta nas duas rodadas legíveis (para saber o que foi copiado para o cadastro). */
function respostasNumericas(p: Profile, chave: "peso" | "altura"): number[] {
  return (["anamnese", "anamnesePrev"] as const).flatMap((campo) => {
    const v = ler(p, campo).an?.a[chave];
    return typeof v === "number" ? [v] : [];
  });
}

/**
 * Peso que pode ir para a IA da dieta (/api/ai/diet): nunca o que foi copiado do questionário (rodada atual ou
 * anterior). As respostas não passam pelo servidor do Shape Real (texto da autorização, §11.1).
 */
export function pesoParaIA(p: Profile): number | undefined {
  if (typeof p.weightKg !== "number") return undefined;
  return respostasNumericas(p, "peso").includes(p.weightKg) ? undefined : p.weightKg;
}

/**
 * "Apagar respostas do questionário" (spec §11.2): remove as respostas atuais e anteriores, as liberações, o pedido,
 * os tokens que o app pôs nas limitações e as marcas de passos clínicos. A autorização e o resto do cadastro ficam.
 * `comCadastro` ("Apagar também as limitações e medidas copiadas para o cadastro"): tira das limitações só os trechos
 * que o app acrescentou (o texto do personal fica) e o peso e a altura iguais aos que o aluno respondeu (medida que o
 * personal registrou com outro valor fica).
 * Quem chama grava `marcarApagado` para cada `idsDeRespostas` ANTES (depois, as respostas já não estão no perfil).
 * Com `agora`, grava `respostasApagadasEm` (só a data): uma cópia de segurança de antes não traz as respostas de volta.
 */
export function apagarRespostas(p: Profile, comCadastro: boolean, agora?: string): Profile {
  const next = semCampos(p, ["anamnese", "anamnesePrev", "liberacoes", "anamnesePedido", "limitacoesDoQuestionario", "passosFeitos"]);
  if (agora) next.respostasApagadasEm = agora;
  const feitos = semPassosClinicos(p.passosFeitos);
  if (feitos) next.passosFeitos = feitos;
  if (!comCadastro) return next;
  const doApp = p.limitacoesDoQuestionario ?? [];
  if (doApp.length && p.limitations !== undefined) {
    const texto = mergeLimitations(p.limitations, doApp, []).texto;
    if (texto) next.limitations = texto;
    else delete next.limitations;
  }
  if (typeof p.weightKg === "number" && respostasNumericas(p, "peso").includes(p.weightKg)) delete next.weightKg;
  if (typeof p.heightCm === "number" && respostasNumericas(p, "altura").includes(p.heightCm)) delete next.heightCm;
  return next;
}

/**
 * Ids das rodadas no perfil (atual e anterior), para `sr:v1:qapagado:{id}`. De respostas que não dá para ler, só o
 * id (texto curto), sem ler mais nada: a mensagem antiga do WhatsApp também não pode trazê-las de volta sem aviso.
 */
export function idsDeRespostas(p: Profile): string[] {
  const ids: string[] = [];
  for (const campo of ["anamnese", "anamnesePrev"] as const) {
    const bruto = p[campo] as unknown;
    if (!bruto) continue;
    const { an } = ler(p, campo);
    const id = an ? an.id : typeof bruto === "object" ? (bruto as { id?: unknown }).id : undefined;
    if (typeof id === "string" && id.trim() && id.length <= 120 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** O personal viu o resumo: grava `vistoEm` (tira o selo "Respostas novas"). Sem mudança, devolve o mesmo perfil. */
export function marcarVisto(p: Profile, agora: string): Profile {
  const { an } = ler(p);
  if (!an || an.vistoEm) return p;
  return { ...p, anamnese: { ...an, vistoEm: agora } };
}

/**
 * Termo do PAR-Q assinado no aparelho do personal ("{aluno} leu e concordou com o termo"): grava `termo` com o nome
 * do aluno no cadastro e a data. Sem respostas legíveis ou sem dados de saúde (sem PAR-Q), devolve o mesmo perfil.
 */
export function registrarTermo(p: Profile, agora: string): Profile {
  const { an } = ler(p);
  if (!an || an.healthOmitted) return p;
  const nome = p.name.trim().replace(/\s+/g, " ") || an.a.nome?.trim() || "";
  return { ...p, anamnese: { ...an, termo: { at: agora, nome } } };
}

/** [Feito] de um passo informativo: `passosFeitos[passo] = agora`. */
export function marcarFeito(p: Profile, passo: StepId, agora: string): Profile {
  return { ...p, passosFeitos: { ...p.passosFeitos, [passo]: agora } };
}

/**
 * Aviso fixo da aba Dieta (spec §7, fim): com gatilho clínico de nutricionista (inclui o transtorno alimentar,
 * A-ALIMENTAR). Não nomeia a condição. null sem gatilho, sem respostas legíveis ou sem dados de saúde.
 */
export function avisoDieta(p: Profile): string | null {
  const { an } = ler(p);
  if (!an || !gatilhoNutricionista(an)) return null;
  const aluno = primeiroNome(p.name) || "Este aluno";
  return `${aluno} informou uma condição em que o plano alimentar é do nutricionista. Use esta aba só para registrar as metas que o nutricionista passar.`;
}

/**
 * Chaves do questionário em `ficha_link_sent` (spec §12): primeiro envio deste aluno neste aparelho (`primeira`, lido
 * no registro antes de gravar o toque), horas desde o cadastro, como o questionário foi feito ("link", "junto" ou
 * "nenhum"; respostas ilegíveis contam como "nenhum") e se o aluno é de depois da publicação. Nada de resposta: dois
 * alunos que só diferem na saúde dão as mesmas chaves.
 */
export function extraDoEnvioDaFicha(student: Profile, primeira: boolean, agora: string): FichaLinkExtra {
  const { an } = ler(student);
  return evFichaLinkExtra({ primeira, criadoEm: student.createdAt, agora, questionario: an ? an.via : "nenhum" });
}

// ───────────────────────── Página do aluno e lista ─────────────────────────

/** Há respostas no perfil (legíveis ou não): mostra "Apagar respostas do questionário". */
export function temRespostas(p: Profile): boolean {
  return Boolean(p.anamnese || p.anamnesePrev);
}

/** Item do menu "Mais opções" ([E1]): sem questionário, "Fazer o questionário"; com, "… de novo" (rodada completa). */
export function rotuloFazerQuestionario(p: Profile): string {
  return p.anamnese ? "Fazer o questionário de novo" : "Fazer o questionário";
}

/**
 * Alerta de `?novo=1` (spec §5.1). Com a chave desligada, o texto de antes. Com a chave: sem questionário nem pedido,
 * "Faça o questionário inicial antes da ficha."; com pedido ou respostas, só o cadastro concluído (o passo diz o resto).
 */
export function avisoCadastroNovo(p: Profile, questionarioLigado: boolean): string {
  const nome = primeiroNome(p.name) || "aluno";
  if (!questionarioLigado) return `Cadastro de ${nome} concluído. O próximo passo é montar a ficha.`;
  if (p.anamnese || p.anamnesePedido) return `Cadastro de ${nome} concluído.`;
  return `Cadastro de ${nome} concluído. Faça o questionário inicial antes da ficha.`;
}

/** Cartão do jeito de trabalhar em /alunos (spec §3.1). `sr:v1:ws-cartao = "0"` grava o "Agora não". */
export const CARTAO_JEITO_KEY = "sr:v1:ws-cartao";
export const CARTAO_JEITO_TEXTO = "Conte em 5 toques como você trabalha e o app já deixa o questionário, o cadastro e a ficha do seu jeito.";
/** Só com a chave `questionario`, para o personal que ainda não respondeu nem pulou e não dispensou o cartão. */
export function mostrarCartaoJeito(coach: Pick<Profile, "role" | "workStyle"> | null | undefined, questionarioLigado: boolean, dispensado: boolean): boolean {
  if (!coach || coach.role !== "coach" || !questionarioLigado || dispensado) return false;
  return !coach.workStyle?.definidoEm && !coach.workStyle?.puladoEm;
}

/** "Veio de: {pergunta curta} → {resposta}", em letra pequena embaixo de cada linha do resumo. */
export function veioDe(o: Origem): string {
  return `Veio de: ${o.pergunta} → ${o.resposta}`;
}

const POR_ROTULO: Record<"medico" | "obstetra" | "fisio" | "outro", string> = { medico: "médico", obstetra: "obstetra", fisio: "fisioterapeuta", outro: "outro profissional" };

/**
 * Linha do alerta coberto (spec §6.2, bloco 1): "Liberado por médico em 23/11; restrições: …". "Seguir mesmo assim"
 * (laranja) e "Conversei" (A-PESSOAL) dizem o que o personal registrou. null sem cobertura.
 */
export function textoCoberto(al: Pick<Alerta, "coberto">, aluno: string): string | null {
  const c = al.coberto;
  if (!c) return null;
  const quando = fmtDiaMes(c.data);
  if (c.por === "override") return `Você seguiu mesmo assim em ${quando}.`;
  if (c.por === "conversei") return `Você conversou com ${primeiroNome(aluno) || "o aluno"} em ${quando}.`;
  return `Liberado por ${POR_ROTULO[c.por]} em ${quando}${c.restricoes ? `; restrições: ${c.restricoes}` : ""}`;
}

/** [E1] Liberação que cobria o alerta, mas é anterior a estas respostas (spec §6.4). */
export function textoLiberacaoAnterior(al: Pick<Alerta, "liberacaoAnterior">): string | null {
  const l = al.liberacaoAnterior;
  return l ? `Liberação de ${fmtDiaMes(l.data)} é anterior a estas respostas. Registre de novo se ainda vale.` : null;
}

export type AcaoAlerta =
  | { tipo: "liberacao"; rotulo: string }
  | { tipo: "avisar"; rotulo: string; texto: string }
  | { tipo: "conversei"; rotulo: string }
  | { tipo: "preencher"; rotulo: string; href: string };

const liberadoPorProfissional = (al: Pick<Alerta, "coberto">) => !!al.coberto && al.coberto.por !== "override" && al.coberto.por !== "conversei";

/**
 * Ações do card de alerta (spec §6.2 e §6.4):
 *  - vermelho e laranja abertos: [Registrar liberação] [Avisar {aluno}] (o "Avisar" não nomeia condição);
 *  - laranja com "Seguir mesmo assim": só [Registrar liberação] (para quando a liberação chegar);
 *  - A-DOENCA-ATIVO sem liberação: [Registrar liberação] (tira o teto moderado);
 *  - A-PESSOAL sem "Conversei": [Conversei];
 *  - sem dados de saúde (A-SEM-TRIAGEM) ou PAR-Q incompleto: preencher com o aluno (não é caso de liberação médica);
 *  - liberado por profissional e os demais níveis: nenhuma.
 */
export function acoesDoAlerta(al: Alerta, p: Pick<Profile, "id" | "name">): AcaoAlerta[] {
  const aluno = primeiroNome(p.name) || "o aluno";
  const href = `/questionario?aluno=${encodeURIComponent(p.id)}`;
  if (liberadoPorProfissional(al)) return [];
  if (al.id === "A-SEM-TRIAGEM") return [{ tipo: "preencher", rotulo: `Preencher a saúde com ${aluno}`, href }];
  if (al.id === "A-PARQ-INCOMPLETO") return [{ tipo: "preencher", rotulo: al.titulo === TITULO_SAUDE_INCOMPLETA ? `Completar a saúde com ${aluno}` : `Completar o PAR-Q com ${aluno}`, href }];
  const liberar: AcaoAlerta = { tipo: "liberacao", rotulo: "Registrar liberação" };
  if (al.nivel === "vermelho" || al.nivel === "laranja") {
    if (al.coberto?.por === "override") return [liberar];
    return [liberar, { tipo: "avisar", rotulo: `Avisar ${aluno}`, texto: mensagemAvisar([al], p.name) }];
  }
  if (al.id === "A-DOENCA-ATIVO") return [liberar];
  if (al.id === "A-PESSOAL" && !al.coberto) return [{ tipo: "conversei", rotulo: "Conversei" }];
  return [];
}

/**
 * `next_step_clicked` de uma ação dos próximos passos: "lembrar" para o lembrete do questionário; o passo para as
 * outras; null para passos clínicos, `dieta` e `nutricionista` (evNextStep) e para aluno de exemplo (nenhum evento).
 */
export function eventoDaAcao(p: Pick<Profile, "id" | "sample">, passo: Pick<Passo, "id">, acao: AcaoPasso): StrictEventProps["next_step_clicked"] | null {
  if (ehExemplo(p)) return null;
  if (acao.tipo === "pedir" && acao.lembrete) return evNextStep(passo.id === "questionario" ? "lembrar" : passo.id);
  return evNextStep(passo.id);
}

/** Até `max` passos visíveis e quantos sobram para "e mais N" (spec §7). */
export function passosVisiveis<T>(passos: readonly T[], max = 4): { visiveis: T[]; mais: number } {
  const visiveis = passos.slice(0, Math.max(0, max));
  return { visiveis, mais: passos.length - visiveis.length };
}

// ───────────────────────── Diálogos (textos literais) ─────────────────────────

export const TERMO_CAIXA_PERSONAL = (aluno: string) => `${primeiroNome(aluno) || "O aluno"} leu e concordou com o termo`;
export const APAGAR_TITULO = (aluno: string) => `Apagar as respostas do questionário de ${primeiroNome(aluno) || "este aluno"}?`;
export const APAGAR_CAIXA = "Apagar também as limitações e medidas copiadas para o cadastro";
/** Rótulo dos exemplos (demonstração e /testar) no resumo. */
export const ROTULO_EXEMPLO = "Exemplo: respostas fictícias.";

// ───────────────────────── Impressão e card do rascunho ─────────────────────────

/** "Questionário pela metade (parte Saúde: 7 perguntas)": card da página do aluno com o rascunho do junto. */
export function textoPelaMetade(parte: string): string {
  return parte.trim() ? `Questionário pela metade (parte ${parte.trim()})` : "Questionário pela metade";
}

const POR_REGISTRO: Record<"medico" | "obstetra" | "fisio" | "outro", string> = { medico: "médico(a)", obstetra: "obstetra", fisio: "fisioterapeuta", outro: "outro profissional de saúde" };

/**
 * Registro impresso com o resumo (spec §6.1, CONFEF 542, art. 7º): autorização de saúde (e do responsável),
 * declaração, termo do PAR-Q, liberações, "Seguir mesmo assim" e "Conversei", com as datas. Os pontos aparecem pelo
 * título do alerta atual (nunca pelo código interno). Vazio sem respostas legíveis. Só vai para o papel: nada disso
 * sai do aparelho.
 */
export function registroDoQuestionario(p: Profile, alertasAtuais: readonly Pick<Alerta, "id" | "titulo">[]): string[] {
  const { an } = ler(p);
  if (!an) return [];
  const aluno = p.name.trim().replace(/\s+/g, " ") || an.a.nome?.trim() || "O aluno";
  const titulo = new Map(alertasAtuais.map((x) => [x.id, x.titulo] as const));
  const titulos = (ids: readonly AlertId[]) => ids.map((id) => titulo.get(id)).filter((t): t is string => !!t).join("; ");
  const out: string[] = [];
  // Menor de idade: a falta pode ser da autorização do responsável (o aluno pode ter autorizado); não atribui a ninguém.
  if (an.healthOmitted)
    out.push(
      precisaResponsavel(an.a, new Date(an.answeredAt))
        ? `Autorização de saúde: faltou a de ${aluno} ou a do responsável. As respostas de saúde não foram guardadas.`
        : "Autorização de saúde: não dada. As respostas de saúde não foram guardadas.",
    );
  else if (an.consent) {
    out.push(
      an.consent.source === "aluno_questionario"
        ? `Autorização de saúde: dada por ${aluno} pelo link em ${fmtData(an.consent.at)}.`
        : `Autorização de saúde: ${aluno} autorizou com você em ${fmtData(an.consent.at)}.`,
    );
    const r = an.consent.responsavel;
    if (r) out.push(`Autorização do responsável: ${r.nome.trim()} em ${fmtData(r.at)}.`);
  } else out.push("Autorização de saúde: sem registro.");
  if (an.declaredAt) out.push(`Declarou que as respostas são verdadeiras em ${fmtData(an.declaredAt)}.`);
  if (an.termo) out.push(`Termo do PAR-Q: ${an.termo.nome.trim() || aluno} leu e concordou em ${fmtData(an.termo.at)}.`);
  else if (!an.healthOmitted && algumSimParq(an.a)) out.push("Termo do PAR-Q: não marcado.");
  const libs = [...(p.liberacoes ?? [])].sort((x, y) => x.registradoEm.localeCompare(y.registradoEm));
  for (const l of libs) {
    const pontos = titulos(l.alertas);
    out.push(`Liberado por ${POR_REGISTRO[l.por]} em ${fmtData(l.data)} (registrado em ${fmtData(l.registradoEm)})${pontos ? `. Pontos: ${pontos}` : ""}${l.restricoes?.trim() ? `. Restrições: ${l.restricoes.trim()}` : ""}.`);
  }
  for (const o of an.overrides ?? []) {
    const pontos = titulos(o.alertas);
    out.push(`Seguiu mesmo assim em ${fmtData(o.at)}${pontos ? `. Pontos: ${pontos}` : ""}.`);
  }
  if (an.conversei) out.push(`Conversou com ${aluno} em ${fmtData(an.conversei.at)}.`);
  return out;
}
