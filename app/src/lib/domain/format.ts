import { unitOf, UNIT_LABEL } from "./exercises";
import type { PlannedExercise } from "./types";

type Scheme = Pick<PlannedExercise, "sets" | "repsMin" | "repsMax"> & { exerciseId?: string; unit?: PlannedExercise["unit"] };

/** "3 × 8–12", "3 × 30–45 s", "1 × 20 min". */
export function fmtScheme(p: Scheme): string {
  const unit = unitOf(p.exerciseId ?? "", p.unit);
  const range = p.repsMin === p.repsMax ? String(p.repsMin) : `${p.repsMin}–${p.repsMax}`;
  return unit === "reps" ? `${p.sets} × ${range}` : `${p.sets} × ${range} ${UNIT_LABEL[unit].short}`;
}

/** "1:30" para 90 s, "45s" abaixo de um minuto, "—" sem descanso. */
export function fmtRest(sec: number | null | undefined): string {
  if (!sec) return "—";
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec}s`;
}

/** "42,5 kg" ou "—". */
export function fmtLoad(kg: number | null | undefined): string {
  if (!kg) return "—";
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

/** Só dígitos com DDI 55, pronto para wa.me; null se o número for curto demais. */
export function waPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

/** Link do WhatsApp com texto; com telefone abre a conversa do aluno, sem telefone abre o seletor de contatos. */
export function waLink(text: string, phone?: string | null): string {
  const to = waPhone(phone);
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}

export interface Validity {
  state: "ok" | "soon" | "expired";
  /** Dias até vencer (negativo quando já venceu). */
  days: number;
  label: string;
}

/** Validade da ficha a partir da data de criação e da duração planejada; null quando a ficha não tem validade. */
export function programValidity(createdAt: string, durationWeeks: number | null | undefined, now = new Date()): Validity | null {
  if (!durationWeeks) return null;
  const end = new Date(createdAt).getTime() + durationWeeks * 7 * 86_400_000;
  const days = Math.ceil((end - now.getTime()) / 86_400_000);
  if (days < 0) return { state: "expired", days, label: days === -1 ? "vencida ontem" : `vencida há ${-days} dias` };
  if (days === 0) return { state: "soon", days, label: "vence hoje" };
  if (days <= 7) return { state: "soon", days, label: days === 1 ? "vence amanhã" : `vence em ${days} dias` };
  return { state: "ok", days, label: days < 14 ? `vence em ${days} dias` : `vence em ${Math.round(days / 7)} semanas` };
}

/** Primeiro nome, para mensagens e botões. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
