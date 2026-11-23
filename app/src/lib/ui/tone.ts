import type { Validity } from "@/lib/domain/format";

/**
 * Tom de estado para a UI (U7). Puro: sem React. A tela mapeia o nome do ícone para o componente do lucide.
 * Atenção (`warn`) = texto `iron` + ícone `warn-ink`; neutro = `steel`, sem ícone. Nunca vermelho.
 */
export type StateTone = "neutral" | "warn";

/** expired e soon → "warn"; ok e null → "neutral". */
export function validityTone(v: Pick<Validity, "state"> | null | undefined): StateTone {
  return v && (v.state === "expired" || v.state === "soon") ? "warn" : "neutral";
}

export type ValidityIcon = "CalendarX" | "CalendarClock" | null;

/** expired → "CalendarX"; soon → "CalendarClock"; ok e null → null. */
export function validityIcon(v: Pick<Validity, "state"> | null | undefined): ValidityIcon {
  if (!v) return null;
  if (v.state === "expired") return "CalendarX";
  if (v.state === "soon") return "CalendarClock";
  return null;
}

/** 1 → "1 recorde"; n ≥ 2 → "n recordes"; 0, negativo, NaN ou não inteiro → "". */
export function recordText(count: number): string {
  if (!Number.isInteger(count) || count <= 0) return "";
  return count === 1 ? "1 recorde" : `${count} recordes`;
}
