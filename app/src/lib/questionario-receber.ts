/**
 * Recepção das respostas do questionário em `/receber` (spec §5.5) e o "Colar aqui" com os tipos novos. Puro: sem
 * React, sem navegador, sem repositório. A tela só junta o que estas funções decidem com o que o aparelho tem.
 */
import { fmtDiaMes, primeiroNome } from "@/lib/domain/anamnese";
import type { Anamnese, Diferenca, DiffLimitacoes, Escolhas, Liberacao } from "@/lib/domain/anamnese-types";
import { packetProblem, parsePedido, parseRespostas, PROBLEMA_TEXTO, readAnamnese, type ProblemaLink, type RespostasPacket } from "@/lib/domain/questionario-link";
import { parsePacket } from "@/lib/domain/transfer";
import { alertas } from "@/lib/domain/triagem";
import type { Profile } from "@/lib/domain/types";
import { pastedLinkHref } from "@/lib/share-link";

export type EstadoRecepcao = { tipo: "ja_registrado"; em: string } | { tipo: "substituir"; anterior: string } | { tipo: "mais_antigas"; atual: string } | { tipo: "nova" };

/** Nome para comparar: sem acento, sem caixa e sem espaços extras. */
export function normalizarNome(nome: string | undefined | null): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * De quem são as respostas (D-31): pelo `studentRef` (sem confirmação); senão, pelo nome completo normalizado, se
 * for único entre os alunos (sempre com confirmação: "Encontramos {cadastro} pelo nome. É a mesma pessoa?"); senão,
 * ninguém (o personal escolhe na lista ou cadastra). Pelo primeiro nome, nunca: a saúde de uma "Juliana" iria para outra.
 */
export function acharAluno(alunos: Profile[], p: RespostasPacket): { aluno: Profile | null; achou: "ref" | "nome" | null; confirmar: boolean } {
  const porRef = alunos.find((a) => a.id === p.studentRef);
  if (porRef) return { aluno: porRef, achou: "ref", confirmar: false };
  const nome = normalizarNome(p.studentName);
  const mesmos = nome ? alunos.filter((a) => normalizarNome(a.name) === nome) : [];
  if (mesmos.length === 1) return { aluno: mesmos[0]!, achou: "nome", confirmar: true };
  return { aluno: null, achou: null, confirmar: false };
}

const tempo = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * Reabrir a mesma mensagem não grava duas vezes (spec §5.5):
 *  - mesmo `id` e mesmo `answeredAt` → já registradas (nada é gravado);
 *  - mesmo `id` e `answeredAt` mais novo → "mandou de novo, com mudanças": substituir (sem empurrar para anamnesePrev);
 *  - respostas mais antigas que as atuais (de outra rodada, ou uma versão anterior da mesma) → "Você já tem mais novas";
 *  - senão, rodada nova (a atual vai para anamnesePrev).
 * Respostas atuais que não dá para ler ("versao_nova"/"invalida") não bloqueiam: viram rodada nova (applyAnamnese
 * guarda a ilegível como anterior em vez de apagar).
 */
export function estadoRecepcao(aluno: Profile | null, p: RespostasPacket): EstadoRecepcao {
  const atual = aluno ? readAtual(aluno) : null;
  if (!atual) return { tipo: "nova" };
  const nova = tempo(p.anamnese.answeredAt);
  const velha = tempo(atual.answeredAt);
  const maisNova = nova !== null && velha !== null ? nova > velha : false;
  const maisVelha = nova !== null && velha !== null ? nova < velha : false;
  if (atual.id === p.anamnese.id) {
    if (maisNova) return { tipo: "substituir", anterior: atual.answeredAt };
    // Uma versão anterior da mesma rodada nunca troca a mais nova em silêncio.
    if (maisVelha) return { tipo: "mais_antigas", atual: atual.answeredAt };
    return { tipo: "ja_registrado", em: atual.receivedAt ?? atual.answeredAt };
  }
  if (maisVelha) return { tipo: "mais_antigas", atual: atual.answeredAt };
  return { tipo: "nova" };
}

function readAtual(aluno: Profile): Anamnese | null {
  const r = readAnamnese(aluno);
  return r && typeof r === "object" ? r : null;
}

