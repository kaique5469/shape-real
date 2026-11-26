import type { Profile, Program } from "./types";

/**
 * De quem é a ficha aberta no editor e o que isso muda (U5a), e os textos do cabeçalho e da barra depois de salvar (U5b).
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

// ---- U5b: cabeçalho e fechamento do editor ------------------------------------------------------------

/** O que o cabeçalho e a barra depois de salvar precisam saber da ficha aberta. Nomes já no primeiro nome. */
export interface FichaContextInput {
  kind: FichaKind;
  mode: AppMode;
  program: Pick<Program, "active" | "adjustedAt">;
  /** Aluno dono da ficha (`aluno`) ou o próprio usuário (`como_aluno`); null quando não carregou. */
  studentFirst: string | null;
  /** Quem montou a ficha `recebida` (`fichaCoach().first`); null quando o app não sabe. */
  coachFirst: string | null;
  /** Quem montou é o personal atual (`fichaCoach().current`). */
  currentCoach: boolean;
}

const firstOf = (name: string | null | undefined): string | null => usableName(name)?.split(/\s+/)[0] ?? null;

/** Nota de ficha inativa (vale para o cabeçalho e para o próximo passo da barra). */
function inactiveNote(kind: FichaKind, studentFirst: string | null): string | null {
  if (kind === "aluno") {
    const s = firstOf(studentFirst);
    return s ? `Inativa: ${s} continua com a ficha ativa até você tocar em “Tornar ativa”.` : "Inativa: a ficha ativa continua valendo até você tocar em “Tornar ativa”.";
  }
  if (kind === "propria") return "Inativa: sua ficha ativa continua valendo até você tocar em “Tornar ativa”.";
  return null;
}

/**
 * Título (`h1`) e nota do cabeçalho do editor (U5 §3.2). A nota é a primeira que se aplicar; null = sem nota.
 * Sem pronome para o personal ou para o aluno (o app não sabe o gênero). `day` formata a data curta ("24/11").
 * Ficha recebida inativa ou de um personal que não é o atual: sem "Se Rafael mandar uma ficha nova, ela passa a
 * valer no lugar desta" (a ficha nova substitui a ativa, não esta).
 */
export function fichaContextText(i: FichaContextInput, day: (iso: string) => string): { title: string; note: string | null } {
  const s = firstOf(i.studentFirst);
  const c = firstOf(i.coachFirst);
  switch (i.kind) {
    case "aluno":
      return { title: s ? `Ficha de ${s}` : "Ficha do aluno", note: i.program.active ? null : inactiveNote("aluno", s) };
    case "modelo":
      return { title: "Modelo de ficha", note: "Aplicar a um aluno cria uma cópia. Mudar o modelo depois não muda as cópias já criadas." };
    case "propria":
      return { title: "Sua ficha", note: i.program.active ? null : inactiveNote("propria", s) };
    case "como_aluno":
      return { title: s ? `Ficha de ${s}` : "Ficha do aluno", note: `O que você mudar aqui muda a ficha ${s ? `de ${s}` : "do aluno"} neste aparelho.` };
    case "recebida": {
      const title = c ? `Ficha montada por ${c}` : "Ficha montada pelo seu personal";
      // Na nuvem a ficha é a mesma linha para os dois lados: nada a dizer aqui.
      if (i.mode !== "local") return { title, note: null };
      const who = c ?? "o seu personal";
      const first = i.program.adjustedAt
        ? `Você ajustou esta ficha em ${day(i.program.adjustedAt)}. Os ajustes ficam só neste celular e não aparecem para ${who}.`
        : `O que você mudar aqui fica só neste celular e não aparece para ${who}.`;
      const replaces = i.currentCoach && i.program.active ? ` Se ${who} mandar uma ficha nova, ela passa a valer no lugar desta.` : "";
      return { title, note: first + replaces };
    }
  }
}

/** A linha de envio (manchete M da U2b) aparece no cabeçalho? Só ficha ativa de aluno real, no modo local, sem alteração pendente. */
export function showEditorDeliveryLine(i: { kind: FichaKind; mode: AppMode; sample: boolean; active: boolean; dirty: boolean }): boolean {
  return i.kind === "aluno" && i.mode === "local" && !i.sample && i.active && !i.dirty;
}

