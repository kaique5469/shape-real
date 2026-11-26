/**
 * Fluxo da sessão de treino (U1 e U8). Puro: sem React e sem DOM. Um arquivo só para as regras que a tela da
 * sessão consulta. A fundação (UX0) entrega o contrato de rolagem; as demais regras entram pelos itens:
 *  - U1d: `assignLinks`, `linkGroups`, `isLinkDissolved`, `linkLabel`, `dissolvedNote` (grupo de bi-set fixado no rascunho);
 *  - U1b: `afterDonePlan` e `nextPendingIndex` (avanço depois de marcar a série e alvo da rolagem);
 *  - U1c: `swapOrigin`, `swapCopy`, `canSwap`, `lastSetHint`, `removeSetConfirm`, `exerciseWork`,
 *    `removeExerciseConfirm`, `removeExerciseHint` (ações do exercício);
 *  - U8a: `KEYBOARD_MIN_SHRINK`, `revealAfterResize`, `acceptTyped`, `ABOVE_MAX_NOTE` (teclado e limite de 999);
 *  - U2a e U5a (fim do treino): `summaryHeadline` (linha "salvo neste …" do resumo) e `programWithFinishedLoads`
 *    (carga feita copiada para a ficha sem virar edição).
 */

import { completedSets } from "./progression";
import { shouldStartRest, type SetRef } from "./rest";
import { setRowState } from "./session-checks";
import type { ExerciseLog, Program, Technique } from "./types";

/** Faixa vertical em px no referencial da viewport (o `top`/`bottom` de `getBoundingClientRect()`). */
export interface VerticalBand {
  top: number;
  bottom: number;
}

/**
 * Quanto rolar (px; positivo = descer, negativo = subir) para `target` caber inteiro em `area` (a área livre
 * entre o cabeçalho fixo e o rodapé fixo, já com as folgas de 8 px). 0 quando já cabe (nunca rola à toa).
 * Alvo maior que a área: alinha o topo do alvo ao topo da área.
 * Contrato único da rolagem depois do ✓ (U1 §3.5) e da revelação da linha com o teclado aberto (U8 §3.2b).
 */
export function scrollDeltaToReveal(target: VerticalBand, area: VerticalBand): number {
  const tall = target.bottom - target.top > area.bottom - area.top;
  if (tall) return target.top - area.top;
  if (target.top < area.top) return target.top - area.top;
  if (target.bottom > area.bottom) return target.bottom - area.bottom;
  return 0;
}

// ───────────────────────── U1d: bi-set, tri-set e supersérie fixados no início do treino ─────────────────────────

/** Técnicas feitas em sequência com o(s) exercício(s) seguinte(s). */
export const LINKED_TECHNIQUES: readonly Technique[] = ["bi_set", "tri_set", "super_serie"];

/** Grupo de um registro: uids dos membros na ordem do treino e a posição deste registro. */
export interface LinkInfo {
  members: string[];
  pos: number;
}

type LinkLike = Pick<ExerciseLog, "uid" | "planned">;

/**
 * Heurística de sempre (antes da U1d os grupos eram recalculados assim a cada render): exercícios seguidos com a
 * mesma técnica formam o grupo (até 2, ou 3 no tri-set); se só o 1º foi marcado, ele se junta ao(s) seguinte(s).
 * Devolve os grupos com 2 ou mais membros e o índice do 1º membro.
 */
function heuristicGroups(exercises: ReadonlyArray<LinkLike>): Array<{ start: number; members: string[] }> {
  const out: Array<{ start: number; members: string[] }> = [];
  let i = 0;
  while (i < exercises.length) {
    const t = exercises[i]!.planned?.technique;
    if (!t || !LINKED_TECHNIQUES.includes(t)) {
      i++;
      continue;
    }
    const size = t === "tri_set" ? 3 : 2;
    let j = i;
    while (j + 1 < exercises.length && j - i + 1 < size && exercises[j + 1]!.planned?.technique === t) j++;
    if (j === i && i + 1 < exercises.length) j = Math.min(exercises.length - 1, i + size - 1);
    const members = exercises.slice(i, j + 1).map((e) => e.uid);
    if (members.length > 1) out.push({ start: i, members });
    i = j + 1;
  }
  return out;
}

/**
 * Grupos do treino, calculados uma vez no início (buildDraft) e gravados no rascunho: uid do registro → id do grupo
 * ("<dia>:<índice do 1º membro>"). Só registros com grupo entram no mapa.
 */
