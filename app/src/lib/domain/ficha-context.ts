import type { Profile, Program } from "./types";

/**
 * De quem é a ficha aberta no editor e o que isso muda (U5a; os textos do cabeçalho e da barra entram na U5b).
 * Puro: sem React e sem `@/lib/hooks`. Datas entram já formatadas por uma função passada por quem chama.
 */

/** Perfil do modo de teste "aluno que treina sozinho". Também liga `returnTo`, mas não é "Ver como aluno". */
export const SOLO_TESTER_ID = "teste-solo";

/**
 * - `modelo`: modelo do personal (aplicar a um aluno cria uma cópia);
 * - `aluno`: ficha de um aluno, aberta pelo personal;
 * - `propria`: ficha da própria pessoa (inclui o modo "aluno sem personal" e a cópia feita pelo aluno);
 * - `recebida`: ficha montada pelo personal, no aparelho do aluno;
 * - `como_aluno`: o personal está vendo o app como o aluno ("Ver como aluno").
 */
export type FichaKind = "modelo" | "aluno" | "propria" | "recebida" | "como_aluno";

export type AppMode = "local" | "supabase";

/** Tipo da ficha aberta, avaliado em ordem (K1 a K5 da U5). */
export function fichaKind(i: { viewer: Pick<Profile, "id" | "role">; program: Pick<Program, "ownerId" | "createdBy">; returnTo: { id: string } | null }): FichaKind {
  // K1: "Ver como aluno". O modo "aluno sem personal" também liga returnTo e fica de fora.
  if (i.returnTo && i.viewer.id !== SOLO_TESTER_ID) return "como_aluno";
  // K2 e K3: personal. Ficha dele = modelo; qualquer outra é de aluno, mesmo que o aluno ainda não tenha carregado.
  if (i.viewer.role === "coach") return i.program.ownerId === i.viewer.id ? "modelo" : "aluno";
  // K4: montada por outra pessoa (o personal que mandou o link).
  if (i.program.createdBy !== i.viewer.id) return "recebida";
  // K5
  return "propria";
}

export interface FichaCoach {
  /** Nome completo de quem montou a ficha recebida; null quando o app não sabe (o texto usa "seu personal"). */
  full: string | null;
  first: string | null;
  /** Quem montou é o personal atual: só então uma ficha nova dele passa a valer no lugar desta. */
  current: boolean;
}

const usableName = (name: string | null | undefined): string | null => {
  const v = name?.trim();
  // "Personal" é o nome provisório de quem ainda não preencheu o próprio nome.
  return v && v !== "Personal" ? v : null;
};

/**
 * Quem montou a ficha recebida: o personal atual (`remoteCoach`) quando é ele; senão o perfil local de quem montou,
 * se for personal (o recebimento do link grava esse perfil, o que cobre quem trocou de personal); senão ninguém.
 */
export function fichaCoach(i: {
  createdBy: string;
  remoteCoach?: Pick<NonNullable<Profile["remoteCoach"]>, "id" | "name"> | null;
  creator?: Pick<Profile, "id" | "role" | "name"> | null;
}): FichaCoach {
  const current = Boolean(i.remoteCoach && i.remoteCoach.id === i.createdBy);
  const full = current
    ? usableName(i.remoteCoach!.name)
    : i.creator && i.creator.id === i.createdBy && i.creator.role === "coach"
      ? usableName(i.creator.name)
      : null;
  return { full, first: full ? (full.split(/\s+/)[0] ?? full) : null, current };
}

/**
 * Salvar a ficha marca `adjustedAt`? Só a ficha recebida do personal, no modo local (na nuvem a ficha é a mesma linha
 * para os dois lados). "Ver como aluno" nunca marca: lá quem edita é o próprio personal.
 */
export function shouldMarkAdjusted(kind: FichaKind, mode: AppMode): boolean {
  return kind === "recebida" && mode === "local";
}

/**
 * Linha que substitui a assinatura do personal na impressão de uma ficha ajustada no aparelho do aluno (regra geral:
 * conteúdo alterado pelo aluno não leva nome nem CREF do personal). null quando a ficha não foi ajustada.
 * `day` formata a data por extenso numérico (ex.: "24/11/2026").
 */
export function programAdjustedNote(p: Pick<Program, "adjustedAt">, coachFullName: string | null, day: (iso: string) => string): string | null {
  if (!p.adjustedAt) return null;
  const name = usableName(coachFullName);
  return `Ajustada em ${day(p.adjustedAt)} a partir ${name ? `da ficha de ${name}` : "da ficha do seu personal"}.`;
}

/**
 * Aviso do /abrir antes de atualizar: só quando este aparelho tem uma ficha com o MESMO id da que chegou e ela foi
 * ajustada aqui (o reenvio substitui o registro inteiro). Com outro id, a ficha ajustada continua no aparelho,
 * inativa, e não há o que avisar. `day` formata a data curta (ex.: "24/11").
 */
export function fichaReplaceNotice(local: Pick<Program, "id" | "adjustedAt"> | null | undefined, packetProgramId: string | null | undefined, coachFirst: string | null, day: (iso: string) => string): string | null {
  if (!local || !packetProgramId || local.id !== packetProgramId || !local.adjustedAt) return null;
  const name = usableName(coachFirst);
  return `Você ajustou a ficha em ${day(local.adjustedAt)}. A ficha nova ${name ? `de ${name}` : "do seu personal"} substitui esses ajustes. Se quiser manter algo, combine ${name ? `com ${name}` : "com o seu personal"} antes de atualizar.`;
}
