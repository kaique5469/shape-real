import type { Program, Session } from "./types";
import { UNIT_LABEL, unitOf } from "./exercises";
import { TECHNIQUE_LABEL } from "./generator";
import { completedSets, isAssisted, volumeElegivel } from "./progression";

/**
 * Planilhas (CSV) de fichas e treinos. Separado de export.ts na rodada 3 (Fundação): export.ts fica com a cópia de
 * segurança (restaurar, trilha L) e este arquivo com o CSV (trilha S). export.ts reexporta as três funções, então
 * nenhum importador mudou (a troca dos importadores e o fim da reexportação são do RM-10, M-B).
 *
 * CSV no formato do Excel brasileiro: separador ";", decimal com vírgula e BOM UTF-8
 * para os acentos abrirem corretamente.
 */
/**
 * Uma célula. Texto que a planilha leria como fórmula (começa com =, +, - ou @, mesmo depois de espaços, ou com TAB ou
 * CR) ganha um apóstrofo na frente (R3-14): nomes de exercício próprio e observações vêm de outra pessoa pelo link, e
 * planilhas avaliam fórmula até entre aspas. Depois, a regra de aspas de sempre. Números nunca passam por isso
 * (carga -5 continua -5).
 */
export function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false }) : /^\s*[=+\-@]|^[\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

const PROGRAM_HEAD = ["Ficha", "Dia", "Ordem", "Exercício", "Séries", "Mín", "Máx", "Unidade", "Carga (kg)", "Descanso (s)", "Técnica", "Observações"];

function programRows(program: Program): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  for (const day of program.days) {
    day.exercises.forEach((e, i) => {
      rows.push([program.name, day.title ? `${day.key} — ${day.title}` : day.key, i + 1, e.name, e.sets, e.repsMin, e.repsMax, UNIT_LABEL[unitOf(e.exerciseId, e.unit)].noun, e.loadKg ?? null, e.restSec, e.technique === "normal" ? "" : TECHNIQUE_LABEL[e.technique], e.notes ?? ""]);
    });
  }
  return rows;
}

export function programToCsv(program: Program): string {
  return toCsv([PROGRAM_HEAD, ...programRows(program)]);
}

/** Várias fichas numa planilha só (a coluna "Ficha" separa uma da outra). */
export function programsToCsv(programs: Program[]): string {
  return toCsv([PROGRAM_HEAD, ...programs.flatMap(programRows)]);
}

export const SESSIONS_HEAD = ["Data", "Treino", "Exercício", "Série", "Carga (kg)", "Reps ou tempo", "Unidade", "RPE", "Volume (kg)"];

/**
 * Histórico de treinos, uma linha por série feita (série não concluída não gera linha). R3-6 B: a coluna "Unidade"
 * (reps, s ou min, pela unidade do exercício, como na tela) diz o que é o número de "Reps ou tempo"; "Volume (kg)" sai
 * da convenção única (`volumeElegivel`) e fica vazio na série por tempo e na máquina assistida (a carga é ajuda). A
 * soma da coluna é o volume do treino em todas as telas.
 */
export function sessionsToCsv(sessions: Session[]): string {
  const rows: (string | number | null)[][] = [SESSIONS_HEAD];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const date = new Date(s.startedAt).toLocaleDateString("pt-BR");
    const label = [s.dayKey, s.dayTitle].filter(Boolean).join(" — ") || s.programName || "Treino livre";
    for (const ex of s.exercises) {
      const unit = unitOf(ex.exerciseId, ex.unit);
      const semVolume = unit !== "reps" || isAssisted(ex.exerciseId);
      completedSets(ex).forEach((set, i) => {
        rows.push([date, label, ex.name, i + 1, set.loadKg ?? null, set.reps ?? null, UNIT_LABEL[unit].short, set.rpe ?? null, semVolume ? null : volumeElegivel(ex, set)]);
      });
    }
  }
  return toCsv(rows);
}