export function assignLinks(dayKey: string, logs: ReadonlyArray<LinkLike>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of heuristicGroups(logs)) for (const u of g.members) out[u] = `${dayKey}:${g.start}`;
  return out;
}

/**
 * Grupos em vigor. Com `links` (rascunho novo): agrupa por id entre os registros presentes, na ordem atual; grupo
 * que ficou com 1 membro está desfeito e não entra (descanso normal, sem "Faça em sequência"); exercício adicionado
 * na hora não tem id. Sem `links` (rascunho de antes da U1d): a heurística de sempre.
 */
export function linkGroups(exercises: ReadonlyArray<LinkLike>, links?: Record<string, string>): Record<string, LinkInfo> {
  const out: Record<string, LinkInfo> = {};
  if (!links) {
    for (const g of heuristicGroups(exercises)) g.members.forEach((u, pos) => (out[u] = { members: g.members, pos }));
    return out;
  }
  const byId = new Map<string, string[]>();
  for (const e of exercises) {
    const id = links[e.uid];
    if (id === undefined) continue;
    const members = byId.get(id);
    if (members) members.push(e.uid);
    else byId.set(id, [e.uid]);
  }
  for (const members of byId.values()) if (members.length > 1) members.forEach((u, pos) => (out[u] = { members, pos }));
  return out;
}

/** O registro era de um grupo e os outros membros saíram deste treino. Rascunho antigo (sem `links`): nunca. */
export function isLinkDissolved(uid: string, exercises: ReadonlyArray<Pick<ExerciseLog, "uid">>, links?: Record<string, string>): boolean {
  const id = links?.[uid];
  if (id === undefined || !exercises.some((e) => e.uid === uid)) return false;
  return exercises.filter((e) => links![e.uid] === id).length < 2;
}

/** Rótulo da técnica de um membro de grupo desfeito; null quando não está desfeito (o rótulo de sempre continua). */
export function linkLabel(technique: Technique | undefined, dissolved: boolean): string | null {
  if (!dissolved) return null;
  if (technique === "bi_set") return "Bi-set desfeito neste treino";
  if (technique === "tri_set") return "Tri-set desfeito neste treino";
  if (technique === "super_serie") return "Supersérie desfeita neste treino";
  return null;
}

/**
 * Caixa do membro de grupo desfeito. Conta os membros pelo rascunho (que guarda o grupo do início do treino, mesmo
 * dos que saíram): 1 que saiu → "O outro exercício…"; 2 ou mais → "Os outros exercícios…".
 */
export function dissolvedNote(uid: string, links: Record<string, string>): string {
  const id = links[uid];
  const gone = id === undefined ? 1 : Object.values(links).filter((v) => v === id).length - 1;
  return `${gone > 1 ? "Os outros exercícios saíram deste treino." : "O outro exercício saiu deste treino."} Descanse entre as séries normalmente.`;
}

// ───────────────────────── U1b: avanço depois de marcar a série ─────────────────────────

export interface AfterDonePlan {
  /** Exercício a abrir (uid); null = fica onde está. */
  open: string | null;
  /** Inicia o descanso (com `from` = a série marcada). false = sem descanso (e a barra de fim some). */
  startRest: boolean;
}

/**
 * O que acontece depois de uma série marcada (✓ ou cronômetro), nesta ordem (U1 §3.4):
 * 1. membro de grupo que não é o último → abre o próximo membro, sem descanso;
 * 2. senão → descanso se `shouldStartRest` (descanso configurado e alguma série ainda por fazer no treino);
 * 3. último membro do grupo e o 1º membro ainda com série pendente → abre o 1º membro;
 * 4. o exercício atual sem nenhuma série pendente → abre o 1º exercício com série pendente, fora do grupo;
 * 5. senão → fica onde está (marcar a última série com outras pendentes não fecha o exercício).
 * `mark` é a série recém-marcada: o estado ainda não aplicou, então ela conta como feita aqui. `links` são os grupos em
 * vigor (`linkGroups`): um grupo desfeito não aparece e segue o fluxo normal.
 */
