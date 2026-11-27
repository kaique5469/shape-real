import type { FichaPacket, TreinosPacket } from "./transfer";
import type { Profile } from "./types";

/**
 * Rodada 3 (R3-1): identidade nos links. PURO: só tipos importados (spec-m §5; entra em /abrir, /receber, /entrar e
 * app-context sem peso). Nome nunca é identidade: nada aqui compara `name` (só o usa para escrever o texto).
 *
 *  - `fichaLinkMatch`: como o link de ficha se relaciona com o perfil aberto (o /abrir decide a tela por ele, e
 *    `importFicha` decide o que pode gravar);
 *  - `perfisDeEntrada`: os perfis que alguém usa como "eu" neste aparelho ("Perfis neste aparelho" em /entrar);
 *  - `contatoDoPersonal`: se o personal do link é um contato gravável ou um perfil de entrada que não pode ser
 *    regravado por link nem por cópia ("Ver como aluno", cópia de um aluno no aparelho do personal);
 *  - `alvoInicialDoRetorno` e `retornoPedeConfirmacao`: /receber nunca escolhe aluno pelo nome;
 *  - os erros tipados da camada de importação (zero escrita quando lançados).
 */

/**
 * Como o link de ficha se relaciona com o perfil aberto neste aparelho:
 *  - "novo": não há perfil de aluno próprio aberto (nenhum perfil, perfil de personal, ou o registro de um aluno do
 *    personal deste aparelho, com `managedBy`, como no "Ver como aluno": esse registro nunca é atualizado por link);
 *  - "mesmo": `studentRef` e `coach.id` do link batem com `remoteCoach` do perfil;
 *  - "legado": mesmo `coach.id`, perfil sem `studentRef`;
 *  - "solo": aluno sem personal (primeiro vínculo);
 *  - "outro_aluno": mesmo personal, outro `studentRef`;
 *  - "outro_personal": `remoteCoach.id` diferente do `coach.id` do link.
 */
export type FichaLinkMatch = "novo" | "mesmo" | "legado" | "solo" | "outro_aluno" | "outro_personal";

/** Estados do /abrir que pedem uma escolha explícita antes de gravar (cancelar = nenhuma gravação). */
export const MATCH_PEDE_CONFIRMACAO: readonly FichaLinkMatch[] = ["legado", "solo", "outro_aluno", "outro_personal"];
/** Estados em que atualizar o perfil aberto exige `allowRelink` (o link é de outra pessoa ou de outro personal). */
export const MATCH_BLOQUEIA_ATUALIZAR: readonly FichaLinkMatch[] = ["outro_aluno", "outro_personal"];

export function fichaLinkMatch(packet: Pick<FichaPacket, "coach" | "student">, current: Profile | null): FichaLinkMatch {
  if (!current || current.role !== "athlete" || current.managedBy) return "novo";
  const rc = current.remoteCoach;
  if (!rc || !rc.id) return "solo";
  if (rc.id !== packet.coach.id) return "outro_personal";
  if (!rc.studentRef) return "legado";
  return rc.studentRef === packet.student.ref ? "mesmo" : "outro_aluno";
}

/**
 * Destino padrão de `importFicha` quando a tela não escolheu: "novo" cria perfil, "mesmo" atualiza. Os outros estados
 * não têm padrão (null): a pessoa escolhe na tela, e sem a escolha nada é gravado.
 */
export function destinoPadrao(match: FichaLinkMatch): "update" | "new" | null {
  return match === "novo" ? "new" : match === "mesmo" ? "update" : null;
}

// ---- perfis de entrada -----------------------------------------------------------------------------------------
/**
 * Perfis do modo teste (/testar: "teste-personal", "teste-solo", "teste-ex-*") e da demonstração ("demo-*"), e os
 * alunos de exemplo (`sample`). Ids literais: importar data/demo.ts quebraria a pureza (há teste que confere com as
 * constantes de lá).
 */
const PREFIXOS_DE_TESTE = ["teste-", "demo-"] as const;
export function ehPerfilDeTesteOuExemplo(p: Pick<Profile, "id" | "sample">): boolean {
  return p.sample === true || PREFIXOS_DE_TESTE.some((x) => p.id.startsWith(x));
}