/** Dá para mandar o link desta ficha agora (`program_edited.send_ready` e o botão da barra): aluno real, modo local, ficha ativa com exercícios. */
export function sendReady(i: { kind: FichaKind; mode: AppMode; sample: boolean; active: boolean; hasExercises: boolean }): boolean {
  return i.kind === "aluno" && i.mode === "local" && !i.sample && i.active && i.hasExercises;
}

/** Título da barra depois de salvar (U5 §3.6). "Neste celular" é o vocabulário do aluno com personal. */
export function postSaveTitle(kind: FichaKind, mode: AppMode, opts: { fromGenerator?: boolean } = {}): string {
  if (opts.fromGenerator) return mode === "local" ? "Ficha nova salva neste aparelho" : "Ficha nova salva";
  if (mode !== "local") return kind === "modelo" ? "Modelo salvo" : "Ficha salva";
  if (kind === "modelo") return "Modelo salvo neste aparelho";
  if (kind === "recebida") return "Ficha salva neste celular";
  return "Ficha salva neste aparelho";
}

/**
 * Próximo passo da barra depois de salvar (U5 §3.6): o envio OU uma frase, nunca os dois; null = nada.
 * Ficha inativa diz que está inativa antes de qualquer coisa (é o que decide o que o aluno vê).
 */
export function postSaveNextStep(i: FichaContextInput & { sample: boolean; hasExercises: boolean }): { send: true } | { text: string } | null {
  const s = firstOf(i.studentFirst);
  switch (i.kind) {
    case "aluno":
      if (!i.program.active) return { text: inactiveNote("aluno", s)! };
      if (i.sample) return null;
      if (i.mode !== "local") return { text: s ? `A versão nova já está no app de ${s}.` : "A versão nova já está no app do aluno." };
      if (!i.hasExercises) return { text: "Adicione exercícios antes de enviar." };
      return { send: true };
    case "modelo":
      return { text: "As cópias já criadas a partir deste modelo não mudam." };
    case "propria":
      return { text: i.program.active ? "A ficha já aparece em Hoje." : inactiveNote("propria", s)! };
    case "recebida": {
      if (i.mode !== "local" || !i.currentCoach || !i.program.active) return null;
      const who = firstOf(i.coachFirst) ?? "o seu personal";
      return { text: `Estas mudanças não aparecem para ${who}. Se ${who} mandar uma ficha nova, ela passa a valer no lugar desta.` };
    }
    case "como_aluno":
      return null;
  }
}

/**
 * Chegada do gerador (`?enviada=1`, U5 A7): a barra com o envio e a frase dela (aluno real, modo local, ficha
 * ativa com exercícios) ou uma frase no topo. Inativa e aluno de exemplo: o texto de antes.
 */
export function newFichaMessage(i: FichaContextInput & { sample: boolean; hasExercises: boolean }): { bar: true; text: string } | { text: string } {
  if (sendReady({ ...i, active: i.program.active })) return { bar: true, text: "Revise se quiser e envie quando estiver pronta." };
  if (!i.program.active && i.kind !== "modelo") return { text: "Ficha criada, ainda inativa: a ficha atual continua valendo até você tocar em “Tornar ativa”." };
  const s = firstOf(i.studentFirst);
  if (i.kind === "aluno" && i.mode !== "local") return { text: s ? `Ficha salva e ativa. Ela já está no app de ${s}.` : "Ficha salva e ativa. Ela já está no app do aluno." };
  if (i.kind === "aluno" && !i.sample && !i.hasExercises) return { text: "Ficha salva e ativa. Adicione exercícios antes de enviar." };
  return { text: "Ficha salva e ativa. Revise os detalhes e envie pelo WhatsApp ou imprima." };
}

/** `program_edited.tela`: "larga" a partir de 1024 px. */
export function editorWidth(px: number): "estreita" | "larga" {
  return px >= 1024 ? "larga" : "estreita";
}

/** `program_edited.duracao`: tempo desde que o editor abriu, em faixas. */
export function editDuration(ms: number): "<1min" | "1-3min" | "3-10min" | "10min+" {
  const min = ms / 60_000;
  if (!(min >= 1)) return "<1min";
  if (min < 3) return "1-3min";
  if (min < 10) return "3-10min";
  return "10min+";
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