/**
 * O nome das respostas é outro? Normaliza os dois e devolve true quando as palavras do nome mais curto não estão todas
 * no mais longo ("Júlia" × "julia souza" → false; "Juliana Prado" × "Juliana Costa" → true). Nome vazio não acusa nada.
 */
export function nomeDiferente(cadastro: string, resposta: string): boolean {
  const a = normalizarNome(cadastro).split(" ").filter(Boolean);
  const b = normalizarNome(resposta).split(" ").filter(Boolean);
  if (!a.length || !b.length) return false;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(longo);
  return !curto.every((w) => set.has(w));
}

// ---- guardas (spec §5.5, nesta ordem) ------------------------------------------------------------------------------
export type GuardaReceber = "nuvem" | "ver_como_aluno" | "respostas_no_aluno" | "sem_perfil" | "nao_personal";

/**
 * O que impede registrar neste aparelho, na ordem da spec: modo nuvem (aviso de hoje); "Ver como aluno"; perfil de
 * aluno do mesmo personal (as respostas já foram na mensagem dele); nenhum perfil (texto neutro, antes do card do
 * iPhone); outro aparelho que não é de personal. null = segue para achar o aluno.
 */
export function guardaReceber(i: { modo: "local" | "supabase"; verComoAluno: boolean; user: Pick<Profile, "role" | "remoteCoach"> | null; temPerfil: boolean; coachId: string }): GuardaReceber | null {
  if (i.modo !== "local") return "nuvem";
  if (i.verComoAluno) return "ver_como_aluno";
  if (i.user && i.user.role !== "coach" && i.user.remoteCoach?.id === i.coachId) return "respostas_no_aluno";
  if (!i.temPerfil || !i.user) return "sem_perfil";
  if (i.user.role !== "coach") return "nao_personal";
  return null;
}

/** `motivo` de `link_dead_end_shown` (tela "receber") para cada guarda; nuvem e "Ver como aluno" não são beco. */
export function motivoDaGuarda(g: GuardaReceber): "respostas_no_aluno" | "nao_personal" | null {
  if (g === "respostas_no_aluno") return "respostas_no_aluno";
  if (g === "sem_perfil" || g === "nao_personal") return "nao_personal";
  return null;
}

/** `motivo` de `link_dead_end_shown` para um pacote que não abre. */
export function motivoDoProblema(p: ProblemaLink): "versao_nova" | "invalido" {
  return p === "invalido" ? "invalido" : "versao_nova";
}

// ---- "Colar aqui" ----------------------------------------------------------------------------------------------------
export const LINK_RUIM = "Esse link não é do Shape Real ou veio cortado. Peça para reenviar.";
const PROBLEMA_ATUALIZE = PROBLEMA_TEXTO.tipo_desconhecido;

/**
 * Para onde vai um pacote colado: ficha → /abrir; treinos e respostas → /receber; pedido do questionário →
 * /questionario. Ficha e treinos continuam como hoje (`parsePacket`, e "não é do Shape Real" quando falha); os tipos
 * novos passam por `parsePedido`/`parseRespostas`; um tipo desconhecido ou de versão mais nova pede para atualizar.
 */
export function destinoColado(raw: unknown, packed: string): { href: string } | { erro: string; problema: ProblemaLink } {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  if (kind === "pedido_anamnese" || kind === "anamnese") {
    const ok = kind === "pedido_anamnese" ? parsePedido(raw) : parseRespostas(raw);
    if (ok) return { href: pastedLinkHref(kind, packed) };
    const problema = packetProblem(raw) ?? "invalido";
    return { erro: problema === "invalido" ? LINK_RUIM : PROBLEMA_ATUALIZE, problema };
  }
  const packet = parsePacket(raw);
  if (packet) return { href: pastedLinkHref(packet.kind, packed) };
  // Tipo desconhecido ou ficha/treinos de versão mais nova: "Atualize", não "veio cortado".
  const problema = packetProblem(raw) ?? "invalido";
  return { erro: problema === "invalido" ? LINK_RUIM : PROBLEMA_ATUALIZE, problema };
}

