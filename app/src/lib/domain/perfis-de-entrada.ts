import type { Profile } from "./types";

/**
 * Rodada 3 (R3-1): perfis de entrada deste aparelho ("Perfis neste aparelho" em /entrar, `continueAsLocal`, e a regra
 * do contato do personal em `importFicha`/`restoreBackup`). PURO: só tipos importados. Separado de link-identity.ts na
 * integração da rodada 3: o app-context (grafo de toda rota) só precisa disto, e o resto de link-identity (telas e
 * textos do /abrir e do /receber) fica nas rotas de link. link-identity.ts reexporta tudo daqui.
 */

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
 * `criadores` (opcional): ids de quem criou fichas ou dietas de alunos deste aparelho sem `managedBy`
 * (`criadoresDeConteudo`). Conta como apontado também: depois de "Trocar de personal neste perfil", o contato antigo
 * não é mais `remoteCoach` de ninguém, mas a ficha antiga dele continua no perfil (sem isso, viraria "personal sem
 * alunos" e apareceria em "Perfis neste aparelho").
 */
export function ehContatoDePersonal(p: Pick<Profile, "id" | "role">, perfis: readonly Profile[], criadores?: ReadonlySet<string>): boolean {
  if (p.role !== "coach") return false;
  const apontado = perfis.some((a) => a.role === "athlete" && !a.managedBy && a.id !== p.id && a.remoteCoach?.id === p.id) || Boolean(criadores?.has(p.id));
  if (!apontado) return false;
  return !perfis.some((a) => a.role === "athlete" && a.managedBy === p.id);
}

/**
 * Quem criou conteúdo (ficha, dieta) de um aluno deste aparelho sem `managedBy`, fora o próprio aluno: no celular do
 * aluno, os personais de quem ele recebeu link (o atual e os anteriores). Puro: quem chama lê as fichas e dietas.
 */
export function criadoresDeConteudo(perfis: readonly Pick<Profile, "id" | "role" | "managedBy">[], conteudo: readonly { ownerId: string; createdBy: string }[]): Set<string> {
  const alunos = new Set(perfis.filter((p) => p.role === "athlete" && !p.managedBy).map((p) => p.id));
  const out = new Set<string>();
  for (const c of conteudo) if (alunos.has(c.ownerId) && c.createdBy && c.createdBy !== c.ownerId) out.add(c.createdBy);
  return out;
}

/**
 * Perfis de entrada deste aparelho: os que alguém usa como "eu" ("Perfis neste aparelho" em /entrar). Ficam fora:
 * perfil de teste e de exemplo; aluno com `managedBy` (registro de um aluno do personal: entrar nele seria o "Ver como"
 * sem o "Voltar ao painel"); e o contato do personal (`ehContatoDePersonal`: entrar nele abriria um painel de personal
 * falso, com o aluno dentro). Todo o resto entra, inclusive o personal sem alunos. A ordem é a de `perfis`.
 */
export function perfisDeEntrada(perfis: readonly Profile[], criadores?: ReadonlySet<string>): Profile[] {
  return perfis.filter((p) => !ehPerfilDeTesteOuExemplo(p) && !(p.role === "athlete" && p.managedBy) && !ehContatoDePersonal(p, perfis, criadores));
}
