/**
 * Chave `questionario`: portas de entrada do personal para o questionário inicial (cadastro rápido, "Como você
 * trabalha?", cartão, "Fazer o questionário", resumo e passos). /questionario e o ramo `anamnese` de /receber
 * funcionam sem ela: o aluno não tem a chave, e o link só existe se o personal a tinha.
 *
 * Decisão do dono e do tech lead (DECISIONS, entradas 18 a 20 do questionário): LIGADA PARA TODOS por padrão.
 * A chave existe para desligar rápido, sem mexer nas telas:
 *  - `NEXT_PUBLIC_QUESTIONARIO=convite` no build (ou `QUESTIONARIO_PADRAO = "convite"` aqui): só no /testar e para
 *    quem abriu o convite `/entrar?beta=questionario` (grava `sr:v1:flag:questionario` = "1");
 *  - `NEXT_PUBLIC_QUESTIONARIO=desligada`: desligada para todos.
 * Fora de "todos" o valor depende do aparelho: leia em efeito (depois de montar), não no primeiro render.
 */

export type EstadoChave = "todos" | "convite" | "desligada";

/** Padrão do código: ligada para todos (decisão 2 do dono e do tech lead, 26/11/2026). */
export const QUESTIONARIO_PADRAO: EstadoChave = "todos";
export const FLAG_QUESTIONARIO_KEY = "sr:v1:flag:questionario";
/** Chave do modo /testar (app-context.tsx). */
const TESTER_KEY = "sr:tester";

type Leitor = Pick<Storage, "getItem">;
type Gravador = Pick<Storage, "setItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Estado da chave neste build: a variável de ambiente, se válida; senão o padrão do código. */
export function estadoChave(env: string | undefined = process.env.NEXT_PUBLIC_QUESTIONARIO): EstadoChave {
  return env === "todos" || env === "convite" || env === "desligada" ? env : QUESTIONARIO_PADRAO;
}

/** As portas de entrada do questionário estão ligadas para este aparelho? Nunca lança (leitura em try/catch). */
export function questionarioLigado(estado: EstadoChave = estadoChave(), ls: Leitor | null = storage()): boolean {
  if (estado === "todos") return true;
  if (estado === "desligada" || !ls) return false;
  try {
    return ls.getItem(TESTER_KEY) === "1" || ls.getItem(FLAG_QUESTIONARIO_KEY) === "1";
  } catch {
    return false;
  }
}

/** Convite `?beta=questionario` (em /entrar): grava a chave neste aparelho. Sem o parâmetro, nada muda. */
export function gravarConvite(search: string, ls: Gravador | null = storage()): void {
  if (!ls) return;
  try {
    if (new URLSearchParams(search).get("beta") === "questionario") ls.setItem(FLAG_QUESTIONARIO_KEY, "1");
  } catch {
    /* armazenamento bloqueado: segue sem a chave */
  }
}