// ---- conferir e registrar --------------------------------------------------------------------------------------------
/** Escolhas iniciais de "Conferir antes de salvar": o padrão de cada linha e [Aplicar] nas limitações. */
export function escolhasIniciais(diferencas: readonly Diferenca[], limitacoes?: DiffLimitacoes | null): Escolhas {
  const out: Escolhas = {};
  for (const d of diferencas) out[d.campo] = d.padrao;
  if (limitacoes && (limitacoes.sai.length || limitacoes.entra.length)) out.limitacoes = "aplicar";
  return out;
}

/** Textos de "Conferir antes de salvar" (spec §8.2), compartilhados com o fim do modo junto. */
export const CONFERIR_TEXTO = {
  titulo: "Conferir antes de salvar",
  manterOSeu: "Manter o seu",
  usarResposta: "Usar a resposta",
  aplicar: "Aplicar",
  manterComoEsta: "Manter como está",
  /** "Você: Hipertrofia · Ana: Saúde". */
  linha: (d: Pick<Diferenca, "cadastro" | "resposta">, aluno: string) => `Você: ${d.cadastro} · ${nomeOu(aluno, "Aluno")}: ${d.resposta}`,
  /** "Limitações · Sai: joelho direito · Entra: lombar" (o lado vazio não aparece); null quando nada muda. */
  limitacoes: (l: Pick<DiffLimitacoes, "sai" | "entra">) =>
    l.sai.length || l.entra.length ? ["Limitações", l.sai.length ? `Sai: ${l.sai.join(", ")}` : null, l.entra.length ? `Entra: ${l.entra.join(", ")}` : null].filter(Boolean).join(" · ") : null,
  excede: "Limitações não atualizadas: passariam de 1.000 caracteres. Encurte o texto em Editar dados.",
} as const;

/** Só a contagem de alertas vermelhos e laranja ainda não cobertos, calculada no aparelho (nunca vai para a medição). */
export function pontosParaVer(an: Anamnese, liberacoes: Liberacao[], hoje: Date): number {
  if (an.healthOmitted) return 0;
  return alertas(an, { hoje, liberacoes }).filter((al) => (al.nivel === "vermelho" || al.nivel === "laranja") && !al.coberto).length;
}

