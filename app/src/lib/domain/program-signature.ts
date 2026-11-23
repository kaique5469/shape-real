import { unitOf } from "./exercises";
import { focusOfDay } from "./program-share";
import type { PlannedExercise, Program } from "./types";

/**
 * Assinatura de conteúdo da ficha (U5a, T1c). Decide se duas versões são a mesma ficha para quem a lê:
 *  - o rascunho do editor só volta se a ficha gravada ainda for a versão de onde a edição partiu
 *    (com `keepUpdatedAt` ao finalizar treino, o `updatedAt` deixou de servir para isso);
 *  - o "Salvar ficha" só marca `adjustedAt` (ficha do personal ajustada pela aluna) quando há diferença.
 * Puro: sem React e sem armazenamento.
 */

/**
 * A limpeza que o "Salvar ficha" faz antes de gravar, sem mexer em `updatedAt`: nome e letras sem espaço nas
 * pontas, grupos do treino recalculados, faixa de repetições na ordem e observação vazia fora.
 */
export function normalizeForSave(p: Program): Program {
  return {
    ...p,
    name: p.name.trim(),
    days: p.days.map((x) => ({
      ...x,
      key: x.key.trim(),
      title: x.title.trim(),
      focus: x.exercises.length ? focusOfDay(x) : x.focus,
      exercises: x.exercises.map((e) => ({ ...e, repsMin: Math.min(e.repsMin, e.repsMax), repsMax: Math.max(e.repsMin, e.repsMax), notes: e.notes?.trim() || undefined })),
    })),
  };
}

/**
 * Campos da ficha que não contam como conteúdo: datas, ficha ativa, marca de ajuste e o que outras partes do app
 * gravam sem passar pelo editor (`sharedAt` e `sugerido`, se vierem a existir). `focus` dos treinos também fica de
 * fora: é recalculado ao salvar.
 */
const IGNORED_FIELDS = new Set(["updatedAt", "createdAt", "active", "adjustedAt", "sharedAt", "sugerido"]);

function canonicalExercise(e: PlannedExercise): Record<string, unknown> {
  return {
    ...e,
    notes: e.notes?.trim() || undefined,
    // 0, null e ausente: sem carga.
    loadKg: e.loadKg || undefined,
    // Unidade ausente = a padrão do exercício. Exercício próprio fica como está gravado: a biblioteca dele é
    // carregada depois da página, e a assinatura não pode mudar só porque ela ainda não chegou.
    unit: e.exerciseId.startsWith("custom_") ? e.unit || undefined : unitOf(e.exerciseId, e.unit || undefined),
  };
}

/** JSON com as chaves em ordem e sem campos vazios (undefined e null valem o mesmo que ausente). */
function stable(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined && x !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Serialização estável da versão normalizada, sem os campos ignorados. Igual para fichas equivalentes (espaços nas
 * pontas, observação vazia, carga 0 ou vazia, unidade padrão, faixa invertida, validade 0) e diferente para qualquer
 * outra mudança, inclusive de campos que o editor não mostra: na dúvida, conta como mudança.
 */
export function programSignature(p: Program): string {
  const n = normalizeForSave(p);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) if (!IGNORED_FIELDS.has(k)) out[k] = v;
  out.notes = n.notes?.trim() || undefined;
  out.durationWeeks = n.durationWeeks || undefined;
  out.days = n.days.map(({ focus: _focus, ...d }) => ({ ...d, exercises: d.exercises.map(canonicalExercise) }));
  return stable(out);
}

// ---- rascunho do editor -------------------------------------------------------------

/** Rascunho guardado enquanto a ficha não é salva: a versão em edição e a assinatura da versão de onde ela partiu. */
export interface FichaDraft {
  program: Program;
  /** Ausente em rascunhos gravados antes da U5a: aí vale a regra antiga (`updatedAt` igual). */
  baseSig?: string;
}

function isProgramLike(v: unknown, programId: string): v is Program {
  const p = v as Partial<Program> | null;
  return Boolean(p && typeof p === "object" && p.id === programId && Array.isArray(p.days) && p.days.length);
}

/**
 * Lê o rascunho guardado (texto do sessionStorage). Aceita o formato novo `{ program, baseSig }` e o antigo (a ficha
 * solta). Qualquer outra coisa, ou rascunho de outra ficha, vira null.
 */
export function parseFichaDraft(raw: string | null | undefined, programId: string): FichaDraft | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const o = v as { program?: unknown; baseSig?: unknown } | null;
  if (o && typeof o === "object" && "program" in o) {
    if (!isProgramLike(o.program, programId)) return null;
    return typeof o.baseSig === "string" ? { program: o.program, baseSig: o.baseSig } : { program: o.program };
  }
  return isProgramLike(v, programId) ? { program: v } : null;
}

/**
 * O rascunho ainda vale se a ficha gravada for a mesma versão de onde a edição partiu. Com `baseSig`, compara o
 * conteúdo: uma carga copiada de um treino depois do rascunho invalida o rascunho (senão, ao salvar, a carga antiga
 * voltaria). Sem `baseSig` (rascunho antigo), compara o `updatedAt`, como antes.
 */
export function draftStillValid(draft: FichaDraft, stored: Program): boolean {
  if (draft.program.id !== stored.id) return false;
  return draft.baseSig !== undefined ? programSignature(stored) === draft.baseSig : draft.program.updatedAt === stored.updatedAt;
}

/** A ficha a restaurar no editor, ou null: rascunho inválido, ou sem nenhuma diferença da versão gravada (descartado em silêncio). */
export function draftToRestore(draft: FichaDraft | null, stored: Program): Program | null {
  if (!draft || !draftStillValid(draft, stored)) return null;
  return programSignature(draft.program) === programSignature(stored) ? null : draft.program;
}

// ---- salvar ------------------------------------------------------------------------

/**
 * O que o "Salvar ficha" grava: a limpeza de sempre e a data de edição. Com `markAdjusted` (ficha recebida do
 * personal, no modo local) e alguma diferença em relação à última versão gravada, grava também `adjustedAt`. O
 * `createdBy` nunca muda: a ficha continua sendo "montada por" quem montou.
 */
export function programForSave(program: Program, base: Program | null, opts: { now: string; markAdjusted: boolean }): { program: Program; changed: boolean } {
  const clean = normalizeForSave(program);
  const changed = !base || programSignature(clean) !== programSignature(base);
  return {
    program: { ...clean, updatedAt: opts.now, ...(changed && opts.markAdjusted ? { adjustedAt: opts.now } : {}) },
    changed,
  };
}
