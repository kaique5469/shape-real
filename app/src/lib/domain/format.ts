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