// ---- textos (spec §5.5, literais) ------------------------------------------------------------------------------------
const dois = (n: number) => String(n).padStart(2, "0");
/** "14:05" no fuso do aparelho; "" se a data for inválida. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
const nomeOu = (nome: string, padrao: string) => primeiroNome(nome) || padrao;

export const RECEBER_TEXTO = {
  titulo: (aluno: string) => `Respostas de ${nomeOu(aluno, "seu aluno")}`,
  respondidoEm: (answeredAt: string) => `Questionário respondido em ${fmtDiaMes(answeredAt)} às ${hhmm(answeredAt)}.`,
  /** Menor de idade: quem autorizou foi o responsável (LGPD, art. 14), e é ele que o texto nomeia. */
  autorizacao: (aluno: string, an: Pick<Anamnese, "healthOmitted" | "consent">) =>
    an.healthOmitted || !an.consent
      ? `${nomeOu(aluno, "O aluno")} enviou sem dados de saúde.`
      : an.consent.responsavel?.nome?.trim()
        ? `Autorização de saúde: dada por ${an.consent.responsavel.nome.trim()}, responsável por ${nomeOu(aluno, "o aluno")}, em ${fmtDiaMes(an.consent.responsavel.at)}.`
        : `Autorização de saúde: dada por ${nomeOu(aluno, "o aluno")} em ${fmtDiaMes(an.consent.at)}.`,
  vaiPara: "Vai para:",
  trocar: "Trocar",
  confirmarNome: (cadastro: string) => `Encontramos ${cadastro.trim()} pelo nome. É a mesma pessoa?`,
  simRegistrar: "Sim, registrar",
  escolherOutro: "Escolher outro",
  cadastrarComoNovo: "Cadastrar como novo",
  cadastrar: (aluno: string) => `Cadastrar ${nomeOu(aluno, "o aluno")} com estas respostas`,
  escolherAluno: "De qual aluno são estas respostas?",
  nomeDiferente: (nome: string, cadastro: string) => `O nome nas respostas (${nome.trim()}) é diferente do cadastro (${cadastro.trim()}). Confira antes de registrar.`,
  eCadastro: (cadastro: string) => `É ${cadastro.trim()}: registrar`,
  cadastrarNome: (nome: string) => `Cadastrar ${nome.trim()} como aluno novo`,
  outroAparelho: "Estas respostas foram pedidas por outro aparelho.",
  apagadas: (em: string, aluno: string) => `Estas respostas foram apagadas em ${fmtDiaMes(em)}. Registre de novo só se ${nomeOu(aluno, "o aluno")} pediu.`,
  registrarMesmoAssim: "Registrar mesmo assim",
  agoraNao: "Agora não",
  pontos: (n: number) => (n <= 0 ? null : n === 1 ? "1 ponto para ver antes de começar" : `${n} pontos para ver antes de começar`),
  registrar: "Registrar respostas",
  pronto: "Pronto. Se quiser, apague a mensagem no WhatsApp: as respostas já estão aqui.",
  jaRegistrado: (em: string) => `Estas respostas já foram registradas em ${fmtDiaMes(em)}.`,
  verResumo: "Ver o resumo",
  substituir: (aluno: string, anterior: string) => `${nomeOu(aluno, "O aluno")} mandou as respostas de novo, com mudanças. Substituir as de ${fmtDiaMes(anterior)} ${hhmm(anterior)}?`,
  botaoSubstituir: "Substituir",
  manterAnteriores: "Manter as anteriores",
  maisAntigas: (aluno: string, atual: string, estas: string) => `Você já tem respostas mais novas de ${nomeOu(aluno, "este aluno")} (${fmtDiaMes(atual)}). Estas são de ${fmtDiaMes(estas)}.`,
  manterMaisNovas: "Manter as mais novas",
  usarEstas: "Usar estas mesmo assim",
  /** spec §5.6: questionário feito junto enquanto havia link pendente. */
  juntoAntes: (data: string) => `Já existe um questionário de ${fmtDiaMes(data)} (preenchido por você). Usar as respostas do link como as mais recentes?`,
  usarDoLink: "Usar as do link",
  manterJunto: (data: string) => `Manter o de ${fmtDiaMes(data)}`,
  respostasNoAluno: (personal: string) => `Este link é para ${nomeOu(personal, "seu personal")} abrir. Suas respostas já foram na mensagem que você enviou.`,
  semPerfil: (personal: string, aluno: string) =>
    `Se você é ${nomeOu(personal, "o personal")}, abra no aparelho onde usa o Shape Real ou copie a mensagem e use Colar aqui no app. Se você é ${nomeOu(aluno, "o aluno")}, suas respostas já foram.`,
  naoPersonal: "Este link é para o personal que pediu o questionário: abra no aparelho dele.",
  verComoAluno: "Você está vendo o app como aluno. Volte ao painel para registrar estas respostas.",
  nuvem: "Com conta no Shape Real, o registro de respostas por link ainda não está disponível. Abra no aparelho onde você usa o app sem conta.",
  voltarAoPainel: "Voltar ao painel",
} as const;

/**
 * spec §5.6: a rodada atual foi preenchida junto (outro id) enquanto o link estava pendente. Em vez de trocar em
 * silêncio, a tela pergunta qual vale. null quando o caso não se aplica.
 */
export function juntoAntesDoLink(aluno: Profile | null, p: RespostasPacket): { data: string } | null {
  const atual = aluno ? readAtual(aluno) : null;
  if (!atual || atual.via !== "junto" || atual.id === p.anamnese.id) return null;
  return { data: atual.answeredAt };
}

// ---- etapas da recepção (spec §5.5) ----------------------------------------------------------------------------------
/** O que o personal já decidiu na tela de recepção. Tudo começa vazio; cada botão liga uma decisão. */
export interface DecisoesRecepcao {
  /** [Registrar mesmo assim] nas respostas apagadas antes neste aparelho. */
  apagadasOk?: boolean;
  /** Aluno escolhido na lista ("escolhido"): vence o casamento automático e dispensa a conferência de nome. */
  escolhido?: string | null;
  /** [Trocar] ou [Escolher outro]: mostra a lista. */
  trocar?: boolean;
  /** [Sim, registrar] (casou pelo nome) ou [É {cadastro}: registrar] (nome diferente). */
  identidadeOk?: boolean;
  /** [Substituir], [Usar estas mesmo assim] ou [Usar as do link]. */
  estadoOk?: boolean;
}

