import type { FichaPacket, TreinosPacket } from "./transfer";
import type { Profile } from "./types";
import { ehContatoDePersonal, ehPerfilDeTesteOuExemplo } from "./perfis-de-entrada";

/**
 * Rodada 3 (R3-1): identidade nos links. PURO: só tipos importados, mais perfis-de-entrada.ts, também puro (spec-m §5;
 * entra em /abrir, /receber e /entrar sem peso; o app-context importa só perfis-de-entrada.ts). Nome nunca é
 * identidade: nada aqui compara `name` (só o usa para escrever o texto).
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

/**
 * O perfil de aluno deste aparelho que É o do link, pelos ids (`remoteCoach.id` = `coach.id` e `remoteCoach.studentRef`
 * = `student.ref`), nunca pelo nome. Só perfil de entrada de aluno (sem teste ou exemplo, sem `managedBy`) e só quando
 * há exatamente um; senão, null. O /abrir usa quando o perfil aberto não é esse (ou não há perfil aberto, depois de
 * "Sair"): o link atualiza o perfil que já existe ("mesmo") em vez de criar um segundo perfil da mesma pessoa.
 */
export function perfilDoLinkNoAparelho(packet: Pick<FichaPacket, "coach" | "student">, perfis: readonly Profile[]): Profile | null {
  const achados = perfis.filter((p) => p.role === "athlete" && !p.managedBy && !ehPerfilDeTesteOuExemplo(p) && Boolean(p.remoteCoach?.studentRef) && p.remoteCoach?.id === packet.coach.id && p.remoteCoach?.studentRef === packet.student.ref);
  return achados.length === 1 ? achados[0]! : null;
}

// ---- perfis de entrada -----------------------------------------------------------------------------------------
// Moram em perfis-de-entrada.ts (o app-context só precisa delas); reexportadas aqui para os importadores de sempre.
export { criadoresDeConteudo, ehContatoDePersonal, ehPerfilDeTesteOuExemplo, perfisDeEntrada } from "./perfis-de-entrada";

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
export function contatoDoPersonal(coachId: string, perfis: readonly Profile[], criadores?: ReadonlySet<string>): ContatoDoPersonal {
  const p = perfis.find((x) => x.id === coachId);
  if (!p) return "criar";
  return ehContatoDePersonal(p, perfis, criadores) ? "atualizar" : "manter";
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

/** "Último uso em 25/11" (no fuso do aparelho); com o ano quando não é o de `agora`. "" com data ilegível. */
export function textoUltimoUso(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dia = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `Último uso em ${d.getFullYear() === agora.getFullYear() ? dia : `${dia}/${d.getFullYear()}`}`;
}

/**
 * Botão de "Perfis neste aparelho": "Continuar como Ana"; com o nome inteiro quando outro perfil da lista tem o mesmo
 * primeiro nome (o nome não identifica ninguém, mas o botão precisa ser distinguível na tela e no leitor de tela).
 */
export function rotuloContinuarComo(p: Pick<Profile, "id" | "name">, lista: readonly Pick<Profile, "id" | "name">[]): string {
  const meu = primeiro(p.name).toLocaleLowerCase("pt-BR");
  const repete = lista.some((o) => o.id !== p.id && primeiro(o.name).toLocaleLowerCase("pt-BR") === meu);
  return `Continuar como ${repete ? p.name.trim().replace(/\s+/g, " ") : primeiro(p.name)}`;
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
  const [perfil, aluno] = nomesDistinguiveis(ctx.perfil.name, ctx.aluno);
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
        // Homônimos: o mesmo nome não é a mesma pessoa (o link traz outro cadastro do personal).
        linhas: [`Este celular está com o perfil de ${perfil}. ${destino}`, ...(perfil === aluno ? [`Mesmo nome, outro cadastro de ${personal}.`] : []), `O perfil de ${perfil} fica como está.`],
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

/**
 * Primeiros nomes para o texto; os nomes inteiros quando os primeiros coincidem ("Ana Souza" e "Ana Lima"), senão a
 * frase "perfil de Ana… link para Ana" não distingue as duas pessoas.
 */
function nomesDistinguiveis(a: string, b: string): [string, string] {
  const pa = primeiro(a);
  const pb = primeiro(b);
  if (pa.toLocaleLowerCase("pt-BR") !== pb.toLocaleLowerCase("pt-BR")) return [pa, pb];
  return [a.trim().replace(/\s+/g, " "), b.trim().replace(/\s+/g, " ")];
}

/**
 * /abrir com outro perfil aberto quando o perfil do link já existe neste celular (`perfilDoLinkNoAparelho`, pelos ids):
 * a ação é atualizar esse perfil, nunca criar um segundo perfil da mesma pessoa. O perfil aberto fica como está.
 */
export function telaDoLinkDeOutroPerfil(ctx: { perfil: Pick<Profile, "name">; dono: Pick<Profile, "name">; personal: string }): TelaDoLink {
  const [perfil, dono] = nomesDistinguiveis(ctx.perfil.name, ctx.dono.name);
  return {
    titulo: `Este link é do perfil de ${dono}`,
    linhas: [`Este celular está com o perfil de ${perfil}. O link é para ${dono}, de ${ctx.personal.trim()}, que já tem perfil neste celular.`, `O perfil de ${perfil} fica como está.`],
    acoes: [
      { acao: "atualizar", rotulo: `Atualizar o perfil de ${dono}` },
      { acao: "voltar", rotulo: "Voltar" },
    ],
  };
}

/** /abrir sem perfil aberto (depois de "Sair"), com o perfil do link neste celular: quem vai ser atualizado. */
export function textoPerfilDoLink(dono: Pick<Profile, "name">): string {
  return `Este link é do perfil de ${dono.name.trim().replace(/\s+/g, " ")}, que já está neste celular.`;
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
