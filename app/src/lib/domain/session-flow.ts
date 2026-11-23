/**
 * Fluxo da sessão de treino (U1 e U8). Puro: sem React e sem DOM. Um arquivo só para as regras que a tela da
 * sessão consulta. A fundação (UX0) entrega o contrato de rolagem; as demais regras entram pelos itens:
 *  - U1d: `assignLinks`, `linkGroups`, `isLinkDissolved`, `linkLabel`, `dissolvedNote` (grupo de bi-set fixado no rascunho);
 *  - U1b: `afterDonePlan` (avanço depois de marcar a série);
 *  - U1c: `swapOrigin`, `swapCopy`, `canSwap`, `lastSetHint`, `removeSetConfirm`, `removeExerciseConfirm`;
 *  - U8a: `KEYBOARD_MIN_SHRINK`, `revealAfterResize`, `acceptTyped` (teclado e limite de 999).
 */

import type { ExerciseLog, Technique } from "./types";

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
