import { coachSignature } from "./cref";
import { getExercise } from "./exercises";
import { fmtLoad, fmtRest, fmtScheme } from "./format";
import { TECHNIQUE_LABEL } from "./generator";
import { uid } from "./ids";
import type { MuscleGroup, PlannedExercise, Program, WorkoutDay } from "./types";

// ---- nome e CREF do personal ------------------------------------------------------
// Ficam em ./cref (sem dependências) para que telas leves possam assinar sem trazer o gerador de fichas.
export { CREF_MAX, coachSignature, crefLabel, crefLooksValid, maskCref, normalizeCref, signerFor } from "./cref";

/**
 * Texto da técnica de um exercício dentro do dia. Em bi-set, tri-set e supersérie o rótulo depende da
 * posição: o primeiro diz "com o próximo", o último "com o anterior".
 */
export function techniqueText(list: Pick<PlannedExercise, "technique">[], i: number): string | null {
  const t = list[i]?.technique ?? "normal";
  if (t === "normal") return null;
  const label = TECHNIQUE_LABEL[t];
  if (t !== "bi_set" && t !== "tri_set" && t !== "super_serie") return label;
  let start = i;
  while (start > 0 && list[start - 1]!.technique === t) start--;
  let end = i;
  while (end + 1 < list.length && list[end + 1]!.technique === t) end++;
  const size = t === "tri_set" ? 3 : 2;
  const pos = (i - start) % size;
  const groupStart = i - pos;
  const groupLen = Math.min(size, end - groupStart + 1);
  if (pos === 0 || groupLen === 1) return label;
  if (pos === groupLen - 1) return label.replace("com o próximo", "com o anterior").replace("com os próximos", "com os anteriores").replace("(antagonista)", "(com o anterior)");
  return label.replace("com os próximos", "em sequência");
}

/**
 * Ficha em texto simples, no formato que funciona no WhatsApp (*negrito* com asteriscos, sem emoji).
 * Uma linha por exercício: "1. Supino reto com barra — 4 × 6–8 · 80 kg · desc. 2:00".
 * Fecha com a assinatura do personal ("Nome · CREF …"), quando há quem assine.
 */
export function programToText(program: Program, opts: { studentName?: string; studentLabel?: string; coachName?: string; coachCref?: string } = {}): string {
  const out: string[] = [`*${program.name.trim()}*`];
  if (opts.studentName) out.push(`${opts.studentLabel ?? "Aluno"}: ${opts.studentName}`);
  if (program.durationWeeks) out.push(`Validade: ${program.durationWeeks} semanas`);

  // Treino sem exercícios (ficha ainda em montagem) não vai para o aluno.
  for (const day of program.days) {
    if (!day.exercises.length) continue;
    out.push("", `*${day.key}${day.title.trim() ? ` — ${day.title.trim()}` : ""}*`);
    day.exercises.forEach((e, i) => {
      const parts = [fmtScheme(e)];
      if (e.loadKg) parts.push(fmtLoad(e.loadKg));
      if (e.restSec) parts.push(`desc. ${fmtRest(e.restSec)}`);
      out.push(`${i + 1}. ${e.name} — ${parts.join(" · ")}`);
      const extra = [techniqueText(day.exercises, i), e.notes?.trim() || null].filter(Boolean);
      if (extra.length) out.push(`   ${extra.join(". ")}`);
    });
  }

  if (program.notes?.trim()) out.push("", "*Orientações*", program.notes.trim());
  const signature = coachSignature({ name: opts.coachName, cref: opts.coachCref });
  if (signature) out.push("", signature);
  return out.join("\n");
}

/** Cópia independente da ficha (novos ids), para duplicar, aplicar a um aluno ou salvar como modelo. */
export function cloneProgram(program: Program, patch: Partial<Program> = {}, now = new Date().toISOString()): Program {
  return {
    ...program,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    days: program.days.map((d) => ({ ...d, focus: [...d.focus], exercises: d.exercises.map((e) => ({ ...e, uid: uid() })) })),
    ...patch,
  };
}

/** Séries diretas por grupo muscular em uma volta completa da ficha (compostos contam para o grupo principal). */
export function programSetsPerGroup(program: Pick<Program, "days">): { group: MuscleGroup; sets: number }[] {
  const acc = new Map<MuscleGroup, number>();
  for (const day of program.days) {
    for (const e of day.exercises) {
      const ex = getExercise(e.exerciseId);
      if (!ex || ex.group === "cardio") continue;
      acc.set(ex.group, (acc.get(ex.group) ?? 0) + e.sets);
    }
  }
  return [...acc.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets);
}

/** Grupos trabalhados no dia, na ordem em que aparecem (usado para manter `focus` coerente ao editar). */
export function focusOfDay(day: Pick<WorkoutDay, "exercises">): MuscleGroup[] {
  const seen: MuscleGroup[] = [];
  for (const e of day.exercises) {
    const g = getExercise(e.exerciseId)?.group;
    if (g && !seen.includes(g)) seen.push(g);
  }
  return seen;
}

/** Próxima letra livre para um novo dia (A, B, C… e depois "Dia 8"). */
export function nextDayKey(days: Pick<WorkoutDay, "key">[]): string {
  const used = new Set(days.map((d) => d.key.toUpperCase()));
  for (const k of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(k)) return k;
  return `D${days.length + 1}`;
}