/**
 * O contato do personal criado pelo link no celular do aluno: perfil de personal que é `remoteCoach.id` de um aluno
 * deste aparelho sem `managedBy` e que não tem nenhum aluno com `managedBy` igual ao id dele. Sem campo novo (contatos
 * antigos não têm marca): a regra só olha os perfis.
 */
export function ehContatoDePersonal(p: Pick<Profile, "id" | "role">, perfis: readonly Profile[]): boolean {
  if (p.role !== "coach") return false;
  const apontado = perfis.some((a) => a.role === "athlete" && !a.managedBy && a.id !== p.id && a.remoteCoach?.id === p.id);
  if (!apontado) return false;
  return !perfis.some((a) => a.role === "athlete" && a.managedBy === p.id);
}

/**
 * Perfis de entrada deste aparelho: os que alguém usa como "eu" ("Perfis neste aparelho" em /entrar). Ficam fora:
 * perfil de teste e de exemplo; aluno com `managedBy` (registro de um aluno do personal: entrar nele seria o "Ver como"
 * sem o "Voltar ao painel"); e o contato do personal (`ehContatoDePersonal`: entrar nele abriria um painel de personal
 * falso, com o aluno dentro). Todo o resto entra, inclusive o personal sem alunos. A ordem é a de `perfis`.
 */
export function perfisDeEntrada(perfis: readonly Profile[]): Profile[] {
  return perfis.filter((p) => !ehPerfilDeTesteOuExemplo(p) && !(p.role === "athlete" && p.managedBy) && !ehContatoDePersonal(p, perfis));
}

/**
 * O que um link (ou uma cópia de segurança) pode fazer com o personal que vem nele, avaliado ANTES da primeira gravação
 * (gravar o aluno com `remoteCoach` mudaria a resposta):
 *  - "criar": o personal não existe neste aparelho; vira contato local ("Acompanhado por", exercícios próprios dele);
 *  - "atualizar": já é contato (`ehContatoDePersonal`); o link pode trazer telefone e CREF novos;
 *  - "manter": é perfil de entrada (o próprio personal, no aparelho dele: "Ver como aluno", cópia de um aluno
 *    restaurada lá) ou o id é de um perfil de aluno. Nada dele é regravado: telefone, CREF, exercícios e alimentos
 *    ficam como estão, e o aluno do link não entra no painel dele.
 * Perfis de teste e de demonstração com esse id também ficam ("manter"): não são contato.
 */
export type ContatoDoPersonal = "criar" | "atualizar" | "manter";
export function contatoDoPersonal(coachId: string, perfis: readonly Profile[]): ContatoDoPersonal {
  const p = perfis.find((x) => x.id === coachId);
  if (!p) return "criar";
  return ehContatoDePersonal(p, perfis) ? "atualizar" : "manter";
}

/** "Personal" ou "Aluno" (a lista "Perfis neste aparelho" não mostra nenhum dado de saúde). */
export function rotuloDoPerfil(p: Pick<Profile, "role">): "Personal" | "Aluno" {
  return p.role === "coach" ? "Personal" : "Aluno";
}

/**
 * Último uso de um perfil para a lista de entrada: a data mais recente entre as informadas (criação do perfil, último
 * treino, ficha editada). Datas ilegíveis ficam de fora; datas no futuro (relógio mexido) valem como estão. null sem
 * nenhuma data legível (a tela não mostra "último uso").
 */
export function ultimoUso(datas: readonly (string | null | undefined)[]): string | null {
  let melhor: { iso: string; t: number } | null = null;
  for (const d of datas) {
    if (typeof d !== "string" || d.length > 40) continue;
    const t = Date.parse(d);
    if (!Number.isFinite(t)) continue;
    if (!melhor || t > melhor.t) melhor = { iso: d, t };
  }
  return melhor?.iso ?? null;
}