export type EtapaRecepcao =
  | { t: "ja_registrado"; aluno: Profile; em: string }
  | { t: "apagadas"; em: string }
  | { t: "escolher"; sugerido: Profile | null }
  | { t: "confirmar_nome"; aluno: Profile }
  | { t: "nome_diferente"; aluno: Profile }
  | { t: "substituir"; aluno: Profile; anterior: string }
  | { t: "mais_antigas"; aluno: Profile; atual: string }
  | { t: "junto_antes"; aluno: Profile; data: string }
  | { t: "registrar"; aluno: Profile; achou: "ref" | "nome" | "escolhido" };

/**
 * Qual pergunta a tela de recepção faz agora (spec §5.5), depois das guardas do aparelho. Nesta ordem:
 *  1. já registradas em algum aluno (mesmo `id` e mesmo `answeredAt`): nada é gravado, nem com outra escolha;
 *  2. apagadas antes neste aparelho: avisa a data e só segue com [Registrar mesmo assim] (sem cadastro automático);
 *  3. ninguém encontrado, ou [Trocar]: a lista e [Cadastrar {aluno} com estas respostas];
 *  4. casou pelo nome: sempre pede confirmação; casou pelo `ref` com outro nome: avisa antes de registrar;
 *  5. reenvio com mudanças, respostas mais antigas que as atuais, ou questionário feito junto depois do pedido;
 *  6. registrar (com "Conferir antes de salvar" quando houver diferenças, decidido pela tela).
 */
export function etapaRecepcao(i: { alunos: Profile[]; p: RespostasPacket; apagadoEm: string | null; decisoes: DecisoesRecepcao }): EtapaRecepcao {
  const d = i.decisoes;
  for (const a of i.alunos) {
    const e = estadoRecepcao(a, i.p);
    if (e.tipo === "ja_registrado") return { t: "ja_registrado", aluno: a, em: e.em };
  }
  if (i.apagadoEm && !d.apagadasOk) return { t: "apagadas", em: i.apagadoEm };
  const escolhido = d.escolhido ? (i.alunos.find((a) => a.id === d.escolhido) ?? null) : null;
  const auto = escolhido ? null : acharAluno(i.alunos, i.p);
  const aluno = escolhido ?? auto?.aluno ?? null;
  if (d.trocar || !aluno) return { t: "escolher", sugerido: aluno };
  if (auto && !d.identidadeOk) {
    if (auto.achou === "nome") return { t: "confirmar_nome", aluno };
    if (auto.achou === "ref" && nomeDiferente(aluno.name, i.p.studentName)) return { t: "nome_diferente", aluno };
  }
  if (!d.estadoOk) {
    const e = estadoRecepcao(aluno, i.p);
    if (e.tipo === "substituir") return { t: "substituir", aluno, anterior: e.anterior };
    if (e.tipo === "mais_antigas") return { t: "mais_antigas", aluno, atual: e.atual };
    const junto = juntoAntesDoLink(aluno, i.p);
    if (junto) return { t: "junto_antes", aluno, data: junto.data };
  }
  return { t: "registrar", aluno, achou: escolhido ? "escolhido" : auto?.achou === "nome" ? "nome" : "ref" };
}

/**
 * Texto do beco sem saída em /receber. O `{personal}` de §5.4 é quem mandou o link: aqui, o aluno (com o link cortado,
 * o nome pode nem existir: "o aluno").
 */
export function textoProblemaReceber(problema: ProblemaLink, nomeAluno: unknown): string {
  const nome = typeof nomeAluno === "string" ? primeiroNome(nomeAluno.slice(0, 120)) : "";
  return PROBLEMA_TEXTO[problema].replaceAll("{personal}", nome || "o aluno");
}
