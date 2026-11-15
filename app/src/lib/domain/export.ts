import type { Program, Session } from "./types";
import { completedSets } from "./progression";

/**
 * CSV no formato do Excel brasileiro: separador ";", decimal com vírgula e BOM UTF-8
 * para os acentos abrirem corretamente.
 */
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false }) : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

export function programToCsv(program: Program): string {
  const rows: (string | number | null)[][] = [["Ficha", "Dia", "Ordem", "Exercício", "Séries", "Reps mín", "Reps máx", "Carga (kg)", "Descanso (s)", "Técnica", "Observações"]];
  for (const day of program.days) {
    day.exercises.forEach((e, i) => {
      rows.push([program.name, `${day.key} — ${day.title}`, i + 1, e.name, e.sets, e.repsMin, e.repsMax, e.loadKg ?? null, e.restSec, e.technique, e.notes ?? ""]);
    });
  }
  return toCsv(rows);
}

export function sessionsToCsv(sessions: Session[]): string {
  const rows: (string | number | null)[][] = [["Data", "Treino", "Exercício", "Série", "Carga (kg)", "Reps", "RPE", "Volume (kg)"]];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const date = new Date(s.startedAt).toLocaleDateString("pt-BR");
    const label = [s.dayKey, s.dayTitle].filter(Boolean).join(" — ") || s.programName || "Treino livre";
    for (const ex of s.exercises) {
      completedSets(ex).forEach((set, i) => {
        rows.push([date, label, ex.name, i + 1, set.loadKg ?? null, set.reps ?? null, set.rpe ?? null, (set.loadKg ?? 0) * (set.reps ?? 0)]);
      });
    }
  }
  return toCsv(rows);
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