/** Perfis de entrada do mais recente para o mais antigo (`ultimoUso`); sem data, no fim, na ordem em que vieram. */
export function ordenarPorUso<T extends { ultimoUso: string | null }>(itens: readonly T[]): T[] {
  return itens
    .map((x, i) => ({ x, i, t: x.ultimoUso ? Date.parse(x.ultimoUso) : Number.NaN }))
    .sort((a, b) => (Number.isFinite(b.t) ? b.t : -Infinity) - (Number.isFinite(a.t) ? a.t : -Infinity) || a.i - b.i)
    .map((e) => e.x);
}

// ---- /receber ------------------------------------------------------------------------------------------------------
/**
 * Aluno pré-escolhido em /receber: só o do `studentRef` do link, se ele estiver no painel. Nunca pelo nome (dois
 * alunos podem ter o mesmo nome, e o aluno pode ter escrito o nome de outro jeito): sem ele, nada é escolhido.
 */
export function alvoInicialDoRetorno(packet: Pick<TreinosPacket, "studentRef">, alunos: readonly { profile: Pick<Profile, "id"> }[]): string | null {
  return alunos.some((a) => a.profile.id === packet.studentRef) ? packet.studentRef : null;
}

/**
 * Registrar estes treinos em `alvo` pede confirmação explícita? `outroAluno`: o aluno escolhido não é o do link (escolha
 * manual); `outroPersonal`: o link é de outro personal (o pacote traz um `coachId` diferente do personal deste aparelho).
 * `importTreinos` recusa os dois sem `confirmedOther`.
 */
export function retornoPedeConfirmacao(packet: Pick<TreinosPacket, "studentRef" | "coachId">, alvo: string, coachId: string | undefined): { outroAluno: boolean; outroPersonal: boolean } {
  return { outroAluno: packet.studentRef !== alvo, outroPersonal: Boolean(coachId && packet.coachId && packet.coachId !== coachId) };
}

// ---- textos (pt-BR; a tela só monta) -------------------------------------------------------------------------------
const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] || nome.trim();

export type AcaoDoLink = "atualizar" | "criar" | "trocar" | "voltar";
export interface TelaDoLink {
  titulo: string;
  linhas: string[];
  /** Na ordem da tela; a primeira é a principal. "voltar" está sempre presente e não grava nada. */
  acoes: { acao: AcaoDoLink; rotulo: string }[];
}

/**
 * Tela do /abrir para os estados que pedem escolha (`MATCH_PEDE_CONFIRMACAO`); null para "novo" e "mesmo" (seguem como
 * antes). `perfil` = o perfil aberto; `aluno` e `personal` = os nomes do link.
 */
export function telaDoLink(match: FichaLinkMatch, ctx: { perfil: Pick<Profile, "name" | "remoteCoach">; aluno: string; personal: string }): TelaDoLink | null {
  const perfil = primeiro(ctx.perfil.name);
  const aluno = primeiro(ctx.aluno);
  const personal = ctx.personal.trim();
  const destino = `Este link é para ${aluno}, de ${personal}.`;
  const voltar = { acao: "voltar" as const, rotulo: "Voltar" };
  switch (match) {
    case "legado":
    case "solo":
      return {
        titulo: "Este link é para você?",
        linhas: [`Este celular está com o perfil de ${perfil}. ${destino}`],
        acoes: [{ acao: "atualizar", rotulo: "Sou eu, atualizar meu perfil" }, { acao: "criar", rotulo: "Criar outro perfil" }, voltar],
      };
    case "outro_aluno":
      return {
        titulo: "Este link é de outro aluno",
        linhas: [`Este celular está com o perfil de ${perfil}. ${destino}`, `O perfil de ${perfil} fica como está.`],
        acoes: [{ acao: "criar", rotulo: `Criar perfil separado para ${aluno}` }, voltar],
      };
    case "outro_personal": {
      const atual = ctx.perfil.remoteCoach?.name?.trim();
      return {
        titulo: "Este link é de outro personal",
        linhas: [`Este celular está com o perfil de ${perfil}${atual ? `, acompanhado por ${atual}` : ""}. ${destino}`, `O perfil de ${perfil} fica como está, a menos que você troque de personal.`],
        acoes: [{ acao: "criar", rotulo: `Criar perfil separado para ${aluno}` }, { acao: "trocar", rotulo: "Trocar de personal neste perfil" }, voltar],
      };
    }
    default:
      return null;
  }
}