export function afterDonePlan(input: {
  exercises: ReadonlyArray<Pick<ExerciseLog, "uid" | "sets">>;
  links: Record<string, LinkInfo>;
  mark: SetRef;
  restSec: number;
}): AfterDonePlan {
  const { exercises, links, mark, restSec } = input;
  const link = links[mark.logUid];
  if (link && link.pos < link.members.length - 1) return { open: link.members[link.pos + 1] ?? null, startRest: false };
  const rest = shouldStartRest(exercises, mark, restSec);
  const pending = (e: Pick<ExerciseLog, "uid" | "sets">) => e.sets.some((s, j) => !s.done && !(e.uid === mark.logUid && j === mark.index));
  if (link) {
    const first = exercises.find((e) => e.uid === link.members[0]);
    if (first && first.uid !== mark.logUid && pending(first)) return { open: first.uid, startRest: rest };
  }
  const current = exercises.find((e) => e.uid === mark.logUid);
  if (current && pending(current)) return { open: null, startRest: rest };
  const next = exercises.find((e) => e.uid !== mark.logUid && !link?.members.includes(e.uid) && pending(e));
  return { open: next?.uid ?? null, startRest: rest };
}

/** Próxima série por fazer do registro, sem contar a série `except` (a recém-marcada); -1 se não houver. */
export function nextPendingIndex(log: Pick<ExerciseLog, "sets">, except = -1): number {
  return log.sets.findIndex((s, j) => !s.done && j !== except);
}

// ───────────────────────── U1c: ações do exercício ─────────────────────────

/** De onde veio o treino: ficha do personal, ficha própria ou treino livre (sem ficha). */
export type SwapOrigin = "personal" | "propria" | "livre";

/** Mesma regra do Hoje: ficha criada por outra pessoa é do personal; sem ficha, treino livre. */
export function swapOrigin(program: Pick<Program, "createdBy"> | null | undefined, userId: string): SwapOrigin {
  if (!program) return "livre";
  return program.createdBy === userId ? "propria" : "personal";
}

/** Rótulo do botão de troca (= título do seletor) e a dica do seletor. */
export function swapCopy(origin: SwapOrigin): { label: string; hint: string | null } {
  if (origin === "personal") return { label: "Trocar só neste treino", hint: "A ficha do seu personal não muda." };
  if (origin === "propria") return { label: "Trocar só neste treino", hint: "A ficha não muda. Para trocar de vez, edite a ficha em Treinos." };
  return { label: "Trocar exercício", hint: null };
}

/** Nota do botão de troca bloqueado, mostrada ao tocar nele. */
export const SWAP_BLOCKED_NOTE = "Este exercício já tem série feita. Para fazer outro, use “Adicionar exercício”.";

/** A troca só vale antes da 1ª série feita (o registro não mistura dois exercícios). */
export function canSwap(log: Pick<ExerciseLog, "sets">): boolean {
  return !log.sets.some((s) => s.done);
}

/** Dica de "Remover a última série" pelo estado dela; com 1 série a ação fica desabilitada. */
export function lastSetHint(log: Pick<ExerciseLog, "sets">): { text: string; disabled: boolean } {
  const n = log.sets.length;
  if (n <= 1) return { text: "O exercício precisa de pelo menos 1 série.", disabled: true };
  const state = setRowState(log.sets[n - 1]!);
  const what = state === "concluida" ? "feita" : state === "preenchida" ? "preenchida, sem ✓" : "vazia";
  return { text: `Série ${n} · ${what}`, disabled: false };
}

/** Diálogo antes de remover a última série; null = remove direto (vazia, ou só 1 série: nada a remover). */
export function removeSetConfirm(log: Pick<ExerciseLog, "sets">): { title: string; body: string } | null {
  const n = log.sets.length;
  if (n <= 1) return null;
  const state = setRowState(log.sets[n - 1]!);
  if (state === "pendente") return null;
  return {
    title: `Remover a série ${n}?`,
    body: state === "concluida" ? `A série ${n} já está marcada como feita e sai deste treino.` : `A série ${n} tem valores digitados, que serão descartados.`,
  };
}

/** Contagem do que se perde ao remover o exercício: séries feitas e preenchidas sem ✓. */
export function exerciseWork(log: Pick<ExerciseLog, "sets">): { feitas: number; preenchidas: number } {
  let feitas = 0;
  let preenchidas = 0;
  for (const s of log.sets) {
    const state = setRowState(s);
    if (state === "concluida") feitas++;
    else if (state === "preenchida") preenchidas++;
  }
  return { feitas, preenchidas };
}

/**
 * Diálogo antes de "Remover do treino"; null = remove direto (nada feito nem preenchido). "A ficha não muda." só
 * quando o treino veio de uma ficha (`fromProgram`).
 */
