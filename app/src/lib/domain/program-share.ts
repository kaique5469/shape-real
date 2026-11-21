import { getExercise } from "./exercises";
import { fmtLoad, fmtRest, fmtScheme } from "./format";
import { TECHNIQUE_LABEL } from "./generator";
import { uid } from "./ids";
import type { MuscleGroup, Program, WorkoutDay } from "./types";

/**
 * Ficha em texto simples, no formato que funciona no WhatsApp (*negrito* com asteriscos, sem emoji).
 * Uma linha por exercício: "1. Supino reto com barra — 4 × 6–8 · 80 kg · desc. 2:00".
 */
export function programToText(program: Program, opts: { studentName?: string; coachName?: string } = {}): string {
  const out: string[] = [`*${program.name.trim()}*`];
  const who = [opts.studentName && `Aluno: ${opts.studentName}`, opts.coachName && `Personal: ${opts.coachName}`].filter(Boolean);
  if (who.length) out.push(who.join(" · "));
  if (program.durationWeeks) out.push(`Validade: ${program.durationWeeks} semanas`);

  for (const day of program.days) {
    out.push("", `*${day.key}${day.title.trim() ? ` — ${day.title.trim()}` : ""}*`);
    if (!day.exercises.length) {
      out.push("(sem exercícios)");
      continue;
    }
    day.exercises.forEach((e, i) => {
      const parts = [fmtScheme(e)];
      if (e.loadKg) parts.push(fmtLoad(e.loadKg));
      if (e.restSec) parts.push(`desc. ${fmtRest(e.restSec)}`);
      out.push(`${i + 1}. ${e.name} — ${parts.join(" · ")}`);
      const extra = [e.technique !== "normal" ? TECHNIQUE_LABEL[e.technique] : null, e.notes?.trim() || null].filter(Boolean);
      if (extra.length) out.push(`   ${extra.join(". ")}`);
    });
  }

  if (program.notes?.trim()) out.push("", "*Orientações*", program.notes.trim());
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