/** Explicação logo abaixo de "Trocar de personal neste perfil" (consentimento explícito; o histórico fica). */
export function textoTrocarDePersonal(personalNovo: string): string {
  return `Seus treinos e recordes continuam neste perfil. A ficha e a dieta passam a ser as de ${personalNovo.trim()}.`;
}

/** /abrir no "Ver como aluno" (ramo do personal): sem botão de salvar. */
export function textoVerComo(aluno: string): string {
  return `Você está vendo como ${primeiro(aluno)}. Volte ao painel para abrir links.`;
}

/** /receber sem o aluno do link no painel: nada pré-escolhido. */
export const TEXTO_RETORNO_SEM_ALUNO = "Este retorno não bate com nenhum aluno deste painel.";
/** Confirmação da escolha manual em /receber. */
export function textoConfirmarOutroAluno(nomeDoLink: string, alunoEscolhido: string): string {
  return `Registrar os treinos de ${primeiro(nomeDoLink)} em ${alunoEscolhido.trim()}?`;
}
/** Aviso antes de registrar um link de outro personal. */
export function textoOutroPersonal(nomeDoLink: string): string {
  return `Este link foi montado para outro personal. Confira se os treinos de ${primeiro(nomeDoLink)} são mesmo de um aluno seu antes de registrar.`;
}

// ---- erros tipados da camada de importação (lançados antes de qualquer gravação) ------------------------------------
/** Base dos erros de identidade: a tela reconhece pelo `instanceof` e mostra `message`. */
export class ErroDeIdentidadeDoLink extends Error {
  constructor(
    message: string,
    public readonly match: FichaLinkMatch | null,
  ) {
    super(message);
    this.name = "ErroDeIdentidadeDoLink";
  }
}

/** O link pede uma escolha (legado, solo, outro_aluno, outro_personal) e `importFicha` foi chamado sem `target`. */
export class ConfirmacaoNecessaria extends ErroDeIdentidadeDoLink {
  constructor(match: FichaLinkMatch) {
    super("Este link precisa de uma escolha antes de salvar. Nada foi alterado.", match);
    this.name = "ConfirmacaoNecessaria";
  }
}

/** `target: "update"` sem perfil de aluno próprio aberto (match "novo"). */
export class SemPerfilParaAtualizar extends ErroDeIdentidadeDoLink {
  constructor() {
    super("Não há um perfil de aluno aberto neste celular para atualizar. Nada foi alterado.", "novo");
    this.name = "SemPerfilParaAtualizar";
  }
}

/** `target: "update"` em outro_aluno ou outro_personal sem `allowRelink`. */
export class LinkDeOutraPessoa extends ErroDeIdentidadeDoLink {
  constructor(match: FichaLinkMatch) {
    super(match === "outro_personal" ? "Este link é de outro personal. Nada foi alterado no seu perfil." : "Este link é de outro aluno. Nada foi alterado no seu perfil.", match);
    this.name = "LinkDeOutraPessoa";
  }
}

/** A ficha ou a dieta do pacote já existe neste aparelho com outro dono, e o destino é "update". */
export class ObjetoDeOutroPerfil extends ErroDeIdentidadeDoLink {
  constructor(match: FichaLinkMatch | null) {
    super("A ficha deste link já pertence a outro perfil deste celular. Nada foi alterado.", match);
    this.name = "ObjetoDeOutroPerfil";
  }
}

/** `importTreinos` num aluno que não é o do link, ou com link de outro personal, sem `confirmedOther`. */
export class RetornoPedeConfirmacao extends Error {
  constructor(
    public readonly outroAluno: boolean,
    public readonly outroPersonal: boolean,
  ) {
    super("Confirme o aluno antes de registrar estes treinos. Nada foi registrado.");
    this.name = "RetornoPedeConfirmacao";
  }
}