export function removeExerciseConfirm(log: Pick<ExerciseLog, "name" | "sets">, fromProgram: boolean): { body: string } | null {
  const { feitas, preenchidas } = exerciseWork(log);
  const tail = fromProgram ? " A ficha não muda." : "";
  if (feitas) return { body: `${log.name} sai deste treino e ${feitas === 1 ? "a série já feita é descartada" : `as ${feitas} séries já feitas são descartadas`}.${tail}` };
  if (preenchidas) return { body: `${log.name} sai deste treino e os valores digitados são descartados.${tail}` };
  return null;
}

/** Dica de "Remover do treino" na folha de ações. */
export function removeExerciseHint(fromProgram: boolean): string {
  return fromProgram ? "A ficha não muda." : "Sai deste treino.";
}

// ───────────────────────── U8a: teclado aberto e valor acima do limite ─────────────────────────

/**
 * Quanto a viewport precisa encolher desde o foco para contar como teclado abrindo (px). A barra de endereço do
 * Chrome (cerca de 56 px) fica abaixo disso e não dispara a revelação.
 */
export const KEYBOARD_MIN_SHRINK = 100;

/**
 * Revela a linha em foco só se a viewport encolheu (teclado) pelo menos KEYBOARD_MIN_SHRINK desde o foco, com um
 * campo ainda em foco e sem a pessoa ter arrastado a tela (nunca briga com quem está rolando). Onde a viewport de
 * layout não muda com o teclado (Safari do iPhone, Chrome com `resizes-visual`), não há `resize` e nada acontece.
 */
export function revealAfterResize(s: { heightAtFocus: number; height: number; fieldFocused: boolean; dragged: boolean }): boolean {
  return s.fieldFocused && !s.dragged && s.heightAtFocus - s.height >= KEYBOARD_MIN_SHRINK;
}

/** Aviso do valor digitado acima do limite (o campo volta ao valor de antes; nunca grava o limite no lugar). */
export const ABOVE_MAX_NOTE = "Acima de 999 não é aceito.";

/**
 * Valor digitado num campo de carga ou reps. Acima de `max` não é aceito: fica o valor de antes (`prev`) e
 * `rejected` avisa a tela. Nunca grava `max` no lugar de um número que a pessoa não digitou ("30" + "35" com a
 * seleção falhando vira "3035", e antes virava 999 calado). Não número: fica o de antes, sem aviso.
 */
export function acceptTyped(prev: number | null, typed: number | null, max: number): { value: number | null; rejected: boolean } {
  if (typed === null) return { value: null, rejected: false };
  if (!Number.isFinite(typed)) return { value: prev, rejected: false };
  if (typed > max) return { value: prev, rejected: true };
  return { value: typed, rejected: false };
}

// ───────────────────────── U2a e U5a: fim do treino ─────────────────────────

/**
 * Linha de cima do resumo do treino (U2 §3.1 e §3.5 aluno-1). "Salvo" tem evidência: o resumo só abre depois que
 * `saveSession` terminou. Só no modo local (na nuvem não é "neste aparelho"). Aluno com personal de link:
 * "celular", o vocabulário de /abrir e do Hoje; sem personal: "aparelho". "Ver como aluno" fica como era (U2 §3.7).
 */
export function summaryHeadline(ctx: { mode: "local" | "supabase"; hasCoach: boolean; viewingAsStudent: boolean }): string {
  if (ctx.mode !== "local" || ctx.viewingAsStudent) return "Treino concluído";
  return `Treino concluído · salvo neste ${ctx.hasCoach ? "celular" : "aparelho"}`;
}

/**
 * A ficha com a carga feita no treino (a maior entre as séries concluídas de cada exercício), ou null quando
 * nenhuma carga muda (não regrava à toa). Carga 0 ou sem carga não substitui a da ficha. `updatedAt` e o resto
 * ficam iguais: copiar a carga não é edição da ficha (U5 I2), e quem grava usa `keepUpdatedAt` (U5 A4). Sem isso,
 * terminar um treino faria a ficha parecer "mudou depois do último envio" no aparelho do personal.
 */
export function programWithFinishedLoads(program: Program, exercises: readonly ExerciseLog[]): Program | null {
  // O mesmo exercício duas vezes no treino (adicionado de novo): vale a maior carga das duas.
  const top = new Map<string, number>();
  for (const e of exercises) top.set(e.exerciseId, Math.max(top.get(e.exerciseId) ?? 0, ...completedSets(e).map((x) => x.loadKg ?? 0)));
  let changed = false;
  const days = program.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((p) => {
      const load = top.get(p.exerciseId);
      if (!load || load === p.loadKg) return p;
      changed = true;
      return { ...p, loadKg: load };
    }),
  }));
  return changed ? { ...program, days } : null;
}
